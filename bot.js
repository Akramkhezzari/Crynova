// ============================================================
// بوت تيليجرام - فتح التطبيق المصغر (WebApp) ومعالجة الإحالات
// ============================================================
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { getOrCreateUser, linkReferral } = require('./referralService');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN غير موجود في .env');
    process.exit(1);
}
if (!WEBAPP_URL) {
    console.warn('⚠️ WEBAPP_URL غير محدد، زر فتح التطبيق لن يعمل بشكل صحيح');
}

const bot = new Telegraf(BOT_TOKEN);

// ============================================================
// أمر /start [كود_الإحالة]
// ============================================================
bot.start(async (ctx) => {
    try {
        const referralCode = (ctx.startPayload || '').trim();
        const user = await getOrCreateUser(ctx.from);

        if (referralCode) {
            const result = await linkReferral(user.uid, referralCode);
            if (result.success) {
                await ctx.telegram.sendMessage(
                    result.referrerTelegramId,
                    `🎉 مبروك! ${user.displayName || 'مستخدم جديد'} انضم عبر رابط دعوتك وحصلت على 5 USDT.`
                ).catch(() => {}); // تجاهل الخطأ إذا كان المُحيل قد حظر البوت
            } else {
                console.log('ℹ️ لم تُعالج الإحالة:', result.reason);
            }
        }

        const webAppUrl = referralCode ? `${WEBAPP_URL}?start=${encodeURIComponent(referralCode)}` : WEBAPP_URL;

        await ctx.reply(
            `مرحباً ${user.displayName || ''} 👋\nأهلاً بك في Crynova Mining ⛏️\n\nاضغط الزر أدناه لفتح التطبيق وابدأ التعدين الآن.`,
            Markup.inlineKeyboard([
                Markup.button.webApp('🚀 فتح التطبيق', webAppUrl)
            ])
        );
    } catch (err) {
        console.error('❌ خطأ في معالجة /start:', err);
        await ctx.reply('حدث خطأ أثناء تسجيل الدخول، حاول مرة أخرى لاحقاً.');
    }
});

// ============================================================
// أمر /help
// ============================================================
bot.help((ctx) => {
    ctx.reply('استخدم /start لفتح تطبيق Crynova Mining. لأي استفسار تواصل مع الدعم داخل التطبيق.');
});

bot.catch((err, ctx) => {
    console.error(`❌ خطأ غير متوقع للمحدث ${ctx.updateType}:`, err);
});

module.exports = bot;
