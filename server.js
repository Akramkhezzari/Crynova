// ============================================================
// ملف خادم واحد متكامل - Crynova Referral Server
// ============================================================

const express = require('express');
const cors = require('cors');
const app = express();

// ===== الإعدادات الأساسية =====
app.use(cors());
app.use(express.json());

// ===== Firebase Admin =====
const admin = require('firebase-admin');

// محاولة تحميل المفتاح بطرق مختلفة
let serviceAccount = null;

// الطريقة 1: من متغير البيئة (في Render/Heroku)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('✅ تم تحميل Firebase من متغير البيئة');
    } catch (e) {
        console.log('⚠️ فشل تحميل من متغير البيئة');
    }
}

// الطريقة 2: من الملف (للتطوير المحلي)
if (!serviceAccount) {
    try {
        serviceAccount = require('./service-account-key.json');
        console.log('✅ تم تحميل Firebase من الملف');
    } catch (e) {
        console.log('⚠️ فشل تحميل من الملف');
    }
}

// الطريقة 3: إعدادات مباشرة (إذا لم يعمل شيء)
if (!serviceAccount) {
    console.log('⚠️ استخدام إعدادات مباشرة من المتغيرات');
    serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID || "crynova-4d6b3",
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
        private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL || "",
        client_id: process.env.FIREBASE_CLIENT_ID || "",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || ""
    };
}

// تهيئة Firebase
let db = null;
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('✅ Firebase متصل بنجاح!');
} catch (error) {
    console.error('❌ فشل اتصال Firebase:', error.message);
    // استمرار بدون Firebase (وضع التجربة)
}

// ============================================================
// دوال الإحالات الأساسية
// ============================================================

/**
 * 1. تسجيل إحالة جديدة
 */
async function registerReferral(telegramId, referralCode) {
    // التحقق من اتصال Firebase
    if (!db) {
        return { 
            success: false, 
            message: 'قاعدة البيانات غير متصلة',
            error: 'FIREBASE_DISCONNECTED'
        };
    }

    try {
        console.log(`📨 معالجة الإحالة: ${telegramId} ← ${referralCode}`);
        
        const usersRef = db.collection('users');
        
        // ===== البحث عن المُحيل =====
        const referrerSnapshot = await usersRef
            .where('telegramId', '==', referralCode)
            .get();

        if (referrerSnapshot.empty) {
            return { 
                success: false, 
                message: 'كود الإحالة غير صحيح',
                error: 'INVALID_CODE'
            };
        }

        const referrerDoc = referrerSnapshot.docs[0];
        const referrerData = referrerDoc.data();

        // ===== البحث عن المستخدم الجديد =====
        const userSnapshot = await usersRef
            .where('telegramId', '==', telegramId)
            .get();

        if (userSnapshot.empty) {
            return { 
                success: false, 
                message: 'المستخدم غير موجود. يرجى التسجيل أولاً',
                error: 'USER_NOT_FOUND'
            };
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        // ===== التحقق من عدم استخدام كود سابق =====
        if (userData.referredBy) {
            return { 
                success: false, 
                message: 'تم استخدام كود إحالة سابقاً',
                error: 'ALREADY_REFERRED'
            };
        }

        // ===== تحديث المستخدم الجديد =====
        await userDoc.ref.update({
            referredBy: referralCode,
            referrerUid: referrerDoc.id,
            referralUsed: true,
            referralDate: admin.firestore.FieldValue.serverTimestamp()
        });

        // ===== تحديث المُحيل =====
        await referrerDoc.ref.update({
            'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
            'wallets.referral': admin.firestore.FieldValue.increment(5),
            'wallets.dzdReferral': admin.firestore.FieldValue.increment(1250)
        });

        // ===== إضافة سجل الإحالة =====
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

        // ===== تسجيل المعاملة =====
        await db.collection('transactions').add({
            uid: referrerDoc.id,
            type: 'referral_bonus',
            amount: 5,
            currency: 'USDT',
            description: `مكافأة إحالة ${userData.displayName || 'مستخدم جديد'}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ تم تسجيل الإحالة بنجاح!');
        
        // ===== إرسال إشعار للمُحيل (اختياري) =====
        try {
            await sendTelegramNotification(
                referrerData.telegramId,
                `🎉 مبروك! قام ${userData.displayName || 'مستخدم جديد'} بالتسجيل عبر رابطك!\n💰 تم إضافة 5 USDT إلى رصيدك.`
            );
        } catch (notifError) {
            console.log('⚠️ فشل إرسال الإشعار:', notifError.message);
        }

        return { 
            success: true, 
            message: 'تم تسجيل الإحالة بنجاح!',
            bonus: 5,
            referralId: referralRef.id
        };

    } catch (error) {
        console.error('❌ خطأ في الإحالة:', error);
        return { 
            success: false, 
            message: 'حدث خطأ في الخادم',
            error: error.message
        };
    }
}

/**
 * 2. جلب إحصائيات الإحالات لمستخدم
 */
async function getReferralStats(telegramId) {
    if (!db) {
        return { 
            success: false, 
            message: 'قاعدة البيانات غير متصلة',
            error: 'FIREBASE_DISCONNECTED'
        };
    }

    try {
        const usersRef = db.collection('users');
        const userSnapshot = await usersRef
            .where('telegramId', '==', telegramId)
            .get();

        if (userSnapshot.empty) {
            return { 
                success: false, 
                message: 'المستخدم غير موجود',
                error: 'USER_NOT_FOUND'
            };
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        // جلب قائمة الإحالات
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

        // حساب إحصائيات إضافية
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

        return {
            success: true,
            data: {
                totalReferrals: userData.miningData?.totalReferrals || 0,
                activeReferrals: activeCount,
                totalCommission: totalCommission,
                todayReferrals: todayReferrals.length,
                weekReferrals: weekReferrals.length,
                monthReferrals: monthReferrals.length,
                referralLink: `https://t.me/Crynova_bot?start=${telegramId}`,
                referrals: referrals.slice(0, 20) // آخر 20 إحالة
            }
        };

    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        return { 
            success: false, 
            message: error.message,
            error: error.message
        };
    }
}

/**
 * 3. تحديث حالة إحالة
 */
async function updateReferralStatus(referralId, status) {
    if (!db) {
        return { 
            success: false, 
            message: 'قاعدة البيانات غير متصلة'
        };
    }

    try {
        const validStatuses = ['active', 'pending', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return { 
                success: false, 
                message: 'حالة غير صالحة',
                validStatuses: validStatuses
            };
        }

        await db.collection('referrals').doc(referralId).update({
            status: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { 
            success: true, 
            message: `تم تحديث الحالة إلى ${status}` 
        };

    } catch (error) {
        console.error('❌ خطأ في تحديث الحالة:', error);
        return { 
            success: false, 
            message: error.message 
        };
    }
}

/**
 * 4. إرسال إشعار تيليجرام (اختياري)
 */
async function sendTelegramNotification(telegramId, message) {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
        console.log('⚠️ BOT_TOKEN غير موجود، تخطي الإشعار');
        return;
    }

    try {
        const axios = require('axios');
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await axios.post(url, {
            chat_id: telegramId,
            text: message,
            parse_mode: 'HTML'
        });
        console.log(`📨 تم إرسال إشعار للمستخدم ${telegramId}`);
    } catch (error) {
        console.error('❌ فشل إرسال الإشعار:', error.message);
    }
}

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * POST /api/referral
 * تسجيل إحالة جديدة
 * 
 * الجسم (Body):
 * {
 *   "telegramId": "123456789",
 *   "referralCode": "987654321"
 * }
 */
app.post('/api/referral', async (req, res) => {
    const { telegramId, referralCode } = req.body;
    
    // التحقق من المدخلات
    if (!telegramId || !referralCode) {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف المستخدم وكود الإحالة مطلوبان',
            required: ['telegramId', 'referralCode']
        });
    }

    // التأكد من أن المستخدم لا يدعو نفسه
    if (telegramId === referralCode) {
        return res.status(400).json({
            success: false,
            message: 'لا يمكنك استخدام كود الإحالة الخاص بك',
            error: 'SELF_REFERRAL'
        });
    }

    const result = await registerReferral(telegramId, referralCode);
    
    // إرجاع استجابة مناسبة
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(400).json(result);
    }
});

/**
 * GET /api/referrals/:telegramId
 * جلب إحصائيات الإحالات لمستخدم
 */
app.get('/api/referrals/:telegramId', async (req, res) => {
    const { telegramId } = req.params;
    
    if (!telegramId) {
        return res.status(400).json({
            success: false,
            message: 'معرف المستخدم مطلوب'
        });
    }

    const result = await getReferralStats(telegramId);
    
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(404).json(result);
    }
});

/**
 * PUT /api/referral/:referralId/status
 * تحديث حالة إحالة
 * 
 * الجسم (Body):
 * {
 *   "status": "completed"
 * }
 */
app.put('/api/referral/:referralId/status', async (req, res) => {
    const { referralId } = req.params;
    const { status } = req.body;
    
    if (!referralId || !status) {
        return res.status(400).json({
            success: false,
            message: 'معرف الإحالة والحالة مطلوبان'
        });
    }

    const result = await updateReferralStatus(referralId, status);
    
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(400).json(result);
    }
});

/**
 * GET /api/leaderboard
 * لوحة المتصدرين (أكثر المستخدمين إحالات)
 */
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

        res.status(200).json({
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

/**
 * GET /health
 * التحقق من صحة الخادم
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        firebase: db ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * GET /
 * الصفحة الرئيسية
 */
app.get('/', (req, res) => {
    res.json({
        name: 'Crynova Referral Server',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            'POST /api/referral': 'تسجيل إحالة جديدة',
            'GET /api/referrals/:telegramId': 'جلب إحصائيات الإحالات',
            'PUT /api/referral/:referralId/status': 'تحديث حالة إحالة',
            'GET /api/leaderboard': 'لوحة المتصدرين',
            'GET /health': 'التحقق من صحة الخادم'
        },
        example: {
            registerReferral: {
                method: 'POST',
                url: '/api/referral',
                body: {
                    telegramId: '123456789',
                    referralCode: '987654321'
                }
            },
            getReferrals: {
                method: 'GET',
                url: '/api/referrals/123456789'
            }
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
    console.log(`🔗 الرابط: http://localhost:${PORT}`);
    console.log(`📡 Firebase: ${db ? 'متصل ✅' : 'غير متصل ❌'}`);
    console.log('='.repeat(50));
    console.log('📌 النقاط النهائية (Endpoints):');
    console.log(`  POST   /api/referral           - تسجيل إحالة`);
    console.log(`  GET    /api/referrals/:id      - جلب الإحصائيات`);
    console.log(`  PUT    /api/referral/:id/status - تحديث الحالة`);
    console.log(`  GET    /api/leaderboard        - لوحة المتصدرين`);
    console.log(`  GET    /health                 - التحقق من الصحة`);
    console.log('='.repeat(50));
});
