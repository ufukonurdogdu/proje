const express = require('express');
const router = express.Router();
const envanterController = require('../controllers/envanterController');

// Auth Middleware
const authMiddleware = (req, res, next) => {
    if (!req.session.userID) {
        return res.redirect('/api/auth/login');
    }
    next();
};

// Tüm envanter route'ları için auth kontrolü
router.use(authMiddleware);

// Ana sayfa - Ürün listesi
router.get('/', envanterController.liste);

// Ürün ekleme
router.post('/ekle', envanterController.ekle);

// Ürün güncelleme
router.post('/guncelle', envanterController.guncelle);

// Stok güncelleme
router.post('/stok-guncelle', envanterController.stokGuncelle);

// Ürün silme
router.get('/sil/:id', envanterController.sil);

// API: Ürün listesi (AJAX için)
router.get('/api/urunler', envanterController.apiUrunler);

// API: Tek ürün detayı (AJAX için)
router.get('/api/urun/:id', envanterController.apiUrunDetay);

// Ürün satışı (Öğrenci profilinden)
router.post('/satis', envanterController.urunSatisi);

module.exports = router;