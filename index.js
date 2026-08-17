const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(express.json());

// ==================== 1. إعداد Firebase ====================

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT
        );

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase متصل');

    } catch (e) {
        console.error(
            '❌ خطأ في تحليل FIREBASE_SERVICE_ACCOUNT:',
            e.message
        );

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

const bot = new TelegramBot(TOKEN, {
    polling: false
});


// ==================== 3. إعداد Webhook ====================

const WEBHOOK_URL =
    process.env.WEBHOOK_URL ||
    'https://crynova-1.onrender.com/webhook';

bot.setWebHook(WEBHOOK_URL)
    .then(() => {
        console.log(`✅ Webhook مضبوط على: ${WEBHOOK_URL}`);
    })
    .catch(err => {
        console.error(
            '❌ فشل تعيين Webhook:',
            err.message
        );
    });


app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


// ==================== 4. معالجة /start ====================

bot.on('message', async (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text || '';

    // تجاهل أي رسالة ليست /start
    if (!text.startsWith('/start')) {
        return;
    }

    // ==================== قراءة Start Parameter ====================

    const parts = text.split(' ');

    let referrerId =
        parts.length > 1
            ? parts[1].trim()
            : null;


    // ==================== بيانات المستخدم ====================

    const newUserId = msg.from.id.toString();

    const firstName =
        msg.from.first_name || 'مستخدم';

    const username =
        msg.from.username || '';

    const photoURL =
        msg.from.photo_url || '';


    console.log(
        `📩 استقبال /start من ${firstName} (${newUserId}) مع مُحيل: ${referrerId || 'لا يوجد'}`
    );


    try {

        // ==================================================
        // أ. إنشاء المستخدم الجديد إذا لم يكن موجوداً
        // ==================================================

        const newUserRef =
            db.collection('users').doc(newUserId);

        const newUserDoc =
            await newUserRef.get();


        if (!newUserDoc.exists) {

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


                // ====================
                // المحافظ
                // ====================

                wallets: {
                    dzd: 0,
                    dzdReward: 0,
                    dzdReferral: 0,
                    dzdLocked: 0
                },


                // ====================
                // الاستثمارات
                // ====================

                investments: [],

                totalInvested: 0,

                totalInvestmentReturns: 0,


                // ====================
                // المعاملات
                // ====================

                transactions: [],


                // ====================
                // الإحالات
                // ====================

                referrals: [],


                // ====================
                // الإيداعات
                // ====================

                deposits: [],


                // ====================
                // السحوبات
                // ====================

                withdrawals: [],


                // ====================
                // بيانات التعدين / الإحالات
                // ====================

                miningData: {
                    totalReferrals: 0,
                    totalReferralsLevel2: 0
                },


                lastDailyDistribution: null

            });


            console.log(
                `✅ تم إنشاء مستخدم جديد: ${newUserId}`
            );


        } else {

            // تحديث معلومات المستخدم الموجودة

            await newUserRef.update({

                displayName: firstName,

                username: username,

                photoURL: photoURL

            });


            console.log(
                `ℹ️ مستخدم موجود مسبقاً: ${newUserId}`
            );
        }


        // ==================================================
        // ب. تسجيل الإحالة
        // ==================================================

        if (
            referrerId &&
            referrerId !== newUserId
        ) {

            const referrerRef =
                db.collection('users').doc(referrerId);

            const referrerDoc =
                await referrerRef.get();


            if (referrerDoc.exists) {

                const referrerData =
                    referrerDoc.data();

                const referrals =
                    referrerData.referrals || [];


                const alreadyExists =
                    referrals.some(
                        r => r.referredUid === newUserId
                    );


                // ================================
                // إحالة جديدة
                // ================================

                if (!alreadyExists) {

                    await referrerRef.update({

                        'miningData.totalReferrals':
                            admin.firestore.FieldValue.increment(1),

                        'referrals':
                            admin.firestore.FieldValue.arrayUnion({

                                referredUid:
                                    newUserId,

                                displayName:
                                    firstName,

                                joinedAt:
                                    new Date(),

                                level: 1,

                                commissionEarned: 0

                            })

                    });


                    console.log(
                        `✅ تم تسجيل إحالة جديدة: ${newUserId} بواسطة ${referrerId}`
                    );


                    // ===================================
                    // مكافأة التسجيل عبر الإحالة
                    // ===================================

                    await newUserRef.update({

                        'wallets.dzdReward':
                            admin.firestore.FieldValue.increment(500),

                        'transactions':
                            admin.firestore.FieldValue.arrayUnion({

                                type: 'reward',

                                amount: 500,

                                currency: 'DZD',

                                description:
                                    'مكافأة التسجيل عبر الإحالة',

                                timestamp:
                                    new Date()

                            })

                    });


                    console.log(
                        `🎁 مكافأة ترحيبية 500 DZD للمستخدم الجديد`
                    );


                } else {

                    console.log(
                        `⚠️ الإحالة مكررة للمستخدم: ${newUserId}`
                    );

                }


            } else {

                console.log(
                    `⚠️ المُحيل ${referrerId} غير موجود في Firebase`
                );

            }
        }


        // ==================================================
        // ج. روابط Crynova
        // ==================================================

        const webAppUrl =
            process.env.WEBAPP_URL ||
            'https://Akramkhezzari.github.io/Crynova/';


        const welcomeImage =
            process.env.WELCOME_IMAGE_URL;


        // ==================================================
        // د. أزرار الرسالة
        // ==================================================

        const keyboard = {

            inline_keyboard: [

                [
                    {
                        text: ' القناة الرسمية',
                        url: 'https://t.me/Crynova_dz'
                    }
                ],

                [
                    {
                        text: ' فتح التطبيق',
                        web_app: {
                            url: webAppUrl
                        }
                    }
                ]

            ]

        };


        // ==================================================
        // هـ. عنوان الترحيب
        // ==================================================

        const welcomeTitle =
            ` مرحباً بك ، ${firstName}!`;


        // إرسال العنوان أولاً

        await bot.sendMessage(
            chatId,
            welcomeTitle
        );


        // ==================================================
        // و. وصف الترحيب
        // ==================================================

        const welcomeDescription =
` استثمر بذكاء تابع تقدمك واستفد من فرصتك💰

 تابع مكافآتك وإحالاتك أولاً بأول 🎉🎁
 
 راقب نشاط حسابك بكل سهولة 🥇🥈🥉

 طوّر حسابك وواصل التقدم نحو مستويات أعلى 🚀🏆

 تابع قناتنا الرسمية لتصلك آخر الأخبار والتحديثات والإعلانات `;


        // ==================================================
        // ز. إرسال الصورة + الوصف + الأزرار
        // ==================================================

        if (welcomeImage) {

            await bot.sendPhoto(
                chatId,
                welcomeImage,
                {
                    caption: welcomeDescription,

                    reply_markup: keyboard
                }
            );

            console.log(
                `🖼️ تم إرسال صورة الترحيب إلى ${newUserId}`
            );


        } else {

            // إذا لم يتم وضع رابط الصورة
            // يرسل الوصف والأزرار فقط

            await bot.sendMessage(
                chatId,
                welcomeDescription,
                {
                    reply_markup: keyboard
                }
            );

            console.log(
                `ℹ️ لم يتم تحديد WELCOME_IMAGE_URL`
            );

        }


        console.log(
            `✅ اكتمل ترحيب المستخدم ${newUserId}`
        );


    } catch (error) {

        console.error(
            '❌ خطأ:',
            error
        );


        try {

            await bot.sendMessage(
                chatId,
                '❌ حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.'
            );

        } catch (sendError) {

            console.error(
                '❌ فشل إرسال رسالة الخطأ:',
                sendError.message
            );

        }

    }

});


// ==================================================
// 5. تشغيل الخادم
// ==================================================

const PORT =
    process.env.PORT || 3000;


app.listen(PORT, () => {

    console.log(
        `🚀 خادم Crynova يعمل على المنفذ ${PORT}`
    );

});
