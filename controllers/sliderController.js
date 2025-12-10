// =====================================================
// SLIDER KAYDETME - Resim Yükleme Desteği
// =====================================================
// Bu kodu websiteController.js dosyasına ekleyin veya mevcut saveSlider fonksiyonunu değiştirin
// Multer middleware'ı route'da kullanılmalı

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer Konfigürasyonu - Slider için
const sliderStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/images/slider');
        // Klasör yoksa oluştur
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'slide-' + uniqueSuffix + ext);
    }
});

const sliderUpload = multer({
    storage: sliderStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
}).single('resim');

// Slider Kaydetme Fonksiyonu
exports.saveSlider = async (req, res) => {
    sliderUpload(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            return res.json({ success: false, message: 'Dosya yükleme hatası: ' + err.message });
        } else if (err) {
            return res.json({ success: false, message: err.message });
        }

        try {
            const { id, baslik, alt_baslik, aciklama, buton_yazi, buton_link, sira, durum, mevcut_resim } = req.body;
            
            // Yeni resim yüklendi mi?
            let resim = mevcut_resim || null;
            
            if (req.file) {
                resim = req.file.filename;
                
                // Eski resmi sil (varsa ve yeni resim yüklendiyse)
                if (id && mevcut_resim) {
                    const oldImagePath = path.join(__dirname, '../public/images/slider', mevcut_resim);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            }

            if (id) {
                // Güncelleme
                await db.execute(`
                    UPDATE landing_slider 
                    SET baslik = ?, alt_baslik = ?, aciklama = ?, buton_yazi = ?, 
                        buton_link = ?, sira = ?, durum = ?, resim = ?
                    WHERE id = ?
                `, [baslik, alt_baslik || null, aciklama || null, buton_yazi || 'Hemen Başvur', 
                    buton_link || '/basvuru', sira || 0, durum, resim, id]);
            } else {
                // Yeni kayıt
                await db.execute(`
                    INSERT INTO landing_slider (baslik, alt_baslik, aciklama, buton_yazi, buton_link, sira, durum, resim)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [baslik, alt_baslik || null, aciklama || null, buton_yazi || 'Hemen Başvur',
                    buton_link || '/basvuru', sira || 0, durum, resim]);
            }

            res.json({ success: true });

        } catch (error) {
            console.error('Slider kayıt hatası:', error);
            res.json({ success: false, message: 'Bir hata oluştu' });
        }
    });
};

// Slider Silme Fonksiyonu (resmi de siler)
exports.deleteSlider = async (req, res) => {
    try {
        const { id } = req.params;

        // Önce resmi bul
        const [slider] = await db.execute('SELECT resim FROM landing_slider WHERE id = ?', [id]);
        
        if (slider.length > 0 && slider[0].resim) {
            const imagePath = path.join(__dirname, '../public/images/slider', slider[0].resim);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Kaydı sil
        await db.execute('DELETE FROM landing_slider WHERE id = ?', [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Slider silme hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ROUTE KULLANIMI
// =====================================================
// routes/website.js dosyasında:
// 
// router.post('/slider/save', websiteController.saveSlider);
// router.delete('/slider/:id', websiteController.deleteSlider);
//
// NOT: saveSlider içinde multer zaten çağrılıyor, route'da ayrıca multer kullanmayın
