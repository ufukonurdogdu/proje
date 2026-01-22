const express = require('express');
const router = express.Router();
const yoklamaController = require('../controllers/yoklamaController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/', yetki('yoklama_gor'), yoklamaController.yoklamaSayfasi);
router.get('/ogrenciler', yetki('yoklama_gor'), yoklamaController.ogrenciGetir); // AJAX ile liste çeker
router.post('/kaydet', yetki('yoklama_islem'), yoklamaController.yoklamaKaydet);   // AJAX ile kaydeder

module.exports = router;