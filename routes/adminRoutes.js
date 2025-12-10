const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const yetki = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Resim Yükleme Ayarları
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'public/uploads/') },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Rotalar
router.get('/ayarlar', adminController.ayarlarSayfasi);
router.post('/ayarlar/guncelle', upload.fields([
    { name: 'logo_default', maxCount: 1 },  // ← YENİ EKLENDİ
    { name: 'logo_192', maxCount: 1 },
    { name: 'logo_512', maxCount: 1 },
    { name: 'logo_180', maxCount: 1 }
]), adminController.ayarlariGuncelle);

// Yeni Eklenenler
router.get('/yedekle', adminController.sistemYedekle);
router.post('/sifirla', adminController.sistemSifirlama);

router.get('/form-ayarlari', adminController.formAyarlariSayfasi);
router.post('/form-ayarlari/ekle', adminController.formAlanEkle);
router.get('/form-ayarlari/sil/:id', adminController.formAlanSil);
router.post('/form-ayarlari/sirala', adminController.formSiralamaGuncelle);

// BRANŞ & GRUP ROTALARI
router.get('/branslar', yetki('brans_grup'), adminController.bransSayfasi);
router.post('/brans/ekle', yetki('brans_grup'), adminController.bransEkle);
router.get('/brans/sil/:id', yetki('brans_grup'), adminController.bransSil);
router.post('/grup/ekle', yetki('brans_grup'), adminController.grupEkle);
router.get('/grup/sil/:id', yetki('brans_grup'), adminController.grupSil);

// ŞUBE VE KULLANICI
router.get('/subeler', adminController.subeKullaniciSayfasi);
router.post('/sube/ekle', adminController.subeEkle);
router.get('/sube/sil/:id', adminController.subeSil);
router.post('/kullanici/ekle', adminController.kullaniciEkle);
router.get('/kullanici/sil/:id', adminController.kullaniciSil);
router.post('/kullanici/duzenle', adminController.kullaniciDuzenle);

// BAŞVURU YÖNETİMİ
const basvuruController = require('../controllers/basvuruController');
router.get('/basvurular', basvuruController.basvuruListesi);
router.get('/basvuru/detay/:id', basvuruController.basvuruDetay);
router.post('/basvuru/durum-guncelle', basvuruController.basvuruDurumGuncelle);
router.get('/basvuru/ogrenci-olustur/:id', basvuruController.basvuruOgrenciOlustur);
router.get('/basvuru/reddet/:id', basvuruController.basvuruReddet);
router.get('/basvuru/sil/:id', basvuruController.basvuruSil);

module.exports = router;