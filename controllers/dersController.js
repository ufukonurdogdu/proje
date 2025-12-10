const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const pushService = require('../services/pushService');

// DERS PROGRAMI SAYFASI
exports.programSayfasi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');
    try {
        const { brans_id } = req.query;
        
        let sql = `
            SELECT d.*, g.grup_adi, b.brans_adi 
            FROM ders_programi d
            JOIN gruplar g ON d.grup_id = g.id
            JOIN branslar b ON g.brans_id = b.id
        `;
        
        let params = [];
        if (brans_id && brans_id !== 'tumu') {
            sql += ` WHERE g.brans_id = ?`;
            params.push(brans_id);
        }
        
        sql += ` ORDER BY d.baslangic_saati ASC`;
        const [dersler] = await db.execute(sql, params);
        
        const [branslar] = await db.execute('SELECT * FROM branslar');
        const [gruplar] = await db.execute('SELECT * FROM gruplar');
        
        res.render('schedule.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            dersler: dersler,
            branslar: branslar,
            gruplar: gruplar,
            seciliBrans: brans_id
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// DERS EKLE
exports.dersEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    const { grup_id, gun, baslangic, bitis } = req.body;
    
    try {
        // 1. Dersi ekle
        await db.execute(`
            INSERT INTO ders_programi (grup_id, gun, baslangic_saati, bitis_saati) 
            VALUES (?, ?, ?, ?)
        `, [grup_id, gun, baslangic, bitis]);

        // 2. WHATSAPP MESAJI GÖNDER
        try {
            // Grup → Branş → Şube bilgilerini al
            const [grupInfo] = await db.execute(`
                SELECT 
                    g.grup_adi, 
                    b.brans_adi, 
                    b.sube_id
                FROM gruplar g
                JOIN branslar b ON g.brans_id = b.id
                WHERE g.id = ?
            `, [grup_id]);

            if (grupInfo.length > 0) {
                const { grup_adi, brans_adi, sube_id } = grupInfo[0];

                // Tesis adını al
                const [tesisInfo] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');
                const tesis_adi = tesisInfo.length > 0 ? tesisInfo[0].tesis_adi : 'netSPOR';

                // Bu gruptaki tüm aktif öğrencileri al
                const [ogrenciler] = await db.execute(`
                    SELECT id, ad_soyad, ozel_veri
                    FROM ogrenciler
                    WHERE grup_id = ? AND durum = 'aktif'
                `, [grup_id]);

                // WhatsApp mesaj ayarını kontrol et
                const [mesajAyar] = await db.execute(
                    'SELECT ders_programi_yeni_aktif, ders_programi_yeni_mesaj FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?',
                    [sube_id]
                );

                if (mesajAyar.length > 0 && mesajAyar[0].ders_programi_yeni_aktif) {

                    // Her öğrenciye mesaj gönder
                    for (const ogr of ogrenciler) {
                        const telefonlar = extractPhoneNumbers(ogr.ozel_veri);

                        if (telefonlar.length > 0) {
                            const mesajData = {
                                ad_soyad: ogr.ad_soyad,
                                gun: formatGun(gun),
                                baslangic: baslangic,
                                bitis: bitis,
                                ders_adi: brans_adi,
                                grup_adi: grup_adi,
                                tesis_adi: tesis_adi
                            };

                            for (const telefon of telefonlar) {
                                try {
                                    await whatsappService.sendAutoMessage(
                                        sube_id,
                                        'ders_programi_yeni',
                                        telefon,
                                        mesajData
                                    );
                                } catch (msgError) {
                                    console.error(`❌ Mesaj gönderilemedi (${ogr.ad_soyad} - ${telefon}):`, msgError.message);
                                }
                            }
                        }
                    }
                }

                // ⭐ PUSH BİLDİRİM - Yöneticilere
                try {
                    await pushService.sendToYoneticiler(
                        '📅 Yeni Ders Eklendi',
                        `${grup_adi} - ${formatGun(gun)} ${baslangic}`,
                        '/api/ders/program'
                    );
                } catch (pushErr) {
                    console.error('Push bildirim hatası:', pushErr.message);
                }

                // ⭐ PUSH BİLDİRİM - Velilere (Gruptaki tüm öğrencilerin velilerine)
                try {
                    for (const ogr of ogrenciler) {
                        await pushService.sendToVeli(
                            ogr.id,
                            '📅 Yeni Ders Eklendi',
                            `${ogr.ad_soyad} - ${grup_adi} grubu için ${formatGun(gun)} günü ${baslangic} saatinde yeni ders eklendi.`,
                            '/veli/panel',
                            'ders_programi'
                        );
                    }
                    console.log(`✅ ${ogrenciler.length} veliye yeni ders push bildirimi gönderildi`);
                } catch (pushErr) {
                    console.error('Veli push bildirim hatası:', pushErr.message);
                }
            }
        } catch (wpError) {
            console.error('❌ WhatsApp genel hatası:', wpError);
        }

        res.redirect('/api/ders/program');
    } catch (error) {
        console.error('❌ Ders ekleme hatası:', error);
        res.send('<script>alert("Hata oluştu!"); window.location.href="/api/ders/program";</script>');
    }
};

// DERS SİL (İPTAL)
exports.dersSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    
    try {
        const dersId = req.params.id;

        // Önce ders bilgisini al (silmeden önce)
        const [dersInfo] = await db.execute(`
            SELECT 
                d.id, 
                d.gun, 
                d.baslangic_saati, 
                d.bitis_saati,
                g.id as grup_id, 
                g.grup_adi, 
                b.brans_adi, 
                b.sube_id
            FROM ders_programi d
            JOIN gruplar g ON d.grup_id = g.id
            JOIN branslar b ON g.brans_id = b.id
            WHERE d.id = ?
        `, [dersId]);

        if (dersInfo.length > 0) {
            const ders = dersInfo[0];

            // Dersi sil
            await db.execute('DELETE FROM ders_programi WHERE id = ?', [dersId]);

            // Bu gruptaki tüm aktif öğrencileri al (bildirimler için)
            const [ogrenciler] = await db.execute(`
                SELECT id, ad_soyad, ozel_veri
                FROM ogrenciler
                WHERE grup_id = ? AND durum = 'aktif'
            `, [ders.grup_id]);

            // =====================
            // WHATSAPP İPTAL MESAJI GÖNDER
            // =====================
            try {
                // Tesis adını al
                const [tesisInfo] = await db.execute('SELECT tesis_adi FROM genel_ayarlar LIMIT 1');
                const tesis_adi = tesisInfo.length > 0 ? tesisInfo[0].tesis_adi : 'netSPOR';

                // WhatsApp mesaj ayarını kontrol et
                const [mesajAyar] = await db.execute(
                    'SELECT ders_programi_iptal_aktif, ders_programi_iptal_mesaj FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?',
                    [ders.sube_id]
                );

                if (mesajAyar.length > 0 && mesajAyar[0].ders_programi_iptal_aktif) {
                    // Bugünün tarihini al
                    const bugun = new Date().toLocaleDateString('tr-TR');

                    // Saat formatını düzenle (HH:MM:SS → HH:MM)
                    const baslangicSaat = ders.baslangic_saati ? 
                        (typeof ders.baslangic_saati === 'string' ? ders.baslangic_saati.slice(0, 5) : ders.baslangic_saati) : '';
                    const bitisSaat = ders.bitis_saati ? 
                        (typeof ders.bitis_saati === 'string' ? ders.bitis_saati.slice(0, 5) : ders.bitis_saati) : '';

                    // Her öğrenciye iptal mesajı gönder
                    for (const ogr of ogrenciler) {
                        const telefonlar = extractPhoneNumbers(ogr.ozel_veri);

                        if (telefonlar.length > 0) {
                            const mesajData = {
                                ad_soyad: ogr.ad_soyad,
                                gun: formatGun(ders.gun),
                                baslangic: baslangicSaat,
                                bitis: bitisSaat,
                                ders_adi: ders.brans_adi,
                                grup_adi: ders.grup_adi,
                                tarih: bugun,
                                tesis_adi: tesis_adi
                            };

                            for (const telefon of telefonlar) {
                                try {
                                    await whatsappService.sendAutoMessage(
                                        ders.sube_id,
                                        'ders_programi_iptal',
                                        telefon,
                                        mesajData
                                    );
                                } catch (msgError) {
                                    console.error(`❌ Mesaj gönderilemedi (${ogr.ad_soyad} - ${telefon}):`, msgError.message);
                                }
                            }
                        }
                    }
                }

                // ⭐ PUSH BİLDİRİM - Yöneticilere
                try {
                    const baslangicSaat = ders.baslangic_saati ? 
                        (typeof ders.baslangic_saati === 'string' ? ders.baslangic_saati.slice(0, 5) : ders.baslangic_saati) : '';
                    
                    await pushService.sendToYoneticiler(
                        '❌ Ders İptal Edildi',
                        `${ders.grup_adi} - ${formatGun(ders.gun)} ${baslangicSaat}`,
                        '/api/ders/program'
                    );
                } catch (pushErr) {
                    console.error('Push bildirim hatası:', pushErr.message);
                }

                // ⭐ PUSH BİLDİRİM - Velilere (Gruptaki tüm öğrencilerin velilerine)
                try {
                    const baslangicSaat = ders.baslangic_saati ? 
                        (typeof ders.baslangic_saati === 'string' ? ders.baslangic_saati.slice(0, 5) : ders.baslangic_saati) : '';
                    
                    for (const ogr of ogrenciler) {
                        await pushService.sendToVeli(
                            ogr.id,
                            '❌ Ders İptal Edildi',
                            `${ogr.ad_soyad} - ${ders.grup_adi} grubu ${formatGun(ders.gun)} günü ${baslangicSaat} saatindeki ders iptal edildi.`,
                            '/veli/panel',
                            'ders_iptal'
                        );
                    }
                    console.log(`✅ ${ogrenciler.length} veliye ders iptal push bildirimi gönderildi`);
                } catch (pushErr) {
                    console.error('Veli push bildirim hatası:', pushErr.message);
                }

            } catch (wpError) {
                console.error('❌ WhatsApp genel hatası:', wpError);
            }
        } else {
            await db.execute('DELETE FROM ders_programi WHERE id = ?', [dersId]);
        }

        res.redirect('/api/ders/program');
    } catch (error) {
        console.error('❌ Ders silme hatası:', error);
        res.send('<script>alert("Ders silinirken hata oluştu!"); window.location.href="/api/ders/program";</script>');
    }
};

/**
 * Gün adını Türkçe formatına çevirir
 */
function formatGun(gun) {
    const gunler = {
        'Pazartesi': 'Pazartesi',
        'Sali': 'Salı',
        'Carsamba': 'Çarşamba',
        'Persembe': 'Perşembe',
        'Cuma': 'Cuma',
        'Cumartesi': 'Cumartesi',
        'Pazar': 'Pazar'
    };
    return gunler[gun] || gun;
}

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
            'acil_durumda_aranacak_kiŞi',
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

/**
 * Telefon numarasını WhatsApp formatına çevirir (Evrensel)
 * +90, +1, +44, +49 vb. tüm ülke kodlarını destekler
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;
    
    let cleaned = phone.toString().trim();
    
    // Boş kontrolü
    if (cleaned.length === 0) return null;
    
    // + ile başlıyorsa (uluslararası format)
    if (cleaned.startsWith('+')) {
        // Sadece rakamları al (+ hariç)
        const digits = cleaned.replace(/\D/g, '');
        if (digits.length >= 7) {
            return digits; // +1234567890 -> 1234567890
        }
        return null;
    }
    
    // Tüm non-digit karakterleri temizle
    cleaned = cleaned.replace(/\D/g, '');
    
    if (cleaned.length === 0) return null;
    
    // ÖNCELİK 1: Türkiye - 0 ile başlayan numaralar (05XX, 0850, 0212 vb.)
    if (cleaned.length === 11 && cleaned[0] === '0') {
        return '90' + cleaned.substring(1);
    }
    
    // ÖNCELİK 2: Türkiye - 10 haneli (5XX ile başlayan GSM)
    if (cleaned.length === 10 && cleaned[0] === '5') {
        return '90' + cleaned;
    }
    
    // ÖNCELİK 3: Zaten ülke kodu ile başlıyorsa (90, 1, 44, 49, vb.)
    if (cleaned.length >= 10) {
        return cleaned;
    }
    
    // 7-9 haneli numaralar - olduğu gibi döndür
    if (cleaned.length >= 7) {
        return cleaned;
    }
    
    return null;
}