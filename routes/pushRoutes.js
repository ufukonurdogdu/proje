const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');

// Auth middleware
const authMiddleware = (req, res, next) => {
    if (!req.session.userID) {
        return res.status(401).json({ success: false, message: 'Oturum gerekli' });
    }
    next();
};

// =====================================================
// PUBLIC ROUTES (Auth gerektirmeyen)
// =====================================================

// VAPID Public Key
router.get('/vapid-public-key', pushController.getVapidPublicKey);

// Debug - geliştirme için
router.get('/debug', pushController.debug);

// Test by ID - geliştirme için
router.get('/test-by-id/:id', pushController.testById);

// =====================================================
// PROTECTED ROUTES (Auth gerektiren)
// =====================================================

// Abonelik kaydet (yönetici için)
router.post('/abone-ol', authMiddleware, pushController.aboneOl);

// Abonelik iptal
router.post('/abonelik-iptal', authMiddleware, pushController.abonelikIptal);

// İstatistikler
router.get('/stats', authMiddleware, pushController.getStats);

// Toplu bildirim gönder
router.post('/toplu-bildirim', authMiddleware, pushController.topluBildirim);

// Test bildirimi (kendi hesabına)
router.post('/test-bildirim', authMiddleware, pushController.testBildirim);

// Kullanıcıya özel bildirim
router.post('/kullanici-bildirim', authMiddleware, pushController.kullaniciBildirim);

// Veliye bildirim
router.post('/veli-bildirim', authMiddleware, pushController.veliBildirim);

module.exports = router;