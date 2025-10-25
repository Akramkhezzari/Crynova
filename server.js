// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// ملف قاعدة البيانات البسيط
const DB_FILE = 'database.json';

// تهيئة قاعدة البيانات إذا لم تكن موجودة
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
    }
}

// قراءة البيانات
function readData() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: [] };
    }
}

// حفظ البيانات
function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// الحصول على بيانات المستخدم
app.get('/api/user/:id', (req, res) => {
    const data = readData();
    const user = data.users.find(u => u.id === req.params.id);
    
    if (user) {
        res.json(user);
    } else {
        res.json(null);
    }
});

// حفظ بيانات المستخدم
app.post('/api/user/:id', (req, res) => {
    const data = readData();
    const userIndex = data.users.findIndex(u => u.id === req.params.id);
    
    if (userIndex !== -1) {
        data.users[userIndex] = { ...data.users[userIndex], ...req.body };
    } else {
        data.users.push({ id: req.params.id, ...req.body });
    }
    
    saveData(data);
    res.json({ success: true });
});

// الحصول على المتصدرين
app.get('/api/leaderboard', (req, res) => {
    const data = readData();
    const leaderboard = data.users
        .sort((a, b) => (b.balance || 0) - (a.balance || 0))
        .slice(0, 100)
        .map(user => ({
            name: user.userName || 'مستخدم',
            balance: user.balance || 0,
            id: user.id
        }));
    
    res.json(leaderboard);
});

// تحديث مكافآت الدعوة
app.post('/api/invite/:inviterId', (req, res) => {
    const data = readData();
    const inviterIndex = data.users.findIndex(u => u.id === req.params.inviterId);
    
    if (inviterIndex !== -1) {
        const user = data.users[inviterIndex];
        const invitesCount = (user.invitesCount || 0) + 1;
        const rewardsTotal = (user.rewardsTotal || 0) + 1000;
        const balance = (user.balance || 0) + 1000;
        
        data.users[inviterIndex] = {
            ...user,
            invitesCount,
            rewardsTotal,
            balance
        };
        
        saveData(data);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'User not found' });
    }
});

app.listen(PORT, () => {
    initDatabase();
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Database file: ${DB_FILE}`);
});
