/**
 * =====================================================
 * WHATSAPP OTOMATİK MESAJ CRON SERVİSİ
 * =====================================================
 * 
 * Her gün Türkiye saati 10:00'da çalışır
 * 
 * İçerik:
 * 1. Aidat Hatırlatma (ödeme öncesi)
 * 2. Gecikmiş Aidat (kademeli: +5, +8, +10 gün)
 * 3. Paket Bitiş Hatırlatma (7, 3, 1 gün kala)
 * 4. Özel Ders Bitiş Hatırlatma (7, 3, 1 gün kala)
 * 5. Taksit Hatırlatma (vade günü)
 * 6. Doğum Günü Kutlaması
 */

const db = require('../config/db');
const axios = require('axios');

// WhatsApp API URL
const WA_API_URL = 'https://app.netqr.tr';

// =====================================================
// YARDIMCI FONKSİYONLAR
// =====================================================

/**
 * Telefon numarasını formatla
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
 * ozel_veri'den telefon numaralarını çıkar
 */
function extractPhoneNumbers(ozelVeri) {
    const telefonlar = [];
    if (!ozelVeri) return telefonlar;

    try {
        const data = typeof ozelVeri === 'string' ? JSON.parse(ozelVeri) : ozelVeri;
        const telefonAlanlari = [
            'baba_telefon', 'anne_telefon', 'veli_telefon',
            'acil_durumda_aranacak_kisi', 'telefon', 'telefon1', 'telefon2',
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
 * Ay numarasından Türkçe ay adı
 */
function getAyAdi(ayNumarasi) {
    const aylar = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return aylar[ayNumarasi] || '';
}

/**
 * Tutarı formatla
 */
function formatTutar(tutar) {
    if (!tutar && tutar !== 0) return '0 ₺';
    return parseFloat(tutar).toLocaleString('tr-TR') + ' ₺';
}

/**
 * Bugün bu öğrenciye bu tip mesaj gönderilmiş mi kontrol et
 */
async function mesajGonderilmisMi(ogrenciId, mesajTipi, referansAy = null, referansYil = null, referansId = null) {
    try {
        const bugun = new Date().toISOString().split('T')[0];
        
        let sql = `
            SELECT id FROM whatsapp_mesaj_log 
            WHERE ogrenci_id = ? 
            AND mesaj_tipi = ? 
            AND DATE(gonderim_tarihi) = ?
            AND durum IN ('sent', 'delivered', 'read', 'pending')
        `;
        let params = [ogrenciId, mesajTipi, bugun];

        if (referansAy !== null && referansYil !== null) {
            sql += ` AND referans_ay = ? AND referans_yil = ?`;
            params.push(referansAy, referansYil);
        }

        if (referansId !== null) {
            sql += ` AND referans_id = ?`;
            params.push(referansId);
        }

        const [rows] = await db.execute(sql, params);
        return rows.length > 0;
    } catch (e) {
        console.error('Mesaj kontrol hatası:', e.message);
        return false;
    }
}

/**
 * Mesaj log'a kaydet
 */
async function mesajLogKaydet(subeId, ogrenciId, telefon, mesaj, mesajTipi, durum, referansAy = null, referansYil = null, referansId = null) {
    try {
        await db.execute(`
            INSERT INTO whatsapp_mesaj_log 
            (sube_id, ogrenci_id, telefon, mesaj, mesaj_tipi, durum, referans_ay, referans_yil, referans_id, gonderim_tarihi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [subeId, ogrenciId, telefon, mesaj, mesajTipi, durum, referansAy, referansYil, referansId]);
    } catch (e) {
        console.error('Mesaj log kayıt hatası:', e.message);
    }
}

/**
 * Öğrencinin bu ay için aktif paketi var mı kontrol et
 */
async function aktifPaketiVarMi(ogrenciId, yil, ay) {
    try {
        // 1. Aidatlar tablosunda paket olarak işaretli mi?
        const [aidatKontrol] = await db.execute(`
            SELECT id FROM aidatlar 
            WHERE ogrenci_id = ? AND yil = ? AND ay = ? AND odeme_tipi = 'paket'
        `, [ogrenciId, yil, ay]);

        if (aidatKontrol.length > 0) return true;

        // 2. Aktif paket satışı bu ayı kapsıyor mu?
        const ayBaslangic = new Date(yil, ay - 1, 1);
        const ayBitis = new Date(yil, ay, 0); // Ayın son günü

        const [paketKontrol] = await db.execute(`
            SELECT id FROM satislar 
            WHERE ogrenci_id = ? 
            AND satis_turu = 'paket' 
            AND durum = 'aktif'
            AND baslangic_tarihi <= ? 
            AND bitis_tarihi >= ?
        `, [ogrenciId, ayBitis.toISOString().split('T')[0], ayBaslangic.toISOString().split('T')[0]]);

        return paketKontrol.length > 0;
    } catch (e) {
        console.error('Paket kontrol hatası:', e.message);
        return false;
    }
}

/**
 * WhatsApp mesajı gönder (cron için)
 * Her şube kendi API key'ini kullanır
 */
async function sendCronMessage(subeId, triggerKey, telefon, variables, ogrenciId, referansAy = null, referansYil = null, referansId = null) {
    try {
        // 1. Şubenin WhatsApp API bağlantısını kontrol et
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            console.log(`  ⚠️ Şube ${subeId} için WhatsApp bağlantısı yok`);
            return false;
        }

        // 2. Mesaj ayarlarını kontrol et (bu trigger aktif mi?)
        const [ayarlar] = await db.execute(
            `SELECT * FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?`,
            [subeId]
        );

        if (ayarlar.length === 0) {
            console.log(`  ⚠️ Şube ${subeId} için mesaj ayarları yok`);
            return false;
        }

        const ayar = ayarlar[0];
        const aktifKey = `${triggerKey}_aktif`;
        const mesajKey = `${triggerKey}_mesaj`;

        // Bu mesaj tipi aktif mi?
        if (!ayar[aktifKey]) {
            console.log(`  ⚠️ ${triggerKey} mesajı şube ${subeId} için aktif değil`);
            return false;
        }

        // Mesaj şablonu var mı?
        let mesajSablonu = ayar[mesajKey];
        if (!mesajSablonu) {
            console.log(`  ⚠️ ${triggerKey} için mesaj şablonu tanımlı değil`);
            return false;
        }

        // 3. Değişkenleri mesaja yerleştir
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            mesajSablonu = mesajSablonu.replace(new RegExp(placeholder, 'g'), value || '');
        }

        // 4. WhatsApp API ile gönder
        await axios.post(`${WA_API_URL}/api/message/text`, {
            token: apiData[0].api_key,
            to: telefon,
            text: mesajSablonu
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        // 5. Log'a kaydet
        await mesajLogKaydet(subeId, ogrenciId, telefon, mesajSablonu.substring(0, 500), triggerKey, 'sent', referansAy, referansYil, referansId);
        
        return true;
    } catch (error) {
        console.error(`❌ Cron mesaj hatası (${triggerKey}):`, error.message);
        await mesajLogKaydet(subeId, ogrenciId, telefon, error.message, triggerKey, 'failed', referansAy, referansYil, referansId);
        return false;
    }
}


// =====================================================
// 1. AİDAT HATIRLATMA CRON (Ödeme Öncesi)
// =====================================================
async function aidatHatirlatmaCron() {
    console.log('📅 Aidat hatırlatma cron başladı...');
    
    try {
        const bugun = new Date();
        const bugunGun = bugun.getDate();
        const buAy = bugun.getMonth() + 1;
        const buYil = bugun.getFullYear();

        // Aktif mesaj ayarları olan şubeleri al
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.aidat_hatirlatma_aktif = 1
        `);

        for (const sube of subeler) {
            // Bugün aidat hatırlatma günü olan öğrencileri bul
            const [ogrenciler] = await db.execute(`
                SELECT o.id, o.ad_soyad, o.aidat_ucreti, o.aidat_hatirlatma_gunu, o.ozel_veri, o.sube_id
                FROM ogrenciler o
                WHERE o.sube_id = ?
                AND o.durum = 'aktif'
                AND o.aidat_hatirlatma_gunu = ?
            `, [sube.sube_id, bugunGun]);

            for (const ogr of ogrenciler) {
                try {
                    // Bu ay zaten ödenmiş mi?
                    const [aidatKontrol] = await db.execute(`
                        SELECT * FROM aidatlar 
                        WHERE ogrenci_id = ? AND yil = ? AND ay = ? AND durum = 'tamamlandi'
                    `, [ogr.id, buYil, buAy]);

                    if (aidatKontrol.length > 0) continue; // Ödenmiş, atla

                    // Aktif paketi var mı bu ay için?
                    const paketVar = await aktifPaketiVarMi(ogr.id, buYil, buAy);
                    if (paketVar) continue; // Paket kapsamında, atla

                    // Bugün zaten mesaj gönderilmiş mi?
                    const gonderilmis = await mesajGonderilmisMi(ogr.id, 'aidat_hatirlatma', buAy, buYil);
                    if (gonderilmis) continue; // Zaten gönderilmiş, atla

                    // Telefonları al
                    const telefonlar = extractPhoneNumbers(ogr.ozel_veri);
                    if (telefonlar.length === 0) continue;

                    // Mesaj gönder
                    for (const telefon of telefonlar) {
                        await sendCronMessage(sube.sube_id, 'aidat_hatirlatma', telefon, {
                            ogrenci_adi: ogr.ad_soyad,
                            ad_soyad: ogr.ad_soyad,
                            tutar: formatTutar(ogr.aidat_ucreti),
                            ay: getAyAdi(buAy),
                            yil: buYil,
                            tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                        }, ogr.id, buAy, buYil);

                        console.log(`  ✅ Aidat hatırlatma: ${ogr.ad_soyad} - ${telefon}`);
                        
                        // Rate limit için bekle
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (e) {
                    console.error(`  ❌ Öğrenci hatası (${ogr.ad_soyad}):`, e.message);
                }
            }
        }

        console.log('📅 Aidat hatırlatma cron tamamlandı.');
    } catch (error) {
        console.error('❌ Aidat hatırlatma cron hatası:', error.message);
    }
}


// =====================================================
// 2. GECİKMİŞ AİDAT CRON (Kademeli: +5, +8, +10 gün)
// =====================================================
async function aidatGecikmisCron() {
    console.log('⚠️ Gecikmiş aidat cron başladı...');
    
    try {
        const bugun = new Date();
        const bugunGun = bugun.getDate();
        const buAy = bugun.getMonth() + 1;
        const buYil = bugun.getFullYear();

        // Aktif mesaj ayarları olan şubeleri al
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.aidat_gecmis_aktif = 1
        `);

        for (const sube of subeler) {
            // Aktif öğrencileri al
            const [ogrenciler] = await db.execute(`
                SELECT o.id, o.ad_soyad, o.aidat_ucreti, o.aidat_hatirlatma_gunu, o.ozel_veri, o.sube_id
                FROM ogrenciler o
                WHERE o.sube_id = ?
                AND o.durum = 'aktif'
                AND o.aidat_hatirlatma_gunu IS NOT NULL
            `, [sube.sube_id]);

            for (const ogr of ogrenciler) {
                try {
                    const hatirlatmaGunu = ogr.aidat_hatirlatma_gunu;
                    
                    // Gecikme günlerini hesapla
                    const gecikme1 = hatirlatmaGunu + 5;  // 1. gecikme mesajı
                    const gecikme2 = hatirlatmaGunu + 8;  // 2. gecikme mesajı (+5+3)
                    const gecikme3 = hatirlatmaGunu + 10; // 3. gecikme mesajı (+5+3+2)

                    // Bugün gecikme günlerinden biri mi?
                    let gecikmeNo = 0;
                    if (bugunGun === gecikme1) gecikmeNo = 1;
                    else if (bugunGun === gecikme2) gecikmeNo = 2;
                    else if (bugunGun === gecikme3) gecikmeNo = 3;
                    
                    if (gecikmeNo === 0) continue; // Bugün gecikme günü değil

                    // Bu ay aidat ödenmiş mi?
                    const [aidatKontrol] = await db.execute(`
                        SELECT * FROM aidatlar 
                        WHERE ogrenci_id = ? AND yil = ? AND ay = ? AND durum = 'tamamlandi'
                    `, [ogr.id, buYil, buAy]);

                    if (aidatKontrol.length > 0) continue; // Ödenmiş, atla

                    // Aktif paketi var mı bu ay için?
                    const paketVar = await aktifPaketiVarMi(ogr.id, buYil, buAy);
                    if (paketVar) continue; // Paket kapsamında, atla

                    // Bu gecikme mesajı bugün gönderilmiş mi?
                    const mesajTipi = `aidat_gecmis`;
                    const gonderilmis = await mesajGonderilmisMi(ogr.id, mesajTipi, buAy, buYil, gecikmeNo);
                    if (gonderilmis) continue; // Zaten gönderilmiş

                    // Telefonları al
                    const telefonlar = extractPhoneNumbers(ogr.ozel_veri);
                    if (telefonlar.length === 0) continue;

                    // Mesaj gönder
                    for (const telefon of telefonlar) {
                        await sendCronMessage(sube.sube_id, 'aidat_gecmis', telefon, {
                            ogrenci_adi: ogr.ad_soyad,
                            ad_soyad: ogr.ad_soyad,
                            tutar: formatTutar(ogr.aidat_ucreti),
                            ay: getAyAdi(buAy),
                            yil: buYil,
                            tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                        }, ogr.id, buAy, buYil, gecikmeNo);

                        console.log(`  ⚠️ Gecikmiş aidat (${gecikmeNo}. uyarı): ${ogr.ad_soyad} - ${telefon}`);
                        
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (e) {
                    console.error(`  ❌ Öğrenci hatası (${ogr.ad_soyad}):`, e.message);
                }
            }
        }

        console.log('⚠️ Gecikmiş aidat cron tamamlandı.');
    } catch (error) {
        console.error('❌ Gecikmiş aidat cron hatası:', error.message);
    }
}


// =====================================================
// 3. PAKET BİTİM HATIRLATMA CRON (7, 3, 1 gün kala)
// =====================================================
async function paketBitimCron() {
    console.log('📦 Paket bitiş cron başladı...');
    
    try {
        const bugun = new Date();
        bugun.setHours(0, 0, 0, 0);

        // Aktif mesaj ayarları olan şubeleri al
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.paket_bitim_aktif = 1
        `);

        for (const sube of subeler) {
            // Hangi günler aktif?
            const gunler = [];
            if (sube.paket_bitim_7gun) gunler.push(7);
            if (sube.paket_bitim_3gun) gunler.push(3);
            if (sube.paket_bitim_1gun) gunler.push(1);

            if (gunler.length === 0) continue;

            for (const kalanGun of gunler) {
                // Hedef tarihi hesapla
                const hedefTarih = new Date(bugun);
                hedefTarih.setDate(hedefTarih.getDate() + kalanGun);
                const hedefTarihStr = hedefTarih.toISOString().split('T')[0];

                // Bu tarihte biten paketleri bul
                const [paketler] = await db.execute(`
                    SELECT s.*, o.ad_soyad, o.ozel_veri, o.sube_id as ogr_sube_id
                    FROM satislar s
                    LEFT JOIN ogrenciler o ON s.ogrenci_id = o.id
                    WHERE s.satis_turu = 'paket'
                    AND s.durum = 'aktif'
                    AND DATE(s.bitis_tarihi) = ?
                    AND o.sube_id = ?
                    AND o.durum = 'aktif'
                `, [hedefTarihStr, sube.sube_id]);

                for (const paket of paketler) {
                    try {
                        // Bugün bu paket için mesaj gönderilmiş mi?
                        const gonderilmis = await mesajGonderilmisMi(paket.ogrenci_id, 'paket_bitim', null, null, paket.id);
                        if (gonderilmis) continue;

                        const telefonlar = extractPhoneNumbers(paket.ozel_veri);
                        if (telefonlar.length === 0) continue;

                        for (const telefon of telefonlar) {
                            await sendCronMessage(sube.sube_id, 'paket_bitim', telefon, {
                                ad_soyad: paket.ad_soyad,
                                paket_adi: paket.baslik,
                                kalan_gun: kalanGun,
                                bitis_tarihi: new Date(paket.bitis_tarihi).toLocaleDateString('tr-TR'),
                                tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                            }, paket.ogrenci_id, null, null, paket.id);

                            console.log(`  📦 Paket bitiş (${kalanGun} gün): ${paket.ad_soyad} - ${telefon}`);
                            
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (e) {
                        console.error(`  ❌ Paket hatası:`, e.message);
                    }
                }
            }
        }

        console.log('📦 Paket bitiş cron tamamlandı.');
    } catch (error) {
        console.error('❌ Paket bitiş cron hatası:', error.message);
    }
}


// =====================================================
// 4. ÖZEL DERS BİTİM HATIRLATMA CRON (7, 3, 1 gün kala)
// =====================================================
async function ozelDersBitimCron() {
    console.log('🎓 Özel ders bitiş cron başladı...');
    
    try {
        const bugun = new Date();
        bugun.setHours(0, 0, 0, 0);

        // Aktif mesaj ayarları olan şubeleri al
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.ozel_ders_bitim_aktif = 1
        `);

        for (const sube of subeler) {
            // Hangi günler aktif?
            const gunler = [];
            if (sube.ozel_ders_bitim_7gun) gunler.push(7);
            if (sube.ozel_ders_bitim_3gun) gunler.push(3);
            if (sube.ozel_ders_bitim_1gun) gunler.push(1);

            if (gunler.length === 0) continue;

            for (const kalanGun of gunler) {
                const hedefTarih = new Date(bugun);
                hedefTarih.setDate(hedefTarih.getDate() + kalanGun);
                const hedefTarihStr = hedefTarih.toISOString().split('T')[0];

                // Bu tarihte biten özel ders paketlerini bul
                const [paketler] = await db.execute(`
                    SELECT odp.*, s.baslik as paket_adi, o.ad_soyad, o.ozel_veri, o.sube_id as ogr_sube_id
                    FROM ozel_ders_paketleri odp
                    LEFT JOIN satislar s ON odp.satis_id = s.id
                    LEFT JOIN ogrenciler o ON odp.ogrenci_id = o.id
                    WHERE odp.durum = 'aktif'
                    AND DATE(odp.bitis_tarihi) = ?
                    AND o.sube_id = ?
                    AND o.durum = 'aktif'
                `, [hedefTarihStr, sube.sube_id]);

                for (const paket of paketler) {
                    try {
                        const gonderilmis = await mesajGonderilmisMi(paket.ogrenci_id, 'ozel_ders_bitim', null, null, paket.id);
                        if (gonderilmis) continue;

                        const telefonlar = extractPhoneNumbers(paket.ozel_veri);
                        if (telefonlar.length === 0) continue;

                        for (const telefon of telefonlar) {
                            await sendCronMessage(sube.sube_id, 'ozel_ders_bitim', telefon, {
                                ad_soyad: paket.ad_soyad,
                                paket_adi: paket.paket_adi || 'Özel Ders Paketi',
                                kalan_gun: kalanGun,
                                toplam_saat: paket.toplam_saat,
                                kalan_saat: paket.kalan_saat,
                                bitis_tarihi: new Date(paket.bitis_tarihi).toLocaleDateString('tr-TR'),
                                tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                            }, paket.ogrenci_id, null, null, paket.id);

                            console.log(`  🎓 Özel ders bitiş (${kalanGun} gün): ${paket.ad_soyad} - ${telefon}`);
                            
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (e) {
                        console.error(`  ❌ Özel ders hatası:`, e.message);
                    }
                }
            }
        }

        console.log('🎓 Özel ders bitiş cron tamamlandı.');
    } catch (error) {
        console.error('❌ Özel ders bitiş cron hatası:', error.message);
    }
}


// =====================================================
// 5. TAKSİT HATIRLATMA CRON (Vade günü)
// =====================================================
async function taksitHatirlatmaCron() {
    console.log('💳 Taksit hatırlatma cron başladı...');
    
    try {
        const bugun = new Date().toISOString().split('T')[0];

        // Aktif mesaj ayarları olan şubeleri al (paket veya özel ders taksit hatırlatma aktif)
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.paket_taksit_hatirlatma_aktif = 1 OR wma.ozel_taksit_hatirlatma_aktif = 1
        `);

        for (const sube of subeler) {
            // Bugün vadesi gelen taksitleri bul
            const [taksitler] = await db.execute(`
                SELECT t.*, s.baslik as satis_baslik, s.satis_turu, 
                       o.ad_soyad, o.ozel_veri, o.sube_id as ogr_sube_id
                FROM taksitler t
                LEFT JOIN satislar s ON t.satis_id = s.id
                LEFT JOIN ogrenciler o ON t.ogrenci_id = o.id
                WHERE t.durum = 'bekliyor'
                AND DATE(t.vade_tarihi) = ?
                AND o.sube_id = ?
                AND o.durum = 'aktif'
            `, [bugun, sube.sube_id]);

            for (const taksit of taksitler) {
                try {
                    // Satış türüne göre mesaj tipi belirle
                    let mesajTipi = '';
                    if (taksit.satis_turu === 'ozel_ders') {
                        if (!sube.ozel_taksit_hatirlatma_aktif) continue;
                        mesajTipi = 'ozel_taksit_hatirlatma';
                    } else {
                        if (!sube.paket_taksit_hatirlatma_aktif) continue;
                        mesajTipi = 'paket_taksit_hatirlatma';
                    }

                    // Bugün bu taksit için mesaj gönderilmiş mi?
                    const gonderilmis = await mesajGonderilmisMi(taksit.ogrenci_id, mesajTipi, null, null, taksit.id);
                    if (gonderilmis) continue;

                    const telefonlar = extractPhoneNumbers(taksit.ozel_veri);
                    if (telefonlar.length === 0) continue;

                    for (const telefon of telefonlar) {
                        await sendCronMessage(sube.sube_id, mesajTipi, telefon, {
                            ad_soyad: taksit.ad_soyad,
                            paket_adi: taksit.satis_baslik,
                            tutar: formatTutar(taksit.kalan),
                            taksit_no: taksit.taksit_no,
                            bitis: new Date(taksit.vade_tarihi).toLocaleDateString('tr-TR'),
                            tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                        }, taksit.ogrenci_id, null, null, taksit.id);

                        const taksitTuru = taksit.satis_turu === 'ozel_ders' ? 'Özel Ders' : 'Paket';
                        console.log(`  💳 Taksit hatırlatma (${taksitTuru}): ${taksit.ad_soyad} - ${telefon}`);
                        
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (e) {
                    console.error(`  ❌ Taksit hatası:`, e.message);
                }
            }
        }

        console.log('💳 Taksit hatırlatma cron tamamlandı.');
    } catch (error) {
        console.error('❌ Taksit hatırlatma cron hatası:', error.message);
    }
}


// =====================================================
// 6. DOĞUM GÜNÜ KUTLAMA CRON
// =====================================================
async function dogumGunuCron() {
    console.log('🎂 Doğum günü cron başladı...');
    
    try {
        const bugun = new Date();
        const bugunAy = bugun.getMonth() + 1;
        const bugunGun = bugun.getDate();

        // Aktif mesaj ayarları olan şubeleri al
        const [subeler] = await db.execute(`
            SELECT wma.*, s.sube_adi, ga.tesis_adi
            FROM whatsapp_mesaj_ayarlari wma
            LEFT JOIN subeler s ON wma.sube_id = s.id
            LEFT JOIN genel_ayarlar ga ON 1=1
            WHERE wma.dogum_gunu_aktif = 1
        `);

        for (const sube of subeler) {
            // Bugün doğum günü olan öğrencileri bul
            const [ogrenciler] = await db.execute(`
                SELECT o.id, o.ad_soyad, o.ozel_veri, o.sube_id
                FROM ogrenciler o
                WHERE o.sube_id = ?
                AND o.durum = 'aktif'
                AND MONTH(o.dogum_tarihi) = ?
                AND DAY(o.dogum_tarihi) = ?
            `, [sube.sube_id, bugunAy, bugunGun]);

            for (const ogr of ogrenciler) {
                try {
                    // Bugün mesaj gönderilmiş mi?
                    const gonderilmis = await mesajGonderilmisMi(ogr.id, 'dogum_gunu');
                    if (gonderilmis) continue;

                    const telefonlar = extractPhoneNumbers(ogr.ozel_veri);
                    if (telefonlar.length === 0) continue;

                    for (const telefon of telefonlar) {
                        await sendCronMessage(sube.sube_id, 'dogum_gunu', telefon, {
                            ad_soyad: ogr.ad_soyad,
                            tesis_adi: sube.tesis_adi || 'Spor Tesisi'
                        }, ogr.id);

                        console.log(`  🎂 Doğum günü: ${ogr.ad_soyad} - ${telefon}`);
                        
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (e) {
                    console.error(`  ❌ Doğum günü hatası:`, e.message);
                }
            }
        }

        console.log('🎂 Doğum günü cron tamamlandı.');
    } catch (error) {
        console.error('❌ Doğum günü cron hatası:', error.message);
    }
}


// =====================================================
// ANA CRON ÇALIŞTIRICI
// =====================================================
let cronIsRunning = false;

async function runAllCrons() {
    if (cronIsRunning) {
        console.log('⏳ Cron zaten çalışıyor, atlanıyor...');
        return;
    }

    cronIsRunning = true;
    console.log('\n' + '='.repeat(60));
    console.log('🚀 OTOMATİK MESAJ CRONLARI BAŞLADI - ' + new Date().toLocaleString('tr-TR'));
    console.log('='.repeat(60) + '\n');

    try {
        // Sırayla tüm cronları çalıştır
        await aidatHatirlatmaCron();
        await aidatGecikmisCron();
        await paketBitimCron();
        await ozelDersBitimCron();
        await taksitHatirlatmaCron();
        await dogumGunuCron();
    } catch (error) {
        console.error('❌ Cron genel hatası:', error.message);
    } finally {
        cronIsRunning = false;
        console.log('\n' + '='.repeat(60));
        console.log('✅ OTOMATİK MESAJ CRONLARI TAMAMLANDI - ' + new Date().toLocaleString('tr-TR'));
        console.log('='.repeat(60) + '\n');
    }
}


// =====================================================
// ZAMANLAYICI - Her gün 10:00 Türkiye saatinde çalış
// =====================================================
let lastRunDate = null;

function checkAndRunCron() {
    const now = new Date();
    
    // Türkiye saati için UTC+3
    const turkeyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const saat = turkeyTime.getHours();
    const dakika = turkeyTime.getMinutes();
    const bugunStr = turkeyTime.toISOString().split('T')[0];

    // Saat 10:00 - 10:04 arası ve bugün henüz çalışmadıysa
    if (saat === 10 && dakika < 5 && lastRunDate !== bugunStr) {
        console.log(`⏰ Saat 10:00 - Günlük cron tetikleniyor...`);
        lastRunDate = bugunStr;
        runAllCrons();
    }
}

/**
 * Cron zamanlayıcısını başlat
 */
function startCronScheduler() {
    console.log('✅ WhatsApp otomatik mesaj cron zamanlayıcısı başlatıldı');
    console.log('   → Her gün Türkiye saati 10:00\'da çalışacak');
    
    // Her dakika kontrol et
    setInterval(checkAndRunCron, 60000);
    
    // İlk kontrolü hemen yap
    setTimeout(checkAndRunCron, 5000);
}

/**
 * Manuel çalıştırma (test için)
 */
async function runManual() {
    console.log('🔧 Manuel cron çalıştırılıyor...');
    await runAllCrons();
}


// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    startCronScheduler,
    runManual,
    runAllCrons,
    // İndividual cron'lar (test için)
    aidatHatirlatmaCron,
    aidatGecikmisCron,
    paketBitimCron,
    ozelDersBitimCron,
    taksitHatirlatmaCron,
    dogumGunuCron
};