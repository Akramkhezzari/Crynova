const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ============================================================
// اتصال Firebase - نسخة معدلة تجرب عدة طرق
// ============================================================

const admin = require('firebase-admin');

// ===== محاولة تحميل المفتاح بطرق مختلفة =====
let serviceAccount = null;
let errorMessage = '';

// الطريقة 1: من متغير البيئة FIREBASE_SERVICE_ACCOUNT
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('✅ تم تحميل Firebase من متغير البيئة');
    } else {
        console.log('⚠️ متغير FIREBASE_SERVICE_ACCOUNT غير موجود');
        errorMessage = 'FIREBASE_SERVICE_ACCOUNT not found in environment';
    }
} catch (e) {
    console.log('❌ فشل تحميل من متغير البيئة:', e.message);
    errorMessage = e.message;
}

// الطريقة 2: من الملف (للتطوير المحلي)
if (!serviceAccount) {
    try {
        serviceAccount = require('./service-account-key.json');
        console.log('✅ تم تحميل Firebase من الملف');
    } catch (e) {
        console.log('⚠️ فشل تحميل من الملف:', e.message);
    }
}

// ===== تهيئة Firebase =====
let db = null;
let firebaseStatus = 'disconnected';

if (serviceAccount) {
    try {
        // تهيئة Firebase Admin
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://crynova-4d6b3-default-rtdb.firebaseio.com"
        });
        
        db = admin.firestore();
        firebaseStatus = 'connected';
        console.log('✅ Firebase متصل بنجاح!');
        
    } catch (error) {
        console.error('❌ فشل تهيئة Firebase:', error.message);
        firebaseStatus = 'error';
        errorMessage = error.message;
    }
} else {
    console.error('❌ لا يوجد مفتاح Firebase!');
    firebaseStatus = 'no_key';
}

// ============================================================
// API Routes
// ============================================================

// تسجيل إحالة
app.post('/api/referral', async (req, res) => {
    const { telegramId, referralCode } = req.body;
    
    if (!telegramId || !referralCode) {
        return res.status(400).json({ 
            success: false, 
            message: 'المعلومات ناقصة' 
        });
    }

    // التحقق من اتصال Firebase
    if (!db) {
        return res.status(500).json({ 
            success: false, 
            message: 'قاعدة البيانات غير متصلة',
            firebaseStatus: firebaseStatus
        });
    }

    try {
        const usersRef = db.collection('users');
        
        // البحث عن المُحيل
        const referrerSnapshot = await usersRef
            .where('telegramId', '==', referralCode)
            .get();

        if (referrerSnapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'كود الإحالة غير صحيح' 
            });
        }

        const referrerDoc = referrerSnapshot.docs[0];

        // البحث عن المستخدم
        const userSnapshot = await usersRef
            .where('telegramId', '==', telegramId)
            .get();

        if (userSnapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        if (userData.referredBy) {
            return res.status(400).json({ 
                success: false, 
                message: 'تم استخدام كود إحالة سابقاً' 
            });
        }

        // تحديث المستخدم الجديد
        await userDoc.ref.update({
            referredBy: referralCode,
            referrerUid: referrerDoc.id,
            referralDate: admin.firestore.FieldValue.serverTimestamp()
        });

        // تحديث المُحيل
        await referrerDoc.ref.update({
            'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
            'wallets.referral': admin.firestore.FieldValue.increment(5)
        });

        // إضافة سجل الإحالة
        await db.collection('referrals').add({
            referrerUid: referrerDoc.id,
            referrerTelegramId: referralCode,
            refereeUid: userDoc.id,
            refereeTelegramId: telegramId,
            refereeName: userData.displayName || 'مستخدم',
            commissionEarned: 5,
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        });

        res.json({ 
            success: true, 
            message: 'تم تسجيل الإحالة!',
            bonus: 5 
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// جلب الإحالات
app.get('/api/referrals/:telegramId', async (req, res) => {
    const { telegramId } = req.params;
    
    if (!db) {
        return res.status(500).json({ 
            success: false, 
            message: 'قاعدة البيانات غير متصلة',
            firebaseStatus: firebaseStatus
        });
    }
    
    try {
        const usersRef = db.collection('users');
        const userSnapshot = await usersRef
            .where('telegramId', '==', telegramId)
            .get();

        if (userSnapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        const referralsSnapshot = await db.collection('referrals')
            .where('referrerUid', '==', userDoc.id)
            .get();

        const referrals = [];
        let totalCommission = 0;
        
        referralsSnapshot.forEach(doc => {
            const data = doc.data();
            totalCommission += data.commissionEarned || 0;
            referrals.push({ id: doc.id, ...data });
        });

        res.json({
            success: true,
            data: {
                totalReferrals: userData.miningData?.totalReferrals || 0,
                totalCommission: totalCommission,
                referrals: referrals,
                referralLink: `https://t.me/Crynova_bot?start=${telegramId}`
            }
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Health Check - يعرض حالة Firebase
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        firebase: firebaseStatus,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        debug: {
            hasServiceAccount: !!serviceAccount,
            error: errorMessage || 'none',
            envKeys: Object.keys(process.env).filter(k => k.includes('FIREBASE'))
        }
    });
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({
        name: 'Crynova Referral Server',
        version: '1.0.0',
        status: 'running',
        firebase: firebaseStatus,
        endpoints: {
            'POST /api/referral': 'تسجيل إحالة جديدة',
            'GET /api/referrals/:telegramId': 'جلب إحصائيات الإحالات',
            'GET /health': 'التحقق من الصحة'
        }
    });
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 Crynova Referral Server');
    console.log('='.repeat(50));
    console.log(`✅ خادم يعمل على المنفذ: ${PORT}`);
    console.log(`📡 Firebase: ${firebaseStatus}`);
    if (firebaseStatus !== 'connected') {
        console.log(`⚠️ خطأ: ${errorMessage}`);
    }
    console.log('='.repeat(50));
});
