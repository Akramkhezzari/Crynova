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
  console.warn('⚠️ فشل تهيئة Firebase Admin:', e.message);
}

// =====================================
// 2. إعداد Telegram Bot
// =====================================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN غير موجود في .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================================
// 3. إعداد Express
// =====================================
const app = express();
app.use(cors());
app.use(express.json());

// =====================================
// 4. معالجة أمر /start
// =====================================
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const refCode = match[1] || '';

  // قراءة رابط التطبيق من .env
  const baseUrl = process.env.WEBAPP_URL || 'https://akramkhezzari.github.io/Crynova/';
  const webAppUrl = refCode ? `${baseUrl}?start=${refCode}` : baseUrl;

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

  const message = `مرحباً بك في **Crynova Mining**! ⛏️

استعد لبدء التعدين وكسب العملات الرقمية. اضغط على الزر أدناه لفتح التطبيق.`;

  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    console.log(`✅ /start from ${chatId} with ref: ${refCode || 'none'}`);
  } catch (error) {
    console.error('❌ Error sending start message:', error);
  }
});

// =====================================
// 5. نقطة نهاية API لتوليد رابط الإحالة (اختياري)
// =====================================
app.get('/api/generate-ref-link/:userId', (req, res) => {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const link = `https://t.me/YourBotUsername?start=${userId}`;
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
      return res.json({ valid: false });
    }
  }
  // بدون Firebase، نعتبر الكود صحيحاً افتراضياً (للتجربة)
  res.json({ valid: true });
});

// =====================================
// 7. تشغيل الخادم
// =====================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🤖 Bot is polling...`);
  console.log(`🌐 WebApp URL: ${process.env.WEBAPP_URL || 'https://akramkhezzari.github.io/Crynova/'}`);
});

// =====================================
// 8. معالجة الأخطاء العامة
// =====================================
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
