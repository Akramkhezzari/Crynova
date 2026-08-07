const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

console.log('🚀 Starting Crynova Server...');

// ============================================================
// اتصال Firebase - الطريقة الصحيحة
// ============================================================

const admin = require('firebase-admin');

// ===== محاولة تحميل المفتاح =====
let serviceAccount = null;
let firebaseError = null;

// الطريقة 1: من متغير البيئة
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('✅ Firebase: تم التحميل من متغير البيئة');
    } catch (e) {
        firebaseError = e.message;
        console.log('❌ فشل تحميل من متغير البيئة:', e.message);
    }
}

// الطريقة 2: من الملف (للتجربة المحلية)
if (!serviceAccount) {
    try {
        serviceAccount = require('./service-account-key.json');
        console.log('✅ Firebase: تم التحميل من الملف');
    } catch (e) {
        console.log('⚠️ فشل تحميل من الملف:', e.message);
    }
}

// ===== تهيئة Firebase =====
let db = null;

if (serviceAccount) {
    try {
        // التأكد من أن private_key يحتوي على التنسيق الصحيح
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        
        db = admin.firestore();
        console.log('✅ Firebase: متصل بنجاح!');
        
        // اختبار الاتصال
        db.collection('test').doc('test').set({ test: true })
            .then(() => console.log('✅ Firebase: اختبار الكتابة نجح!'))
            .catch(err => console.log('⚠️ Firebase: اختبار الكتابة فشل:', err.message));
            
    } catch (error) {
        console.error('❌ Firebase: فشل التهيئة:', error.message);
        firebaseError = error.message;
    }
} else {
    console.error('❌ Firebase: لا يوجد مفتاح!');
    firebaseError = 'No service account found';
}

// ============================================================
// API Routes
// ============================================================

// Health Check - يعرض حالة Firebase
app.get('/health', (req, res) => {
    const status = {
        status: 'healthy',
        firebase: db ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        debug: {
            hasEnvKey: !!process.env.FIREBASE_SERVICE_ACCOUNT,
            hasServiceAccount: !!serviceAccount,
            error: firebaseError || 'none',
            envKeys: Object.keys(process.env).filter(k => k.includes('FIREBASE'))
        }
    };
    res.json(status);
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Crynova Referral Server',
        version: '1.0.0',
        firebase: db ? 'connected' : 'disconnected'
    });
});

// تسجيل إحالة
app.post('/api/referral', async (req, res) => {
    const { telegramId, referralCode } = req.body;
    
    if (!telegramId || !referralCode) {
        return res.status(400).json({ 
            success: false, 
            message: 'المعلومات ناقصة' 
        });
    }

    if (!db) {
        return res.status(500).json({ 
            success: false, 
            message: 'قاعدة البيانات غير متصلة',
            firebase: 'disconnected'
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

        console.log(`✅ إحالة جديدة: ${telegramId} ← ${referralCode}`);
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
            message: 'قاعدة البيانات غير متصلة' 
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

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 Crynova Referral Server');
    console.log('='.repeat(50));
    console.log(`✅ خادم يعمل على المنفذ: ${PORT}`);
    console.log(`📡 Firebase: ${db ? 'متصل ✅' : 'غير متصل ❌'}`);
    if (!db) {
        console.log(`⚠️ خطأ: ${firebaseError || 'unknown'}`);
        console.log(`📌 متغيرات البيئة المتوفرة:`, Object.keys(process.env).filter(k => k.includes('FIREBASE')));
    }
    console.log('='.repeat(50));
});
