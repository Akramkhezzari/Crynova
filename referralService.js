// ============================================================
// خدمة الإحالات - نسخة موثوقة من جهة الخادم
// تُعيد نفس منطق handleReferral() الموجود في الواجهة الأمامية
// لكن بصلاحيات Admin SDK حتى تكون العملية موثوقة وغير قابلة للتلاعب
// ============================================================
const { db, FieldValue } = require('./firebase');

const REFERRAL_BONUS_USDT = 5;

/**
 * البحث عن مستخدم عبر معرف تيليجرام، أو إنشاؤه إذا لم يكن موجوداً
 * @param {object} tgUser - كائن المستخدم القادم من تيليجرام (ctx.from)
 */
async function getOrCreateUser(tgUser) {
    const telegramId = String(tgUser.id);
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('telegramId', '==', telegramId).limit(1).get();

    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        await doc.ref.update({ lastLogin: FieldValue.serverTimestamp() });
        return { uid: doc.id, ...doc.data() };
    }

    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'مستخدم';
    const newUser = {
        telegramId,
        username: tgUser.username || '',
        displayName,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6c5ce7&color=fff&size=128`,
        joinDate: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
        level: 1,
        status: 'active',
        referralCode: telegramId,
        referrerBy: null,
        currency: 'USDT',
        wallets: {
            main: 0, reward: 0, referral: 0, locked: 0,
            dzd: 0, dzdReward: 0, dzdReferral: 0, dzdLocked: 0
        },
        miningData: {
            currentPackage: null,
            totalMined: 0,
            totalMinedDZD: 0,
            totalReferrals: 0,
            miningHistory: {
                today: 0, todayDZD: 0,
                thisWeek: 0, thisWeekDZD: 0,
                thisMonth: 0, thisMonthDZD: 0
            }
        }
    };

    const docRef = await usersRef.add(newUser);
    console.log('✅ تم إنشاء حساب جديد عبر الخادم:', displayName, telegramId);
    return { uid: docRef.id, ...newUser };
}

/**
 * ربط المستخدم بمُحيله ومعالجة المكافآت، بمعاملة ذرية (Transaction)
 * آمنة ضد التكرار: تتحقق من عدم وجود إحالة سابقة قبل التنفيذ
 * @param {string} referredUid - معرف وثيقة المستخدم المُحال
 * @param {string} referralCode - كود الإحالة (يساوي telegramId الخاص بالمُحيل)
 * @returns {{success: boolean, reason?: string}}
 */
async function linkReferral(referredUid, referralCode) {
    if (!referralCode) return { success: false, reason: 'لا يوجد كود إحالة' };

    const referredRef = db.collection('users').doc(referredUid);
    const referredSnap = await referredRef.get();
    if (!referredSnap.exists) return { success: false, reason: 'المستخدم المُحال غير موجود' };

    const referredData = referredSnap.data();

    if (referredData.referrerBy) {
        return { success: false, reason: 'المستخدم مُحال بالفعل' };
    }
    if (referralCode === referredData.telegramId) {
        return { success: false, reason: 'لا يمكن للمستخدم إحالة نفسه' };
    }

    const referrerSnap = await db.collection('users').where('referralCode', '==', referralCode).limit(1).get();
    if (referrerSnap.empty) {
        return { success: false, reason: 'لم يُعثر على المُحيل' };
    }
    const referrerDoc = referrerSnap.docs[0];

    const existing = await db.collection('referrals').where('referredUid', '==', referredUid).limit(1).get();
    if (!existing.empty) {
        return { success: false, reason: 'الإحالة مسجلة مسبقاً' };
    }

    await db.runTransaction(async (t) => {
        const refUserRef = referrerDoc.ref;
        const refUserDoc = await t.get(refUserRef);
        if (!refUserDoc.exists) throw new Error('المُحيل غير موجود');

        t.update(referredRef, { referrerBy: referralCode });

        t.update(refUserRef, {
            'miningData.totalReferrals': FieldValue.increment(1),
            'wallets.referral': FieldValue.increment(REFERRAL_BONUS_USDT)
        });

        t.set(db.collection('referrals').doc(), {
            referrerUid: referrerDoc.id,
            referredUid,
            displayName: referredData.displayName || 'مستخدم',
            joinedAt: FieldValue.serverTimestamp(),
            commissionEarned: REFERRAL_BONUS_USDT
        });

        t.set(db.collection('transactions').doc(), {
            uid: referrerDoc.id,
            type: 'referral_bonus',
            amount: REFERRAL_BONUS_USDT,
            currency: 'USDT',
            description: `عمولة إحالة - ${referredData.displayName || 'مستخدم'}`,
            timestamp: FieldValue.serverTimestamp()
        });
    });

    console.log(`✅ تمت معالجة إحالة: ${referrerDoc.id} <- ${referredUid}`);
    return { success: true, referrerUid: referrerDoc.id, referrerTelegramId: referrerDoc.data().telegramId };
}

module.exports = { getOrCreateUser, linkReferral, REFERRAL_BONUS_USDT };
