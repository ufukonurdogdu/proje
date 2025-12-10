const express = require('express');
const router = express.Router();
const envanterController = require('../controllers/envanterController');
const yetki = require('../middleware/authMiddleware');

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
router.get('/', yetki('envanter_gor'), envanterController.liste);

// Ürün ekleme
router.post('/ekle', yetki('envanter_islem'), envanterController.ekle);

// Ürün güncelleme
router.post('/guncelle', yetki('envanter_islem'), envanterController.guncelle);

// Stok güncelleme
router.post('/stok-guncelle', yetki('envanter_islem'), envanterController.stokGuncelle);

// Ürün silme
router.get('/sil/:id', yetki('envanter_islem'), envanterController.sil);

// API: Ürün listesi (AJAX için)
router.get('/api/urunler', yetki('envanter_gor'), envanterController.apiUrunler);

// API: Tek ürün detayı (AJAX için)
router.get('/api/urun/:id', yetki('envanter_gor'), envanterController.apiUrunDetay);

// Ürün satışı (Öğrenci profilinden)
router.post('/satis', yetki('ogrenci_profil'), envanterController.urunSatisi);

module.exports = router;