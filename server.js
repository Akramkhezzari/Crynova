require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const fs = require('fs');

// =====================================
// 1. إعداد Firebase Admin (اختياري - يعمل بدونه)
// =====================================
let admin = null;
let db = null;

try {
  if (fs.existsSync('./serviceAccountKey.json')) {
    admin = require('firebase-admin');
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://crynova-4d6b3.firebaseio.com'
    });
    db = admin.firestore();
    console.log('✅ Firebase Admin initialized');
  } else {
    console.warn('⚠️ ملف serviceAccountKey.json غير موجود. سيتم تشغيل الخادم بدون Firebase Admin.');
  }
} catch (e) {
  console.warn('⚠️ فشل تهيئة Firebase Admin:', e && e.message ? e.message : e);
}

// =====================================
// 2. إعداد Telegram Bot (اختياري)
// =====================================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let bot = null;
let botUsername = process.env.BOT_USERNAME || 'YourBotUsername';

if (TOKEN) {
  try {
    bot = new TelegramBot(TOKEN, { polling: true });
    // حاول الحصول على اسم المستخدم للبوت لاستخدامه في روابط الإحالة إن أمكن
    bot.getMe()
      .then((me) => {
        if (me && me.username) {
          botUsername = me.username;
          console.log(`🤖 Bot username: @${botUsername}`);
        }
      })
      .catch((err) => {
        console.warn('⚠️ تعذّر الحصول على بيانات البوت (getMe):', err && err.message ? err.message : err);
      });
    console.log('🤖 Telegram bot started (polling).');
  } catch (err) {
    console.error('❌ فشل بدء البوت:', err && err.message ? err.message : err);
    bot = null;
  }
} else {
  console.warn('⚠️ لم يتم العثور على TELEGRAM_BOT_TOKEN في .env — سيتم تشغيل الخادم بدون بوت Telegram.');
}

// =====================================
// 3. إعداد Express
// =====================================
const app = express();
app.use(cors());
app.use(express.json());

// نقطة صحّة بسيطة
app.get('/health', (req, res) => res.json({ ok: true }));

// =====================================
// 4. معالجة أمر /start (إذا كان البوت مُفعلاً)
// =====================================
if (bot) {
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat && msg.chat.id;
    const rawRefCode = (match && match[1]) ? String(match[1]) : '';
    const refCode = rawRefCode.trim();

    // قراءة رابط التطبيق من .env (تأكد من أنه يحتوي على https://)
    const baseUrl = process.env.WEBAPP_URL || 'https://akramkhezzari.github.io/Crynova/';
    const encodedRef = refCode ? encodeURIComponent(refCode) : '';
    const webAppUrl = encodedRef ? `${baseUrl}?start=${encodedRef}` : baseUrl;

    // لوحة المفاتيح بزر WebApp
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🚀 فتح التطبيق',
            web_app: { url: webAppUrl }
          }
        ]
      ]
    };

    const message = `<b>مرحباً بك في Crynova Mining! ⛏️</b>\n\nاستعد لبدء التعدين وكسب العملات الرقمية. اضغط على الزر أدناه لفتح التطبيق.`;

    try {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      console.log(`✅ /start from ${chatId} with ref: ${refCode || 'none'}`);
    } catch (error) {
      console.error('❌ Error sending start message:', error && error.message ? error.message : error);
    }
  });
} else {
  console.log('ℹ️ Telegram bot is disabled; skipping bot command handlers.');
}

// =====================================
// 5. نقطة نهاية API لتوليد رابط الإحالة (اختياري)
// =====================================
app.get('/api/generate-ref-link/:userId', (req, res) => {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  // استخدم اسم البوت إن كان متوفرًا
  const username = botUsername || 'YourBotUsername';
  const link = `https://t.me/${username}?start=${encodeURIComponent(userId)}`;
  res.json({ link });
});

// =====================================
// 6. نقطة نهاية للتحقق من صحة الكود (اختياري)
// =====================================
app.get('/api/validate-ref/:code', async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ valid: false });

  // إذا كان Firebase Admin مفعلاً، نتحقق من قاعدة البيانات
  if (db) {
    try {
      const snapshot = await db.collection('users').where('telegramId', '==', code).get();
      return res.json({ valid: !snapshot.empty });
    } catch (e) {
      console.error('❌ Error checking ref in Firestore:', e && e.message ? e.message : e);
      return res.status(500).json({ valid: false, error: 'db error' });
    }
  }
  // بدون Firebase، نعتبر الكود صحيحاً افتراضياً (للتجربة)
  res.json({ valid: true });
});

// =====================================
// 7. تشغيل الخادم
// =====================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  if (bot) console.log(`🤖 Bot is polling...`);
  console.log(`🌐 WebApp URL: ${process.env.WEBAPP_URL || 'https://akramkhezzari.github.io/Crynova/'}`);
});

// تنظيف عند الإغلاق
process.on('SIGINT', () => {
  console.log('ℹ️ SIGINT received, shutting down...');
  if (bot && typeof bot.stopPolling === 'function') {
    bot.stopPolling()
      .then(() => {
        console.log('🤖 Bot polling stopped.');
        server.close(() => process.exit(0));
      })
      .catch(() => server.close(() => process.exit(0)));
  } else {
    server.close(() => process.exit(0));
  }
});

// =====================================
// 8. معالجة الأخطاء العامة
// =====================================
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});
