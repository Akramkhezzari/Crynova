const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(express.json());

// ==================== 1. إعداد Firebase ====================
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase متصل');
    } catch (e) {
        console.error('❌ خطأ في تحليل FIREBASE_SERVICE_ACCOUNT:', e.message);
        process.exit(1);
    }
} else {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT غير موجود');
    process.exit(1);
}

const db = admin.firestore();

// ==================== 2. إعداد البوت ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN غير موجود');
    process.exit(1);
}
const bot = new TelegramBot(TOKEN, { polling: false });

// استخدم الرابط الصحيح للخدمة على Render
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://crynova-1.onrender.com/webhook';
bot.setWebHook(WEBHOOK_URL).then(() => {
    console.log(`✅ Webhook مضبوط على: ${WEBHOOK_URL}`);
}).catch(err => {
    console.error('❌ فشل تعيين Webhook:', err.message);
});

// ==================== 3. نقطة نهاية Webhook ====================
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ==================== 4. معالجة رسائل /start ====================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    // تجاهل أي رسالة ليست /start
    if (!text.startsWith('/start')) return;

    // استخراج البارامتر (معرف المُحيل)
    const parts = text.split(' ');
    let referrerId = parts.length > 1 ? parts[1].trim() : null;

    // بيانات المستخدم الجديد
    const newUserId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';
    const username = msg.from.username || '';
    const photoURL = msg.from.photo_url || '';

    console.log(`📩 استقبال /start من ${firstName} (${newUserId}) مع مُحيل: ${referrerId || 'لا يوجد'}`);

    try {
        // ========== أ. التأكد من وجود المستخدم الجديد في Firebase ==========
        const newUserRef = db.collection('users').doc(newUserId);
        const newUserDoc = await newUserRef.get();

        if (!newUserDoc.exists) {
            // إنشاء المستخدم الجديد مع جميع الحقول المطلوبة
            await newUserRef.set({
                telegramId: newUserId,
                displayName: firstName,
                username: username,
                photoURL: photoURL,
                joinDate: new Date(),
                level: 1,
                status: 'active',
                referrer: referrerId || null,
                referrerLevel2: null,
                wallets: {
                    dzd: 0,
                    dzdReward: 0,
                    dzdReferral: 0,
                    dzdLocked: 0
                },
                investments: [],
                totalInvested: 0,
                totalInvestmentReturns: 0,
                transactions: [],
                referrals: [],
                deposits: [],
                withdrawals: [],
                miningData: {
                    totalReferrals: 0,
                    totalReferralsLevel2: 0
                },
                lastDailyDistribution: null
            });
            console.log(`✅ تم إنشاء مستخدم جديد: ${newUserId}`);
        } else {
            // تحديث بيانات المستخدم إذا تغيرت
            await newUserRef.update({
                displayName: firstName,
                username: username,
                photoURL: photoURL
            });
            console.log(`ℹ️ مستخدم موجود مسبقاً: ${newUserId}`);
        }

        // ========== ب. تسجيل الإحالة إذا وُجد مُحيل ==========
        if (referrerId && referrerId !== newUserId) {
            const referrerRef = db.collection('users').doc(referrerId);
            const referrerDoc = await referrerRef.get();

            if (referrerDoc.exists) {
                const referrerData = referrerDoc.data();
                const referrals = referrerData.referrals || [];
                const alreadyExists = referrals.some(r => r.referredUid === newUserId);

                if (!alreadyExists) {
                    // تحديث المُحيل: إضافة المدعو وزيادة العدد
                    await referrerRef.update({
                        'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
                        'referrals': admin.firestore.FieldValue.arrayUnion({
                            referredUid: newUserId,
                            displayName: firstName,
                            joinedAt: new Date(),
                            level: 1,
                            commissionEarned: 0
                        })
                    });
                    console.log(`✅ تم تسجيل إحالة جديدة: ${newUserId} بواسطة ${referrerId}`);

                    // مكافأة ترحيبية للمستخدم الجديد (500 DZD)
                    await newUserRef.update({
                        'wallets.dzdReward': admin.firestore.FieldValue.increment(500),
                        'transactions': admin.firestore.FieldValue.arrayUnion({
                            type: 'reward',
                            amount: 500,
                            currency: 'DZD',
                            description: 'مكافأة التسجيل عبر الإحالة',
                            timestamp: new Date()
                        })
                    });
                    console.log(`🎁 مكافأة ترحيبية 500 DZD للمستخدم الجديد`);
                } else {
                    console.log(`⚠️ الإحالة مكررة: ${newUserId} سبق أن سُجلت للمُحيل ${referrerId}`);
                }
            } else {
                console.log(`⚠️ المُحيل ${referrerId} غير موجود في Firebase`);
            }
        }

        // ========== ج. إرسال رد للمستخدم مع زر فتح التطبيق ==========
        const webAppUrl = process.env.WEBAPP_URL || 'https://Akramkhezzari.github.io/Crynova/';
        const keyboard = {
            inline_keyboard: [
                [{ text: '🚀 فتح التطبيق', web_app: { url: webAppUrl } }]
            ]
        };

        const welcomeMessage = `
👋 مرحباً ${firstName}!

تم تسجيل دخولك بنجاح.
💰 استثمر واربح مع Crynova.

اضغط على الزر أدناه لبدء الاستثمار.
        `;

        await bot.sendMessage(chatId, welcomeMessage, {
            reply_markup: keyboard
        });

        console.log(`✅ تم إرسال رسالة الترحيب إلى ${newUserId}`);

    } catch (error) {
        console.error('❌ خطأ أثناء معالجة /start:', error);
        await bot.sendMessage(chatId, 'حدث خطأ، حاول مرة أخرى لاحقاً.');
    }
});

// ==================== 5. تشغيل الخادم ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📡 Webhook: ${WEBHOOK_URL}`);
});
