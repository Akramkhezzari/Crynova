// ============================================================
// الخادم الرئيسي - Crynova Mining Backend
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db } = require('./firebase');
const bot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================================
// فحص صحة الخادم
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'crynova-backend', time: new Date().toISOString() });
});

// ============================================================
// POST /api/referral
// نقطة اختيارية تستدعيها الواجهة الأمامية بعد نجاح الإحالة (انظر handleReferral في index.html)
// تُستخدم هنا لإرسال إشعار تيليجرام للمُحيل، وليس لإعادة كتابة الرصيد
// (لأن الإحالة تُعالَج فعلياً إما من الواجهة أو من bot.js عند /start)
// ============================================================
app.post('/api/referral', async (req, res) => {
    try {
        const { referrerId, referredId, referredName, amount } = req.body || {};
        if (!referrerId || !referredId) {
            return res.status(400).json({ ok: false, error: 'بيانات ناقصة' });
        }

        await bot.telegram.sendMessage(
            referrerId,
            `🎉 مبروك! ${referredName || 'مستخدم جديد'} انضم عبر رابط دعوتك وحصلت على ${amount || 5} USDT.`
        ).catch((e) => console.warn('⚠️ تعذر إرسال إشعار الإحالة:', e.message));

        res.json({ ok: true });
    } catch (err) {
        console.error('❌ خطأ في /api/referral:', err);
        res.status(500).json({ ok: false, error: 'خطأ داخلي' });
    }
});

// ============================================================
// GET /api/exchange-rate
// نقطة عامة لقراءة سعر الصرف الحالي (مطابقة لـ loadExchangeRate في الواجهة)
// ============================================================
app.get('/api/exchange-rate', async (req, res) => {
    try {
        const doc = await db.collection('settings').doc('exchangeRate').get();
        const rate = doc.exists ? (doc.data().rate || 250) : 250;
        res.json({ rate });
    } catch (err) {
        res.status(500).json({ error: 'تعذر جلب سعر الصرف' });
    }
});

// ============================================================
// تشغيل البوت (Polling) وخادم Express معاً
// للإنتاج: يُفضّل استخدام Webhook بدلاً من Polling (راجع README)
// ============================================================
async function start() {
    app.listen(PORT, () => {
        console.log(`✅ خادم Express يعمل على المنفذ ${PORT}`);
    });

    if (process.env.BOT_WEBHOOK_URL) {
        await bot.telegram.setWebhook(process.env.BOT_WEBHOOK_URL);
        app.use(bot.webhookCallback('/telegram-webhook'));
        console.log('✅ البوت يعمل في وضع Webhook:', process.env.BOT_WEBHOOK_URL);
    } else {
        await bot.launch();
        console.log('✅ البوت يعمل في وضع Polling');
    }
}

start().catch((err) => {
    console.error('❌ فشل تشغيل الخادم:', err);
    process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
