const express = require('express');
const router = express.Router();
const veliController = require('../controllers/veliController');

// Veli Giriş
router.get('/giris', veliController.girisForm);
router.post('/giris', veliController.girisYap);

// Veli Çıkış
router.get('/cikis', veliController.cikisYap);

// Veli Panel
router.get('/panel', veliController.veliAuth, veliController.panel);

// ⭐ Profil API'leri
router.get('/api/profil', veliController.veliAuth, veliController.profilGetir);
router.post('/api/profil/guncelle', veliController.veliAuth, veliController.profilGuncelle);
router.post('/api/giris/guncelle', veliController.veliAuth, veliController.girisGuncelle);

// ⭐ Push Bildirim API'leri
router.post('/api/push/abone-ol', veliController.veliAuth, veliController.pushAboneOl);
router.post('/api/push/abonelik-iptal', veliController.veliAuth, veliController.pushAbonelikIptal);
router.get('/api/push/vapid-key', veliController.getVapidKey);

// Diğer API'ler
router.get('/api/yoklama', veliController.veliAuth, veliController.yoklamaGetir);
router.get('/api/aidatlar', veliController.veliAuth, veliController.aidatlarGetir);
router.get('/api/analizler', veliController.veliAuth, veliController.analizlerGetir);
router.get('/api/ozel-dersler', veliController.veliAuth, veliController.ozelDerslerGetir);
router.get('/api/satislar', veliController.veliAuth, veliController.satislarGetir);
router.get('/api/ders-programi', veliController.veliAuth, veliController.dersProgramiGetir);

module.exports = router;