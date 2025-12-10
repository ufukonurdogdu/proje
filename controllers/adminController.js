const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// AYARLAR SAYFASINI GÖSTER
exports.ayarlarSayfasi = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    try {
        const [rows] = await db.execute('SELECT * FROM genel_ayarlar LIMIT 1');
        res.render('settings.html', { 
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            ayarlar: rows[0],
            siteAyarlari: res.locals.siteAyarlari
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// AYARLARI GÜNCELLEME
exports.ayarlariGuncelle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    const { 
        tesis_adi, pwa_adi,
        ana_renk, ara_renk,
        sube_limiti, kullanici_limiti, brans_limiti, grup_limiti,
        limit_guvenlik_sifresi, limit_degisikligi_var
    } = req.body;

    // Limit Güvenlik Kontrolü
    if (limit_degisikligi_var === '1') {
        const MASTER_KEY = "30210510qweQWE-"; 
        if (limit_guvenlik_sifresi !== MASTER_KEY) {
            return res.redirect('/api/admin/ayarlar?error=' + encodeURIComponent('Limit şifresi yanlış!'));
        }
    }

    try {
        let sql = `UPDATE genel_ayarlar SET tesis_adi=?, pwa_adi=?, ana_renk=?, ara_renk=?`;
        let params = [tesis_adi, pwa_adi, ana_renk, ara_renk];

        if (limit_degisikligi_var === '1') {
            sql += `, sube_limiti=?, kullanici_limiti=?, brans_limiti=?, grup_limiti=?`;
            params.push(sube_limiti, kullanici_limiti, brans_limiti, grup_limiti);
        }

        // Logo Yükleme
        if (req.files && req.files['logo_default']) { sql += `, logo_default=?`; params.push(req.files['logo_default'][0].filename); }
        if (req.files && req.files['logo_192']) { sql += `, logo_192=?`; params.push(req.files['logo_192'][0].filename); }
        if (req.files && req.files['logo_512']) { sql += `, logo_512=?`; params.push(req.files['logo_512'][0].filename); }
        if (req.files && req.files['logo_180']) { sql += `, logo_180=?`; params.push(req.files['logo_180'][0].filename); }

        sql += ` WHERE id=1`;

        await db.execute(sql, params);
        res.redirect('/api/admin/ayarlar?success=' + encodeURIComponent('Ayarlar başarıyla güncellendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/ayarlar?error=' + encodeURIComponent('Bir hata oluştu!'));
    }
};

// TÜM TABLOLARI YEDEKLEME FONKSİYONU (Dahili kullanım için)
async function tumVeritabaniniYedekle() {
    // Tüm tablolar listesi
    const tumTablolar = [
        'aidatlar', 'analizler', 'basvurular', 'branslar',
        'canli_destek_konusmalar', 'canli_destek_mesajlar',
        'ders_programi', 'destek_talepleri', 'devices',
        'genel_ayarlar', 'gruplar', 'kasa', 'kasa_kategorileri',
        'kullanicilar', 'landing_ayarlar', 'landing_ebulten',
        'landing_egitmenler', 'landing_galeri', 'landing_hakkimizda',
        'landing_iletisim', 'landing_programlar', 'landing_slider',
        'landing_yorumlar', 'landing_ziyaretci', 'ogrenciler',
        'ogrenci_form_ayarlari', 'ozel_ders_kullanimlari',
        'ozel_ders_paketleri', 'satislar', 'subeler', 'taksitler',
        'urunler', 'urun_satislari', 'urun_stoklari', 'veliler',
        'whatsapp_konusmalar', 'whatsapp_mesajlar', 'whatsapp_mesaj_ayarlari',
        'whatsapp_mesaj_log', 'whatsapp_otomatik_mesajlar', 'whatsapp_sablonlar',
        'whatsapp_toplu_mesajlar', 'whatsapp_webhook_log', 'wp_api', 'yoklamalar'
    ];

    const now = new Date();
    const tarih = now.toLocaleDateString('tr-TR').split('.').reverse().join('').split('/').join('');
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    
    let dumpData = `-- ╔══════════════════════════════════════════════════════════════╗\n`;
    dumpData += `-- ║              netSPOR Yedek ${formattedDate}                    ║\n`;
    dumpData += `-- ║              Tarih: ${now.toLocaleString('tr-TR')}                  ║\n`;
    dumpData += `-- ╚══════════════════════════════════════════════════════════════╝\n\n`;
    dumpData += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (let tablo of tumTablolar) {
        try {
            const [rows] = await db.execute(`SELECT * FROM ${tablo}`);
            dumpData += `-- ═══════════════════════════════════════════════════════════════\n`;
            dumpData += `-- Tablo: ${tablo} (${rows.length} kayıt)\n`;
            dumpData += `-- ═══════════════════════════════════════════════════════════════\n`;
            
            if (rows.length > 0) {
                // Kolon isimlerini al
                const kolonlar = Object.keys(rows[0]);
                
                rows.forEach(row => {
                    const values = Object.values(row).map(v => {
                        if (v === null) return "NULL";
                        if (typeof v === 'object' && v instanceof Date) {
                            return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        }
                        return `'${String(v).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
                    });
                    dumpData += `INSERT INTO \`${tablo}\` (\`${kolonlar.join('`, `')}\`) VALUES (${values.join(", ")});\n`;
                });
            }
            dumpData += `\n`;
        } catch (err) {
            dumpData += `-- HATA: ${tablo} tablosu okunamadı: ${err.message}\n\n`;
        }
    }

    dumpData += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    dumpData += `\n-- Yedekleme tamamlandı.\n`;

    return { data: dumpData, filename: `netSPOR_Yedek_${formattedDate}.sql` };
}

// SİSTEM YEDEKLEME (SQL İndir)
exports.sistemYedekle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    
    try {
        const yedek = await tumVeritabaniniYedekle();
        
        res.setHeader('Content-disposition', `attachment; filename=${yedek.filename}`);
        res.setHeader('Content-type', 'text/sql; charset=utf-8');
        res.send(yedek.data);

    } catch (error) {
        console.error("Yedekleme Hatası:", error);
        res.redirect('/api/admin/ayarlar?error=' + encodeURIComponent('Yedekleme hatası: ' + error.message));
    }
};

// FABRİKA AYARLARINA DÖN (Reset) - TÜM TABLOLAR
exports.sistemSifirlama = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    const { fabrika_sifresi } = req.body;
    const RESET_KEY = "102030SistemFabrika";

    if (fabrika_sifresi !== RESET_KEY) {
        return res.redirect('/api/admin/ayarlar?error=' + encodeURIComponent('Fabrika şifresi yanlış! Sıfırlama iptal edildi.'));
    }

    try {
        // 1. ÖNCE YEDEĞİ AL
        const yedek = await tumVeritabaniniYedekle();
        
        // Yedek dosyasını kaydet
        const yedekKlasoru = path.join(__dirname, '../backups');
        if (!fs.existsSync(yedekKlasoru)) {
            fs.mkdirSync(yedekKlasoru, { recursive: true });
        }
        fs.writeFileSync(path.join(yedekKlasoru, yedek.filename), yedek.data, 'utf8');
        console.log(`Sıfırlama öncesi yedek alındı: ${yedek.filename}`);

        // 2. SİFIRLANACAK TABLOLAR (genel_ayarlar, landing_ayarlar, ogrenci_form_ayarlari HARİÇ)
        const sifirlanacakTablolar = [
            'aidatlar', 'analizler', 'basvurular', 'branslar',
            'canli_destek_konusmalar', 'canli_destek_mesajlar',
            'ders_programi', 'destek_talepleri', 'devices',
            'gruplar', 'kasa', 'kasa_kategorileri', 'kullanicilar',
            'landing_ebulten', 'landing_egitmenler', 'landing_galeri',
            'landing_hakkimizda', 'landing_iletisim', 'landing_programlar',
            'landing_slider', 'landing_yorumlar', 'landing_ziyaretci',
            'ogrenciler', 'ozel_ders_kullanimlari', 'ozel_ders_paketleri',
            'satislar', 'subeler', 'taksitler', 'urunler', 'urun_satislari',
            'urun_stoklari', 'veliler', 'whatsapp_konusmalar', 'whatsapp_mesajlar',
            'whatsapp_mesaj_ayarlari', 'whatsapp_mesaj_log', 'whatsapp_otomatik_mesajlar',
            'whatsapp_sablonlar', 'whatsapp_toplu_mesajlar', 'whatsapp_webhook_log',
            'wp_api', 'yoklamalar'
        ];

        // 3. FOREIGN KEY KONTROLÜNÜ KAPAT
        await db.execute("SET FOREIGN_KEY_CHECKS = 0");

        // 4. TÜM TABLOLARI TRUNCATE ET
        for (let tablo of sifirlanacakTablolar) {
            try {
                await db.execute(`TRUNCATE TABLE \`${tablo}\``);
                console.log(`✓ ${tablo} tablosu temizlendi`);
            } catch (err) {
                console.log(`✗ ${tablo} tablosu temizlenemedi: ${err.message}`);
            }
        }

        // 5. VARSAYILAN YÖNETİCİYİ OLUŞTUR (netspor / 102030)
        const sifreHash = await bcrypt.hash('102030', 10);
        await db.execute(`
            INSERT INTO kullanicilar (ad_soyad, kullanici_adi, sifre, rol, durum) 
            VALUES ('Ana Yönetici', 'netspor', ?, 'yonetici', 1)
        `, [sifreHash]);
        console.log('✓ Varsayılan yönetici oluşturuldu (netspor / 102030)');

        // 6. GENEL AYARLARI GÜNCELLE (sadece limitleri sıfırla, diğer ayarları koru)
        await db.execute(`
            UPDATE genel_ayarlar SET 
                sube_limiti = 1,
                kullanici_limiti = 5,
                brans_limiti = 5,
                grup_limiti = 10
            WHERE id = 1
        `);
        console.log('✓ Sistem limitleri varsayılana döndürüldü');

        // 7. FOREIGN KEY KONTROLÜNÜ AÇ
        await db.execute("SET FOREIGN_KEY_CHECKS = 1");

        // 8. OTURUMU SONLANDIR VE GİRİŞ SAYFASINA YÖNLENDİR
        req.session.destroy(() => {
            res.redirect('/api/auth/login?success=' + encodeURIComponent('Sistem başarıyla sıfırlandı! Yeni giriş: netspor / 102030'));
        });

    } catch (error) {
        console.error("Sıfırlama Hatası:", error);
        await db.execute("SET FOREIGN_KEY_CHECKS = 1");
        res.redirect('/api/admin/ayarlar?error=' + encodeURIComponent('Sıfırlama sırasında hata oluştu: ' + error.message));
    }
};


// ═══════════════════════════════════════════════════════════════
// FORM AYARLARI
// ═══════════════════════════════════════════════════════════════

// FORM AYARLARI SAYFASI (Listeleme)
exports.formAyarlariSayfasi = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    try {
        const [alanlar] = await db.execute('SELECT * FROM ogrenci_form_ayarlari ORDER BY sira ASC');

        res.render('form_builder.html', { 
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            alanlar: alanlar
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// YENİ ALAN EKLEME
exports.formAlanEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    const { alan_adi, alan_tipi, zorunlu_mu } = req.body;

    try {
        const [sonSira] = await db.execute('SELECT MAX(sira) as maxSira FROM ogrenci_form_ayarlari');
        const yeniSira = (sonSira[0].maxSira || 0) + 1;

        await db.execute(`
            INSERT INTO ogrenci_form_ayarlari (alan_adi, alan_tipi, zorunlu_mu, sira, gosterim_aktif) 
            VALUES (?, ?, ?, ?, 1)
        `, [alan_adi, alan_tipi, zorunlu_mu ? 1 : 0, yeniSira]);

        res.redirect('/api/admin/form-ayarlari?success=' + encodeURIComponent('Alan başarıyla eklendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/form-ayarlari?error=' + encodeURIComponent('Bir hata oluştu!'));
    }
};

// ALAN SİLME
exports.formAlanSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    const id = req.params.id;

    try {
        await db.execute('DELETE FROM ogrenci_form_ayarlari WHERE id = ?', [id]);
        res.redirect('/api/admin/form-ayarlari?success=' + encodeURIComponent('Alan silindi!'));
    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/form-ayarlari?error=' + encodeURIComponent('Silme hatası!'));
    }
};

// FORM SIRALAMA GÜNCELLEME (AJAX)
exports.formSiralamaGuncelle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.status(403).send('Yetkisiz');

    const { siralama } = req.body;

    try {
        if (siralama && siralama.length > 0) {
            for (let i = 0; i < siralama.length; i++) {
                const id = siralama[i];
                const siraNo = i + 1;
                await db.execute('UPDATE ogrenci_form_ayarlari SET sira = ? WHERE id = ?', [siraNo, id]);
            }
        }
        res.json({ success: true, message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error("Sıralama Hatası:", error);
        res.status(500).json({ success: false, message: 'Veritabanı hatası' });
    }
};


// ═══════════════════════════════════════════════════════════════
// BRANŞ & GRUP YÖNETİMİ
// ═══════════════════════════════════════════════════════════════

// SAYFAYI GÖSTER
exports.bransSayfasi = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    try {
        const [subeler] = await db.execute('SELECT * FROM subeler');
        const [branslar] = await db.execute(`
            SELECT b.*, s.sube_adi 
            FROM branslar b 
            JOIN subeler s ON b.sube_id = s.id
            ORDER BY b.id DESC
        `);
        const [gruplar] = await db.execute('SELECT * FROM gruplar');
        const [ayarlar] = await db.execute('SELECT brans_limiti, grup_limiti FROM genel_ayarlar LIMIT 1');
        
        res.render('branches.html', { 
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            subeler: subeler,
            branslar: branslar,
            gruplar: gruplar,
            limitler: ayarlar[0]
        });

    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// YENİ BRANŞ EKLE
exports.bransEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    
    const { sube_id, brans_adi } = req.body;

    try {
        const [limitData] = await db.execute('SELECT brans_limiti FROM genel_ayarlar LIMIT 1');
        const [mevcutSayi] = await db.execute('SELECT COUNT(*) as sayi FROM branslar');
        
        if (mevcutSayi[0].sayi >= limitData[0].brans_limiti) {
            return res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Branş limitine ulaşıldı! Yeni branş ekleyemezsiniz.'));
        }

        await db.execute('INSERT INTO branslar (sube_id, brans_adi) VALUES (?, ?)', [sube_id, brans_adi]);
        res.redirect('/api/admin/branslar?success=' + encodeURIComponent('Branş başarıyla eklendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Bir hata oluştu!'));
    }
};

// YENİ GRUP EKLE
exports.grupEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    
    const { brans_id, grup_adi, kontenjan } = req.body;

    try {
        const [limitData] = await db.execute('SELECT grup_limiti FROM genel_ayarlar LIMIT 1');
        const [mevcutSayi] = await db.execute('SELECT COUNT(*) as sayi FROM gruplar');
        
        if (mevcutSayi[0].sayi >= limitData[0].grup_limiti) {
            return res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Grup limitine ulaşıldı! Yeni grup ekleyemezsiniz.'));
        }

        await db.execute('INSERT INTO gruplar (brans_id, grup_adi, kontenjan) VALUES (?, ?, ?)', [brans_id, grup_adi, kontenjan]);
        res.redirect('/api/admin/branslar?success=' + encodeURIComponent('Grup başarıyla eklendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Bir hata oluştu!'));
    }
};

// SİLME İŞLEMLERİ
exports.bransSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    try {
        await db.execute('DELETE FROM branslar WHERE id = ?', [req.params.id]);
        res.redirect('/api/admin/branslar?success=' + encodeURIComponent('Branş silindi!'));
    } catch (error) {
        res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Silme hatası!'));
    }
};

exports.grupSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    try {
        await db.execute('DELETE FROM gruplar WHERE id = ?', [req.params.id]);
        res.redirect('/api/admin/branslar?success=' + encodeURIComponent('Grup silindi!'));
    } catch (error) {
        res.redirect('/api/admin/branslar?error=' + encodeURIComponent('Silme hatası!'));
    }
};


// ═══════════════════════════════════════════════════════════════
// ŞUBE & KULLANICI YÖNETİMİ
// ═══════════════════════════════════════════════════════════════

// SAYFAYI GÖSTER
exports.subeKullaniciSayfasi = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    try {
        const [subeler] = await db.execute(`
            SELECT s.*, COUNT(k.id) as personel_sayisi 
            FROM subeler s 
            LEFT JOIN kullanicilar k ON k.sube_id = s.id 
            GROUP BY s.id
        `);

        const [kullanicilar] = await db.execute(`
            SELECT k.*, s.sube_adi 
            FROM kullanicilar k 
            LEFT JOIN subeler s ON k.sube_id = s.id 
            ORDER BY k.rol, k.ad_soyad
        `);

        const [ayarlar] = await db.execute('SELECT sube_limiti, kullanici_limiti FROM genel_ayarlar LIMIT 1');

        res.render('branches_users.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            subeler: subeler,
            kullanicilar: kullanicilar,
            limitler: ayarlar[0]
        });

    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// YENİ ŞUBE EKLE
exports.subeEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    const { sube_adi, adres, telefon } = req.body;

    try {
        const [limit] = await db.execute('SELECT sube_limiti FROM genel_ayarlar LIMIT 1');
        const [mevcut] = await db.execute('SELECT COUNT(*) as sayi FROM subeler');
        
        if (mevcut[0].sayi >= limit[0].sube_limiti) {
            return res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Şube limitine ulaşıldı!'));
        }

        await db.execute('INSERT INTO subeler (sube_adi, adres, telefon) VALUES (?, ?, ?)', [sube_adi, adres, telefon]);
        res.redirect('/api/admin/subeler?success=' + encodeURIComponent('Şube başarıyla eklendi!'));
    } catch (error) { 
        console.error(error); 
        res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Bir hata oluştu!'));
    }
};

// YENİ KULLANICI EKLE (DETAYLI YETKİLERLE)
exports.kullaniciEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    
    const { ad_soyad, kullanici_adi, sifre, sube_id, rol } = req.body;

    try {
        const [limit] = await db.execute('SELECT kullanici_limiti FROM genel_ayarlar LIMIT 1');
        const [mevcut] = await db.execute('SELECT COUNT(*) as sayi FROM kullanicilar');
        
        if (mevcut[0].sayi >= limit[0].kullanici_limiti) {
            return res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Kullanıcı limitine ulaşıldı!'));
        }

        const hashSifre = await bcrypt.hash(sifre, 10);

        const yetkiler = JSON.stringify({
            // Dashboard
            dashboard: req.body.perm_dashboard === 'on',
            // Öğrenci Yönetimi
            ogrenci_liste: req.body.perm_ogrenci_liste === 'on',
            ogrenci_profil: req.body.perm_ogrenci_profil === 'on',
            ogrenci_ekle: req.body.perm_ogrenci_ekle === 'on',
            ogrenci_duzenle: req.body.perm_ogrenci_duzenle === 'on',
            ogrenci_sil: req.body.perm_ogrenci_sil === 'on',
            // Yoklama
            yoklama_gor: req.body.perm_yoklama_gor === 'on',
            yoklama_islem: req.body.perm_yoklama_islem === 'on',
            // Ders Programı
            ders_programi_gor: req.body.perm_ders_programi_gor === 'on',
            ders_programi_islem: req.body.perm_ders_programi_islem === 'on',
            // Branş/Grup
            brans_grup_gor: req.body.perm_brans_grup_gor === 'on',
            brans_grup_islem: req.body.perm_brans_grup_islem === 'on',
            // Kasa
            kasa_gor: req.body.perm_kasa_gor === 'on',
            kasa_islem: req.body.perm_kasa_islem === 'on',
            // Envanter
            envanter_gor: req.body.perm_envanter_gor === 'on',
            envanter_islem: req.body.perm_envanter_islem === 'on',
            // Başvuru
            basvuru_gor: req.body.perm_basvuru_gor === 'on',
            basvuru_islem: req.body.perm_basvuru_islem === 'on',
            // WhatsApp
            whatsapp_gor: req.body.perm_whatsapp_gor === 'on',
            whatsapp_islem: req.body.perm_whatsapp_islem === 'on'
        });

        await db.execute(`
            INSERT INTO kullanicilar (ad_soyad, kullanici_adi, sifre, sube_id, rol, yetkiler, durum)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [ad_soyad, kullanici_adi, hashSifre, sube_id || null, rol, yetkiler]);

        res.redirect('/api/admin/subeler?success=' + encodeURIComponent('Kullanıcı başarıyla eklendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Hata: Kullanıcı adı kullanılıyor olabilir.'));
    }
};

// KULLANICI DÜZENLE (DETAYLI YETKİLERLE)
exports.kullaniciDuzenle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');

    const { id, ad_soyad, kullanici_adi, sifre, sube_id, rol } = req.body;

    try {
        const yetkiler = JSON.stringify({
            // Dashboard
            dashboard: req.body.perm_dashboard === 'on',
            // Öğrenci Yönetimi
            ogrenci_liste: req.body.perm_ogrenci_liste === 'on',
            ogrenci_profil: req.body.perm_ogrenci_profil === 'on',
            ogrenci_ekle: req.body.perm_ogrenci_ekle === 'on',
            ogrenci_duzenle: req.body.perm_ogrenci_duzenle === 'on',
            ogrenci_sil: req.body.perm_ogrenci_sil === 'on',
            // Yoklama
            yoklama_gor: req.body.perm_yoklama_gor === 'on',
            yoklama_islem: req.body.perm_yoklama_islem === 'on',
            // Ders Programı
            ders_programi_gor: req.body.perm_ders_programi_gor === 'on',
            ders_programi_islem: req.body.perm_ders_programi_islem === 'on',
            // Branş/Grup
            brans_grup_gor: req.body.perm_brans_grup_gor === 'on',
            brans_grup_islem: req.body.perm_brans_grup_islem === 'on',
            // Kasa
            kasa_gor: req.body.perm_kasa_gor === 'on',
            kasa_islem: req.body.perm_kasa_islem === 'on',
            // Envanter
            envanter_gor: req.body.perm_envanter_gor === 'on',
            envanter_islem: req.body.perm_envanter_islem === 'on',
            // Başvuru
            basvuru_gor: req.body.perm_basvuru_gor === 'on',
            basvuru_islem: req.body.perm_basvuru_islem === 'on',
            // WhatsApp
            whatsapp_gor: req.body.perm_whatsapp_gor === 'on',
            whatsapp_islem: req.body.perm_whatsapp_islem === 'on'
        });

        let sql = `UPDATE kullanicilar SET ad_soyad=?, kullanici_adi=?, sube_id=?, rol=?, yetkiler=?`;
        let params = [ad_soyad, kullanici_adi, sube_id || null, rol, yetkiler];

        if (sifre && sifre.trim() !== "") {
            const hashSifre = await bcrypt.hash(sifre, 10);
            sql += `, sifre=?`;
            params.push(hashSifre);
        }

        sql += ` WHERE id=?`;
        params.push(id);

        await db.execute(sql, params);
        res.redirect('/api/admin/subeler?success=' + encodeURIComponent('Kullanıcı güncellendi!'));

    } catch (error) {
        console.error(error);
        res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Güncelleme hatası!'));
    }
};

// SİLME İŞLEMLERİ
exports.subeSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    try {
        await db.execute('DELETE FROM subeler WHERE id = ?', [req.params.id]);
        res.redirect('/api/admin/subeler?success=' + encodeURIComponent('Şube silindi!'));
    } catch (error) {
        res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Silme hatası!'));
    }
};

exports.kullaniciSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    if (req.params.id == req.session.userID) {
        return res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Kendinizi silemezsiniz!'));
    }
    
    try {
        await db.execute('DELETE FROM kullanicilar WHERE id = ?', [req.params.id]);
        res.redirect('/api/admin/subeler?success=' + encodeURIComponent('Kullanıcı silindi!'));
    } catch (error) {
        res.redirect('/api/admin/subeler?error=' + encodeURIComponent('Silme hatası!'));
    }
};
