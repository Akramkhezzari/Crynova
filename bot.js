"bot.js" — Crynova Telegram Bot

"use strict";

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

// ============================================================
// CONFIG
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || "Crynova_bot";

const WEB_APP_URL =
  process.env.WEB_APP_URL ||
  "https://t.me/Crynova_bot/Crynova";

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN غير موجود في ملف .env");
  process.exit(1);
}

// ============================================================
// BOT
// ============================================================

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true,
});

console.log("=================================");
console.log("🚀 Crynova Bot Started");
console.log(`🤖 @${BOT_USERNAME}`);
console.log(`🎮 ${WEB_APP_URL}`);
console.log("=================================");

// ============================================================
// HELPERS
// ============================================================

function getUserData(msg) {
  return {
    telegramId: msg.from.id,
    username: msg.from.username || null,
    firstName: msg.from.first_name || "",
    lastName: msg.from.last_name || "",
    languageCode: msg.from.language_code || "ar",
  };
}

function getReferralLink(telegramId) {
  return `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`;
}

async function sendMainMenu(chatId, firstName = "") {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🎮 تشغيل Crynova",
            web_app: {
              url: WEB_APP_URL,
            },
          },
        ],
        [
          {
            text: "💰 رصيدي",
            callback_data: "balance",
          },
          {
            text: "👥 إحالاتي",
            callback_data: "referrals",
          },
        ],
        [
          {
            text: "🎁 المكافآت",
            callback_data: "rewards",
          },
        ],
        [
          {
            text: "📖 المساعدة",
            callback_data: "help",
          },
        ],
      ],
    },
  };

  const name = firstName || "صديقي";

  const text =
    `🚀 أهلاً ${name} في Crynova!\n\n` +
    `⛏️ ابدأ التعدين واجمع Crynova.\n` +
    `👥 ادعُ أصدقاءك واحصل على مكافآت.\n` +
    `🎁 أكمل المهام اليومية.\n\n` +
    `اضغط على «🎮 تشغيل Crynova» لفتح اللعبة.`;

  return bot.sendMessage(chatId, text, keyboard);
}

// ============================================================
// START
// ============================================================

bot.onText(/^\/start(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = getUserData(msg);

  const startParameter = match?.[1] || null;

  let referralId = null;

  if (startParameter) {
    if (startParameter.startsWith("ref_")) {
      referralId = startParameter.substring(4);
    } else {
      referralId = startParameter;
    }
  }

  console.log("=================================");
  console.log("👤 START");
  console.log("Telegram ID:", user.telegramId);
  console.log("Username:", user.username);
  console.log("Referral:", referralId);
  console.log("=================================");

  try {
    /*
     * هنا لاحقًا نرسل المستخدم إلى الـBackend.
     *
     * مثال:
     *
     * await fetch(`${BACKEND_URL}/api/users/start`, {
     *   method: "POST",
     *   headers: {
     *     "Content-Type": "application/json"
     *   },
     *   body: JSON.stringify({
     *     ...user,
     *     referralId
     *   })
     * });
     *
     * لا نضع منطق الرصيد والتعدين داخل البوت.
     */

    await sendMainMenu(chatId, user.firstName);
  } catch (error) {
    console.error("❌ /start error:", error);

    await bot.sendMessage(
      chatId,
      "❌ حدث خطأ مؤقتًا. حاول مرة أخرى بعد قليل."
    );
  }
});

// ============================================================
// HELP
// ============================================================

bot.onText(/^\/help$/i, async (msg) => {
  const chatId = msg.chat.id;

  const text =
    `📚 مساعدة Crynova\n\n` +
    `🎮 /start — تشغيل اللعبة\n` +
    `💰 /balance — عرض الرصيد\n` +
    `👥 /referral — رابط الإحالة\n` +
    `🎁 /rewards — المكافآت\n` +
    `❓ /help — المساعدة\n\n` +
    `إذا واجهت مشكلة، حاول إعادة تشغيل اللعبة.`;

  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error("❌ /help error:", error.message);
  }
});

// ============================================================
// BALANCE
// ============================================================

bot.onText(/^\/balance$/i, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(
      chatId,
      `💰 رصيدك\n\n` +
        `افتح Crynova من الزر التالي لمعرفة رصيدك الحقيقي:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 فتح Crynova",
                web_app: {
                  url: WEB_APP_URL,
                },
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("❌ /balance error:", error.message);
  }
});

// ============================================================
// REFERRAL
// ============================================================

bot.onText(/^\/referral$/i, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const referralLink = getReferralLink(telegramId);

  const text =
    `👥 نظام الإحالة\n\n` +
    `🔗 رابط دعوتك:\n\n` +
    `${referralLink}\n\n` +
    `📢 شارك الرابط مع أصدقائك.\n` +
    `عند انضمام مستخدم جديد من خلال رابطك، يتم تسجيل الإحالة في النظام.\n\n` +
    `⚠️ يتم احتساب المكافآت من طرف الـBackend.`;

  try {
    await bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎮 فتح Crynova",
              web_app: {
                url: WEB_APP_URL,
              },
            },
          ],
          [
            {
              text: "📤 مشاركة رابط الإحالة",
              switch_inline_query: referralLink,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("❌ /referral error:", error.message);
  }
});

// ============================================================
// REWARDS
// ============================================================

bot.onText(/^\/rewards$/i, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(
      chatId,
      `🎁 المكافآت والمهام\n\n` +
        `افتح Crynova لمعرفة:\n\n` +
        `🎁 المكافأة اليومية\n` +
        `📋 المهام\n` +
        `👥 مكافآت الإحالة\n` +
        `🏆 الإنجازات`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 فتح Crynova",
                web_app: {
                  url: WEB_APP_URL,
                },
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("❌ /rewards error:", error.message);
  }
});

// ============================================================
// CALLBACK QUERIES
// ============================================================

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  const data = query.data;

  try {
    await bot.answerCallbackQuery(query.id);

    if (!chatId) {
      return;
    }

    switch (data) {
      case "balance":

        await bot.sendMessage(
          chatId,
          `💰 لعرض رصيدك الحالي افتح Crynova:`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🎮 فتح اللعبة",
                    web_app: {
                      url: WEB_APP_URL,
                    },
                  },
                ],
              ],
            },
          }
        );

        break;

      case "referrals": {

        const telegramId = query.from.id;
        const referralLink = getReferralLink(telegramId);

        await bot.sendMessage(
          chatId,
          `👥 إحالاتك\n\n` +
            `رابط الإحالة الخاص بك:\n\n` +
            `${referralLink}\n\n` +
            `📊 سيتم عرض عدد الإحالات والمكافآت داخل Crynova.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🎮 فتح Crynova",
                    web_app: {
                      url: WEB_APP_URL,
                    },
                  },
                ],
              ],
            },
          }
        );

        break;
      }

      case "rewards":

        await bot.sendMessage(
          chatId,
          `🎁 افتح Crynova لمشاهدة المهام والمكافآت.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🎮 فتح Crynova",
                    web_app: {
                      url: WEB_APP_URL,
                    },
                  },
                ],
              ],
            },
          }
        );

        break;

      case "help":

        await bot.sendMessage(
          chatId,
          `📖 Crynova\n\n` +
            `🎮 افتح اللعبة من زر تشغيل Crynova.\n` +
            `⛏️ التعدين يتم داخل اللعبة.\n` +
            `👥 الإحالات يتم تسجيلها تلقائيًا.\n` +
            `🎁 المهام والمكافآت تظهر داخل التطبيق.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🎮 تشغيل Crynova",
                    web_app: {
                      url: WEB_APP_URL,
                    },
                  },
                ],
              ],
            },
          }
        );

        break;

      default:
        console.log("⚠️ Unknown callback:", data);
    }
  } catch (error) {
    console.error("❌ Callback error:", error.message);
  }
});

// ============================================================
// WEB APP DATA
// ============================================================

bot.on("message", async (msg) => {
  if (!msg.web_app_data) {
    return;
  }

  const chatId = msg.chat.id;

  try {
    const data = JSON.parse(msg.web_app_data.data);

    console.log("📱 WebApp Data:", data);

    /*
     * مهم:
     * لا تثق بالبيانات القادمة من WebApp وحدها.
     *
     * التحقق الحقيقي من Telegram initData
     * يجب أن يتم في الـBackend.
     */

    await bot.sendMessage(
      chatId,
      "✅ تم استلام البيانات."
    );
  } catch (error) {
    console.error("❌ WebApp data error:", error.message);
  }
});

// ============================================================
// POLLING ERRORS
// ============================================================

bot.on("polling_error", (error) => {
  console.error("⚠️ Telegram polling error:", error.message);
});

// ============================================================
// GENERAL ERROR
// ============================================================

bot.on("error", (error) => {
  console.error("❌ Telegram bot error:", error.message);
});

// ============================================================
// SHUTDOWN
// ============================================================

async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received.`);
  console.log("Stopping Crynova Bot...");

  try {
    await bot.stopPolling();
    console.log("✅ Bot stopped.");
  } catch (error) {
    console.error("❌ Stop error:", error.message);
  }

  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
