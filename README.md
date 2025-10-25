# Coin Crynova - نظام تخزين البيانات على GitHub

## إعداد قاعدة البيانات:

1. **إنشاء GitHub Token:**
   - اذهب إلى GitHub Settings > Developer settings > Personal access tokens
   - أنشئ token جديد مع صلاحية `gist`
   - انسخ التوكن

2. **تعديل الإعدادات:**
   - افتح ملف `config.js`
   - استبدل `ghp_your_token_here` بالتوكن الحقيقي

3. **رفع الملفات إلى GitHub:**
   - `index.html`
   - `config.js`
   - `database.js`

4. **تفعيل GitHub Pages:**
   - اذهب إلى إعدادات الريبو
   - اختر GitHub Pages
   - اختر الفرع الرئيسي (main/master)

## هيكل البيانات المخزنة:

```json
{
  "users": [
    {
      "id": "user123",
      "userName": "مستخدم",
      "balance": 1500,
      "level": 15,
      "energy": 85,
      "pointsPerClick": 5,
      "autoMiningRate": 10,
      "totalClicks": 150,
      "invitesCount": 3,
      "rewardsTotal": 3000,
      "upgrades": {
        "pickaxe": 2,
        "server": 1,
        "farm": 0,
        "datacenter": 0
      },
      "upgradeCosts": {
        "pickaxe": 32,
        "server": 90,
        "farm": 200,
        "datacenter": 1000
      },
      "created": "2024-01-01T10:00:00.000Z",
      "lastUpdated": "2024-01-01T12:00:00.000Z"
    }
  ]
}
