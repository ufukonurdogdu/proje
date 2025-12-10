const express = require('express');
const router = express.Router();
const kasaController = require('../controllers/kasaController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/', kasaController.kasaSayfasi);
router.post('/ekle', kasaController.islemEkle);
router.post('/duzenle', kasaController.islemDuzenle); // YENİ
router.get('/sil/:id', kasaController.islemSil);

// Kategori
router.post('/kategori/ekle', kasaController.kategoriEkle);
router.get('/kategori/sil/:id', kasaController.kategoriSil);

module.exports = router;