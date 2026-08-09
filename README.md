# خادم Crynova Mining 🚀

الخادم الخلفي لتطبيق Crynova Mining: بوت تيليجرام، معالجة إحالات موثوقة، ونقاط API تدعم الواجهة الأمامية (index.html).

## الملفات

| الملف | الوظيفة |
|---|---|
| `server.js` | خادم Express الرئيسي + نقاط API |
| `bot.js` | بوت تيليجرام (أمر /start وفتح التطبيق المصغر) |
| `firebase.js` | تهيئة Firebase Admin SDK |
| `referralService.js` | منطق إنشاء المستخدمين ومعالجة الإحالات بأمان |
| `firestore.rules` | قواعد أمان Firestore (اقرأ التنبيه بداخلها) |
| `.env.example` | قالب متغيرات البيئة المطلوبة |

## التثبيت

```bash
npm install
cp .env.example .env
# عدّل .env وأدخل بياناتك الحقيقية
npm start
```

## متغيرات البيئة المطلوبة

- بيانات حساب خدمة Firebase (من Firebase Console > Project Settings > Service Accounts)
- توكن بوت تيليجرام (من BotFather)
- رابط الواجهة الأمامية المستضافة (WEBAPP_URL)

## نشر قواعد Firestore

```bash
firebase deploy --only firestore:rules
```

## ⚠️ تنبيه أمني مهم

الواجهة الأمامية حالياً تكتب مباشرة إلى Firestore من المتصفح بدون Firebase
Authentication حقيقي. هذا الخادم يضيف طبقة موثوقة لمعالجة الإحالات فقط.
لتأمين بقية العمليات (الشراء، مكافآت التعدين، السحب، تأكيد الإيداع) بشكل
كامل، يجب نقلها تدريجياً لتمر عبر نقاط API في `server.js` بدلاً من الكتابة
المباشرة من الواجهة. راجع التعليقات في `firestore.rules` للتفاصيل.

## وضع الإنتاج (Webhook بدلاً من Polling)

أضف `BOT_WEBHOOK_URL` في `.env` يشير إلى رابط خادمك العام
(مثال: `https://your-domain.com/telegram-webhook`)، وسيتحول البوت تلقائياً
لوضع Webhook بدل الاستطلاع الدوري (Polling)، وهو الأنسب للإنتاج.
