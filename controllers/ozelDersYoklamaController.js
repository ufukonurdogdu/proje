const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const pushService = require('../services/pushService');

// Aktif Özel Ders Öğrencileri Listesi
exports.liste = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        // Aktif özel ders paketleri olan öğrencileri çek
        const [paketler] = await db.execute(`
            SELECT 
                odp.id as paket_id,
                odp.toplam_saat,
                odp.kullanilan_saat,
                odp.kalan_saat,
                odp.gecerlilik_gun,
                odp.baslangic_tarihi,
                odp.bitis_tarihi,
                odp.durum as paket_durum,
                s.baslik as paket_adi,
                s.satis_turu,
                o.id as ogrenci_id,
                o.ad_soyad,
                o.profil_foto,
                o.sube_id,
                o.ozel_veri,
                sub.sube_adi,
                g.grup_adi,
                b.brans_adi
            FROM ozel_ders_paketleri odp
            JOIN satislar s ON odp.satis_id = s.id
            JOIN ogrenciler o ON odp.ogrenci_id = o.id
            LEFT JOIN subeler sub ON o.sube_id = sub.id
            LEFT JOIN gruplar g ON o.grup_id = g.id
            LEFT JOIN branslar b ON g.brans_id = b.id
            WHERE odp.durum = 'aktif'
            ORDER BY o.ad_soyad ASC
        `);

        // Şube filtresi (admin değilse)
        let filtreliPaketler = paketler;
        if (req.session.rol !== 'yonetici') {
            filtreliPaketler = paketler.filter(p => p.sube_id === req.session.subeId);
        }

        // Bugünün yoklamasını kontrol et
        const bugun = new Date().toISOString().split('T')[0];
        const [bugunYoklamalar] = await db.execute(`
            SELECT paket_id, durum FROM ozel_ders_kullanimlari WHERE DATE(tarih) = ?
        `, [bugun]);

        const yoklamaMap = {};
        bugunYoklamalar.forEach(y => {
            yoklamaMap[y.paket_id] = y.durum;
        });

        res.render('ozel_ders_yoklama.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari,
            paketler: filtreliPaketler,
            bugunYoklamalar: yoklamaMap,
            bugun: bugun
        });

    } catch (error) {
        console.error('Özel ders yoklama liste hatası:', error);
        res.redirect('/');
    }
};

// Toplu Yoklama Kaydet
exports.yoklamaKaydet = async (req, res) => {
    const { yoklamalar, tarih } = req.body;
    // yoklamalar: [{ paket_id, ogrenci_id, durum, saat }]

    try {
        const sonuclar = [];
        
        for (const yoklama of yoklamalar) {
            const { paket_id, ogrenci_id, durum, saat } = yoklama;
            
            // Paket ve öğrenci bilgisini al
            const [paket] = await db.execute(`
                SELECT odp.*, s.baslik as paket_adi, o.ad_soyad, o.ozel_veri, o.sube_id
                FROM ozel_ders_paketleri odp
                JOIN satislar s ON odp.satis_id = s.id
                JOIN ogrenciler o ON odp.ogrenci_id = o.id
                WHERE odp.id = ?
            `, [paket_id]);
            
            if (paket.length === 0) continue;
            
            const paketData = paket[0];
            const kullanilanSaat = parseFloat(saat) || 1;
            
            // Süre kontrolü
            const bugun = new Date();
            const bitisTarihi = new Date(paketData.bitis_tarihi);
            
            if (bugun > bitisTarihi) {
                await db.execute('UPDATE ozel_ders_paketleri SET durum = "suresi_doldu" WHERE id = ?', [paket_id]);
                sonuclar.push({ paket_id, success: false, message: 'Paket süresi dolmuş' });
                continue;
            }

            // ⭐ ÖNCEKİ YOKLAMAYI KONTROL ET (Bildirim kontrolü için)
            const [eskiKayit] = await db.execute(`
                SELECT id, durum FROM ozel_ders_kullanimlari 
                WHERE paket_id = ? AND DATE(tarih) = DATE(?)
            `, [paket_id, tarih]);
            
            const eskiDurum = eskiKayit.length > 0 ? eskiKayit[0].durum : null;
            const bildirimGonderilecek = !eskiDurum || eskiDurum !== durum;

            // Durum: katildi, katilmadi, izinli
            let saatDusulecek = 0;
            let aciklama = '';
            let yeniKullanilan = parseFloat(paketData.kullanilan_saat);
            let yeniKalan = parseFloat(paketData.kalan_saat);
            
            if (durum === 'katildi') {
                // Saat kontrolü
                if (kullanilanSaat > paketData.kalan_saat) {
                    sonuclar.push({ paket_id, success: false, message: 'Yetersiz saat' });
                    continue;
                }
                saatDusulecek = kullanilanSaat;
                aciklama = 'Derse katıldı';
                yeniKullanilan = parseFloat(paketData.kullanilan_saat) + saatDusulecek;
                yeniKalan = parseFloat(paketData.toplam_saat) - yeniKullanilan;
            } else if (durum === 'katilmadi') {
                // KATILMADI - Saat düşülmez, sadece kayıt tutulur
                saatDusulecek = 0;
                aciklama = 'Derse katılmadı (ders hakkı düşülmedi)';
            } else if (durum === 'izinli') {
                // İZİNLİ - Saat düşülmez
                saatDusulecek = 0;
                aciklama = 'İzinli (ders hakkı saklı)';
            }

            if (eskiKayit.length > 0) {
                // Güncelle
                await db.execute(`
                    UPDATE ozel_ders_kullanimlari 
                    SET kullanilan_saat = ?, durum = ?, aciklama = ?
                    WHERE id = ?
                `, [saatDusulecek, durum, aciklama, eskiKayit[0].id]);
            } else {
                // Yeni kayıt
                await db.execute(`
                    INSERT INTO ozel_ders_kullanimlari (paket_id, ogrenci_id, kullanilan_saat, tarih, durum, aciklama)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [paket_id, ogrenci_id, saatDusulecek, tarih, durum, aciklama]);
            }

            // Paketi güncelle (sadece katıldı ise saat düşülür)
            if (durum === 'katildi') {
                const paketDurum = yeniKalan <= 0 ? 'bitti' : 'aktif';

                await db.execute(`
                    UPDATE ozel_ders_paketleri SET kullanilan_saat = ?, kalan_saat = ?, durum = ? WHERE id = ?
                `, [yeniKullanilan, Math.max(0, yeniKalan), paketDurum, paket_id]);
            }

            // ⭐ BİLDİRİM KONTROLÜ: Sadece durum değiştiyse veya ilk kez alınıyorsa gönder
            if (!bildirimGonderilecek) {
                console.log(`⏭️ Öğrenci ${ogrenci_id} (Paket ${paket_id}) için aynı durum (${durum}), bildirim atlanıyor`);
                sonuclar.push({ paket_id, success: true, durum, saat: saatDusulecek, bildirimAtlandi: true });
                continue;
            }

            // =====================
            // ⭐ PUSH BİLDİRİM GÖNDER (Sadece durum değiştiyse)
            // =====================
            try {
                let pushTitle = '';
                let pushBody = '';
                
                if (durum === 'katildi') {
                    pushTitle = '✅ Özel Ders - Katıldı';
                    pushBody = `${paketData.ad_soyad} - ${paketData.paket_adi} dersine katıldı. Kalan: ${Math.max(0, yeniKalan)} saat`;
                } else if (durum === 'katilmadi') {
                    pushTitle = '❌ Özel Ders - Katılmadı';
                    pushBody = `${paketData.ad_soyad} - ${paketData.paket_adi} dersine katılmadı. (Ders hakkı düşülmedi)`;
                } else if (durum === 'izinli') {
                    pushTitle = '📝 Özel Ders - İzinli';
                    pushBody = `${paketData.ad_soyad} - ${paketData.paket_adi} dersi için izinli sayıldı.`;
                }
                
                await pushService.sendToVeli(ogrenci_id, pushTitle, pushBody, '/veli/panel', 'ozel_ders');
                console.log(`✅ Bildirim gönderildi: Öğrenci ${ogrenci_id} - ${durum}`);
            } catch (pushErr) {
                console.error('Push bildirim hatası:', pushErr.message);
            }

            // =====================
            // WHATSAPP MESAJI GÖNDER (Sadece durum değiştiyse)
            // =====================
            if (whatsappService && typeof whatsappService.sendAutoMessage === 'function') {
                try {
                    const telefonlar = extractPhoneNumbers(paketData.ozel_veri);

                    if (telefonlar.length > 0 && paketData.sube_id) {
                        let trigger = 'ozel_yoklama_katildi';
                        if (durum === 'katilmadi') {
                            trigger = 'ozel_yoklama_katilmadi';
                        } else if (durum === 'izinli') {
                            trigger = 'ozel_yoklama_izinli';
                        }

                        const mesajData = {
                            ad_soyad: paketData.ad_soyad,
                            paket_adi: paketData.paket_adi,
                            toplam_saat: paketData.toplam_saat,
                            kullanilan_saat: yeniKullanilan,
                            kalan_saat: Math.max(0, yeniKalan)
                        };

                        for (const telefon of telefonlar) {
                            try {
                                await whatsappService.sendAutoMessage(
                                    paketData.sube_id,
                                    trigger,
                                    telefon,
                                    mesajData
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

            sonuclar.push({ paket_id, success: true, durum, saat: saatDusulecek });
        }

        res.json({ 
            success: true, 
            message: `${sonuclar.filter(s => s.success).length} yoklama kaydedildi`,
            sonuclar 
        });

    } catch (error) {
        console.error('Yoklama kaydetme hatası:', error);
        res.json({ success: false, message: 'Yoklama kaydedilemedi: ' + error.message });
    }
};

// Yoklama Geçmişi
exports.gecmis = async (req, res) => {
    try {
        const { tarih } = req.query;
        const secilenTarih = tarih || new Date().toISOString().split('T')[0];

        const [gecmis] = await db.execute(`
            SELECT 
                odk.*,
                o.ad_soyad,
                o.profil_foto,
                s.baslik as paket_adi
            FROM ozel_ders_kullanimlari odk
            JOIN ogrenciler o ON odk.ogrenci_id = o.id
            JOIN ozel_ders_paketleri odp ON odk.paket_id = odp.id
            JOIN satislar s ON odp.satis_id = s.id
            WHERE DATE(odk.tarih) = ?
            ORDER BY odk.created_at DESC
        `, [secilenTarih]);

        res.json({ success: true, gecmis, tarih: secilenTarih });

    } catch (error) {
        console.error('Yoklama geçmişi hatası:', error);
        res.json({ success: false, message: error.message });
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