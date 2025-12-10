// controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.loginSayfasi = (req, res) => {
    // Eğer kullanıcı zaten giriş yapmışsa panele yönlendir
    if (req.session.userID) {
        return res.redirect('/');
    }
    // Login sayfasını göster (Genel ayarlardaki renklerle)
    res.render('login.html', { 
        siteAyarlari: res.locals.siteAyarlari,
        hata: null 
    });
};

exports.loginIslemi = async (req, res) => {
    const { kullanici_adi, sifre, beni_hatirla } = req.body;

    try {
        // 1. Kullanıcıyı bul
        const [rows] = await db.execute('SELECT * FROM kullanicilar WHERE kullanici_adi = ?', [kullanici_adi]);
        
        if (rows.length === 0) {
            return res.render('login.html', { hata: 'Kullanıcı bulunamadı!', siteAyarlari: res.locals.siteAyarlari });
        }

        const user = rows[0];

        // 2. Şifreyi kontrol et
        const sifreDogruMu = await bcrypt.compare(sifre, user.sifre);

        if (!sifreDogruMu) {
            return res.render('login.html', { hata: 'Şifre hatalı!', siteAyarlari: res.locals.siteAyarlari });
        }

        // 3. Durum kontrolü (Aktif mi?)
        if (!user.durum) {
            return res.render('login.html', { hata: 'Hesabınız pasif durumdadır.', siteAyarlari: res.locals.siteAyarlari });
        }

        // 4. Session Başlat
        req.session.userID = user.id;
        req.session.rol = user.rol;
        req.session.adSoyad = user.ad_soyad;
        req.session.subeId = user.sube_id;
        
        // YENİ EKLENEN KISIM: YETKİLERİ HAFIZAYA AL
        if (user.yetkiler) {
            // JSON formatındaysa parse et, değilse boş obje
            try {
                req.session.yetkiler = typeof user.yetkiler === 'string' ? JSON.parse(user.yetkiler) : user.yetkiler;
            } catch (e) {
                req.session.yetkiler = {};
            }
        } else {
            req.session.yetkiler = {};
        }

        // 5. Beni Hatırla Seçeneği (30 Gün)
if (beni_hatirla) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 gün
    console.log(`🔐 Oturum 30 gün açık kalacak`);
} else {
    req.session.cookie.maxAge = null;
    req.session.cookie.expires = false;
}

// ❌ Bu satırı SİL - veli girişinde kullanılacak, burada değil:
// req.session.veliID = veli.id;

// 6. Son giriş tarihini güncelle
await db.execute('UPDATE kullanicilar SET son_giris = NOW() WHERE id = ?', [user.id]);
console.log(`${user.kullanici_adi} giriş yaptı.`);
        res.redirect('/'); // Ana sayfaya git

    } catch (error) {
        console.error(error);
        res.render('login.html', { hata: 'Sistem hatası oluştu.', siteAyarlari: res.locals.siteAyarlari });
    }
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/api/auth/login');
    });
};