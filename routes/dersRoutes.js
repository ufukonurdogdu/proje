const express = require('express');
const router = express.Router();
const dersController = require('../controllers/dersController');
const yetki = require('../middleware/authMiddleware'); // Middleware'i çağır

router.get('/program', dersController.programSayfasi);
router.post('/ekle', dersController.dersEkle);
router.get('/sil/:id', dersController.dersSil);



module.exports = router;