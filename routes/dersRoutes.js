const express = require('express');
const router = express.Router();
const dersController = require('../controllers/dersController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/program', yetki('ders_programi'), dersController.programSayfasi);
router.post('/ekle', yetki('ders_programi'), dersController.dersEkle);
router.get('/sil/:id', yetki('ders_programi'), dersController.dersSil);



module.exports = router;