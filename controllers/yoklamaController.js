const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const pushService = require('../services/pushService');

// YOKLAMA EKRANI (Grup Seçimi)
exports.yoklamaSayfasi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');
    try {
        const [gruplar] = await db.execute(`
            SELECT g.id, g.grup_adi, b.brans_adi 
            FROM gruplar g 
            JOIN branslar b ON g.brans_id = b.id
        `);
        res.render('attendance.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            gruplar: gruplar
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// GRUBA AİT ÖĞRENCİLERİ GETİR (AJAX)
exports.ogrenciGetir = async (req, res) => {
    const { grup_id, tarih } = req.query;
    try {
        const [ogrenciler] = await db.execute(`
            SELECT id, ad_soyad, profil_foto FROM ogrenciler 
            WHERE grup_id = ? AND durum = 'aktif'
        `, [grup_id]);

        const [yoklamalar] = await db.execute(`
            SELECT ogrenci_id, durum FROM yoklamalar 
            WHERE grup_id = ? AND tarih = ?
        `, [grup_id, tarih]);

        const liste = ogrenciler.map(ogr => {
            const kayit = yoklamalar.find(y => y.ogrenci_id === ogr.id);
            return {
                ...ogr,
                profil_foto: ogr.profil_foto && ogr.profil_foto !== 'default.png' ? ogr.profil_foto : '1.png',
                mevcut_durum: kayit ? kayit.durum : null
            };
        });

        res.json({ success: true, ogrenciler: liste });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
};

// YOKLAMAYI KAYDET
exports.yoklamaKaydet = async (req, res) => {
    const { grup_id, tarih, yoklama_verisi } = req.body;

    try {
        // Grup bilgisini al (branş adı ve sube_id için - branslar tablosundan)
        const [grupInfo] = await db.execute(`
            SELECT g.id, g.grup_adi, b.brans_adi, b.sube_id 
            FROM gruplar g 
            JOIN branslar b ON g.brans_id = b.id 
            WHERE g.id = ?
        `, [grup_id]);

        if (grupInfo.length === 0) {
            return res.status(400).json({ success: false, message: 'Grup bulunamadı.' });
        }

        const grupAdi = grupInfo[0].grup_adi;
        const bransAdi = grupInfo[0].brans_adi;
        const subeId = grupInfo[0].sube_id;

        // ⭐ ÖNCEKİ YOKLAMALARI ÇEK (Bildirim kontrolü için)
        const [eskiYoklamalar] = await db.execute(
            'SELECT ogrenci_id, durum FROM yoklamalar WHERE grup_id = ? AND tarih = ?', 
            [grup_id, tarih]
        );
        
        // Eski yoklamaları map'e çevir: { ogrenci_id: durum }
        const eskiDurumlar = {};
        eskiYoklamalar.forEach(y => {
            eskiDurumlar[y.ogrenci_id] = y.durum;
        });

        // Önce o günkü o grubun eski yoklamasını temizle
        await db.execute('DELETE FROM yoklamalar WHERE grup_id = ? AND tarih = ?', [grup_id, tarih]);

        // Yeni verileri ekle
        if (yoklama_verisi && yoklama_verisi.length > 0) {
            for (const veri of yoklama_verisi) {
                // Yoklama kaydını ekle
                await db.execute(`
                    INSERT INTO yoklamalar (grup_id, tarih, ogrenci_id, durum) 
                    VALUES (?, ?, ?, ?)
                `, [grup_id, tarih, veri.id, veri.durum]);

                // ⭐ BİLDİRİM KONTROLÜ: Eski durum ile yeni durum aynı mı?
                const eskiDurum = eskiDurumlar[veri.id];
                const bildirimGonderilecek = !eskiDurum || eskiDurum !== veri.durum;
                
                // Eğer daha önce aynı durumda yoklama alınmışsa bildirim gönderme
                if (!bildirimGonderilecek) {
                    console.log(`⏭️ Öğrenci ${veri.id} için aynı durum (${veri.durum}), bildirim atlanıyor`);
                    continue;
                }

                // Öğrenci bilgilerini al
                const [ogr] = await db.execute('SELECT ad_soyad, ozel_veri FROM ogrenciler WHERE id = ?', [veri.id]);

                if (ogr.length > 0) {
                    // ⭐ PUSH BİLDİRİM - Veliye (Sadece durum değiştiyse veya ilk kez alınıyorsa)
                    try {
                        let pushTitle = '';
                        let pushBody = '';
                        
                        if (veri.durum === 'katildi') {
                            pushTitle = '✅ Yoklama - Katıldı';
                            pushBody = `${ogr[0].ad_soyad} - ${bransAdi} dersine katıldı. (${tarih})`;
                        } else if (veri.durum === 'katilmadi') {
                            pushTitle = '❌ Yoklama - Katılmadı';
                            pushBody = `${ogr[0].ad_soyad} - ${bransAdi} dersine katılmadı. (${tarih})`;
                        } else if (veri.durum === 'izinli') {
                            pushTitle = '📝 Yoklama - İzinli';
                            pushBody = `${ogr[0].ad_soyad} - ${bransAdi} dersi için izinli sayıldı. (${tarih})`;
                        }
                        
                        await pushService.sendToVeli(veri.id, pushTitle, pushBody, '/veli/panel?tab=yoklama', 'yoklama');
                        console.log(`✅ Bildirim gönderildi: Öğrenci ${veri.id} - ${veri.durum}`);
                    } catch (pushErr) {
                        console.error('Push bildirim hatası:', pushErr.message);
                    }

                    // WhatsApp mesajı gönder (servis varsa)
                    if (whatsappService && typeof whatsappService.sendAutoMessage === 'function') {
                        try {
                            const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);

                            if (telefonlar.length > 0 && subeId) {
                                const trigger = veri.durum === 'katildi' ? 'yoklama_katildi' 
                                              : veri.durum === 'katilmadi' ? 'yoklama_katilmadi' 
                                              : 'yoklama_izinli';

                                for (const telefon of telefonlar) {
                                    try {
                                        await whatsappService.sendAutoMessage(
                                            subeId, 
                                            trigger, 
                                            telefon, 
                                            { 
                                                ad_soyad: ogr[0].ad_soyad, 
                                                tarih: tarih, 
                                                ders_adi: bransAdi 
                                            }
                                        );
                                    } catch (msgError) {
                                        console.error(`❌ Mesaj gönderilemedi: ${telefon}`, msgError.message);
                                    }
                                }
                            }
                        } catch (wpError) {
                            console.error('WhatsApp mesaj hatası:', wpError.message);
                        }
                    }
                }
            }
        }

        // ⭐ PUSH BİLDİRİM - Yöneticilere (Sadece ilk yoklama alındığında)
        // Eğer daha önce bu gün bu grup için yoklama alınmamışsa yöneticilere bildirim gönder
        if (Object.keys(eskiDurumlar).length === 0) {
            try {
                const katildiSayisi = yoklama_verisi ? yoklama_verisi.filter(v => v.durum === 'katildi').length : 0;
                const toplamSayisi = yoklama_verisi ? yoklama_verisi.length : 0;
                
                await pushService.sendToYoneticiler(
                    '📋 Yoklama Alındı',
                    `${grupAdi} (${bransAdi}) - ${katildiSayisi}/${toplamSayisi} katıldı`,
                    '/api/yoklama'
                );
            } catch (pushErr) {
                console.error('Push bildirim hatası:', pushErr.message);
            }
        }

        res.json({ success: true, message: 'Yoklama başarıyla kaydedildi.' });

    } catch (error) {
        console.error('Yoklama kaydetme hatası:', error);
        res.status(500).json({ success: false, message: 'Veritabanı hatası: ' + error.message });
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
 * Telefon numarasını 90XXXXXXXXXX formatına çevirir
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;
    
    let cleaned = phone.toString().trim();
    let hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/\D/g, '');
    
    if (cleaned.length === 0) return null;
    
    if (hasPlus) {
        return cleaned;
    }
    
    if (cleaned.length === 11 && cleaned[0] === '0') {
        return '90' + cleaned.substring(1);
    }
    
    if (cleaned.length === 10 && (cleaned[0] === '5' || cleaned[0] === '8' || cleaned[0] === '2' || cleaned[0] === '3' || cleaned[0] === '4')) {
        return '90' + cleaned;
    }
    
    if (cleaned.length === 12 && cleaned.substring(0, 2) === '90') {
        return cleaned;
    }
    
    if (cleaned.length >= 7) {
        return cleaned;
    }
    
    return null;
}