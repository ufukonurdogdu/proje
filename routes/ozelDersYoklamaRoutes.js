const express = require('express');
const router = express.Router();
const ozelDersYoklamaController = require('../controllers/ozelDersYoklamaController');

router.get('/', ozelDersYoklamaController.liste);
router.post('/kaydet', ozelDersYoklamaController.yoklamaKaydet);
router.get('/gecmis', ozelDersYoklamaController.gecmis);

module.exports = router;