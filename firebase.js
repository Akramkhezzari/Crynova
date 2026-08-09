// ============================================================
// تهيئة Firebase Admin SDK
// هذا الاتصال يتجاوز قواعد أمان Firestore (Security Rules)
// لذلك يُستخدم فقط من الخادم الموثوق، أبداً من الواجهة الأمامية
// ============================================================
require('dotenv').config();
const admin = require('firebase-admin');

if (!admin.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
        console.error('❌ متغيرات بيئة Firebase غير مكتملة. تحقق من ملف .env');
        process.exit(1);
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
        })
    });

    console.log('✅ تم الاتصال بـ Firebase Admin SDK بنجاح');
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, db, FieldValue };
