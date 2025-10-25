// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// تهيئة قاعدة البيانات
const db = new sqlite3.Database(':memory:'); // يمكن تغييرها إلى ملف : ./database.db

// إنشاء الجداول
db.serialize(() => {
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        balance INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        energy INTEGER DEFAULT 100,
        points_per_click INTEGER DEFAULT 1,
        auto_mining_rate INTEGER DEFAULT 0,
        total_clicks INTEGER DEFAULT 0,
        invites_count INTEGER DEFAULT 0,
        rewards_total INTEGER DEFAULT 0,
        upgrades TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // جدول الدعوات
    db.run(`CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inviter_id TEXT,
        invited_id TEXT,
        reward_claimed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inviter_id) REFERENCES users (id),
        FOREIGN KEY (invited_id) REFERENCES users (id)
    )`);
});

// API Routes

// الحصول على بيانات المستخدم
app.get('/api/user/:id', (req, res) => {
    db.get(`
        SELECT * FROM users 
        WHERE id = ?
    `, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            row.upgrades = JSON.parse(row.upgrades || '{}');
            res.json(row);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    });
});

// حفظ بيانات المستخدم
app.post('/api/user/:id', (req, res) => {
    const {
        username, balance, level, energy, pointsPerClick,
        autoMiningRate, totalClicks, invitesCount, rewardsTotal, upgrades
    } = req.body;

    const upgradesJson = JSON.stringify(upgrades || {});

    db.run(`
        INSERT OR REPLACE INTO users 
        (id, username, balance, level, energy, points_per_click, auto_mining_rate, 
         total_clicks, invites_count, rewards_total, upgrades, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
        req.params.id, username, balance, level, energy, pointsPerClick,
        autoMiningRate, totalClicks, invitesCount, rewardsTotal, upgradesJson
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// الحصول على المتصدرين
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    
    db.all(`
        SELECT id, username, balance, level, invites_count
        FROM users 
        ORDER BY balance DESC 
        LIMIT ?
    `, [limit], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// نظام الدعوة - التحقق من الدعوة
app.get('/api/invite/check/:invitedId/:inviterId', (req, res) => {
    const { invitedId, inviterId } = req.params;

    // منع المستخدم من دعوة نفسه
    if (invitedId === inviterId) {
        return res.json({ valid: false, error: 'لا يمكن دعوة نفسك' });
    }

    // التحقق إذا كان المستخدم الجديد موجود بالفعل
    db.get('SELECT * FROM users WHERE id = ?', [invitedId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (user) {
            return res.json({ valid: false, error: 'المستخدم مسجل بالفعل' });
        }

        // التحقق إذا كانت الدعوة موجودة مسبقاً
        db.get(`
            SELECT * FROM invitations 
            WHERE inviter_id = ? AND invited_id = ?
        `, [inviterId, invitedId], (err, invitation) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (invitation) {
                return res.json({ valid: false, error: 'تم استخدام رابط الدعوة مسبقاً' });
            }

            res.json({ valid: true });
        });
    });
});

// نظام الدعوة - تطبيق المكافأة
app.post('/api/invite/apply', (req, res) => {
    const { inviterId, invitedId, invitedName } = req.body;
    const INVITE_REWARD = 1000;

    // بداية transaction
    db.serialize(() => {
        // 1. تسجيل الدعوة
        db.run(`
            INSERT INTO invitations (inviter_id, invited_id)
            VALUES (?, ?)
        `, [inviterId, invitedId]);

        // 2. تحديث بيانات المُدعِي
        db.run(`
            UPDATE users 
            SET balance = balance + ?,
                invites_count = invites_count + 1,
                rewards_total = rewards_total + ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [INVITE_REWARD, INVITE_REWARD, inviterId]);

        // 3. إنشاء حساب للمستخدم الجديد مع مكافأة
        db.run(`
            INSERT INTO users (id, username, balance, last_updated)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [invitedId, invitedName, INVITE_REWARD]);

        res.json({ 
            success: true, 
            message: 'تم تطبيق مكافأة الدعوة بنجاح',
            reward: INVITE_REWARD 
        });
    });
});

// إحصائيات النظام
app.get('/api/stats', (req, res) => {
    db.get(`
        SELECT 
            COUNT(*) as total_users,
            SUM(balance) as total_balance,
            SUM(invites_count) as total_invites,
            AVG(balance) as average_balance
        FROM users
    `, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

// إحصائيات المستخدم
app.get('/api/user/stats/:id', (req, res) => {
    const userId = req.params.id;

    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM users WHERE balance < (SELECT balance FROM users WHERE id = ?)) + 1 as rank,
            (SELECT COUNT(*) FROM users) as total_players,
            invites_count,
            rewards_total
        FROM users 
        WHERE id = ?
    `, [userId, userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Database initialized`);
});
