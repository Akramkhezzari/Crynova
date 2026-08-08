const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
    origin: ['https://t.me', 'https://web.telegram.org', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ============================================================
// RATE LIMITING (حماية من التكرار)
// ============================================================
const referralLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 10, // الحد الأقصى 10 طلبات لكل IP
    message: { 
        success: false, 
        message: 'تم تجاوز حد الطلبات المسموح بها. حاول لاحقاً.' 
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 5, // 5 محاولات تسجيل لكل IP
    message: { 
        success: false, 
        message: 'تم تجاوز حد محاولات التسجيل. حاول بعد ساعة.' 
    }
});

console.log('🚀 Starting Crynova Server...');

// ============================================================
// FIREBASE CONNECTION
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
// HELPER FUNCTIONS
// ============================================================

// ✅ التحقق من صحة بيانات Telegram
function isValidTelegramInitData(initData) {
    try {
        // تحليل البيانات
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        // ترتيب المعاملات أبجدياً
        const sortedParams = Array.from(params.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        // توليد التوقيع المتوقع
        const secretKey = crypto
            .createHash('sha256')
            .update(process.env.TELEGRAM_BOT_TOKEN || 'test_token')
            .digest();
        
        const expectedHash = crypto
            .createHmac('sha256', secretKey)
            .update(sortedParams)
            .digest('hex');
        
        return hash === expectedHash;
    } catch (error) {
        console.error('❌ فشل التحقق من Telegram:', error);
        return false;
    }
}

// ✅ توليد كود إحالة فريد
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ✅ منع التكرار (Idempotency)
const processedRequests = new Map();

function isRequestProcessed(key) {
    const timestamp = processedRequests.get(key);
    if (!timestamp) return false;
    
    // تنظيف الطلبات القديمة (أكثر من ساعة)
    if (Date.now() - timestamp > 60 * 60 * 1000) {
        processedRequests.delete(key);
        return false;
    }
    return true;
}

function markRequestProcessed(key) {
    processedRequests.set(key, Date.now());
}

// ✅ توقيع الردود
function signResponse(data) {
    const secret = process.env.JWT_SECRET || 'crynova_secret_key_2024';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
}

// ============================================================
// API ROUTES
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
        version: '2.0.0',
        firebase: db ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 1. تسجيل مستخدم جديد (مع دعم الإحالة)
// ============================================================
app.post('/api/user/register', registerLimiter, async (req, res) => {
    const { telegramId, firstName, username, initData, referralCode } = req.body;
    
    // ✅ التحقق من صحة البيانات
    if (!telegramId) {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف المستخدم مطلوب' 
        });
    }

    // ✅ التحقق من صحة initData (إن وجد)
    if (initData && !isValidTelegramInitData(initData)) {
        return res.status(401).json({ 
            success: false, 
            message: 'طلب غير مصرح به' 
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

        // إذا كان المستخدم موجوداً
        if (!userSnapshot.empty) {
            const userDoc = userSnapshot.docs[0];
            const userData = userDoc.data();
            
            // تحديث آخر تسجيل دخول
            await userDoc.ref.update({
                lastLogin: admin.firestore.FieldValue.serverTimestamp()
            });
            
            return res.json({
                success: true,
                message: 'المستخدم موجود بالفعل',
                data: { id: userDoc.id, ...userData },
                isNew: false
            });
        }

        // ===== إنشاء مستخدم جديد =====
        const displayName = firstName || username || 'مستخدم';
        const newReferralCode = generateReferralCode();
        
        const newUser = {
            telegramId: telegramId.toString(),
            username: username || '',
            displayName: displayName,
            joinDate: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            level: 1,
            status: 'active',
            referralCode: newReferralCode,
            referredBy: null,
            referrerUid: null,
            referralUsed: false,
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
        const userData = { id: docRef.id, ...newUser };
        
        console.log(`✅ مستخدم جديد: ${displayName} (${telegramId})`);
        console.log(`📌 كود الإحالة الخاص به: ${newReferralCode}`);

        // ===== معالجة الإحالة إذا وجدت =====
        let referralResult = null;
        if (referralCode && referralCode !== telegramId.toString()) {
            try {
                referralResult = await processReferral(
                    referralCode,
                    docRef.id,
                    telegramId,
                    displayName
                );
                console.log('✅ تمت معالجة الإحالة بنجاح:', referralResult);
            } catch (error) {
                console.error('⚠️ فشل معالجة الإحالة:', error.message);
                // لا نمنع إنشاء المستخدم إذا فشلت الإحالة
            }
        }

        // ===== الرد =====
        const response = {
            success: true,
            message: 'تم تسجيل المستخدم بنجاح',
            data: userData,
            isNew: true,
            referral: referralResult || null
        };

        // ✅ توقيع الرد
        response.signature = signResponse({
            telegramId,
            userId: docRef.id,
            timestamp: Date.now()
        });

        res.json(response);

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 2. تسجيل إحالة جديدة (منفصل)
// ============================================================
app.post('/api/referral', referralLimiter, async (req, res) => {
    const { telegramId, referralCode, initData } = req.body;
    
    // ✅ التحقق من صحة البيانات
    if (!telegramId || !referralCode) {
        return res.status(400).json({ 
            success: false, 
            message: 'المعلومات ناقصة' 
        });
    }

    // ✅ التحقق من صحة initData (إن وجد)
    if (initData && !isValidTelegramInitData(initData)) {
        return res.status(401).json({ 
            success: false, 
            message: 'طلب غير مصرح به' 
        });
    }

    // ✅ منع التكرار
    const requestKey = `ref_${telegramId}_${referralCode}`;
    if (isRequestProcessed(requestKey)) {
        return res.status(429).json({
            success: false,
            message: 'تم معالجة هذا الطلب مسبقاً'
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
        
        // ✅ البحث عن المستخدم
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

        // ✅ التحقق من عدم استخدام كود سابق
        if (userData.referredBy) {
            return res.status(400).json({ 
                success: false, 
                message: 'تم استخدام كود إحالة سابقاً' 
            });
        }

        // ✅ معالجة الإحالة
        const result = await processReferral(
            referralCode,
            userDoc.id,
            telegramId,
            userData.displayName || 'مستخدم'
        );

        // ✅ تحديث المستخدم
        await userDoc.ref.update({
            referredBy: referralCode,
            referrerUid: result.referrerUid,
            referralUsed: true,
            referralDate: admin.firestore.FieldValue.serverTimestamp()
        });

        markRequestProcessed(requestKey);

        // ✅ الرد
        const response = {
            success: true,
            message: 'تم تسجيل الإحالة!',
            bonus: 5,
            referralId: result.referralId,
            referrerName: result.referrerName
        };

        response.signature = signResponse({
            telegramId,
            referralCode,
            timestamp: Date.now()
        });

        console.log(`✅ تم تسجيل الإحالة بنجاح! ${telegramId} ← ${referralCode}`);
        res.json(response);

    } catch (error) {
        console.error('❌ خطأ في الإحالة:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// دالة معالجة الإحالة (مشاركة)
// ============================================================
async function processReferral(referralCode, userUid, telegramId, displayName) {
    const usersRef = db.collection('users');
    
    // ✅ البحث عن المُحيل
    const referrerSnapshot = await usersRef.where('referralCode', '==', referralCode).get();

    if (referrerSnapshot.empty) {
        throw new Error('كود الإحالة غير صحيح');
    }

    const referrerDoc = referrerSnapshot.docs[0];
    const referrerData = referrerDoc.data();

    // ✅ منع إحالة النفس
    if (referrerData.telegramId === telegramId.toString()) {
        throw new Error('لا يمكنك إحالة نفسك');
    }

    // ✅ التحقق من عدم وجود إحالة مسبقة للمستخدم
    const existingReferral = await db.collection('referrals')
        .where('referredUid', '==', userUid)
        .get();

    if (!existingReferral.empty) {
        throw new Error('تمت إحالة هذا المستخدم مسبقاً');
    }

    // ✅ إضافة سجل الإحالة
    const referralData = {
        referrerUid: referrerDoc.id,
        referrerTelegramId: referrerData.telegramId,
        referrerName: referrerData.displayName || 'مُحيل',
        referredUid: userUid,
        referredTelegramId: telegramId.toString(),
        referredName: displayName || 'مستخدم جديد',
        commissionEarned: 5,
        status: 'active',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const referralRef = await db.collection('referrals').add(referralData);

    // ✅ تحديث المُحيل
    await referrerDoc.ref.update({
        'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
        'wallets.referral': admin.firestore.FieldValue.increment(5),
        'wallets.dzdReferral': admin.firestore.FieldValue.increment(1250)
    });

    // ✅ تسجيل المعاملة
    await db.collection('transactions').add({
        uid: referrerDoc.id,
        type: 'referral_bonus',
        amount: 5,
        currency: 'USDT',
        description: `مكافأة إحالة - ${displayName || 'مستخدم جديد'}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ إحالة جديدة: ${displayName} ← ${referrerData.displayName}`);
    console.log(`💰 مكافأة: 5 USDT + 1250 DZD للمُحيل`);

    return {
        referralId: referralRef.id,
        referrerUid: referrerDoc.id,
        referrerName: referrerData.displayName || 'مُحيل',
        commission: 5
    };
}

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
                referralCode: userData.referralCode || telegramId,
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
    console.log('🚀 Crynova Referral Server v2.0');
    console.log('='.repeat(50));
    console.log(`✅ خادم يعمل على المنفذ: ${PORT}`);
    console.log(`📡 Firebase: ${db ? 'متصل ✅' : 'غير متصل ❌'}`);
    if (!db) {
        console.log(`⚠️ خطأ: ${firebaseError || 'unknown'}`);
    }
    console.log('='.repeat(50));
    console.log('📌 النقاط النهائية (Endpoints):');
    console.log(`  POST /api/user/register        - تسجيل مستخدم (مع إحالة)`);
    console.log(`  POST /api/referral             - تسجيل إحالة`);
    console.log(`  GET  /api/referrals/:id        - جلب الإحصائيات`);
    console.log(`  PUT  /api/referral/:id/status  - تحديث الحالة`);
    console.log(`  GET  /api/leaderboard          - لوحة المتصدرين`);
    console.log(`  GET  /health                   - التحقق من الصحة`);
    console.log('='.repeat(50));
});

// ============================================================
// تنظيف الخريطة كل ساعة
// ============================================================
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of processedRequests.entries()) {
        if (now - timestamp > 60 * 60 * 1000) {
            processedRequests.delete(key);
        }
    }
}, 60 * 60 * 1000);
