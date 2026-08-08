// ============================================================
// Crynova Telegram Bot
// Referral System + Telegram Mini App
// ============================================================

require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");

// ============================================================
// CONFIG
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN غير موجود في ملف .env");
    process.exit(1);
}

const BOT_USERNAME = "Crynova_bot";
const WEB_APP_SHORT_NAME = "Crynova";

// رابط موقع Crynova على GitHub Pages
const WEB_APP_URL = "https://akramkhezzari.github.io/Crynova/";

// ============================================================
// BOT
// ============================================================

const bot = new Telegraf(BOT_TOKEN);

// ============================================================
// HELPERS
// ============================================================

function getUserName(user) {
    if (!user) return "مستخدم";

    if (user.first_name) {
        return user.first_name;
    }

    if (user.username) {
        return `@${user.username}`;
    }

    return "مستخدم";
}

// ============================================================
// REFERRAL LINK
// ============================================================

function createReferralLink(telegramId) {
    return `https://t.me/${BOT_USERNAME}/${WEB_APP_SHORT_NAME}?startapp=${telegramId}`;
}

// ============================================================
// START MESSAGE
// ============================================================

bot.start(async (ctx) => {
    try {
        const user = ctx.from;

        if (!user) {
            return;
        }

        const telegramId = String(user.id);
        const name = getUserName(user);

        // Telegram /start payload
        const startPayload = ctx.startPayload || null;

        console.log("======================================");
        console.log("👤 مستخدم جديد");
        console.log("ID:", telegramId);
        console.log("Name:", name);
        console.log("Referral:", startPayload);
        console.log("======================================");

        const referralLink = createReferralLink(telegramId);

        const text =
`🚀 أهلاً بك في Crynova!

مرحبًا ${name} 👋

💎 ابدأ التعدين
💰 اجمع Crynova
👥 ادعُ أصدقاءك واحصل على مكافآت
🏆 نافس في النظام

🎁 مكافأة الإحالة:
5 USDT + 1250 DZD

اضغط على الزر بالأسفل لفتح المنصة 👇`;

        await ctx.reply(
            text,
            Markup.inlineKeyboard([
                [
                    Markup.button.webApp(
                        "🚀 فتح Crynova",
                        WEB_APP_URL
                    )
                ],
                [
                    Markup.button.url(
                        "👥 رابط الإحالة الخاص بي",
                        referralLink
                    )
                ]
            ])
        );

    } catch (error) {
        console.error("❌ خطأ في /start:", error);

        try {
            await ctx.reply(
                "حدث خطأ مؤقتًا، حاول مرة أخرى بعد قليل."
            );
        } catch (_) {}
    }
});

// ============================================================
// OPEN WEB APP
// ============================================================

bot.command("app", async (ctx) => {
    try {
        await ctx.reply(
            "🚀 افتح منصة Crynova من الزر التالي:",
            Markup.inlineKeyboard([
                [
                    Markup.button.webApp(
                        "🚀 فتح Crynova",
                        WEB_APP_URL
                    )
                ]
            ])
        );
    } catch (error) {
        console.error("❌ خطأ في /app:", error);
    }
});

// ============================================================
// REFERRAL COMMAND
// ============================================================

bot.command("referral", async (ctx) => {
    try {
        const user = ctx.from;

        if (!user) return;

        const telegramId = String(user.id);

        const referralLink = createReferralLink(telegramId);

        await ctx.reply(
`👥 رابط الإحالة الخاص بك

شارك الرابط مع أصدقائك:

${referralLink}

🎁 عندما ينضم مستخدم جديد عن طريق رابطك، يمكن للنظام تسجيله كمُحال إليك وفقًا لقواعد Crynova.

🚀 كلما دعوت أشخاصًا أكثر، زادت إحالاتك.`,
            {
                disable_web_page_preview: true,
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            "🚀 فتح Crynova",
                            referralLink
                        )
                    ]
                ])
            }
        );

    } catch (error) {
        console.error("❌ خطأ في /referral:", error);
    }
});

// ============================================================
// HELP
// ============================================================

bot.command("help", async (ctx) => {
    await ctx.reply(
`🤖 أوامر Crynova

/start
بدء استخدام البوت

/app
فتح منصة Crynova

/referral
الحصول على رابط الإحالة

/help
عرض المساعدة`
    );
});

// ============================================================
// TEXT HANDLER
// ============================================================

bot.on("text", async (ctx) => {
    const text = ctx.message?.text;

    if (!text) return;

    // لا نتدخل في الأوامر
    if (text.startsWith("/")) {
        return;
    }

    await ctx.reply(
        "🚀 استخدم الزر بالأسفل لفتح منصة Crynova.",
        Markup.inlineKeyboard([
            [
                Markup.button.webApp(
                    "🚀 فتح Crynova",
                    WEB_APP_URL
                )
            ]
        ])
    );
});

// ============================================================
// ERROR HANDLER
// ============================================================

bot.catch((error, ctx) => {
    console.error("❌ Telegram Bot Error:");

    console.error(error);

    try {
        console.error(
            "Update:",
            ctx?.update?.update_id
        );
    } catch (_) {}
});

// ============================================================
// START BOT
// ============================================================

async function startBot() {
    try {
        console.log("======================================");
        console.log("🚀 Starting Crynova Bot...");
        console.log("======================================");

        // الحصول على معلومات البوت
        const me = await bot.telegram.getMe();

        console.log(`✅ Bot: @${me.username}`);
        console.log(`🆔 Bot ID: ${me.id}`);

        // إعداد Menu Button لفتح Mini App
        try {
            await bot.telegram.setChatMenuButton({
                menu_button: {
                    type: "web_app",
                    text: "🚀 Crynova",
                    web_app: {
                        url: WEB_APP_URL
                    }
                }
            });

            console.log("✅ Telegram Menu Button configured");
        } catch (error) {
            console.warn(
                "⚠️ تعذر إعداد Menu Button:",
                error.message
            );
        }

        // تشغيل البوت
        await bot.launch();

        console.log("======================================");
        console.log("✅ Crynova Bot is running");
        console.log("🌐 Web App:", WEB_APP_URL);
        console.log("🔗 Referral format:");
        console.log(
            `https://t.me/${BOT_USERNAME}/${WEB_APP_SHORT_NAME}?startapp=TELEGRAM_ID`
        );
        console.log("======================================");

    } catch (error) {
        console.error("❌ فشل تشغيل البوت:");
        console.error(error);

        process.exit(1);
    }
}

// ============================================================
// GRACEFUL STOP
// ============================================================

process.once("SIGINT", () => {
    console.log("🛑 إيقاف البوت...");
    bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
    console.log("🛑 إيقاف البوت...");
    bot.stop("SIGTERM");
});

// ============================================================
// RUN
// ============================================================

startBot();
