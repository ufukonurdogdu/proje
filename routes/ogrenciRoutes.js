const express = require('express');
const router = express.Router();
const ogrenciController = require('../controllers/ogrenciController');
const yetki = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Resim Yükleme Ayarı
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/students/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ogrenci-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// =====================================================
// Kardeş Arama (Live Search)
// =====================================================
router.get('/ara', ogrenciController.ogrenciAra);

// Rotalar
router.get('/liste', ogrenciController.ogrenciListesi);
router.get('/ekle', ogrenciController.ogrenciEkleSayfasi);
router.post('/ekle', upload.single('profil_foto'), ogrenciController.ogrenciKayitIslemi);
router.get('/profil/:id', ogrenciController.ogrenciProfil);
router.post('/odeme-yap', ogrenciController.aidatOdemeYap);

// Düzenleme & Silme
router.get('/duzenle/:id', yetki('ogrenci_duzenle'), ogrenciController.ogrenciDuzenleSayfasi);
router.post('/duzenle', yetki('ogrenci_duzenle'), upload.single('profil_foto'), ogrenciController.ogrenciDuzenleIslemi);
router.get('/sil/:id', yetki('ogrenci_sil'), ogrenciController.ogrenciSil);
router.post('/durum-guncelle', yetki('ogrenci_duzenle'), ogrenciController.durumGuncelle);

// Paket & Ders Satışı
router.post('/paket-satis', ogrenciController.paketSatisYap);

// Taksit Ödeme
router.post('/taksit-ode', ogrenciController.taksitOde);

// Özel Ders Kullanımı
router.post('/ozel-ders-kullan', ogrenciController.ozelDersKullan);

// Analiz Routes
router.post('/analiz-ekle', ogrenciController.analizEkle);
router.get('/analiz-detay/:id', ogrenciController.analizDetay);
router.get('/analiz-sil/:id', ogrenciController.analizSil);

module.exports = router;