const express = require('express');
const router = express.Router();
const yoklamaController = require('../controllers/yoklamaController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/', yetki('yoklama'), yoklamaController.yoklamaSayfasi);
router.get('/ogrenciler', yetki('yoklama'), yoklamaController.ogrenciGetir); // AJAX ile liste çeker
router.post('/kaydet', yetki('yoklama'), yoklamaController.yoklamaKaydet);   // AJAX ile kaydeder

module.exports = router;