const db = require('../config/db');
const whatsappService = require('../services/whatsappService');

// 6 haneli rastgele kod üret
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Başvuru Formu Sayfası (Üyeliksiz - Public)
exports.basvuruFormu = async (req, res) => {
    try {
        const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
        const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');

        res.render('basvuru', {
            siteAyarlari: res.locals.siteAyarlari,
            subeler: subeler,
            formAlanlari: formAlanlari,
            hata: null,
            basari: null
        });
    } catch (error) {
        console.error('Başvuru formu hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// Başvuru Kaydetme İşlemi
exports.basvuruKaydet = async (req, res) => {
    try {
        const {
            sube_id, tc_kimlik, ad_soyad, dogum_tarihi, aciklama,
            kvkk_onay
        } = req.body;

        // KVKK onayı kontrolü
        if (!kvkk_onay) {
            const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');
            return res.render('basvuru', {
                siteAyarlari: res.locals.siteAyarlari,
                subeler: subeler,
                formAlanlari: formAlanlari,
                hata: 'KVKK Aydınlatma Metni ve Sözleşmeleri kabul etmelisiniz.',
                basari: null
            });
        }

        // Zorunlu alanlar kontrolü
        if (!ad_soyad || !dogum_tarihi || !sube_id) {
            const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');
            return res.render('basvuru', {
                siteAyarlari: res.locals.siteAyarlari,
                subeler: subeler,
                formAlanlari: formAlanlari,
                hata: 'Ad Soyad, Doğum Tarihi ve Şube alanları zorunludur.',
                basari: null
            });
        }

        // Fotoğraf dosyası varsa al
        let profilFoto = null;
        if (req.file) {
            profilFoto = req.file.filename;
        }

        // IP adresini al
        const ipAdresi = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Bilinmiyor';

        // Dinamik alanları JSON olarak sakla
        const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1');
        let ekstraVeriler = {};

        formAlanlari.forEach(alan => {
            const fieldName = alan.alan_adi.replace(/\s+/g, '_').toLowerCase();
            if (req.body[fieldName]) {
                ekstraVeriler[alan.alan_adi] = req.body[fieldName]; // Orijinal key
                ekstraVeriler[fieldName] = req.body[fieldName]; // Normalize edilmiş key (extractPhoneNumbers için)
            }
        });

        // Veli telefonlarını al
        const veli_telefonlar = extractPhoneNumbers(ekstraVeriler);

        if (veli_telefonlar.length === 0) {
            const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');
            return res.render('basvuru', {
                siteAyarlari: res.locals.siteAyarlari,
                subeler: subeler,
                formAlanlari: formAlanlari,
                hata: 'Baba Telefon veya Anne Telefon alanlarından en az birini doldurmalısınız!',
                basari: null
            });
        }

        // İlk telefonu doğrulama için kullan
        const dogrulamaTelefon = veli_telefonlar[0];

        // 6 haneli doğrulama kodu üret
        const dogrulamaKodu = generateVerificationCode();

        // Geçerlilik süresi: 5 dakika
        const gecerlilikSuresi = new Date();
        gecerlilikSuresi.setMinutes(gecerlilikSuresi.getMinutes() + 5);

        // Geçici başvuru kaydı oluştur (doğrulama_durumu: 'bekliyor')
        await db.execute(`
            INSERT INTO basvurular (
                sube_id, tc_kimlik, ad_soyad, dogum_tarihi, profil_foto, aciklama,
                ekstra_alanlar, ip_adresi, kvkk_onay,
                dogrulama_telefon, dogrulama_kodu, dogrulama_durumu, dogrulama_gecerlilik, dogrulama_deneme, dogrulama_son_gonderim,
                basvuru_tarihi, durum
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'bekliyor', ?, 0, NOW(), NOW(), 'beklemede')
        `, [
            sube_id, tc_kimlik || null, ad_soyad, dogum_tarihi, profilFoto, aciklama || null,
            JSON.stringify(ekstraVeriler), ipAdresi,
            dogrulamaTelefon, dogrulamaKodu, gecerlilikSuresi
        ]);

        const [lastInsert] = await db.execute('SELECT LAST_INSERT_ID() as id');
        const basvuruId = lastInsert[0].id;

        // =====================
        // DOĞRULAMA KODU GÖNDER (WhatsApp)
        // =====================
        try {
            // Şube bilgisini al
            const [subeInfo] = await db.execute('SELECT sube_adi, telefon FROM subeler WHERE id = ?', [sube_id]);
            const sube_adi = subeInfo.length > 0 ? subeInfo[0].sube_adi : 'Bilinmiyor';
            const sube_telefon = subeInfo.length > 0 ? subeInfo[0].telefon : 'Bilinmiyor';

            // Tesis adını al
            const [tesisInfo] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');
            const tesis_adi = tesisInfo.length > 0 ? tesisInfo[0].tesis_adi : 'netSPOR';

            // WhatsApp ile doğrulama kodu gönder (Şubenin numarasından)
            await whatsappService.sendManualMessage(
                sube_id,  // Şubenin WhatsApp token'ı kullanılacak
                dogrulamaTelefon,  // Velinin telefonuna gönderilecek
                `🔐 ${tesis_adi} Başvuru Doğrulama\n\nDoğrulama Kodunuz: ${dogrulamaKodu}\n\nBu kod 5 dakika geçerlidir.\nKodu kimseyle paylaşmayınız.`
            );

        } catch (smsError) {
            console.error(`❌ Doğrulama kodu gönderilemedi:`, smsError.message);
        }

        // JSON response döndür (AJAX için)
        res.json({
            success: true,
            basvuru_id: basvuruId,
            telefon: dogrulamaTelefon,
            message: 'Doğrulama kodu telefonunuza gönderildi.'
        });

    } catch (error) {
        console.error('Başvuru kaydetme hatası:', error);
        try {
            const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');
            res.render('basvuru', {
                siteAyarlari: res.locals.siteAyarlari,
                subeler: subeler,
                formAlanlari: formAlanlari,
                hata: 'Başvuru kaydedilirken bir hata oluştu: ' + error.message,
                basari: null
            });
        } catch (renderError) {
            console.error('Render hatası:', renderError);
            res.status(500).send('Başvuru kaydedilirken hata: ' + error.message);
        }
    }
};

// Başvuru Listesi Sayfası (Admin)
exports.basvuruListesi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const { durum, sube } = req.query;

        let sql = `
            SELECT b.*, s.sube_adi
            FROM basvurular b
            LEFT JOIN subeler s ON b.sube_id = s.id
            WHERE 1=1
        `;
        let params = [];

        if (durum) {
            sql += ' AND b.durum = ?';
            params.push(durum);
        }

        if (sube) {
            sql += ' AND b.sube_id = ?';
            params.push(sube);
        }

        sql += ' ORDER BY b.basvuru_tarihi DESC';

        const [basvurular] = await db.execute(sql, params);
        const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');

        // İstatistikler
        const [stats] = await db.execute(`
            SELECT
                COUNT(*) as toplam,
                SUM(CASE WHEN durum = 'beklemede' THEN 1 ELSE 0 END) as beklemede,
                SUM(CASE WHEN durum = 'onaylandi' THEN 1 ELSE 0 END) as onaylandi,
                SUM(CASE WHEN durum = 'reddedildi' THEN 1 ELSE 0 END) as reddedildi
            FROM basvurular
        `);

        res.render('basvurular_liste', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            basvurular: basvurular,
            subeler: subeler,
            stats: stats[0],
            filtre: { durum, sube }
        });

    } catch (error) {
        console.error('Başvuru listesi hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// Başvuru Detay Sayfası (Admin)
exports.basvuruDetay = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const id = req.params.id;

        const [basvuru] = await db.execute(`
            SELECT b.*, s.sube_adi
            FROM basvurular b
            LEFT JOIN subeler s ON b.sube_id = s.id
            WHERE b.id = ?
        `, [id]);

        if (basvuru.length === 0) {
            return res.redirect('/api/admin/basvurular');
        }

        res.render('basvuru_detay', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            basvuru: basvuru[0]
        });

    } catch (error) {
        console.error('Başvuru detay hatası:', error);
        res.redirect('/api/basvuru/liste');
    }
};

// Başvuru Durumu Güncelle
exports.basvuruDurumGuncelle = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const { basvuru_id, durum, notlar } = req.body;

        await db.execute(`
            UPDATE basvurular
            SET durum = ?, notlar = ?, isleyen_kullanici_id = ?, islem_tarihi = NOW()
            WHERE id = ?
        `, [durum, notlar || null, req.session.userID, basvuru_id]);

        res.redirect('/api/basvuru/detay/' + basvuru_id);

    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        res.redirect('/api/admin/basvurular');
    }
};

// Başvurudan Öğrenci Oluştur
exports.basvuruOgrenciOlustur = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const id = req.params.id;

        const [basvuru] = await db.execute('SELECT * FROM basvurular WHERE id = ?', [id]);

        if (basvuru.length === 0) {
            return res.send('<script>alert("Başvuru bulunamadı!"); window.location.href="/api/admin/basvurular";</script>');
        }

        const b = basvuru[0];

        // Öğrenci oluştur
        await db.execute(`
            INSERT INTO ogrenciler (
                sube_id, tc_kimlik, ad_soyad, dogum_tarihi, kayit_tarihi,
                profil_foto, aciklama, durum
            ) VALUES (?, ?, ?, ?, NOW(), ?, ?, 'aktif')
        `, [b.sube_id, b.tc_kimlik, b.ad_soyad, b.dogum_tarihi, b.profil_foto, b.aciklama]);

        // Başvuruyu onayla
        await db.execute(`
            UPDATE basvurular
            SET durum = 'onaylandi', isleyen_kullanici_id = ?, islem_tarihi = NOW()
            WHERE id = ?
        `, [req.session.userID, id]);

        res.send('<script>alert("Öğrenci başarıyla oluşturuldu!"); window.location.href="/api/ogrenci/liste";</script>');

    } catch (error) {
        console.error('Öğrenci oluşturma hatası:', error);
        res.send('<script>alert("Hata: ' + error.message + '"); window.location.href="/api/admin/basvurular";</script>');
    }
};

// Başvuru Sil
exports.basvuruSil = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const id = req.params.id;
        await db.execute('DELETE FROM basvurular WHERE id = ?', [id]);
        res.redirect('/api/admin/basvurular');
    } catch (error) {
        console.error('Başvuru silme hatası:', error);
        res.redirect('/api/admin/basvurular');
    }
};

// Başvuru Reddet
exports.basvuruReddet = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');
    try {
        const id = req.params.id;
        await db.execute(`
            UPDATE basvurular
            SET durum = 'reddedildi', isleyen_kullanici_id = ?, islem_tarihi = NOW()
            WHERE id = ?
        `, [req.session.userID, id]);
        res.redirect('/api/admin/basvurular');
    } catch (error) {
        console.error('Başvuru reddetme hatası:', error);
        res.redirect('/api/admin/basvurular');
    }
};

/**
 * ozel_veri JSON'dan telefon numaralarını çıkarır
 */
function extractPhoneNumbers(ozelVeri) {
    const telefonlar = [];

    if (!ozelVeri) return telefonlar;

    try {
        const data = typeof ozelVeri === 'string' ? JSON.parse(ozelVeri) : ozelVeri;

        const telefonAlanlari = [
            'baba_telefon',
            'anne_telefon',
            'acil_durumda_aranacak_kisi',
            'acil_durumda_aranacak_kiÅi',
            'veli_telefon',
            'telefon',
            'telefon1',
            'telefon2',
            'telefon3'
        ];

        for (const alan of telefonAlanlari) {
            if (data[alan]) {
                const telefon = formatPhoneNumber(data[alan]);
                if (telefon && !telefonlar.includes(telefon)) {
                    telefonlar.push(telefon);
                }
            }
        }

    } catch (e) {
        console.error('ozel_veri parse hatası:', e.message);
    }

    return telefonlar;
}

// Kod Doğrulama
exports.kodDogrula = async (req, res) => {
    try {
        const { basvuru_id, kod } = req.body;

        if (!basvuru_id || !kod) {
            return res.json({ success: false, message: 'Eksik bilgi!' });
        }

        // Başvuruyu ve kodunu al
        const [basvuru] = await db.execute(`
            SELECT * FROM basvurular
            WHERE id = ? AND dogrulama_durumu = 'bekliyor'
        `, [basvuru_id]);

        if (basvuru.length === 0) {
            return res.json({ success: false, message: 'Başvuru bulunamadı!' });
        }

        const b = basvuru[0];

        // Deneme sayısı kontrolü
        if (b.dogrulama_deneme >= 3) {
            await db.execute(`UPDATE basvurular SET dogrulama_durumu = 'iptal' WHERE id = ?`, [basvuru_id]);
            return res.json({ success: false, message: 'Çok fazla hatalı deneme! Başvurunuz iptal edildi.' });
        }

        // Süre kontrolü
        const simdi = new Date();
        const gecerlilik = new Date(b.dogrulama_gecerlilik);

        if (simdi > gecerlilik) {
            return res.json({ success: false, message: 'Doğrulama kodunun süresi dolmuş! Lütfen kodu tekrar gönderin.' });
        }

        // Kod kontrolü
        if (kod.trim() !== b.dogrulama_kodu) {
            await db.execute(`
                UPDATE basvurular
                SET dogrulama_deneme = dogrulama_deneme + 1
                WHERE id = ?
            `, [basvuru_id]);

            const kalanHak = 3 - (b.dogrulama_deneme + 1);
            return res.json({
                success: false,
                message: `Hatalı kod! Kalan deneme hakkı: ${kalanHak}`
            });
        }

        // ✅ KOD DOĞRU - BAŞVURUYU TAMAMLA
        await db.execute(`
            UPDATE basvurular
            SET dogrulama_durumu = 'dogrulandi'
            WHERE id = ?
        `, [basvuru_id]);

        // =====================
        // WHATSAPP MESAJLARI GÖNDER
        // =====================
        try {
            const [subeInfo] = await db.execute('SELECT sube_adi, telefon FROM subeler WHERE id = ?', [b.sube_id]);
            const [tesisInfo] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');

            const sube_adi = subeInfo.length > 0 ? subeInfo[0].sube_adi : '';
            const sube_telefon = subeInfo.length > 0 ? subeInfo[0].telefon : '';
            const tesis_adi = tesisInfo.length > 0 ? tesisInfo[0].tesis_adi : 'netSPOR';

            const ekstraVeriler = typeof b.ekstra_alanlar === 'string' ? JSON.parse(b.ekstra_alanlar) : b.ekstra_alanlar;
            const veli_telefonlar = extractPhoneNumbers(ekstraVeriler);

            // 1. VELİYE MESAJ
            if (veli_telefonlar.length > 0) {
                for (const telefon of veli_telefonlar) {
                    try {
                        await whatsappService.sendAutoMessage(
                            b.sube_id,
                            'basvuru_gonderme',
                            telefon,
                            {
                                ad_soyad: b.ad_soyad,
                                veli_adi: b.ad_soyad,
                                tc_no: b.tc_kimlik || '',
                                telefon: telefon,
                                tesis_adi: tesis_adi,
                                sube_adi: sube_adi,
                                dogum_tarihi: b.dogum_tarihi
                            }
                        );
                    } catch (e) {
                        console.error(`❌ Veli mesajı hata: ${e.message}`);
                    }
                }
            }

            // 2. YÖNETİCİYE MESAJ
            if (sube_telefon && sube_telefon.trim() !== '') {
                try {
                    const formattedSubeTelefon = formatPhoneNumber(sube_telefon.trim());
                    if (formattedSubeTelefon) {
                        await whatsappService.sendAutoMessage(
                            b.sube_id,
                            'basvuru_yonetici',
                            formattedSubeTelefon,
                            {
                                ad_soyad: b.ad_soyad,
                                telefon: veli_telefonlar.join(', ') || 'Belirtilmemiş',
                                bolum: sube_adi,
                                sube_adi: sube_adi,
                                dogum_tarihi: b.dogum_tarihi,
                                tesis_adi: tesis_adi
                            }
                        );
                    }
                } catch (e) {
                    console.error(`❌ Yönetici mesajı hata: ${e.message}`);
                }
            }

        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError);
        }

        res.json({
            success: true,
            message: 'Başvurunuz başarıyla tamamlandı! En kısa sürede size dönüş yapılacaktır.'
        });

    } catch (error) {
        console.error('Kod doğrulama hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu: ' + error.message });
    }
};

// Kodu Tekrar Gönder
exports.kodTekrarGonder = async (req, res) => {
    try {
        const { basvuru_id } = req.body;

        if (!basvuru_id) {
            return res.json({ success: false, message: 'Başvuru ID gerekli!' });
        }

        const [basvuru] = await db.execute(`
            SELECT * FROM basvurular
            WHERE id = ? AND dogrulama_durumu = 'bekliyor'
        `, [basvuru_id]);

        if (basvuru.length === 0) {
            return res.json({ success: false, message: 'Başvuru bulunamadı!' });
        }

        const b = basvuru[0];

        // ⏱️ 60 SANİYE KONTROL (SPAM KORUMASI)
        if (b.dogrulama_son_gonderim) {
            const sonGonderim = new Date(b.dogrulama_son_gonderim);
            const simdi = new Date();
            const farkSaniye = Math.floor((simdi - sonGonderim) / 1000);

            if (farkSaniye < 60) {
                const kalanSaniye = 60 - farkSaniye;

                return res.json({
                    success: false,
                    message: `Lütfen ${kalanSaniye} saniye bekleyin!`,
                    cooldown: kalanSaniye
                });
            }
        }

        // Yeni kod üret
        const yeniKod = generateVerificationCode();

        // Yeni geçerlilik süresi
        const gecerlilikSuresi = new Date();
        gecerlilikSuresi.setMinutes(gecerlilikSuresi.getMinutes() + 5);

        // Kodu güncelle
        await db.execute(`
            UPDATE basvurular
            SET dogrulama_kodu = ?,
                dogrulama_gecerlilik = ?,
                dogrulama_deneme = 0,
                dogrulama_son_gonderim = NOW()
            WHERE id = ?
        `, [yeniKod, gecerlilikSuresi, basvuru_id]);

        // Kodu gönder
        try {
            // Şube bilgisini al
            const [subeInfo] = await db.execute('SELECT sube_adi, telefon FROM subeler WHERE id = ?', [b.sube_id]);
            const sube_adi = subeInfo.length > 0 ? subeInfo[0].sube_adi : 'Bilinmiyor';
            const sube_telefon = subeInfo.length > 0 ? subeInfo[0].telefon : 'Bilinmiyor';

            const [tesisInfo] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');
            const tesis_adi = tesisInfo.length > 0 ? tesisInfo[0].tesis_adi : 'netSPOR';


            await whatsappService.sendManualMessage(
                b.sube_id,  // Şubenin WhatsApp token'ı kullanılacak
                b.dogrulama_telefon,  // Velinin telefonuna gönderilecek
                `🔐 ${tesis_adi} Başvuru Doğrulama\n\nYeni Doğrulama Kodunuz: ${yeniKod}\n\nBu kod 5 dakika geçerlidir.\nKodu kimseyle paylaşmayınız.`
            );

            res.json({
                success: true,
                message: 'Yeni doğrulama kodu telefonunuza gönderildi.'
            });

        } catch (smsError) {
            console.error('Kod gönderme hatası:', smsError);
            res.json({ success: false, message: 'Kod gönderilemedi!' });
        }

    } catch (error) {
        console.error('Kod tekrar gönderme hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu!' });
    }
};

// Başvuru İptal Et
exports.basvuruIptal = async (req, res) => {
    try {
        const { basvuru_id } = req.body;

        if (!basvuru_id) {
            return res.json({ success: false, message: 'Başvuru ID gerekli!' });
        }

        // Başvuruyu iptal et
        await db.execute(`
            UPDATE basvurular
            SET dogrulama_durumu = 'iptal'
            WHERE id = ? AND dogrulama_durumu = 'bekliyor'
        `, [basvuru_id]);

        res.json({
            success: true,
            message: 'Başvuru iptal edildi.'
        });

    } catch (error) {
        console.error('Başvuru iptal hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu!' });
    }
};

/**
 * Telefon numarasını 90XXXXXXXXXX formatına çevirir
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Tüm non-digit karakterleri temizle (+ hariç başta)
    let cleaned = phone.toString().trim();

    // Başta + varsa işaretle ve kaldır
    let hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/\D/g, '');

    if (cleaned.length === 0) return null;

    // Eğer + ile başladıysa, direkt kullan (uluslararası format)
    if (hasPlus) {
        return cleaned;
    }

    // Türkiye numaraları
    if (cleaned.length === 11 && cleaned[0] === '0') {
        return '90' + cleaned.substring(1);
    }

    if (cleaned.length === 10 && (cleaned[0] === '5' || cleaned[0] === '8' || cleaned[0] === '2' || cleaned[0] === '3' || cleaned[0] === '4')) {
        return '90' + cleaned;
    }

    // Zaten 90 ile başlıyorsa (Türkiye)
    if (cleaned.length === 12 && cleaned.substring(0, 2) === '90') {
        return cleaned;
    }

    // Diğer tüm numaralar
    if (cleaned.length >= 7) {
        return cleaned;
    }

    return null;
}
