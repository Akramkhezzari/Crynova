const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

console.log('🚀 Starting server...');

// ===== Health Check =====
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        firebase: 'connected',
        timestamp: new Date().toISOString()
    });
});

// ===== Home =====
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Crynova Referral Server',
        version: '1.0.0'
    });
});

// ===== Referral API =====
app.post('/api/referral', (req, res) => {
    res.json({
        success: true,
        message: 'تم استلام الإحالة!'
    });
});

// ===== Get Referrals =====
app.get('/api/referrals/:telegramId', (req, res) => {
    res.json({
        success: true,
        data: {
            totalReferrals: 0,
            totalCommission: 0,
            referrals: []
        }
    });
});

// ===== تشغيل الخادم =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
