const db = require('../config/db');
const bcrypt = require('bcryptjs');

// =====================================================
// VELİ AUTH MIDDLEWARE
// =====================================================
exports.veliAuth = (req, res, next) => {
    if (!req.session.veliID) {
        return res.redirect('/api/auth/login?tip=veli');
    }
    next();
};

// =====================================================
// GİRİŞ FORMU (login.html'e yönlendir)
// =====================================================
exports.girisForm = async (req, res) => {
    if (req.session.veliID) {
        return res.redirect('/veli/panel');
    }
    res.redirect('/api/auth/login?tip=veli');
};

// =====================================================
// GİRİŞ YAP
// =====================================================
exports.girisYap = async (req, res) => {
    const { kullanici_adi, sifre } = req.body;

    try {
        // Veli bilgilerini al
        const [veliler] = await db.execute(
            'SELECT * FROM veliler WHERE kullanici_adi = ?',
            [kullanici_adi]
        );

        if (veliler.length === 0) {
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Kullanıcı bulunamadı'));
        }

        const veli = veliler[0];

        // Şifre kontrolü
        let sifreDogruMu = false;
        if (veli.sifre && veli.sifre.startsWith('$2')) {
            sifreDogruMu = await bcrypt.compare(sifre, veli.sifre);
        } else {
            sifreDogruMu = (sifre === veli.sifre);
        }

        if (!sifreDogruMu) {
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Şifre hatalı'));
        }

        // Öğrenci bilgilerini al
        const [ogrenciler] = await db.execute(`
            SELECT o.*, g.grup_adi, b.brans_adi, s.sube_adi
            FROM ogrenciler o
            LEFT JOIN gruplar g ON o.grup_id = g.id
            LEFT JOIN branslar b ON g.brans_id = b.id
            LEFT JOIN subeler s ON o.sube_id = s.id
            WHERE o.id = ?
        `, [veli.ogrenci_id]);

        if (ogrenciler.length === 0) {
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Öğrenci kaydı bulunamadı'));
        }

        const ogrenci = ogrenciler[0];

        // ⭐ DURUM KONTROLÜ - Aktif değilse giriş yapamaz
        if (ogrenci.durum !== 'aktif') {
            // Tesis adını al
            const [ayarlar] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');
            const tesisAdi = ayarlar.length > 0 ? ayarlar[0].tesis_adi : 'Spor Tesisi';
            
            const durumMesaj = `Merhaba, ${ogrenci.ad_soyad} isimli öğrencimizin ${tesisAdi} tesisimizde ki üyeliği ${ogrenci.durum === 'pasif' ? 'pasif duruma alınmıştır' : 'dondurulmuştur'}. Lütfen ilgili antrenör veya yönetici ile iletişime geçiniz.`;
            
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent(durumMesaj));
        }

        // Session'a kaydet
        req.session.veliID = veli.id;
        req.session.veliOgrenciID = veli.ogrenci_id;
        req.session.veliSubeID = veli.sube_id;
        req.session.ogrenciAdi = ogrenci.ad_soyad;

        console.log(`✅ Veli girişi: ${kullanici_adi} (Öğrenci: ${ogrenci.ad_soyad})`);

        res.redirect('/veli/panel');

    } catch (error) {
        console.error('Veli giriş hatası:', error);
        res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Bir hata oluştu'));
    }
};

// =====================================================
// ÇIKIŞ YAP
// =====================================================
exports.cikisYap = (req, res) => {
    req.session.destroy();
    res.redirect('/api/auth/login?tip=veli');
};

// =====================================================
// VELİ PANELİ
// =====================================================
exports.panel = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;
        const veliId = req.session.veliID;

        // Site ayarları
        const [ayarlar] = await db.execute('SELECT * FROM genel_ayarlar LIMIT 1');
        const siteAyarlari = ayarlar.length > 0 ? ayarlar[0] : {};

        // Veli bilgileri
        const [veliBilgi] = await db.execute('SELECT * FROM veliler WHERE id = ?', [veliId]);
        const veli = veliBilgi.length > 0 ? veliBilgi[0] : {};

        // Öğrenci bilgileri
        const [ogrenciler] = await db.execute(`
            SELECT o.*, g.grup_adi, b.brans_adi, s.sube_adi
            FROM ogrenciler o
            LEFT JOIN gruplar g ON o.grup_id = g.id
            LEFT JOIN branslar b ON g.brans_id = b.id
            LEFT JOIN subeler s ON o.sube_id = s.id
            WHERE o.id = ?
        `, [ogrenciId]);

        if (ogrenciler.length === 0) {
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Öğrenci bulunamadı'));
        }

        const ogrenci = ogrenciler[0];

        // Durum kontrolü (tekrar)
        if (ogrenci.durum !== 'aktif') {
            req.session.destroy();
            return res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Üyelik aktif değil'));
        }

        // Yaş hesapla
        let yas = null;
        if (ogrenci.dogum_tarihi) {
            const bugun = new Date();
            const dogum = new Date(ogrenci.dogum_tarihi);
            yas = bugun.getFullYear() - dogum.getFullYear();
            const ayFarki = bugun.getMonth() - dogum.getMonth();
            if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) {
                yas--;
            }
        }

        // Bu ayki aidat durumu
        const buAy = new Date().getMonth() + 1;
        const buYil = new Date().getFullYear();
        const [aidatDurum] = await db.execute(`
            SELECT * FROM aidatlar 
            WHERE ogrenci_id = ? AND yil = ? AND ay = ?
        `, [ogrenciId, buYil, buAy]);

        // Toplam borç
        const [borcSorgu] = await db.execute(`
            SELECT SUM(odenmesi_gereken - odenen) as toplam_borc
            FROM aidatlar 
            WHERE ogrenci_id = ? AND durum != 'tamamlandi'
        `, [ogrenciId]);
        const toplamBorc = borcSorgu[0].toplam_borc || 0;

        // Bu ay yoklama özeti
        const ayBaslangic = new Date(buYil, buAy - 1, 1).toISOString().split('T')[0];
        const ayBitis = new Date(buYil, buAy, 0).toISOString().split('T')[0];
        
        const [yoklamaOzet] = await db.execute(`
            SELECT 
                COUNT(*) as toplam,
                SUM(CASE WHEN durum = 'katildi' THEN 1 ELSE 0 END) as katildi,
                SUM(CASE WHEN durum = 'katilmadi' THEN 1 ELSE 0 END) as katilmadi,
                SUM(CASE WHEN durum = 'izinli' THEN 1 ELSE 0 END) as izinli
            FROM yoklamalar 
            WHERE ogrenci_id = ? AND tarih BETWEEN ? AND ?
        `, [ogrenciId, ayBaslangic, ayBitis]);

        // Son analiz
        const [sonAnaliz] = await db.execute(`
            SELECT * FROM analizler 
            WHERE ogrenci_id = ? 
            ORDER BY analiz_tarihi DESC LIMIT 1
        `, [ogrenciId]);

        // Aktif özel ders paketi
        const [ozelDersPaket] = await db.execute(`
            SELECT odp.*, s.baslik as paket_adi
            FROM ozel_ders_paketleri odp
            LEFT JOIN satislar s ON odp.satis_id = s.id
            WHERE odp.ogrenci_id = ? AND odp.durum = 'aktif'
            ORDER BY odp.created_at DESC LIMIT 1
        `, [ogrenciId]);

        // Bugünkü dersler
        const gunler = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
        const bugun = gunler[new Date().getDay()];
        
        let bugunDersler = [];
        if (ogrenci.grup_id) {
            const [dersler] = await db.execute(`
                SELECT d.*, g.grup_adi, b.brans_adi
                FROM ders_programi d
                JOIN gruplar g ON d.grup_id = g.id
                JOIN branslar b ON g.brans_id = b.id
                WHERE d.grup_id = ? AND d.gun = ?
                ORDER BY d.baslangic_saati
            `, [ogrenci.grup_id, bugun]);
            bugunDersler = dersler;
        }

        // Özel veri alanlarını parse et
        let ozelVeri = {};
        if (ogrenci.ozel_veri) {
            try {
                ozelVeri = JSON.parse(ogrenci.ozel_veri);
            } catch (e) {
                ozelVeri = {};
            }
        }

        res.render('ogrenci-takip.html', {
            siteAyarlari,
            veli,
            ogrenci: {
                ...ogrenci,
                yas,
                ozel_veri: ozelVeri
            },
            aidatDurum: aidatDurum.length > 0 ? aidatDurum[0] : null,
            toplamBorc,
            yoklamaOzet: yoklamaOzet[0],
            sonAnaliz: sonAnaliz.length > 0 ? sonAnaliz[0] : null,
            ozelDersPaket: ozelDersPaket.length > 0 ? ozelDersPaket[0] : null,
            bugunDersler,
            bugun: bugun.replace('Sali', 'Salı').replace('Carsamba', 'Çarşamba').replace('Persembe', 'Perşembe')
        });

    } catch (error) {
        console.error('Veli panel hatası:', error);
        res.redirect('/api/auth/login?tip=veli&hata=' + encodeURIComponent('Bir hata oluştu'));
    }
};

// =====================================================
// API: PROFİL BİLGİLERİ GETİR
// =====================================================
exports.profilGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;
        const veliId = req.session.veliID;

        // Öğrenci bilgileri
        const [ogrenciler] = await db.execute(`
            SELECT id, tc_kimlik, ad_soyad, dogum_tarihi, ozel_veri, profil_foto
            FROM ogrenciler WHERE id = ?
        `, [ogrenciId]);

        // Veli bilgileri
        const [veliler] = await db.execute(`
            SELECT id, kullanici_adi FROM veliler WHERE id = ?
        `, [veliId]);

        if (ogrenciler.length === 0) {
            return res.json({ success: false, message: 'Öğrenci bulunamadı' });
        }

        const ogrenci = ogrenciler[0];
        let ozelVeri = {};
        if (ogrenci.ozel_veri) {
            try {
                ozelVeri = JSON.parse(ogrenci.ozel_veri);
            } catch (e) {
                ozelVeri = {};
            }
        }

        res.json({ 
            success: true, 
            ogrenci: {
                ...ogrenci,
                ozel_veri: ozelVeri
            },
            veli: veliler.length > 0 ? veliler[0] : null
        });

    } catch (error) {
        console.error('Profil getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: ÖĞRENCİ PROFİLİ GÜNCELLE
// =====================================================
exports.profilGuncelle = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;
        const { tc_kimlik, ad_soyad, dogum_tarihi, ozel_veri } = req.body;

        // Sadece izin verilen alanları güncelle
        let updateFields = [];
        let updateValues = [];

        if (tc_kimlik !== undefined) {
            // TC Kimlik validasyonu (11 haneli sayı)
            if (tc_kimlik && !/^\d{11}$/.test(tc_kimlik)) {
                return res.json({ success: false, message: 'TC Kimlik 11 haneli olmalıdır' });
            }
            updateFields.push('tc_kimlik = ?');
            updateValues.push(tc_kimlik || null);
        }

        if (ad_soyad !== undefined && ad_soyad.trim()) {
            updateFields.push('ad_soyad = ?');
            updateValues.push(ad_soyad.trim());
        }

        if (dogum_tarihi !== undefined) {
            updateFields.push('dogum_tarihi = ?');
            updateValues.push(dogum_tarihi || null);
        }

        if (ozel_veri !== undefined) {
            // Mevcut özel veriyi al ve birleştir
            const [mevcut] = await db.execute('SELECT ozel_veri FROM ogrenciler WHERE id = ?', [ogrenciId]);
            let mevcutVeri = {};
            if (mevcut.length > 0 && mevcut[0].ozel_veri) {
                try {
                    mevcutVeri = JSON.parse(mevcut[0].ozel_veri);
                } catch (e) {
                    mevcutVeri = {};
                }
            }
            
            // Yeni verileri birleştir
            const yeniVeri = { ...mevcutVeri, ...ozel_veri };
            updateFields.push('ozel_veri = ?');
            updateValues.push(JSON.stringify(yeniVeri));
        }

        if (updateFields.length === 0) {
            return res.json({ success: false, message: 'Güncellenecek alan bulunamadı' });
        }

        updateValues.push(ogrenciId);

        await db.execute(
            `UPDATE ogrenciler SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Session'daki adı güncelle
        if (ad_soyad) {
            req.session.ogrenciAdi = ad_soyad.trim();
        }

        console.log(`✅ Öğrenci profili güncellendi: ID ${ogrenciId}`);

        res.json({ success: true, message: 'Profil başarıyla güncellendi' });

    } catch (error) {
        console.error('Profil güncelle hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: VELİ GİRİŞ BİLGİLERİ GÜNCELLE
// =====================================================
exports.girisGuncelle = async (req, res) => {
    try {
        const veliId = req.session.veliID;
        const { kullanici_adi, mevcut_sifre, yeni_sifre } = req.body;

        // Mevcut veli bilgilerini al
        const [veliler] = await db.execute('SELECT * FROM veliler WHERE id = ?', [veliId]);
        if (veliler.length === 0) {
            return res.json({ success: false, message: 'Veli bulunamadı' });
        }

        const veli = veliler[0];
        let updateFields = [];
        let updateValues = [];

        // Kullanıcı adı değişikliği
        if (kullanici_adi && kullanici_adi !== veli.kullanici_adi) {
            // Benzersizlik kontrolü
            const [varMi] = await db.execute(
                'SELECT id FROM veliler WHERE kullanici_adi = ? AND id != ?',
                [kullanici_adi, veliId]
            );
            if (varMi.length > 0) {
                return res.json({ success: false, message: 'Bu kullanıcı adı zaten kullanılıyor' });
            }
            updateFields.push('kullanici_adi = ?');
            updateValues.push(kullanici_adi);
        }

        // Şifre değişikliği
        if (yeni_sifre) {
            if (!mevcut_sifre) {
                return res.json({ success: false, message: 'Mevcut şifrenizi girmelisiniz' });
            }

            // Mevcut şifre kontrolü
            let sifreDogruMu = false;
            if (veli.sifre && veli.sifre.startsWith('$2')) {
                sifreDogruMu = await bcrypt.compare(mevcut_sifre, veli.sifre);
            } else {
                sifreDogruMu = (mevcut_sifre === veli.sifre);
            }

            if (!sifreDogruMu) {
                return res.json({ success: false, message: 'Mevcut şifre hatalı' });
            }

            if (yeni_sifre.length < 4) {
                return res.json({ success: false, message: 'Yeni şifre en az 4 karakter olmalı' });
            }

            // Yeni şifreyi hashle
            const hashedPassword = await bcrypt.hash(yeni_sifre, 10);
            updateFields.push('sifre = ?');
            updateValues.push(hashedPassword);
        }

        if (updateFields.length === 0) {
            return res.json({ success: false, message: 'Değişiklik yapılmadı' });
        }

        updateValues.push(veliId);

        await db.execute(
            `UPDATE veliler SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        console.log(`✅ Veli giriş bilgileri güncellendi: ID ${veliId}`);

        res.json({ success: true, message: 'Giriş bilgileri güncellendi' });

    } catch (error) {
        console.error('Giriş güncelle hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: YOKLAMA GETİR (En yeni üstte)
// =====================================================
exports.yoklamaGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;
        const { ay, yil } = req.query;

        const secilenYil = yil || new Date().getFullYear();
        const secilenAy = ay || (new Date().getMonth() + 1);

        const ayBaslangic = new Date(secilenYil, secilenAy - 1, 1).toISOString().split('T')[0];
        const ayBitis = new Date(secilenYil, secilenAy, 0).toISOString().split('T')[0];

        // ⭐ EN YENİ ÜSTTE - tarih DESC
        const [yoklamalar] = await db.execute(`
            SELECT y.*, g.grup_adi, b.brans_adi
            FROM yoklamalar y
            JOIN gruplar g ON y.grup_id = g.id
            JOIN branslar b ON g.brans_id = b.id
            WHERE y.ogrenci_id = ? AND y.tarih BETWEEN ? AND ?
            ORDER BY y.tarih DESC
        `, [ogrenciId, ayBaslangic, ayBitis]);

        const ozet = {
            toplam: yoklamalar.length,
            katildi: yoklamalar.filter(y => y.durum === 'katildi').length,
            katilmadi: yoklamalar.filter(y => y.durum === 'katilmadi').length,
            izinli: yoklamalar.filter(y => y.durum === 'izinli').length
        };

        res.json({ success: true, yoklamalar, ozet });

    } catch (error) {
        console.error('Yoklama getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: AİDATLAR GETİR (En yeni üstte)
// =====================================================
exports.aidatlarGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;
        const { yil } = req.query;

        // Yıl filtresi varsa sadece o yılı getir, yoksa tüm aidatları getir
        let aidatlar;
        if (yil) {
            [aidatlar] = await db.execute(`
                SELECT * FROM aidatlar 
                WHERE ogrenci_id = ? AND yil = ?
                ORDER BY yil DESC, ay DESC
            `, [ogrenciId, yil]);
        } else {
            // ⭐ EN YENİ ÜSTTE - yıl DESC, ay DESC (tüm aidatlar)
            [aidatlar] = await db.execute(`
                SELECT * FROM aidatlar 
                WHERE ogrenci_id = ?
                ORDER BY yil DESC, ay DESC
            `, [ogrenciId]);
        }

        const toplamBorc = aidatlar.reduce((t, a) => t + Math.max(0, parseFloat(a.odenmesi_gereken) - parseFloat(a.odenen)), 0);
        const toplamOdenen = aidatlar.reduce((t, a) => t + parseFloat(a.odenen), 0);

        res.json({ 
            success: true, 
            aidatlar, 
            ozet: { toplamBorc, toplamOdenen }
        });

    } catch (error) {
        console.error('Aidatlar getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: ANALİZLER GETİR (En yeni üstte)
// =====================================================
exports.analizlerGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;

        // ⭐ EN YENİ ÜSTTE - analiz_tarihi DESC
        const [analizler] = await db.execute(`
            SELECT a.*, k.ad_soyad as analizci_adi
            FROM analizler a
            LEFT JOIN kullanicilar k ON a.analizci_id = k.id
            WHERE a.ogrenci_id = ?
            ORDER BY a.analiz_tarihi DESC
        `, [ogrenciId]);

        res.json({ success: true, analizler });

    } catch (error) {
        console.error('Analizler getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: ÖZEL DERSLER GETİR
// =====================================================
exports.ozelDerslerGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;

        const [paketler] = await db.execute(`
            SELECT odp.*, s.baslik as paket_adi, s.tutar
            FROM ozel_ders_paketleri odp
            LEFT JOIN satislar s ON odp.satis_id = s.id
            WHERE odp.ogrenci_id = ?
            ORDER BY odp.created_at DESC
        `, [ogrenciId]);

        const [kullanimlar] = await db.execute(`
            SELECT odk.*, s.baslik as paket_adi
            FROM ozel_ders_kullanimlari odk
            LEFT JOIN ozel_ders_paketleri odp ON odk.paket_id = odp.id
            LEFT JOIN satislar s ON odp.satis_id = s.id
            WHERE odk.ogrenci_id = ?
            ORDER BY odk.tarih DESC
            LIMIT 20
        `, [ogrenciId]);

        res.json({ success: true, paketler, kullanimlar });

    } catch (error) {
        console.error('Özel dersler getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: SATIŞLAR GETİR
// =====================================================
exports.satislarGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;

        const [urunSatislari] = await db.execute(`
            SELECT us.*, u.urun_adi
            FROM urun_satislari us
            JOIN urunler u ON us.urun_id = u.id
            WHERE us.ogrenci_id = ?
            ORDER BY us.created_at DESC
        `, [ogrenciId]);

        const [paketSatislari] = await db.execute(`
            SELECT * FROM satislar
            WHERE ogrenci_id = ?
            ORDER BY tarih DESC
        `, [ogrenciId]);

        res.json({ success: true, urunSatislari, paketSatislari });

    } catch (error) {
        console.error('Satışlar getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// API: DERS PROGRAMI GETİR
// =====================================================
exports.dersProgramiGetir = async (req, res) => {
    try {
        const ogrenciId = req.session.veliOgrenciID;

        const [ogrenci] = await db.execute('SELECT grup_id FROM ogrenciler WHERE id = ?', [ogrenciId]);
        
        if (ogrenci.length === 0 || !ogrenci[0].grup_id) {
            return res.json({ success: true, dersler: [] });
        }

        const [dersler] = await db.execute(`
            SELECT d.*, g.grup_adi, b.brans_adi
            FROM ders_programi d
            JOIN gruplar g ON d.grup_id = g.id
            JOIN branslar b ON g.brans_id = b.id
            WHERE d.grup_id = ?
            ORDER BY FIELD(d.gun, 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi', 'Pazar'), d.baslangic_saati
        `, [ogrenci[0].grup_id]);

        res.json({ success: true, dersler });

    } catch (error) {
        console.error('Ders programı getir hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// PUSH BİLDİRİM API'LERİ
// =====================================================

/**
 * Push bildirim aboneliği kaydet
 */
exports.pushAboneOl = async (req, res) => {
    try {
        const { subscription, cihazTipi, tarayici } = req.body;
        const veliId = req.session.veliID;
        const ogrenciId = req.session.veliOgrenciID;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: 'Geçersiz subscription' });
        }

        const { endpoint, keys } = subscription;
        const { p256dh, auth } = keys || {};

        if (!p256dh || !auth) {
            return res.status(400).json({ success: false, message: 'Eksik key bilgisi' });
        }

        // Mevcut abonelik var mı kontrol et
        const [existing] = await db.execute(
            'SELECT id FROM push_abonelikler WHERE endpoint = ?',
            [endpoint]
        );

        if (existing.length > 0) {
            // Güncelle - veli_id ve ogrenci_id ekle
            await db.execute(`
                UPDATE push_abonelikler 
                SET veli_id = ?, ogrenci_id = ?, p256dh = ?, auth = ?, 
                    cihaz_tipi = ?, tarayici = ?, aktif = 1, updated_at = NOW()
                WHERE endpoint = ?
            `, [veliId, ogrenciId, p256dh, auth, cihazTipi || 'web', tarayici || 'Unknown', endpoint]);
            
            console.log(`🔔 Push abonelik güncellendi: Veli ${veliId}, Öğrenci ${ogrenciId}`);
        } else {
            // Yeni kayıt
            await db.execute(`
                INSERT INTO push_abonelikler 
                (veli_id, ogrenci_id, endpoint, p256dh, auth, cihaz_tipi, tarayici, aktif, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
            `, [veliId, ogrenciId, endpoint, p256dh, auth, cihazTipi || 'web', tarayici || 'Unknown']);
            
            console.log(`🔔 Yeni push abonelik: Veli ${veliId}, Öğrenci ${ogrenciId}`);
        }

        res.json({ success: true, message: 'Push bildirimleri aktif' });
    } catch (error) {
        console.error('Push abonelik hatası:', error);
        res.status(500).json({ success: false, message: 'Abonelik kaydedilemedi' });
    }
};

/**
 * Push bildirim aboneliğini iptal et
 */
exports.pushAbonelikIptal = async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ success: false, message: 'Endpoint gerekli' });
        }

        await db.execute(
            'UPDATE push_abonelikler SET aktif = 0 WHERE endpoint = ?',
            [endpoint]
        );

        console.log('🔕 Push abonelik iptal edildi');
        res.json({ success: true, message: 'Abonelik iptal edildi' });
    } catch (error) {
        console.error('Push iptal hatası:', error);
        res.status(500).json({ success: false, message: 'İptal edilemedi' });
    }
};

/**
 * VAPID Public Key döndür
 */
exports.getVapidKey = (req, res) => {
    res.json({ 
        success: true, 
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' 
    });
};