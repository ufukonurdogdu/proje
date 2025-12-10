const express = require('express');
const router = express.Router();
const ozelDersYoklamaController = require('../controllers/ozelDersYoklamaController');
const yetki = require('../middleware/authMiddleware');

router.get('/', yetki('yoklama'), ozelDersYoklamaController.liste);
router.post('/kaydet', yetki('yoklama'), ozelDersYoklamaController.yoklamaKaydet);
router.get('/gecmis', yetki('yoklama'), ozelDersYoklamaController.gecmis);

module.exports = router;