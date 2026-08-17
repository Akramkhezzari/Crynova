const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(express.json());

// إعداد Firebase
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: false });

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.onrender.com/webhook';
bot.setWebHook(WEBHOOK_URL);

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (!text.startsWith('/start')) return;

    const parts = text.split(' ');
    let referrerId = parts.length > 1 ? parts[1].trim() : null;
    const newUserId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';

    try {
        if (referrerId && referrerId !== newUserId) {
            const userRef = db.collection('users').doc(referrerId);
            const referrerDoc = await userRef.get();
            if (referrerDoc.exists) {
                const referrals = referrerDoc.data().referrals || [];
                const alreadyExists = referrals.some(r => r.referredUid === newUserId);
                if (!alreadyExists) {
                    await userRef.update({
                        'miningData.totalReferrals': admin.firestore.FieldValue.increment(1),
                        'referrals': admin.firestore.FieldValue.arrayUnion({
                            referredUid: newUserId,
                            displayName: firstName,
                            joinedAt: new Date(),
                            level: 1,
                            commissionEarned: 0
                        })
                    });
                }
            }
        }

        const webAppUrl = process.env.WEBAPP_URL || 'https://your-username.github.io/your-repo/';
        const keyboard = {
            inline_keyboard: [
                [{ text: '🚀 فتح التطبيق', web_app: { url: webAppUrl } }]
            ]
        };

        await bot.sendMessage(chatId, `👋 مرحباً ${firstName}!\nتم تسجيل دخولك بنجاح.\n💰 استثمر واربح مع Crynova.`, {
            reply_markup: keyboard
        });
    } catch (error) {
        console.error(error);
        await bot.sendMessage(chatId, 'حدث خطأ، حاول مرة أخرى.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
