const express = require('express');
const router = express.Router();
const ozelDersYoklamaController = require('../controllers/ozelDersYoklamaController');
const yetki = require('../middleware/authMiddleware');

router.get('/', yetki('yoklama_gor'), ozelDersYoklamaController.liste);
router.post('/kaydet', yetki('yoklama_islem'), ozelDersYoklamaController.yoklamaKaydet);
router.get('/gecmis', yetki('yoklama_gor'), ozelDersYoklamaController.gecmis);

module.exports = router;