const express = require('express');
const router = express.Router();
const yoklamaController = require('../controllers/yoklamaController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/', yoklamaController.yoklamaSayfasi);
router.get('/ogrenciler', yoklamaController.ogrenciGetir); // AJAX ile liste çeker
router.post('/kaydet', yoklamaController.yoklamaKaydet);   // AJAX ile kaydeder

module.exports = router;