const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const pushService = require('../services/pushService');


// =====================================================
// WHATSAPP YARDIMCI FONKSİYONLARI
// =====================================================

/**
 * Telefon numarasını evrensel formata çevirir
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;

    let cleaned = phone.toString().trim();
    let hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/\D/g, '');

    if (cleaned.length === 0) return null;

    if (hasPlus) return cleaned;

    if (cleaned.length === 11 && cleaned[0] === '0') {
        return '90' + cleaned.substring(1);
    }

    if (cleaned.length === 10 && ['5', '8', '2', '3', '4'].includes(cleaned[0])) {
        return '90' + cleaned;
    }

    if (cleaned.length === 12 && cleaned.substring(0, 2) === '90') {
        return cleaned;
    }

    if (cleaned.length >= 7) return cleaned;

    return null;
}

/**
 * ozel_veri JSON veya form verilerinden telefon numaralarını çıkarır
 */
function extractPhoneNumbers(ozelVeri) {
    const telefonlar = [];

    if (!ozelVeri) return telefonlar;

    try {
        const data = typeof ozelVeri === 'string' ? JSON.parse(ozelVeri) : ozelVeri;

        const telefonAlanlari = [
            'baba_telefon', 'anne_telefon', 'veli_telefon',
            'acil_durumda_aranacak_kisi', 'acil_durumda_aranacak_kiÅi',
            'telefon', 'telefon1', 'telefon2', 'telefon3',
            'cep_telefonu', 'ev_telefonu', 'is_telefonu'
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
 * WhatsApp mesajı gönderir (hata durumunda işlemi engellemez)
 */
async function sendWhatsAppNotification(subeId, triggerKey, telefonlar, variables, tesisAdi) {
    if (!whatsappService || typeof whatsappService.sendAutoMessage !== 'function') {
        console.log(`⚠️ WhatsApp servisi mevcut değil (${triggerKey})`);
        return;
    }

    if (!telefonlar || telefonlar.length === 0 || !subeId) {
        console.log(`⚠️ WhatsApp gönderilemedi - telefon veya şube yok (${triggerKey})`);
        return;
    }

    variables.tesis_adi = tesisAdi || 'Spor Tesisi';

    for (const telefon of telefonlar) {
        try {
            await whatsappService.sendAutoMessage(subeId, triggerKey, telefon, variables);
            console.log(`✅ WhatsApp mesajı gönderildi (${triggerKey}): ${telefon}`);
        } catch (error) {
            console.error(`❌ WhatsApp mesaj hatası (${triggerKey}): ${telefon}`, error.message);
        }
    }
}

/**
 * Tutarı formatlar (1000 -> 1.000 ₺)
 */
function formatTutar(tutar) {
    if (!tutar && tutar !== 0) return '0 ₺';
    return parseFloat(tutar).toLocaleString('tr-TR') + ' ₺';
}

/**
 * Ödeme tipini Türkçe'ye çevirir
 */
function getOdemeTipiAdi(odemeTipi) {
    const tipler = {
        'nakit': 'Nakit',
        'havale': 'Havale/EFT',
        'kredi_karti': 'Kredi Kartı',
        'pos': 'POS',
        'diger': 'Diğer'
    };
    return tipler[odemeTipi] || odemeTipi || 'Belirtilmedi';
}


// =====================
// ÜRÜN LİSTESİ
// =====================
exports.liste = async (req, res) => {
    try {
        // Ürünleri çek
        const [urunler] = await db.execute(`
            SELECT * FROM urunler ORDER BY created_at DESC
        `);

        // Her ürün için stok bilgilerini çek
        for (let urun of urunler) {
            if (urun.tur === 'stoklu') {
                const [stoklar] = await db.execute(
                    'SELECT * FROM urun_stoklari WHERE urun_id = ?',
                    [urun.id]
                );
                urun.stoklar = stoklar;
            } else {
                urun.stoklar = [];
            }
        }

        res.render('envanter.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                sube_id: req.session.subeId,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari,
            urunler: urunler
        });

    } catch (error) {
        console.error('Envanter liste hatası:', error);
        res.status(500).send('Sunucu hatası: ' + error.message);
    }
};

// =====================
// ÜRÜN EKLEME
// =====================
exports.ekle = async (req, res) => {
    try {
        const { urun_adi, fiyat, tur, bedenler, stoklar } = req.body;

        // Ürünü ekle
        const [result] = await db.execute(
            'INSERT INTO urunler (urun_adi, fiyat, tur) VALUES (?, ?, ?)',
            [urun_adi, fiyat, tur || 'stoklu']
        );

        const urunId = result.insertId;

        // Stoklu ürün ise beden ve stokları ekle
        if (tur === 'stoklu' && bedenler && bedenler.length > 0) {
            for (let i = 0; i < bedenler.length; i++) {
                const beden = bedenler[i];
                const stok = stoklar[i] || 0;
                
                if (beden && beden.trim() !== '') {
                    await db.execute(
                        'INSERT INTO urun_stoklari (urun_id, beden, adet) VALUES (?, ?, ?)',
                        [urunId, beden.trim(), parseInt(stok) || 0]
                    );
                }
            }
        }

        res.redirect('/api/envanter?success=' + encodeURIComponent('Ürün başarıyla eklendi'));

    } catch (error) {
        console.error('Ürün ekleme hatası:', error);
        res.redirect('/api/envanter?error=' + encodeURIComponent('Ürün eklenirken hata oluştu'));
    }
};

// =====================
// ÜRÜN GÜNCELLEME (STOK DAHİL)
// =====================
exports.guncelle = async (req, res) => {
    try {
        const { 
            urun_id, 
            urun_adi, 
            fiyat, 
            urun_tur,
            stok_id,        // Mevcut stok ID'leri (dizi)
            beden,          // Mevcut bedenler (dizi)
            adet,           // Mevcut adetler (dizi)
            yeni_beden,     // Yeni eklenecek beden
            yeni_stok,      // Yeni eklenecek stok adedi
            silinen_stok_ids // Silinecek stok ID'leri (dizi)
        } = req.body;

        // 1. Ürün bilgilerini güncelle
        await db.execute(
            'UPDATE urunler SET urun_adi = ?, fiyat = ? WHERE id = ?',
            [urun_adi, fiyat, urun_id]
        );

        // 2. Stoklu ürün ise stok işlemlerini yap
        if (urun_tur === 'stoklu') {
            
            // 2a. Silinen bedenleri kaldır
            if (silinen_stok_ids) {
                const silinecekler = Array.isArray(silinen_stok_ids) ? silinen_stok_ids : [silinen_stok_ids];
                for (const sid of silinecekler) {
                    if (sid && parseInt(sid) > 0) {
                        await db.execute('DELETE FROM urun_stoklari WHERE id = ? AND urun_id = ?', [sid, urun_id]);
                    }
                }
            }

            // 2b. Mevcut stokları güncelle
            if (stok_id && Array.isArray(stok_id)) {
                for (let i = 0; i < stok_id.length; i++) {
                    const id = stok_id[i];
                    const yeniAdet = adet[i] || 0;
                    
                    if (id && parseInt(id) > 0) {
                        await db.execute(
                            'UPDATE urun_stoklari SET adet = ? WHERE id = ? AND urun_id = ?',
                            [parseInt(yeniAdet), id, urun_id]
                        );
                    }
                }
            }

            // 2c. Yeni beden ekle
            if (yeni_beden && yeni_beden.trim() !== '') {
                // Aynı beden var mı kontrol et
                const [mevcutBeden] = await db.execute(
                    'SELECT id FROM urun_stoklari WHERE urun_id = ? AND beden = ?',
                    [urun_id, yeni_beden.trim()]
                );

                if (mevcutBeden.length > 0) {
                    // Varsa adetini artır
                    await db.execute(
                        'UPDATE urun_stoklari SET adet = adet + ? WHERE id = ?',
                        [parseInt(yeni_stok) || 0, mevcutBeden[0].id]
                    );
                } else {
                    // Yoksa yeni ekle
                    await db.execute(
                        'INSERT INTO urun_stoklari (urun_id, beden, adet) VALUES (?, ?, ?)',
                        [urun_id, yeni_beden.trim(), parseInt(yeni_stok) || 0]
                    );
                }
            }
        }

        res.redirect('/api/envanter?success=' + encodeURIComponent('Ürün ve stoklar güncellendi'));

    } catch (error) {
        console.error('Ürün güncelleme hatası:', error);
        res.redirect('/api/envanter?error=' + encodeURIComponent('Güncelleme sırasında hata oluştu: ' + error.message));
    }
};

// =====================
// STOK GÜNCELLEME (Ayrı modal için - opsiyonel)
// =====================
exports.stokGuncelle = async (req, res) => {
    try {
        const { urun_id, stok_id, beden, adet, yeni_beden, yeni_stok } = req.body;

        // Mevcut stokları güncelle
        if (stok_id && Array.isArray(stok_id)) {
            for (let i = 0; i < stok_id.length; i++) {
                const id = stok_id[i];
                const yeniAdet = adet[i] || 0;
                
                if (id) {
                    await db.execute(
                        'UPDATE urun_stoklari SET adet = ? WHERE id = ?',
                        [parseInt(yeniAdet), id]
                    );
                }
            }
        }

        // Yeni beden ekle
        if (yeni_beden && yeni_beden.trim() !== '') {
            await db.execute(
                'INSERT INTO urun_stoklari (urun_id, beden, adet) VALUES (?, ?, ?)',
                [urun_id, yeni_beden.trim(), parseInt(yeni_stok) || 0]
            );
        }

        res.redirect('/api/envanter?success=' + encodeURIComponent('Stoklar güncellendi'));

    } catch (error) {
        console.error('Stok güncelleme hatası:', error);
        res.redirect('/api/envanter?error=' + encodeURIComponent('Stok güncellenirken hata oluştu'));
    }
};

// =====================
// ÜRÜN SİLME
// =====================
exports.sil = async (req, res) => {
    try {
        const { id } = req.params;

        // Önce stokları sil
        await db.execute('DELETE FROM urun_stoklari WHERE urun_id = ?', [id]);
        
        // Sonra ürünü sil
        await db.execute('DELETE FROM urunler WHERE id = ?', [id]);

        res.redirect('/api/envanter?success=' + encodeURIComponent('Ürün silindi'));

    } catch (error) {
        console.error('Ürün silme hatası:', error);
        res.redirect('/api/envanter?error=' + encodeURIComponent('Silme sırasında hata oluştu'));
    }
};

// =====================
// API: ÜRÜN LİSTESİ (AJAX)
// =====================
exports.apiUrunler = async (req, res) => {
    try {
        const [urunler] = await db.execute('SELECT * FROM urunler ORDER BY urun_adi ASC');

        for (let urun of urunler) {
            if (urun.tur === 'stoklu') {
                const [stoklar] = await db.execute(
                    'SELECT * FROM urun_stoklari WHERE urun_id = ?',
                    [urun.id]
                );
                urun.stoklar = stoklar;
            } else {
                urun.stoklar = [];
            }
        }

        res.json({ success: true, urunler });

    } catch (error) {
        console.error('API ürün listesi hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================
// API: TEK ÜRÜN DETAYI (AJAX)
// =====================
exports.apiUrunDetay = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [urunler] = await db.execute('SELECT * FROM urunler WHERE id = ?', [id]);
        
        if (urunler.length === 0) {
            return res.json({ success: false, message: 'Ürün bulunamadı' });
        }

        const urun = urunler[0];

        if (urun.tur === 'stoklu') {
            const [stoklar] = await db.execute(
                'SELECT * FROM urun_stoklari WHERE urun_id = ?',
                [urun.id]
            );
            urun.stoklar = stoklar;
        } else {
            urun.stoklar = [];
        }

        res.json({ success: true, urun });

    } catch (error) {
        console.error('API ürün detay hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================
// ÜRÜN SATIŞI (WhatsApp Entegreli)
// =====================
exports.urunSatisi = async (req, res) => {
    try {
        const { 
            ogrenci_id, 
            urun_id, 
            stok_id,
            adet, 
            birim_fiyat, 
            toplam_tutar,
            odeme_tipi, 
            aciklama 
        } = req.body;

        // Ürün bilgisini al
        const [urunler] = await db.execute('SELECT * FROM urunler WHERE id = ?', [urun_id]);
        if (urunler.length === 0) {
            return res.json({ success: false, message: 'Ürün bulunamadı' });
        }
        const urun = urunler[0];

        // Öğrenci bilgisini al
        const [ogrenciler] = await db.execute('SELECT * FROM ogrenciler WHERE id = ?', [ogrenci_id]);
        if (ogrenciler.length === 0) {
            return res.json({ success: false, message: 'Öğrenci bulunamadı' });
        }
        const ogrenci = ogrenciler[0];

        // Beden bilgisini al (stoklu ürün için)
        let bedenBilgisi = '-';
        let kalanStok = null;

        // Stoklu ürün ise stok kontrolü ve düşürme
        if (urun.tur === 'stoklu' && stok_id) {
            const [stoklar] = await db.execute(
                'SELECT * FROM urun_stoklari WHERE id = ?',
                [stok_id]
            );

            if (stoklar.length === 0) {
                return res.json({ success: false, message: 'Stok kaydı bulunamadı' });
            }

            const stok = stoklar[0];
            bedenBilgisi = stok.beden || '-';
            const satisAdedi = parseInt(adet) || 1;

            if (stok.adet < satisAdedi) {
                return res.json({ success: false, message: 'Yetersiz stok! Mevcut: ' + stok.adet });
            }

            // Stoktan düş
            await db.execute(
                'UPDATE urun_stoklari SET adet = adet - ? WHERE id = ?',
                [satisAdedi, stok_id]
            );

            // Güncel stok miktarını hesapla
            kalanStok = stok.adet - satisAdedi;

            // =====================================================
            // STOK KRİTİK SEVİYE KONTROLÜ - YÖNETİCİYE BİLDİRİM
            // =====================================================
            const kritikEsik = 5; // Kritik stok eşiği (ayarlanabilir)
            if (kalanStok <= kritikEsik && kalanStok >= 0) {
                try {
                    const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';
                    
                    // Yöneticiye bildirim gönder
                    if (whatsappService && typeof whatsappService.notifyAdmin === 'function') {
                        await whatsappService.notifyAdmin(ogrenci.sube_id, 'urun_stok_az', {
                            urun_adi: urun.urun_adi,
                            beden: bedenBilgisi,
                            kalan_stok: kalanStok,
                            kritik_esik: kritikEsik,
                            tesis_adi: tesisAdi
                        });
                        console.log(`⚠️ Stok uyarısı gönderildi: ${urun.urun_adi} (${bedenBilgisi}) - Kalan: ${kalanStok}`);
                    }
                } catch (stokUyariError) {
                    console.error('Stok uyarı mesajı hatası:', stokUyariError.message);
                }
            }
        }

        // Açıklama oluştur
        const kasaAciklama = aciklama || `${ogrenci.ad_soyad} - ${urun.urun_adi}${bedenBilgisi !== '-' ? ' (' + bedenBilgisi + ')' : ''} satışı`;
        
        // Ödeme tipini kategori olarak kullan
        let kategori = 'Ürün Satışı';
        if (odeme_tipi === 'nakit') kategori = 'Ürün Satışı (Nakit)';
        else if (odeme_tipi === 'havale') kategori = 'Ürün Satışı (Havale/EFT)';
        else if (odeme_tipi === 'kredi_karti') kategori = 'Ürün Satışı (Kredi Kartı)';

        // KASA TABLOSUNA KAYIT
        await db.execute(`
            INSERT INTO kasa (sube_id, islem_turu, kategori, tutar, aciklama, tarih, islem_yapan_id)
            VALUES (?, 'gelir', ?, ?, ?, NOW(), ?)
        `, [ogrenci.sube_id || 1, kategori, toplam_tutar, kasaAciklama, req.session.userID]);

        // Ürün satış kaydı (opsiyonel tablo)
        try {
            await db.execute(`
                INSERT INTO urun_satislari (ogrenci_id, urun_id, stok_id, adet, birim_fiyat, toplam_tutar, odeme_tipi, aciklama, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [ogrenci_id, urun_id, stok_id || null, adet, birim_fiyat, toplam_tutar, odeme_tipi, kasaAciklama]);
        } catch (e) {
            // Tablo yoksa sorun değil, kasa kaydı yapıldı
            console.log('Satış detay tablosu hatası (önemsiz):', e.message);
        }
		
		// ⭐ PUSH BİLDİRİM - Veliye (🛒 10. Ürün Satışı Yapıldı)
try {
    await pushService.sendToVeli(
        ogrenci_id,
        '🛒 Ürün Satıldı',
        `${ogrenci.ad_soyad} - ${urun.urun_adi}${bedenBilgisi !== '-' ? ' (' + bedenBilgisi + ')' : ''} satışı yapıldı. Tutar: ${formatTutar(toplam_tutar)}`,
        '/veli/panel?tab=aidat',
        'urun'
    );
} catch (pushErr) {
    console.error('Push bildirim hatası:', pushErr.message);
}

        // =====================================================
        // WhatsApp Mesajı Gönder (urun_satis)
        // =====================================================
        try {
            const telefonlar = extractPhoneNumbers(ogrenci.ozel_veri);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            await sendWhatsAppNotification(ogrenci.sube_id, 'urun_satis', telefonlar, {
                ad_soyad: ogrenci.ad_soyad,
                urun_adi: urun.urun_adi,
                beden: bedenBilgisi,
                adet: adet || 1,
                birim_fiyat: formatTutar(birim_fiyat),
                toplam_tutar: formatTutar(toplam_tutar),
                tutar: formatTutar(toplam_tutar), // {tutar} değişkeni için de aynı değer
                odeme_tipi: getOdemeTipiAdi(odeme_tipi),
                tarih: new Date().toLocaleDateString('tr-TR'),
                saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            }, tesisAdi);

            console.log(`✅ Ürün satış mesajı gönderildi: ${ogrenci.ad_soyad} - ${urun.urun_adi}`);
        } catch (wpError) {
            console.error('WhatsApp ürün satış mesaj hatası:', wpError.message);
        }

        res.json({ 
            success: true, 
            message: 'Satış başarıyla kaydedildi',
            data: {
                urun: urun.urun_adi,
                beden: bedenBilgisi,
                adet: adet,
                tutar: toplam_tutar
            }
        });

    } catch (error) {
        console.error('Ürün satışı hatası:', error);
        res.json({ success: false, message: 'Satış sırasında hata: ' + error.message });
    }
};
