const express = require('express');
const router = express.Router();
const dersController = require('../controllers/dersController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/program', yetki('ders_programi_gor'), dersController.programSayfasi);
router.post('/ekle', yetki('ders_programi_islem'), dersController.dersEkle);
router.get('/sil/:id', yetki('ders_programi_islem'), dersController.dersSil);



module.exports = router;