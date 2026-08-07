const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

console.log('🚀 Starting Crynova Server...');

// ============================================================
// اتصال Firebase
// ============================================================

const admin = require('firebase-admin');

let serviceAccount = null;
let firebaseError = null;

// من متغير البيئة (في Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('✅ Firebase: تم التحميل من متغير البيئة');
    } catch (e) {
        firebaseError = e.message;
        console.log('❌ فشل تحميل من متغير البيئة:', e.message);
    }
}

// من الملف (للتجربة المحلية)
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

// Health Check
app.get('/health', (req, res) => {
    const status = {
        status: 'healthy',
        firebase: db ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        debug: {
            hasEnvKey: !!process.env.FIREBASE_SERVICE_ACCOUNT,
            hasServiceAccount: !!serviceAccount,
            error: firebaseError || 'none'
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

// ============================================================
// 1. تسجيل مستخدم جديد
// ============================================================
app.post('/api/user/register', async (req, res) => {
    const { telegramId, firstName, username } = req.body;
    
    if (!telegramId) {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف المستخدم مطلوب' 
        });
    }

    if (!db) {
        return res.status(500).json({ 
            success: false, 
            message: 'قاعدة البيانات غير متصلة' 
        });
    }

    try {
        const usersRef = db.collection('users');
        const userSnapshot = await usersRef.where('telegramId', '==', telegramId).get();

        if (!userSnapshot.empty) {
            return res.json({
                success: true,
                message: 'المستخدم موجود بالفعل',
                data: userSnapshot.docs[0].data()
            });
        }

        const displayName = firstName || username || 'مستخدم';
        
        const newUser = {
            telegramId: telegramId,
            username: username || '',
            displayName: displayName,
            joinDate: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            level: 1,
            status: 'active',
            referralCode: telegramId,
            referredBy: null,
            currency: 'USDT',
            wallets: {
                main: 0, reward: 0, referral: 0, locked: 0,
                dzd: 0, dzdReward: 0, dzdReferral: 0, dzdLocked: 0
            },
            miningData: {
                currentPackage: null,
                totalMined: 0,
                totalMinedDZD: 0,
                totalReferrals: 0,
                miningHistory: {
                    today: 0, todayDZD: 0,
                    thisWeek: 0, thisWeekDZD: 0,
                    thisMonth: 0, thisMonthDZD: 0
                },
                lastMiningUpdate: admin.firestore.FieldValue.serverTimestamp(),
                activeSince: admin.firestore.FieldValue.serverTimestamp()
            }
        };
        
        const docRef = await usersRef.add(newUser);
        console.log(`✅ مستخدم جديد: ${displayName} (${telegramId})`);
        
        res.json({
            success: true,
            message: 'تم تسجيل المستخدم بنجاح',
            data: { id: docRef.id, ...newUser }
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 2. تسجيل إحالة جديدة
// ============================================================
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
            message: 'قاعدة البيانات غير متصلة' 
        });
    }

    try {
        console.log(`📨 معالجة الإحالة: ${telegramId} ← ${referralCode}`);
        
        const usersRef = db.collection('users');
        
        // البحث عن المُحيل
        const referrerSnapshot = await usersRef.where('telegramId', '==', referralCode).get();

        if (referrerSnapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'كود الإحالة غير صحيح' 
            });
        }

        const referrerDoc = referrerSnapshot.docs[0];

        // البحث عن المستخدم
        const userSnapshot = await usersRef.where('telegramId', '==', telegramId).get();

        if (userSnapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        // التحقق من عدم استخدام كود سابق
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
            referralUsed: true,
            referralDate: admin.firestore.FieldValue.serverTimestamp()
        });

        // تحديث المُحيل
        await referrerDoc.ref.update({
            'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
            'wallets.referral': admin.firestore.FieldValue.increment(5),
            'wallets.dzdReferral': admin.firestore.FieldValue.increment(1250)
        });

        // إضافة سجل الإحالة
        const referralRef = await db.collection('referrals').add({
            referrerUid: referrerDoc.id,
            referrerTelegramId: referralCode,
            refereeUid: userDoc.id,
            refereeTelegramId: telegramId,
            refereeName: userData.displayName || 'مستخدم',
            commissionEarned: 5,
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        });

        // تسجيل المعاملة
        await db.collection('transactions').add({
            uid: referrerDoc.id,
            type: 'referral_bonus',
            amount: 5,
            currency: 'USDT',
            description: `مكافأة إحالة ${userData.displayName || 'مستخدم جديد'}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ تم تسجيل الإحالة بنجاح! ${telegramId} ← ${referralCode}`);
        
        res.json({ 
            success: true, 
            message: 'تم تسجيل الإحالة!',
            bonus: 5,
            referralId: referralRef.id
        });

    } catch (error) {
        console.error('❌ خطأ في الإحالة:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// 3. جلب إحصائيات الإحالات
// ============================================================
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
        const userSnapshot = await usersRef.where('telegramId', '==', telegramId).get();

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
            .orderBy('joinedAt', 'desc')
            .get();

        const referrals = [];
        let totalCommission = 0;
        let activeCount = 0;
        
        referralsSnapshot.forEach(doc => {
            const data = doc.data();
            totalCommission += data.commissionEarned || 0;
            if (data.status === 'active') activeCount++;
            referrals.push({
                id: doc.id,
                ...data,
                joinedAt: data.joinedAt?.toDate?.() || data.joinedAt
            });
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const todayReferrals = referrals.filter(r => {
            const d = new Date(r.joinedAt);
            return d >= today;
        });

        const weekReferrals = referrals.filter(r => {
            const d = new Date(r.joinedAt);
            return d >= thisWeekStart;
        });

        const monthReferrals = referrals.filter(r => {
            const d = new Date(r.joinedAt);
            return d >= thisMonthStart;
        });

        res.json({
            success: true,
            data: {
                totalReferrals: userData.miningData?.totalReferrals || 0,
                activeReferrals: activeCount,
                totalCommission: totalCommission,
                todayReferrals: todayReferrals.length,
                weekReferrals: weekReferrals.length,
                monthReferrals: monthReferrals.length,
                referralLink: `https://t.me/Crynova_bot?start=${telegramId}`,
                referrals: referrals.slice(0, 20)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// 4. تحديث حالة إحالة
// ============================================================
app.put('/api/referral/:referralId/status', async (req, res) => {
    const { referralId } = req.params;
    const { status } = req.body;
    
    if (!db) {
        return res.status(500).json({ 
            success: false, 
            message: 'قاعدة البيانات غير متصلة' 
        });
    }

    try {
        const validStatuses = ['active', 'pending', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'حالة غير صالحة',
                validStatuses: validStatuses
            });
        }

        await db.collection('referrals').doc(referralId).update({
            status: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            success: true, 
            message: `تم تحديث الحالة إلى ${status}` 
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث الحالة:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// 5. لوحة المتصدرين
// ============================================================
app.get('/api/leaderboard', async (req, res) => {
    if (!db) {
        return res.status(500).json({
            success: false,
            message: 'قاعدة البيانات غير متصلة'
        });
    }

    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const snapshot = await db.collection('users')
            .orderBy('miningData.totalReferrals', 'desc')
            .limit(limit)
            .get();

        const leaderboard = [];
        let rank = 1;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            leaderboard.push({
                rank: rank++,
                name: data.displayName || 'مستخدم',
                telegramId: data.telegramId,
                referrals: data.miningData?.totalReferrals || 0,
                commission: data.wallets?.referral || 0,
                level: data.level || 1
            });
        }

        res.json({
            success: true,
            data: leaderboard
        });

    } catch (error) {
        console.error('❌ خطأ في لوحة المتصدرين:', error);
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
    }
    console.log('='.repeat(50));
    console.log('📌 النقاط النهائية (Endpoints):');
    console.log(`  POST /api/user/register        - تسجيل مستخدم`);
    console.log(`  POST /api/referral             - تسجيل إحالة`);
    console.log(`  GET  /api/referrals/:id        - جلب الإحصائيات`);
    console.log(`  PUT  /api/referral/:id/status  - تحديث الحالة`);
    console.log(`  GET  /api/leaderboard          - لوحة المتصدرين`);
    console.log(`  GET  /health                   - التحقق من الصحة`);
    console.log('='.repeat(50));
});
