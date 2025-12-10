const express = require('express');
const router = express.Router();
const basvuruController = require('../controllers/basvuruController');
const multer = require('multer');
const path = require('path');

// Resim Yükleme Ayarı
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/students/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'basvuru-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece JPG, JPEG, PNG, GIF dosyaları yüklenebilir!'));
        }
    }
});

// PUBLIC ROTALAR
router.get('/', basvuruController.basvuruFormu);
router.post('/kaydet', upload.single('fotograf'), basvuruController.basvuruKaydet);

// DOĞRULAMA ROTALARI
router.post('/kod-dogrula', basvuruController.kodDogrula);
router.post('/kod-tekrar-gonder', basvuruController.kodTekrarGonder);
router.post('/basvuru-iptal', basvuruController.basvuruIptal);

module.exports = router;
