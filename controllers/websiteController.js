const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// =====================================================
// YARDIMCI FONKSİYONLAR - UNDEFINED HATASINI ÖNLER
// =====================================================
function safeValue(val) {
    return (val === undefined || val === '') ? null : val;
}

function safeInt(val, defaultVal = 0) {
    const parsed = parseInt(val);
    return isNaN(parsed) ? defaultVal : parsed;
}

// =====================================================
// MULTER CONFIGURATIONS - RESİM YÜKLEME
// =====================================================

// Slider için multer storage
const sliderStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/images/slider');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        cb(null, 'slide-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const sliderUploadMiddleware = multer({
    storage: sliderStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
}).single('resim');

// Hakkımızda için multer storage
const hakkimizdaStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/images/hakkimizda');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        cb(null, 'hakkimizda-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const hakkimizdaUploadMiddleware = multer({
    storage: hakkimizdaStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
}).single('resim');

// Eğitmenler için multer storage
const egitmenlerStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/images/egitmenler');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        cb(null, 'egitmen-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const egitmenlerUploadMiddleware = multer({
    storage: egitmenlerStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
}).single('foto');

// =====================================================
// ANA YÖNETİM SAYFASI
// =====================================================
exports.index = async (req, res) => {
    try {
        let stats = {
            slider: 0,
            programlar: 0,
            egitmenler: 0,
            galeri: 0,
            yorumlar: 0,
            ebulten: 0,
            canliDestek: 0,
            bekleyenChat: 0,
            iletisim: 0,
            okunmamisIletisim: 0,
            toplamZiyaret: 0,
            bugunZiyaret: 0
        };

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_slider WHERE durum = 1');
            stats.slider = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_programlar WHERE durum = 1');
            stats.programlar = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_egitmenler WHERE durum = 1');
            stats.egitmenler = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_galeri WHERE durum = 1');
            stats.galeri = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_yorumlar WHERE onay = 1');
            stats.yorumlar = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_ebulten');
            stats.ebulten = r[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM canli_destek_konusmalar');
            stats.canliDestek = r[0].c;
            const [r2] = await db.execute("SELECT COUNT(*) as c FROM canli_destek_konusmalar WHERE durum = 'beklemede'");
            stats.bekleyenChat = r2[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_iletisim');
            stats.iletisim = r[0].c;
            const [r2] = await db.execute('SELECT COUNT(*) as c FROM landing_iletisim WHERE okundu = 0');
            stats.okunmamisIletisim = r2[0].c;
        } catch (e) {}

        try {
            const [r] = await db.execute('SELECT COUNT(*) as c FROM landing_ziyaretci');
            stats.toplamZiyaret = r[0].c;
            
            const bugun = new Date().toISOString().split('T')[0];
            const [r2] = await db.execute('SELECT COUNT(*) as c FROM landing_ziyaretci WHERE DATE(created_at) = ?', [bugun]);
            stats.bugunZiyaret = r2[0].c;
        } catch (e) {
            stats.toplamZiyaret = 0;
            stats.bugunZiyaret = 0;
        }

        res.render('website-yonetim.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                sube_id: req.session.subeId,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari,
            stats
        });

    } catch (error) {
        console.error('Website yönetim hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

// =====================================================
// SLIDER YÖNETİMİ
// =====================================================
exports.sliderList = async (req, res) => {
    try {
        const [sliderlar] = await db.execute('SELECT * FROM landing_slider ORDER BY sira ASC');
        
        res.render('website-slider.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            sliderlar
        });
    } catch (error) {
        console.error('Slider listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

// Slider Kaydet - RESİM DESTEKLİ
exports.sliderSave = (req, res) => {
    sliderUploadMiddleware(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.json({ success: false, message: 'Dosya yükleme hatası: ' + err.message });
        } else if (err) {
            return res.json({ success: false, message: err.message });
        }

        try {
            const { id, baslik, alt_baslik, aciklama, buton_yazi, buton_link, sira, durum, mevcut_resim } = req.body;
            
            const durumInt = (durum == 1 || durum == 'on' || durum == 'true' || durum === true) ? 1 : 0;
            
            let resim = safeValue(mevcut_resim);
            
            if (req.file) {
                resim = req.file.filename;
                if (id && mevcut_resim) {
                    const oldImagePath = path.join(__dirname, '../public/images/slider', mevcut_resim);
                    if (fs.existsSync(oldImagePath)) {
                        try { fs.unlinkSync(oldImagePath); } catch (e) {}
                    }
                }
            }

            const safeBaslik = safeValue(baslik) || 'Başlık';
            const safeAltBaslik = safeValue(alt_baslik);
            const safeAciklama = safeValue(aciklama);
            const safeButonYazi = safeValue(buton_yazi) || 'Hemen Başvur';
            const safeButonLink = safeValue(buton_link) || '/basvuru';
            const safeSira = safeInt(sira, 0);

            if (id) {
                await db.execute(`
                    UPDATE landing_slider 
                    SET baslik = ?, alt_baslik = ?, aciklama = ?, buton_yazi = ?, buton_link = ?, sira = ?, durum = ?, resim = ?
                    WHERE id = ?
                `, [safeBaslik, safeAltBaslik, safeAciklama, safeButonYazi, safeButonLink, safeSira, durumInt, resim, id]);
            } else {
                await db.execute(`
                    INSERT INTO landing_slider (baslik, alt_baslik, aciklama, buton_yazi, buton_link, sira, durum, resim)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [safeBaslik, safeAltBaslik, safeAciklama, safeButonYazi, safeButonLink, safeSira, durumInt, resim]);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Slider kayıt hatası:', error);
            res.json({ success: false, message: error.message });
        }
    });
};

// Slider Sil
exports.sliderDelete = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.json({ success: false, message: 'ID gerekli' });
        }
        
        const [slider] = await db.execute('SELECT resim FROM landing_slider WHERE id = ?', [id]);
        
        if (slider.length > 0 && slider[0].resim) {
            const imagePath = path.join(__dirname, '../public/images/slider', slider[0].resim);
            if (fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) {}
            }
        }
        
        await db.execute('DELETE FROM landing_slider WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Slider silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// HAKKIMIZDA YÖNETİMİ
// =====================================================
exports.hakkimizdaPage = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM landing_hakkimizda LIMIT 1');
        const hakkimizda = rows[0] || {};
        
        res.render('website-hakkimizda.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            hakkimizda
        });
    } catch (error) {
        console.error('Hakkımızda sayfası hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

// Hakkımızda Kaydet - RESİM DESTEKLİ
exports.hakkimizdaSave = (req, res) => {
    hakkimizdaUploadMiddleware(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.json({ success: false, message: 'Dosya yükleme hatası: ' + err.message });
        } else if (err) {
            return res.json({ success: false, message: err.message });
        }

        try {
            const data = req.body;
            
            let resim = safeValue(data.mevcut_resim);
            
            if (req.file) {
                resim = req.file.filename;
                if (data.mevcut_resim) {
                    const oldImagePath = path.join(__dirname, '../public/images/hakkimizda', data.mevcut_resim);
                    if (fs.existsSync(oldImagePath)) {
                        try { fs.unlinkSync(oldImagePath); } catch (e) {}
                    }
                }
            }
            
            const values = {
                baslik: safeValue(data.baslik) || 'BİZ KİMİZ?',
                aciklama: safeValue(data.aciklama),
                aciklama_2: safeValue(data.aciklama_2),
                deneyim_yili: safeInt(data.deneyim_yili, 15),
                ozellik_1_ikon: safeValue(data.ozellik_1_ikon) || 'certificate',
                ozellik_1_baslik: safeValue(data.ozellik_1_baslik) || 'Lisanslı Eğitim',
                ozellik_1_aciklama: safeValue(data.ozellik_1_aciklama) || 'Sertifikalı antrenörler',
                ozellik_2_ikon: safeValue(data.ozellik_2_ikon) || 'users',
                ozellik_2_baslik: safeValue(data.ozellik_2_baslik) || 'Yaşa Özel',
                ozellik_2_aciklama: safeValue(data.ozellik_2_aciklama) || 'Her yaş grubuna program',
                ozellik_3_ikon: safeValue(data.ozellik_3_ikon) || 'chart-line',
                ozellik_3_baslik: safeValue(data.ozellik_3_baslik) || 'Gelişim Takibi',
                ozellik_3_aciklama: safeValue(data.ozellik_3_aciklama) || 'Düzenli raporlama',
                ozellik_4_ikon: safeValue(data.ozellik_4_ikon) || 'shield-alt',
                ozellik_4_baslik: safeValue(data.ozellik_4_baslik) || 'Güvenli Ortam',
                ozellik_4_aciklama: safeValue(data.ozellik_4_aciklama) || 'Sigortalı eğitim',
                resim: resim
            };
            
            const [existing] = await db.execute('SELECT id FROM landing_hakkimizda LIMIT 1');
            
            if (existing.length > 0) {
                await db.execute(`
                    UPDATE landing_hakkimizda SET
                        baslik = ?, aciklama = ?, aciklama_2 = ?, deneyim_yili = ?,
                        ozellik_1_ikon = ?, ozellik_1_baslik = ?, ozellik_1_aciklama = ?,
                        ozellik_2_ikon = ?, ozellik_2_baslik = ?, ozellik_2_aciklama = ?,
                        ozellik_3_ikon = ?, ozellik_3_baslik = ?, ozellik_3_aciklama = ?,
                        ozellik_4_ikon = ?, ozellik_4_baslik = ?, ozellik_4_aciklama = ?,
                        resim = ?
                    WHERE id = ?
                `, [
                    values.baslik, values.aciklama, values.aciklama_2, values.deneyim_yili,
                    values.ozellik_1_ikon, values.ozellik_1_baslik, values.ozellik_1_aciklama,
                    values.ozellik_2_ikon, values.ozellik_2_baslik, values.ozellik_2_aciklama,
                    values.ozellik_3_ikon, values.ozellik_3_baslik, values.ozellik_3_aciklama,
                    values.ozellik_4_ikon, values.ozellik_4_baslik, values.ozellik_4_aciklama,
                    values.resim, existing[0].id
                ]);
            } else {
                await db.execute(`
                    INSERT INTO landing_hakkimizda 
                    (baslik, aciklama, aciklama_2, deneyim_yili, ozellik_1_ikon, ozellik_1_baslik, ozellik_1_aciklama, ozellik_2_ikon, ozellik_2_baslik, ozellik_2_aciklama, ozellik_3_ikon, ozellik_3_baslik, ozellik_3_aciklama, ozellik_4_ikon, ozellik_4_baslik, ozellik_4_aciklama, resim)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    values.baslik, values.aciklama, values.aciklama_2, values.deneyim_yili,
                    values.ozellik_1_ikon, values.ozellik_1_baslik, values.ozellik_1_aciklama,
                    values.ozellik_2_ikon, values.ozellik_2_baslik, values.ozellik_2_aciklama,
                    values.ozellik_3_ikon, values.ozellik_3_baslik, values.ozellik_3_aciklama,
                    values.ozellik_4_ikon, values.ozellik_4_baslik, values.ozellik_4_aciklama,
                    values.resim
                ]);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Hakkımızda kayıt hatası:', error);
            res.json({ success: false, message: error.message });
        }
    });
};

// =====================================================
// PROGRAMLAR YÖNETİMİ
// =====================================================
exports.programlarList = async (req, res) => {
    try {
        const [programlar] = await db.execute('SELECT * FROM landing_programlar ORDER BY sira ASC');
        
        res.render('website-programlar.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            programlar
        });
    } catch (error) {
        console.error('Programlar listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.programSave = async (req, res) => {
    try {
        const data = req.body;
        const durumInt = (data.durum == 1 || data.durum == 'on' || data.durum == 'true' || data.durum === true) ? 1 : 0;

        const values = {
            program_adi: safeValue(data.program_adi) || 'Program',
            kisa_aciklama: safeValue(data.kisa_aciklama),
            uzun_aciklama: safeValue(data.uzun_aciklama),
            ikon: safeValue(data.ikon) || 'futbol',
            yas_grubu: safeValue(data.yas_grubu),
            ders_suresi: safeValue(data.ders_suresi),
            haftalik_ders: safeValue(data.haftalik_ders),
            kontenjan: safeValue(data.kontenjan),
            ozellik_1: safeValue(data.ozellik_1),
            ozellik_2: safeValue(data.ozellik_2),
            ozellik_3: safeValue(data.ozellik_3),
            ozellik_4: safeValue(data.ozellik_4),
            sira: safeInt(data.sira, 0),
            durum: durumInt
        };

        if (data.id) {
            await db.execute(`
                UPDATE landing_programlar SET
                    program_adi = ?, kisa_aciklama = ?, uzun_aciklama = ?, ikon = ?,
                    yas_grubu = ?, ders_suresi = ?, haftalik_ders = ?, kontenjan = ?,
                    ozellik_1 = ?, ozellik_2 = ?, ozellik_3 = ?, ozellik_4 = ?,
                    sira = ?, durum = ?
                WHERE id = ?
            `, [
                values.program_adi, values.kisa_aciklama, values.uzun_aciklama, values.ikon,
                values.yas_grubu, values.ders_suresi, values.haftalik_ders, values.kontenjan,
                values.ozellik_1, values.ozellik_2, values.ozellik_3, values.ozellik_4,
                values.sira, values.durum, data.id
            ]);
        } else {
            await db.execute(`
                INSERT INTO landing_programlar 
                (program_adi, kisa_aciklama, uzun_aciklama, ikon, yas_grubu, ders_suresi, haftalik_ders, kontenjan, ozellik_1, ozellik_2, ozellik_3, ozellik_4, sira, durum)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                values.program_adi, values.kisa_aciklama, values.uzun_aciklama, values.ikon,
                values.yas_grubu, values.ders_suresi, values.haftalik_ders, values.kontenjan,
                values.ozellik_1, values.ozellik_2, values.ozellik_3, values.ozellik_4,
                values.sira, values.durum
            ]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Program kayıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.programDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        await db.execute('DELETE FROM landing_programlar WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// EĞİTMENLER YÖNETİMİ
// =====================================================
exports.egitmenlerList = async (req, res) => {
    try {
        const [egitmenler] = await db.execute('SELECT * FROM landing_egitmenler ORDER BY sira ASC');
        
        res.render('website-egitmenler.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            egitmenler
        });
    } catch (error) {
        console.error('Eğitmenler listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

// Eğitmen Kaydet - FOTOĞRAF DESTEKLİ
exports.egitmenSave = (req, res) => {
    egitmenlerUploadMiddleware(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.json({ success: false, message: 'Dosya yükleme hatası: ' + err.message });
        } else if (err) {
            return res.json({ success: false, message: err.message });
        }

        try {
            const data = req.body;
            
            const durumInt = (data.durum == 1 || data.durum == 'on' || data.durum == 'true' || data.durum === true) ? 1 : 0;
            
            let foto = safeValue(data.mevcut_foto);
            
            if (req.file) {
                foto = req.file.filename;
                if (data.id && data.mevcut_foto) {
                    const oldPhotoPath = path.join(__dirname, '../public/images/egitmenler', data.mevcut_foto);
                    if (fs.existsSync(oldPhotoPath)) {
                        try { fs.unlinkSync(oldPhotoPath); } catch (e) {}
                    }
                }
            }

            const values = {
                ad_soyad: safeValue(data.ad_soyad) || 'İsimsiz',
                unvan: safeValue(data.unvan),
                brans: safeValue(data.brans),
                deneyim_yil: safeInt(data.deneyim_yil, 0),
                aciklama: safeValue(data.aciklama),
                instagram: safeValue(data.instagram),
                twitter: safeValue(data.twitter),
                linkedin: safeValue(data.linkedin),
                sira: safeInt(data.sira, 0),
                durum: durumInt,
                foto: foto
            };

            if (data.id) {
                await db.execute(`
                    UPDATE landing_egitmenler SET
                        ad_soyad = ?, unvan = ?, brans = ?, deneyim_yil = ?, aciklama = ?,
                        instagram = ?, twitter = ?, linkedin = ?, sira = ?, durum = ?, foto = ?
                    WHERE id = ?
                `, [
                    values.ad_soyad, values.unvan, values.brans, values.deneyim_yil, values.aciklama,
                    values.instagram, values.twitter, values.linkedin, values.sira, values.durum, values.foto,
                    data.id
                ]);
            } else {
                await db.execute(`
                    INSERT INTO landing_egitmenler 
                    (ad_soyad, unvan, brans, deneyim_yil, aciklama, instagram, twitter, linkedin, sira, durum, foto)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    values.ad_soyad, values.unvan, values.brans, values.deneyim_yil, values.aciklama,
                    values.instagram, values.twitter, values.linkedin, values.sira, values.durum, values.foto
                ]);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Eğitmen kayıt hatası:', error);
            res.json({ success: false, message: error.message });
        }
    });
};

// Eğitmen Sil
exports.egitmenDelete = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        const [egitmen] = await db.execute('SELECT foto FROM landing_egitmenler WHERE id = ?', [id]);
        
        if (egitmen.length > 0 && egitmen[0].foto) {
            const photoPath = path.join(__dirname, '../public/images/egitmenler', egitmen[0].foto);
            if (fs.existsSync(photoPath)) {
                try { fs.unlinkSync(photoPath); } catch (e) {}
            }
        }
        
        await db.execute('DELETE FROM landing_egitmenler WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Eğitmen silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// GALERİ YÖNETİMİ
// =====================================================
exports.galeriList = async (req, res) => {
    try {
        const [galeri] = await db.execute('SELECT * FROM landing_galeri ORDER BY sira ASC, id DESC');
        
        res.render('website-galeri.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            galeri
        });
    } catch (error) {
        console.error('Galeri listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.galeriUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: 'Dosya yüklenemedi' });
        }

        const dosyaAdi = req.file.filename;
        const baslik = req.file.originalname.replace(/\.[^/.]+$/, '');

        await db.execute(`
            INSERT INTO landing_galeri (baslik, tur, dosya, durum)
            VALUES (?, 'foto', ?, 1)
        `, [baslik, dosyaAdi]);

        res.json({ success: true, dosya: dosyaAdi });
    } catch (error) {
        console.error('Galeri upload hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.galeriVideo = async (req, res) => {
    try {
        const { baslik, video_url } = req.body;

        if (!video_url) {
            return res.json({ success: false, message: 'Video URL gerekli' });
        }

        await db.execute(`
            INSERT INTO landing_galeri (baslik, tur, video_url, durum)
            VALUES (?, 'video', ?, 1)
        `, [safeValue(baslik) || 'Video', video_url]);

        res.json({ success: true });
    } catch (error) {
        console.error('Galeri video hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.galeriSave = async (req, res) => {
    try {
        const data = req.body;
        const durumInt = (data.durum == 1 || data.durum == 'on' || data.durum == 'true' || data.durum === true) ? 1 : 0;

        const values = {
            baslik: safeValue(data.baslik) || 'Görsel',
            tur: safeValue(data.tur) || 'foto',
            dosya: safeValue(data.dosya),
            video_url: safeValue(data.video_url),
            thumbnail: safeValue(data.thumbnail),
            sira: safeInt(data.sira, 0),
            durum: durumInt
        };

        if (data.id) {
            await db.execute(`
                UPDATE landing_galeri SET
                    baslik = ?, tur = ?, dosya = ?, video_url = ?, thumbnail = ?, sira = ?, durum = ?
                WHERE id = ?
            `, [
                values.baslik, values.tur, values.dosya, values.video_url, values.thumbnail,
                values.sira, values.durum, data.id
            ]);
        } else {
            await db.execute(`
                INSERT INTO landing_galeri (baslik, tur, dosya, video_url, thumbnail, sira, durum)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                values.baslik, values.tur, values.dosya, values.video_url, values.thumbnail,
                values.sira, values.durum
            ]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Galeri kayıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.galeriDelete = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        const [rows] = await db.execute('SELECT dosya FROM landing_galeri WHERE id = ?', [id]);
        
        if (rows.length > 0 && rows[0].dosya) {
            const dosyaYolu = path.join(__dirname, '../public/uploads/galeri', rows[0].dosya);
            if (fs.existsSync(dosyaYolu)) {
                try { fs.unlinkSync(dosyaYolu); } catch (e) {}
            }
        }

        await db.execute('DELETE FROM landing_galeri WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Galeri silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// YORUMLAR YÖNETİMİ
// =====================================================
exports.yorumlarList = async (req, res) => {
    try {
        const [yorumlar] = await db.execute('SELECT * FROM landing_yorumlar ORDER BY created_at DESC');
        
        res.render('website-yorumlar.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            yorumlar
        });
    } catch (error) {
        console.error('Yorumlar listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.yorumSave = async (req, res) => {
    try {
        const data = req.body;
        const onayInt = (data.onay == 1 || data.onay == 'on' || data.onay == 'true' || data.onay === true) ? 1 : 0;

        const values = {
            ad_soyad: safeValue(data.ad_soyad) || 'Anonim',
            rol: safeValue(data.rol),
            yorum: safeValue(data.yorum) || '',
            puan: safeInt(data.puan, 5),
            onay: onayInt,
            sira: safeInt(data.sira, 0)
        };

        if (data.id) {
            await db.execute(`
                UPDATE landing_yorumlar SET
                    ad_soyad = ?, rol = ?, yorum = ?, puan = ?, onay = ?, sira = ?
                WHERE id = ?
            `, [values.ad_soyad, values.rol, values.yorum, values.puan, values.onay, values.sira, data.id]);
        } else {
            await db.execute(`
                INSERT INTO landing_yorumlar (ad_soyad, rol, yorum, puan, onay, sira)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [values.ad_soyad, values.rol, values.yorum, values.puan, values.onay, values.sira]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Yorum kayıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.yorumDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        await db.execute('DELETE FROM landing_yorumlar WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

exports.yorumOnayla = async (req, res) => {
    try {
        const { id } = req.params;
        const { onay } = req.body;
        await db.execute('UPDATE landing_yorumlar SET onay = ? WHERE id = ?', [onay ? 1 : 0, id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// SAYAÇLAR (COUNTER) YÖNETİMİ
// =====================================================
exports.sayaclarPage = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM landing_ayarlar LIMIT 1');
        const ayarlar = rows[0] || {};
        
        res.render('website-sayaclar.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            ayarlar
        });
    } catch (error) {
        console.error('Sayaçlar sayfası hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.sayaclarSave = async (req, res) => {
    try {
        const { stat_sporcu, stat_antrenor, stat_tecrube, stat_memnuniyet } = req.body;
        
        const [existing] = await db.execute('SELECT id FROM landing_ayarlar LIMIT 1');
        
        if (existing.length > 0) {
            await db.execute(`
                UPDATE landing_ayarlar SET
                    stat_sporcu = ?, stat_antrenor = ?, stat_tecrube = ?, stat_memnuniyet = ?
                WHERE id = ?
            `, [safeInt(stat_sporcu, 500), safeInt(stat_antrenor, 25), safeInt(stat_tecrube, 15), safeInt(stat_memnuniyet, 98), existing[0].id]);
        } else {
            await db.execute(`
                INSERT INTO landing_ayarlar (stat_sporcu, stat_antrenor, stat_tecrube, stat_memnuniyet)
                VALUES (?, ?, ?, ?)
            `, [safeInt(stat_sporcu, 500), safeInt(stat_antrenor, 25), safeInt(stat_tecrube, 15), safeInt(stat_memnuniyet, 98)]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Sayaçlar kayıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// E-BÜLTEN LİSTESİ
// =====================================================
exports.ebultenList = async (req, res) => {
    try {
        const [kayitlar] = await db.execute('SELECT * FROM landing_ebulten ORDER BY created_at DESC');
        
        res.render('website-ebulten.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            kayitlar
        });
    } catch (error) {
        console.error('E-Bülten listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.ebultenDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        await db.execute('DELETE FROM landing_ebulten WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// İLETİŞİM FORMLARI
// =====================================================
exports.iletisimList = async (req, res) => {
    try {
        const [mesajlar] = await db.execute('SELECT * FROM landing_iletisim ORDER BY created_at DESC');
        
        res.render('website-iletisim.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            mesajlar
        });
    } catch (error) {
        console.error('İletişim listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.iletisimOkundu = async (req, res) => {
    try {
        const { id } = req.params;
        const { okundu } = req.body;
        await db.execute('UPDATE landing_iletisim SET okundu = ? WHERE id = ?', [okundu ? 1 : 0, id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

exports.iletisimDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.json({ success: false, message: 'ID gerekli' });
        
        await db.execute('DELETE FROM landing_iletisim WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// GENEL AYARLAR
// =====================================================
exports.ayarlarPage = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM landing_ayarlar LIMIT 1');
        const ayarlar = rows[0] || {};
        
        res.render('website-ayarlar.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            ayarlar
        });
    } catch (error) {
        console.error('Ayarlar sayfası hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.ayarlarSave = async (req, res) => {
    try {
        const data = req.body;
        const chatAktif = (data.chat_aktif == 1 || data.chat_aktif === 'on' || data.chat_aktif === true) ? 1 : 0;
        
        const values = {
            telefon1: safeValue(data.telefon1),
            telefon2: safeValue(data.telefon2),
            fax: safeValue(data.fax),
            email1: safeValue(data.email1),
            email2: safeValue(data.email2),
            adres: safeValue(data.adres),
            ilce: safeValue(data.ilce),
            il: safeValue(data.il),
            posta_kodu: safeValue(data.posta_kodu),
            chat_aktif: chatAktif,
            chat_karsilama: safeValue(data.chat_karsilama),
            chat_offline_mesaj: safeValue(data.chat_offline_mesaj),
            google_maps_embed: safeValue(data.google_maps_embed),
            google_maps_link: safeValue(data.google_maps_link),
            facebook_url: safeValue(data.facebook_url),
            instagram_url: safeValue(data.instagram_url),
            youtube_url: safeValue(data.youtube_url),
            twitter_url: safeValue(data.twitter_url),
            tiktok_url: safeValue(data.tiktok_url),
            calisma_saatleri: safeValue(data.calisma_saatleri)
        };
        
        const [existing] = await db.execute('SELECT id FROM landing_ayarlar LIMIT 1');
        
        if (existing.length > 0) {
            await db.execute(`
                UPDATE landing_ayarlar SET
                    telefon1 = ?, telefon2 = ?, fax = ?,
                    email1 = ?, email2 = ?,
                    adres = ?, ilce = ?, il = ?, posta_kodu = ?,
                    chat_aktif = ?, chat_karsilama = ?, chat_offline_mesaj = ?,
                    google_maps_embed = ?, google_maps_link = ?,
                    facebook_url = ?, instagram_url = ?, youtube_url = ?, twitter_url = ?, tiktok_url = ?,
                    calisma_saatleri = ?
                WHERE id = ?
            `, [
                values.telefon1, values.telefon2, values.fax,
                values.email1, values.email2,
                values.adres, values.ilce, values.il, values.posta_kodu,
                values.chat_aktif, values.chat_karsilama, values.chat_offline_mesaj,
                values.google_maps_embed, values.google_maps_link,
                values.facebook_url, values.instagram_url, values.youtube_url, values.twitter_url, values.tiktok_url,
                values.calisma_saatleri, existing[0].id
            ]);
        } else {
            await db.execute(`
                INSERT INTO landing_ayarlar 
                (telefon1, telefon2, fax, email1, email2, adres, ilce, il, posta_kodu, chat_aktif, chat_karsilama, chat_offline_mesaj, google_maps_embed, google_maps_link, facebook_url, instagram_url, youtube_url, twitter_url, tiktok_url, calisma_saatleri)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                values.telefon1, values.telefon2, values.fax,
                values.email1, values.email2,
                values.adres, values.ilce, values.il, values.posta_kodu,
                values.chat_aktif, values.chat_karsilama, values.chat_offline_mesaj,
                values.google_maps_embed, values.google_maps_link,
                values.facebook_url, values.instagram_url, values.youtube_url, values.twitter_url, values.tiktok_url,
                values.calisma_saatleri
            ]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ayarlar kayıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// ZİYARETÇİ İSTATİSTİKLERİ
// =====================================================
exports.istatistiklerPage = async (req, res) => {
    try {
        let stats = {
            bugun: 0,
            hafta: 0,
            ay: 0,
            toplam: 0,
            gunlukData: [],
            sayfalar: [],
            cihazlar: [],
            tarayicilar: [],
            sonZiyaretler: []
        };

        try {
            const [r1] = await db.execute(`
                SELECT COUNT(*) as c FROM landing_ziyaretci 
                WHERE DATE(created_at) = CURDATE()
            `);
            stats.bugun = r1[0].c;

            const [r2] = await db.execute(`
                SELECT COUNT(*) as c FROM landing_ziyaretci 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            `);
            stats.hafta = r2[0].c;

            const [r3] = await db.execute(`
                SELECT COUNT(*) as c FROM landing_ziyaretci 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `);
            stats.ay = r3[0].c;

            const [r4] = await db.execute('SELECT COUNT(*) as c FROM landing_ziyaretci');
            stats.toplam = r4[0].c;

            const [gunluk] = await db.execute(`
                SELECT DATE(created_at) as tarih, COUNT(*) as sayi 
                FROM landing_ziyaretci 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                GROUP BY DATE(created_at)
                ORDER BY tarih ASC
            `);
            stats.gunlukData = gunluk;

            const [sayfalar] = await db.execute(`
                SELECT sayfa, COUNT(*) as sayi 
                FROM landing_ziyaretci 
                GROUP BY sayfa
                ORDER BY sayi DESC
                LIMIT 10
            `);
            stats.sayfalar = sayfalar;

            const [cihazlar] = await db.execute(`
                SELECT cihaz, COUNT(*) as sayi 
                FROM landing_ziyaretci 
                WHERE cihaz IS NOT NULL AND cihaz != ''
                GROUP BY cihaz
                ORDER BY sayi DESC
            `);
            stats.cihazlar = cihazlar;

            const [tarayicilar] = await db.execute(`
                SELECT tarayici, COUNT(*) as sayi 
                FROM landing_ziyaretci 
                WHERE tarayici IS NOT NULL AND tarayici != ''
                GROUP BY tarayici
                ORDER BY sayi DESC
                LIMIT 5
            `);
            stats.tarayicilar = tarayicilar;

            const [sonZiyaretler] = await db.execute(`
                SELECT id, ip_adresi, sayfa, cihaz, tarayici, created_at 
                FROM landing_ziyaretci 
                ORDER BY id DESC
                LIMIT 10
            `);
            stats.sonZiyaretler = sonZiyaretler;

        } catch (e) {
            console.log('Ziyaretçi tablosu hatası:', e.message);
        }

        res.render('website-istatistikler.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            stats
        });
    } catch (error) {
        console.error('İstatistikler sayfası hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

// =====================================================
// CANLI DESTEK YÖNETİMİ
// =====================================================
exports.canliDestekList = async (req, res) => {
    try {
        let konusmalar = [];
        
        try {
            const [rows] = await db.execute(`
                SELECT c.*, k.ad_soyad as temsilci_adi,
                    (SELECT COUNT(*) FROM canli_destek_mesajlar WHERE konusma_id = c.id AND okundu = 0 AND gonderen = 'musteri') as okunmamis
                FROM canli_destek_konusmalar c
                LEFT JOIN kullanicilar k ON c.temsilci_id = k.id
                ORDER BY 
                    CASE WHEN c.durum = 'beklemede' THEN 0 
                         WHEN c.durum = 'aktif' THEN 1 
                         ELSE 2 END,
                    c.son_mesaj_zamani DESC
                LIMIT 100
            `);
            konusmalar = rows;
        } catch (e) {
            console.log('Canlı destek tablosu hatası:', e.message);
        }

        res.render('website-canli-destek.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            konusmalar
        });
    } catch (error) {
        console.error('Canlı destek listesi hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.canliDestekDetay = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [konusmalar] = await db.execute(`
            SELECT c.*, k.ad_soyad as temsilci_adi
            FROM canli_destek_konusmalar c
            LEFT JOIN kullanicilar k ON c.temsilci_id = k.id
            WHERE c.id = ?
        `, [id]);

        if (konusmalar.length === 0) {
            return res.redirect('/api/admin/website/canli-destek');
        }

        const konusma = konusmalar[0];

        const [mesajlar] = await db.execute(`
            SELECT * FROM canli_destek_mesajlar 
            WHERE konusma_id = ? 
            ORDER BY created_at ASC
        `, [id]);

        await db.execute(`
            UPDATE canli_destek_mesajlar 
            SET okundu = 1 
            WHERE konusma_id = ? AND gonderen = 'musteri'
        `, [id]);

        res.render('website-canli-destek-detay.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            konusma,
            mesajlar
        });
    } catch (error) {
        console.error('Canlı destek detay hatası:', error);
        res.status(500).send('Sunucu hatası');
    }
};

exports.canliDestekYanitla = async (req, res) => {
    try {
        const { id } = req.params;
        const { mesaj } = req.body;

        if (!mesaj) {
            return res.json({ success: false, message: 'Mesaj gerekli' });
        }

        await db.execute(`
            INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
            VALUES (?, 'temsilci', ?)
        `, [id, mesaj]);

        await db.execute(`
            UPDATE canli_destek_konusmalar 
            SET durum = 'aktif', temsilci_id = ?, son_mesaj_zamani = NOW()
            WHERE id = ?
        `, [req.session.userID || null, id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Canlı destek yanıt hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.canliDestekKapat = async (req, res) => {
    try {
        const { id } = req.params;

        await db.execute(`
            UPDATE canli_destek_konusmalar 
            SET durum = 'kapatildi'
            WHERE id = ?
        `, [id]);

        await db.execute(`
            INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
            VALUES (?, 'sistem', 'Görüşme sonlandırıldı.')
        `, [id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Canlı destek kapatma hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

exports.canliDestekMesajlar = async (req, res) => {
    try {
        const { id } = req.params;
        const { lastId } = req.query;

        const [mesajlar] = await db.execute(`
            SELECT * FROM canli_destek_mesajlar 
            WHERE konusma_id = ? AND id > ?
            ORDER BY created_at ASC
        `, [id, lastId || 0]);

        res.json({ success: true, mesajlar });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

exports.canliDestekCheckUpdates = async (req, res) => {
    try {
        const { since } = req.query;
        
        let sinceDate;
        if (since) {
            const timestamp = parseInt(since);
            sinceDate = new Date(timestamp);
        } else {
            sinceDate = new Date(Date.now() - 30000);
        }

        const [newChats] = await db.execute(`
            SELECT id, ad_soyad, telefon, durum, created_at
            FROM canli_destek_konusmalar 
            WHERE created_at > ?
            ORDER BY created_at DESC
        `, [sinceDate]);

        const [updates] = await db.execute(`
            SELECT c.id, c.durum, c.son_mesaj_zamani,
                (SELECT COUNT(*) FROM canli_destek_mesajlar 
                 WHERE konusma_id = c.id AND okundu = 0 AND gonderen = 'musteri') as okunmamis
            FROM canli_destek_konusmalar c
            WHERE c.durum IN ('beklemede', 'aktif')
        `);

        res.json({ 
            success: true, 
            newChats, 
            updates,
            serverTime: new Date().toISOString()
        });
    } catch (error) {
        console.error('Check updates hatası:', error);
        res.json({ success: false, message: error.message });
    }
};