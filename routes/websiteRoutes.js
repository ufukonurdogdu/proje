const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/websiteController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Galeri için multer ayarları
const galeriStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/uploads/galeri');
        // Klasör yoksa oluştur
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'galeri-' + uniqueSuffix + ext);
    }
});

const galeriUpload = multer({
    storage: galeriStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

// Auth middleware
const authCheck = (req, res, next) => {
    if (!req.session.userID) {
        return res.redirect('/api/auth/login');
    }
    if (req.session.rol !== 'yonetici') {
        return res.status(403).send('Bu sayfaya erişim yetkiniz yok');
    }
    next();
};

// Tüm route'lara auth middleware uygula
router.use(authCheck);

// Ana Sayfa
router.get('/', websiteController.index);

// Slider
router.get('/slider', websiteController.sliderList);
router.post('/slider/save', websiteController.sliderSave);
router.delete('/slider/:id', websiteController.sliderDelete);

// Hakkımızda
router.get('/hakkimizda', websiteController.hakkimizdaPage);
router.post('/hakkimizda/save', websiteController.hakkimizdaSave);

// Programlar
router.get('/programlar', websiteController.programlarList);
router.post('/programlar/save', websiteController.programSave);
router.delete('/programlar/:id', websiteController.programDelete);

// Eğitmenler
router.get('/egitmenler', websiteController.egitmenlerList);
router.post('/egitmenler/save', websiteController.egitmenSave);
router.delete('/egitmenler/:id', websiteController.egitmenDelete);

// Galeri
router.get('/galeri', websiteController.galeriList);
router.post('/galeri/upload', galeriUpload.single('foto'), websiteController.galeriUpload);
router.post('/galeri/video', websiteController.galeriVideo);
router.post('/galeri/save', websiteController.galeriSave);
router.delete('/galeri/:id', websiteController.galeriDelete);

// Yorumlar
router.get('/yorumlar', websiteController.yorumlarList);
router.post('/yorumlar/save', websiteController.yorumSave);
router.delete('/yorumlar/:id', websiteController.yorumDelete);
router.post('/yorumlar/:id/onayla', websiteController.yorumOnayla);

// Sayaçlar
router.get('/sayaclar', websiteController.sayaclarPage);
router.post('/sayaclar/save', websiteController.sayaclarSave);

// E-Bülten
router.get('/ebulten', websiteController.ebultenList);
router.delete('/ebulten/:id', websiteController.ebultenDelete);

// İletişim
router.get('/iletisim', websiteController.iletisimList);
router.post('/iletisim/:id/okundu', websiteController.iletisimOkundu);
router.delete('/iletisim/:id', websiteController.iletisimDelete);

// Genel Ayarlar
router.get('/ayarlar', websiteController.ayarlarPage);
router.post('/ayarlar/save', websiteController.ayarlarSave);

// Ziyaretçi İstatistikleri
router.get('/istatistikler', websiteController.istatistiklerPage);

// Canlı Destek
router.get('/canli-destek', websiteController.canliDestekList);
router.get('/canli-destek/check-updates', websiteController.canliDestekCheckUpdates);
router.get('/canli-destek/:id', websiteController.canliDestekDetay);
router.post('/canli-destek/:id/yanitla', websiteController.canliDestekYanitla);
router.post('/canli-destek/:id/kapat', websiteController.canliDestekKapat);
router.get('/canli-destek/:id/mesajlar', websiteController.canliDestekMesajlar);

module.exports = router;