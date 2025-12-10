// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// GET isteği gelirse sayfayı göster
router.get('/login', authController.loginSayfasi);

// POST isteği gelirse giriş işlemini yap
router.post('/login', authController.loginIslemi);

// Çıkış Yap
router.get('/logout', authController.logout);

module.exports = router;