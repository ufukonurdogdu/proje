const express = require('express');
const router = express.Router();
const kasaController = require('../controllers/kasaController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/', yetki('kasa_gor'), kasaController.kasaSayfasi);
router.post('/ekle', yetki('kasa_islem'), kasaController.islemEkle);
router.post('/duzenle', yetki('kasa_islem'), kasaController.islemDuzenle); // YENİ
router.get('/sil/:id', yetki('kasa_islem'), kasaController.islemSil);

// Kategori
router.post('/kategori/ekle', yetki('kasa_islem'), kasaController.kategoriEkle);
router.get('/kategori/sil/:id', yetki('kasa_islem'), kasaController.kategoriSil);

module.exports = router;