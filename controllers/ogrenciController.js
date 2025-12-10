const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const bcrypt = require('bcryptjs');
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
 * Türkçe karakterleri İngilizce'ye çevirir
 */
function turkceToEnglish(str) {
    if (!str) return '';
    
    const charMap = {
        'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g',
        'ı': 'i', 'I': 'i', 'İ': 'i', 'i': 'i',
        'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's',
        'ü': 'u', 'Ü': 'u', 'â': 'a', 'Â': 'a',
        'î': 'i', 'Î': 'i', 'û': 'u', 'Û': 'u'
    };
    
    let result = '';
    for (let char of str) {
        result += charMap[char] || char;
    }
    
    return result.toLowerCase();
}

/**
 * Ad soyad'dan kullanıcı adı oluşturur
 */
function generateUsername(adSoyad) {
    if (!adSoyad) return '';
    let username = turkceToEnglish(adSoyad);
    username = username.replace(/[^a-z]/g, '');
    return username;
}

/**
 * 6 haneli rastgele şifre oluşturur
 */
function generatePassword() {
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += Math.floor(Math.random() * 10);
    }
    return password;
}

/**
 * Ay numarasından Türkçe ay adı döndürür
 */
function getAyAdi(ayNumarasi) {
    const aylar = [
        '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    return aylar[ayNumarasi] || '';
}

/**
 * Tarihi formatlar ve ay adını ekler
 */
function formatTarihWithAy(tarih) {
    if (!tarih) return '-';
    const date = new Date(tarih);
    const gun = date.getDate().toString().padStart(2, '0');
    const ay = date.getMonth() + 1;
    const yil = date.getFullYear();
    const ayAdi = getAyAdi(ay);
    return `${gun}.${ay.toString().padStart(2, '0')}.${yil} ${ayAdi} Ayı`;
}

/**
 * Tutarı formatlar (1000 -> 1.000 ₺)
 */
function formatTutar(tutar) {
    if (!tutar && tutar !== 0) return '0 ₺';
    return parseFloat(tutar).toLocaleString('tr-TR') + ' ₺';
}


// =====================================================
// ÖĞRENCİ ARAMA (Live Search - Kardeş için)
// =====================================================
exports.ogrenciAra = async (req, res) => {
    try {
        const { q, sube_id } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ success: false, ogrenciler: [] });
        }

        let sql = `
            SELECT o.id, o.ad_soyad, o.profil_foto, g.grup_adi
            FROM ogrenciler o
            LEFT JOIN gruplar g ON o.grup_id = g.id
            WHERE o.ad_soyad LIKE ? AND o.durum = 'aktif'
        `;
        let params = [`%${q}%`];

        if (sube_id) {
            sql += ` AND o.sube_id = ?`;
            params.push(sube_id);
        }

        sql += ` ORDER BY o.ad_soyad ASC LIMIT 10`;

        const [ogrenciler] = await db.execute(sql, params);

        res.json({ success: true, ogrenciler });

    } catch (error) {
        console.error('Öğrenci arama hatası:', error);
        res.json({ success: false, message: error.message, ogrenciler: [] });
    }
};


// =====================================================
// 1. ÖĞRENCİ PROFİLİ (Detaylı)
// =====================================================
exports.ogrenciProfil = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    const ogrenciId = req.params.id;
    const seciliYil = req.query.yil ? parseInt(req.query.yil) : new Date().getFullYear();

    try {
        const [ogrenci] = await db.execute(`
            SELECT o.*, s.sube_adi, g.grup_adi, b.brans_adi
            FROM ogrenciler o
            LEFT JOIN subeler s ON o.sube_id = s.id
            LEFT JOIN gruplar g ON o.grup_id = g.id
            LEFT JOIN branslar b ON g.brans_id = b.id
            WHERE o.id = ?
        `, [ogrenciId]);

        if (ogrenci.length === 0) return res.redirect('/api/ogrenci/liste');

        const [aidatlar] = await db.execute(`
            SELECT a.*, s.baslik as paket_adi, s.baslangic_tarihi as paket_baslangic, s.bitis_tarihi as paket_bitis
            FROM aidatlar a
            LEFT JOIN satislar s ON a.satis_id = s.id
            WHERE a.ogrenci_id = ? AND a.yil = ?
        `, [ogrenciId, seciliYil]);

        let aylikDurum = {};
        const guncelAidat = parseFloat(ogrenci[0].aidat_ucreti || 0);
        const kayitTarihi = new Date(ogrenci[0].kayit_tarihi);

        for (let i = 1; i <= 12; i++) {
            const kayit = aidatlar.find(a => a.ay === i);
            const kutuTarihi = new Date(seciliYil, i - 1, 1);

            let isPasif = false;
            if (kutuTarihi < new Date(kayitTarihi.getFullYear(), kayitTarihi.getMonth(), 1)) {
                isPasif = true;
            }

            aylikDurum[i] = {
                durum: kayit ? kayit.durum : 'odenmedi',
                odenen: kayit ? kayit.odenen : 0,
                gereken: kayit ? kayit.odenmesi_gereken : guncelAidat,
                kalan: kayit ? (kayit.odenmesi_gereken - kayit.odenen) : guncelAidat,
                isPasif: isPasif,
                odeme_tipi: kayit ? (kayit.odeme_tipi || 'normal') : 'normal',
                satis_id: kayit ? kayit.satis_id : null,
                paket_adi: kayit ? kayit.paket_adi : null,
                paket_baslangic: kayit ? kayit.paket_baslangic : null,
                paket_bitis: kayit ? kayit.paket_bitis : null
            };
        }

        let yoklamalar = [];
        try {
            const [yokData] = await db.execute('SELECT * FROM yoklamalar WHERE ogrenci_id = ? ORDER BY tarih DESC LIMIT 5', [ogrenciId]);
            yoklamalar = yokData;
        } catch (e) { console.log('Yoklamalar tablosu hatası:', e.message); }

        let analizler = [];
        try {
            const [analizData] = await db.execute(`
                SELECT a.*, k.ad_soyad as analizci_adi
                FROM analizler a
                LEFT JOIN kullanicilar k ON a.analizci_id = k.id
                WHERE a.ogrenci_id = ?
                ORDER BY a.analiz_tarihi DESC
            `, [ogrenciId]);
            analizler = analizData;
        } catch (e) {
            console.log('Analizler tablosu hatası:', e.message);
        }

        let satislar = [];
        try {
            const [satData] = await db.execute('SELECT * FROM satislar WHERE ogrenci_id = ? ORDER BY created_at DESC', [ogrenciId]);
            satislar = satData;
        } catch (e) { console.log('Satışlar tablosu hatası:', e.message); }

        let taksitler = [];
        try {
            const [taksitData] = await db.execute(`
                SELECT t.*, s.baslik as satis_baslik, s.satis_turu
                FROM taksitler t
                LEFT JOIN satislar s ON t.satis_id = s.id
                WHERE t.ogrenci_id = ?
                ORDER BY t.vade_tarihi ASC
            `, [ogrenciId]);
            taksitler = taksitData;
        } catch (e) {
            console.log('Taksitler tablosu hatası:', e.message);
        }

        let ozelDersPaketleri = [];
        try {
            const [paketData] = await db.execute(`
                SELECT odp.*, s.baslik as satis_baslik
                FROM ozel_ders_paketleri odp
                LEFT JOIN satislar s ON odp.satis_id = s.id
                WHERE odp.ogrenci_id = ? AND odp.durum = 'aktif'
                ORDER BY odp.bitis_tarihi ASC
            `, [ogrenciId]);
            ozelDersPaketleri = paketData;
        } catch (e) {
            console.log('Özel ders paketleri tablosu hatası:', e.message);
        }

        let kasaKayitlari = [];
        try {
            const [kasaData] = await db.execute(`
                SELECT
                    k.id, k.islem_turu, k.kategori, k.tutar, k.aciklama, k.tarih,
                    kul.ad_soyad as islem_yapan
                FROM kasa k
                LEFT JOIN kullanicilar kul ON k.islem_yapan_id = kul.id
                WHERE k.aciklama LIKE ? AND k.islem_turu = 'gelir'
                ORDER BY k.tarih DESC
                LIMIT 50
            `, [`%${ogrenci[0].ad_soyad}%`]);
            kasaKayitlari = kasaData;
        } catch (e) {
            console.log('Kasa kayıtları hatası:', e.message);
        }

        res.render('student_profile.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari,
            ogrenci: ogrenci[0],
            aylar: aylikDurum,
            yoklamalar: yoklamalar,
            analizler: analizler,
            satislar: satislar,
            taksitler: taksitler,
            ozelDersPaketleri: ozelDersPaketleri,
            seciliYil: seciliYil,
            kasaKayitlari: kasaKayitlari
        });

    } catch (error) {
        console.error("PROFİL HATASI:", error);
        res.status(500).send(`Profil Hatası: ${error.message}`);
    }
};


// =====================================================
// 2. ÖĞRENCİ LİSTESİ
// =====================================================
exports.ogrenciListesi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    try {
        const { q, sube, durum } = req.query;

        let sql = `
            SELECT o.*, s.sube_adi, g.grup_adi, b.brans_adi
            FROM ogrenciler o
            LEFT JOIN subeler s ON o.sube_id = s.id
            LEFT JOIN gruplar g ON o.grup_id = g.id
            LEFT JOIN branslar b ON g.brans_id = b.id
            WHERE 1=1
        `;

        let params = [];
        if (req.session.rol !== 'yonetici') { sql += ` AND o.sube_id = ?`; params.push(req.session.subeId); }
        else if (sube && sube !== 'tumu') { sql += ` AND o.sube_id = ?`; params.push(sube); }
        if (q) { sql += ` AND (o.ad_soyad LIKE ? OR o.tc_kimlik LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
        if (durum && durum !== 'tumu') { sql += ` AND o.durum = ?`; params.push(durum); }

        sql += ` ORDER BY o.kayit_tarihi DESC`;

        const [ogrenciler] = await db.execute(sql, params);
        const [subeler] = await db.execute('SELECT * FROM subeler');
        const [tumAidatlar] = await db.execute('SELECT * FROM aidatlar');

        const bugun = new Date();
        const islenmisListe = ogrenciler.map(ogr => {
            let toplamBorc = 0;
            let kayitTarihi = new Date(ogr.kayit_tarihi);
            let aidatUcreti = parseFloat(ogr.aidat_ucreti || 0);

            let loopDate = new Date(kayitTarihi.getFullYear(), kayitTarihi.getMonth(), 1);
            let currentMonthDate = new Date(bugun.getFullYear(), bugun.getMonth(), 1);

            while (loopDate <= currentMonthDate) {
                const yil = loopDate.getFullYear();
                const ay = loopDate.getMonth() + 1;
                const odemeKaydi = tumAidatlar.find(a => a.ogrenci_id === ogr.id && a.yil === yil && a.ay === ay);

                if (odemeKaydi) {
                    toplamBorc += (parseFloat(odemeKaydi.odenmesi_gereken) - parseFloat(odemeKaydi.odenen));
                } else {
                    toplamBorc += aidatUcreti;
                }
                loopDate.setMonth(loopDate.getMonth() + 1);
            }

            const buAyKayit = tumAidatlar.find(a => a.ogrenci_id === ogr.id && a.yil === bugun.getFullYear() && a.ay === (bugun.getMonth() + 1));
            let buAyDurum = 'odenmedi';
            if (buAyKayit && buAyKayit.durum === 'tamamlandi') buAyDurum = 'odendi';

            return { ...ogr, toplam_borc: toplamBorc, bu_ay_durum: buAyDurum };
        });

        const stats = {
            toplam: ogrenciler.length,
            aktif: ogrenciler.filter(o => o.durum === 'aktif').length,
            pasif: ogrenciler.filter(o => o.durum === 'pasif').length
        };

        res.render('student_list.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, sube_id: req.session.subeId, yetkiler: req.session.yetkiler || {} },
            siteAyarlari: res.locals.siteAyarlari,
            ogrenciler: islenmisListe,
            subeler: subeler,
            istatistik: stats,
            filtre: { q, sube, durum }
        });

    } catch (error) { console.error(error); res.redirect('/'); }
};


// =====================================================
// 3. DÜZENLEME SAYFASI
// =====================================================
exports.ogrenciDuzenleSayfasi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');
    try {
        const [ogr] = await db.execute('SELECT * FROM ogrenciler WHERE id = ?', [req.params.id]);
        if(ogr.length === 0) return res.redirect('/api/ogrenci/liste');

        const [subeler] = await db.execute('SELECT * FROM subeler');
        const [branslar] = await db.execute('SELECT * FROM branslar');
        const [gruplar] = await db.execute('SELECT * FROM gruplar');
        const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');

        let ozelVeri = {};
        try { ozelVeri = JSON.parse(ogr[0].ozel_veri || '{}'); } catch (e) { ozelVeri = {}; }

        res.render('student_edit.html', {
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol },
            siteAyarlari: res.locals.siteAyarlari,
            ogrenci: ogr[0],
            ozelVeri: ozelVeri,
            subeler, branslar, gruplar, ekstraAlanlar: formAlanlari
        });
    } catch (error) { console.error(error); res.redirect('/api/ogrenci/liste'); }
};


// =====================================================
// 4. DÜZENLEME KAYDET (Push Bildirim Eklendi)
// =====================================================
exports.ogrenciDuzenleIslemi = async (req, res) => {
    const {
        id, sube_id, ad_soyad, tc_kimlik, dogum_tarihi, kayit_tarihi,
        aidat_ucreti, aidat_hatirlatma_gunu, durum,
        brans_id, grup_id,
        kardes_id, kardes_adi, kardes_indirim_orani,
        ...digerVeriler
    } = req.body;

    try {
        let finalAidatUcreti = parseFloat(aidat_ucreti) || 0;
        let kardesIdKayit = null;
        let kardesIndirimOraniKayit = 0;
        
        if (kardes_id && kardes_indirim_orani && parseFloat(kardes_indirim_orani) > 0) {
            kardesIdKayit = parseInt(kardes_id);
            kardesIndirimOraniKayit = parseFloat(kardes_indirim_orani);
        }

        const ozelVeriJSON = JSON.stringify(digerVeriler);

        let sql = `
            UPDATE ogrenciler SET
            sube_id=?, grup_id=?, tc_kimlik=?, ad_soyad=?, dogum_tarihi=?, kayit_tarihi=?,
            aidat_ucreti=?, aidat_hatirlatma_gunu=?, durum=?, ozel_veri=?,
            kardes_id=?, kardes_indirim_orani=?
        `;
        let params = [
            sube_id, grup_id || null, tc_kimlik, ad_soyad, dogum_tarihi, kayit_tarihi, 
            finalAidatUcreti, aidat_hatirlatma_gunu, durum, ozelVeriJSON,
            kardesIdKayit, kardesIndirimOraniKayit
        ];

        if (req.file) {
            sql += `, profil_foto=?`;
            params.push(req.file.filename);
        }

        sql += ` WHERE id=?`;
        params.push(id);

        await db.execute(sql, params);

        // WhatsApp Mesajı Gönder
        try {
            const telefonlar = extractPhoneNumbers(digerVeriler);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            await sendWhatsAppNotification(sube_id, 'ogrenci_duzenle', telefonlar, {
                ad_soyad: ad_soyad
            }, tesisAdi);
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (📝 4. Öğrenci Bilgileri Güncellendi)
        try {
            await pushService.sendToVeli(
                id,
                '📝 Bilgiler Güncellendi',
                `${ad_soyad} - Öğrencinin profil bilgileri başarıyla güncellendi.`,
                '/veli/panel?tab=ayarlar',
                'bilgi'
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        res.redirect('/api/ogrenci/liste');

    } catch (error) { console.error(error); res.redirect('/api/ogrenci/liste'); }
};


// =====================================================
// 5. SİLME
// =====================================================
exports.ogrenciSil = async (req, res) => {
    if(req.session.rol !== 'yonetici') return res.send('<script>alert("Yetkisiz!");window.location.href="/api/ogrenci/liste";</script>');
    try {
        await db.execute('DELETE FROM analizler WHERE ogrenci_id = ?', [req.params.id]);
        await db.execute('DELETE FROM yoklamalar WHERE ogrenci_id = ?', [req.params.id]);
        await db.execute('DELETE FROM aidatlar WHERE ogrenci_id = ?', [req.params.id]);
        await db.execute('DELETE FROM ogrenciler WHERE id = ?', [req.params.id]);
        res.redirect('/api/ogrenci/liste');
    } catch (e) { console.error(e); res.redirect('/api/ogrenci/liste'); }
};


// =====================================================
// 6. EKLEME SAYFASI
// =====================================================
exports.ogrenciEkleSayfasi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');
    try {
        const [subeler] = await db.execute('SELECT id, sube_adi FROM subeler');
        const [branslar] = await db.execute('SELECT id, brans_adi FROM branslar');
        const [gruplar] = await db.execute('SELECT id, grup_adi, brans_id FROM gruplar');
        const [formAlanlari] = await db.execute('SELECT * FROM ogrenci_form_ayarlari WHERE gosterim_aktif = 1 ORDER BY sira ASC');

        let basvuruData = null;
        let ekstraAlanlarData = {};
        if (req.query.basvuru_id) {
            const [basvuru] = await db.execute('SELECT * FROM basvurular WHERE id = ?', [req.query.basvuru_id]);
            if (basvuru.length > 0) {
                basvuruData = basvuru[0];
                if (basvuruData.ekstra_alanlar) {
                    try {
                        ekstraAlanlarData = typeof basvuruData.ekstra_alanlar === 'string'
                            ? JSON.parse(basvuruData.ekstra_alanlar)
                            : basvuruData.ekstra_alanlar;
                    } catch (e) {
                        ekstraAlanlarData = {};
                    }
                }
            }
        }

        res.render('student_add', {
            user: {
                ad_soyad: req.session.adSoyad || 'Kullanıcı',
                rol: req.session.rol || 'personel',
                sube_id: req.session.subeId || null
            },
            siteAyarlari: res.locals.siteAyarlari || { tesis_adi: 'netSPOR', ana_renk: '#007bff' },
            subeler: subeler || [],
            branslar: branslar || [],
            gruplar: gruplar || [],
            ekstraAlanlar: formAlanlari || [],
            basvuru: basvuruData,
            ekstraAlanlarData: ekstraAlanlarData
        });
    } catch (error) {
        console.error('Öğrenci ekleme sayfası hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};


// =====================================================
// 7. KAYIT İŞLEMİ
// =====================================================
exports.ogrenciKayitIslemi = async (req, res) => {
    const { 
        sube_id, ad_soyad, tc_kimlik, dogum_tarihi, brans_id, grup_id, 
        aidat_ucreti, aidat_hatirlatma_gunu, basvuru_id,
        kardes_id, kardes_adi, kardes_indirim_orani,
        ...digerVeriler 
    } = req.body;
    
    const profil_foto = req.file ? req.file.filename : 'default.png';

    try {
        let finalAidatUcreti = parseFloat(aidat_ucreti) || 0;
        let indirimBilgisi = null;
        let kardesIdKayit = null;
        let kardesIndirimOraniKayit = 0;
        
        if (kardes_id && kardes_indirim_orani && parseFloat(kardes_indirim_orani) > 0) {
            const indirimOrani = parseFloat(kardes_indirim_orani);
            const indirimTutar = finalAidatUcreti * (indirimOrani / 100);
            const originalAidat = finalAidatUcreti;
            finalAidatUcreti = finalAidatUcreti - indirimTutar;
            
            kardesIdKayit = parseInt(kardes_id);
            kardesIndirimOraniKayit = indirimOrani;
            
            indirimBilgisi = {
                kardes_id: kardes_id,
                kardes_adi: kardes_adi,
                indirim_orani: indirimOrani,
                orijinal_aidat: originalAidat,
                indirimli_aidat: finalAidatUcreti
            };
        }

        const ozelVeriJSON = JSON.stringify(digerVeriler);
        const kayitTarihi = req.body.kayit_tarihi || new Date();

        const [result] = await db.execute(`
            INSERT INTO ogrenciler (sube_id, grup_id, tc_kimlik, ad_soyad, dogum_tarihi, kayit_tarihi, aidat_ucreti, aidat_hatirlatma_gunu, profil_foto, ozel_veri, kardes_id, kardes_indirim_orani) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [sube_id, grup_id || null, tc_kimlik, ad_soyad, dogum_tarihi, kayitTarihi, finalAidatUcreti, aidat_hatirlatma_gunu, profil_foto, ozelVeriJSON, kardesIdKayit, kardesIndirimOraniKayit]);

        const ogrenciId = result.insertId;

        // Veli hesabı oluştur
        let kullaniciAdi = generateUsername(ad_soyad);
        const sifreDuzMetin = generatePassword();
        const sifreHash = await bcrypt.hash(sifreDuzMetin, 10);

        const [mevcutKullanici] = await db.execute(
            'SELECT id FROM veliler WHERE kullanici_adi = ?', 
            [kullaniciAdi]
        );

        if (mevcutKullanici.length > 0) {
            kullaniciAdi = kullaniciAdi + Math.floor(Math.random() * 900 + 100);
        }

        await db.execute(`
            INSERT INTO veliler (sube_id, ogrenci_id, kullanici_adi, sifre) 
            VALUES (?, ?, ?, ?)
        `, [sube_id, ogrenciId, kullaniciAdi, sifreHash]);

        console.log(`✅ Veli hesabı oluşturuldu: ${kullaniciAdi}`);

        if (basvuru_id) {
            await db.execute(`
                UPDATE basvurular SET durum = 'onaylandi', isleyen_kullanici_id = ?, islem_tarihi = NOW() WHERE id = ?
            `, [req.session.userID, basvuru_id]);
        }

        // WhatsApp Mesajı Gönder
        try {
            const telefonlar = extractPhoneNumbers(digerVeriler);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            await sendWhatsAppNotification(sube_id, 'ogrenci_ekle', telefonlar, {
                ad_soyad: ad_soyad,
                tc_no: tc_kimlik || '',
                telefon: telefonlar[0] || '',
                kullanici_adi: kullaniciAdi,
                sifre: sifreDuzMetin
            }, tesisAdi);
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        res.json({ 
            success: true, 
            message: 'Öğrenci başarıyla kaydedildi!',
            ogrenciId: ogrenciId,
            kullaniciAdi: kullaniciAdi,
            indirimBilgisi: indirimBilgisi
        });

    } catch (error) { 
        console.error('Öğrenci kayıt hatası:', error); 
        res.json({ 
            success: false, 
            message: 'Kayıt sırasında hata oluştu: ' + error.message 
        });
    }
};


// =====================================================
// 8. DURUM GÜNCELLE (Push Bildirim Eklendi)
// =====================================================
exports.durumGuncelle = async (req, res) => {
    const { id, yeni_durum } = req.body;
    
    try {
        await db.execute('UPDATE ogrenciler SET durum = ? WHERE id = ?', [yeni_durum, id]);

        const [ogr] = await db.execute('SELECT ad_soyad, sube_id, ozel_veri FROM ogrenciler WHERE id = ?', [id]);
        
        if (ogr.length > 0) {
            // WhatsApp Mesajı Gönder
            try {
                const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);
                const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

                let trigger = null;
                if (yeni_durum === 'aktif') trigger = 'ogrenci_aktif';
                else if (yeni_durum === 'pasif') trigger = 'ogrenci_pasif';
                else if (yeni_durum === 'dondurulmus') trigger = 'ogrenci_dondurulmus';

                if (trigger) {
                    await sendWhatsAppNotification(ogr[0].sube_id, trigger, telefonlar, {
                        ad_soyad: ogr[0].ad_soyad
                    }, tesisAdi);
                }
            } catch (wpError) {
                console.error('WhatsApp mesaj hatası:', wpError.message);
            }

            // ⭐ PUSH BİLDİRİM - Veliye (🔵🟡🔴 1-2-3. Üyelik Durumu)
            try {
                let pushTitle = '';
                let pushBody = '';
                let pushType = 'durum';

                if (yeni_durum === 'aktif') {
                    pushTitle = '🔵 Üyelik Aktif!';
                    pushBody = `${ogr[0].ad_soyad} - Öğrencinin üyeliği başarıyla aktif hale getirildi.`;
                } else if (yeni_durum === 'dondurulmus') {
                    pushTitle = '🟡 Üyelik Donduruldu';
                    pushBody = `${ogr[0].ad_soyad} - Öğrencinin üyeliği donduruldu.`;
                } else if (yeni_durum === 'pasif') {
                    pushTitle = '🔴 Üyelik Pasifleştirildi';
                    pushBody = `${ogr[0].ad_soyad} - Öğrencinin üyeliği pasif duruma getirildi.`;
                }

                if (pushTitle) {
                    await pushService.sendToVeli(
                        id,
                        pushTitle,
                        pushBody,
                        '/veli/panel',
                        pushType
                    );
                }
            } catch (pushErr) {
                console.error('Push bildirim hatası:', pushErr.message);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};


// =====================================================
// 9. AİDAT ÖDEME YAP (Push Bildirim Eklendi)
// =====================================================
exports.aidatOdemeYap = async (req, res) => {
    const { ogrenci_id, ay, yil, odenecek_tutar, gereken_tutar, odeme_tarihi, ay_adi } = req.body;
    const tutar = parseFloat(odenecek_tutar);

    try {
        const [mevcut] = await db.execute('SELECT * FROM aidatlar WHERE ogrenci_id = ? AND ay = ? AND yil = ?', [ogrenci_id, ay, yil]);
        let yeniOdenen = tutar;
        let aidatId = null;
        let kalanBorc = 0;

        if (mevcut.length > 0) {
            yeniOdenen += parseFloat(mevcut[0].odenen);
            kalanBorc = parseFloat(mevcut[0].odenmesi_gereken) - yeniOdenen;
            let durum = yeniOdenen >= parseFloat(mevcut[0].odenmesi_gereken) ? 'tamamlandi' : 'kismi_odendi';
            await db.execute('UPDATE aidatlar SET odenen = ?, durum = ?, odeme_tarihi = ? WHERE id = ?', [yeniOdenen, durum, odeme_tarihi, mevcut[0].id]);
            aidatId = mevcut[0].id;
        } else {
            kalanBorc = parseFloat(gereken_tutar) - tutar;
            let durum = tutar >= parseFloat(gereken_tutar) ? 'tamamlandi' : 'kismi_odendi';
            const [result] = await db.execute('INSERT INTO aidatlar (ogrenci_id, yil, ay, odenmesi_gereken, odenen, durum, odeme_tarihi, odeme_tipi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [ogrenci_id, yil, ay, gereken_tutar, yeniOdenen, durum, odeme_tarihi, 'normal']);
            aidatId = result.insertId;
        }

        const [ogr] = await db.execute('SELECT sube_id, ad_soyad, ozel_veri FROM ogrenciler WHERE id = ?', [ogrenci_id]);
        const otomatikAciklama = `${ogr[0].ad_soyad} - ${ay_adi} ${yil} Aidat Ödemesi`;

        await db.execute(`
            INSERT INTO kasa (sube_id, islem_turu, kategori, tutar, aciklama, tarih, islem_yapan_id, aidat_id)
            VALUES (?, 'gelir', 'Aidat Ödemesi', ?, ?, ?, ?, ?)
        `, [ogr[0].sube_id, tutar, otomatikAciklama, odeme_tarihi, req.session.userID, aidatId]);

        // WhatsApp Mesajı Gönder
        try {
            const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            await sendWhatsAppNotification(ogr[0].sube_id, 'aidat_odendi', telefonlar, {
                ad_soyad: ogr[0].ad_soyad,
                ogrenci_adi: ogr[0].ad_soyad,
                tutar: tutar,
                ay: ay_adi,
                yil: yil,
                odenen_tutar: tutar,
                kalan_tutar: Math.max(0, kalanBorc),
                kalan_bilgi: kalanBorc > 0 ? `${kalanBorc.toFixed(2)} TL kalan borç` : 'Borç kalmadı'
            }, tesisAdi);
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (💳 11. Aidat Ödemesi Alındı)
        try {
            const kalanBorcFormatted = Math.max(0, kalanBorc).toLocaleString('tr-TR') + ' ₺';
            const alinanTutarFormatted = tutar.toLocaleString('tr-TR') + ' ₺';

            await pushService.sendToVeli(
                ogrenci_id,
                '💳 Aidat Ödemesi Alındı',
                `${ogr[0].ad_soyad} - ${ay_adi} ${yil} aidatı alındı. Alınan: ${alinanTutarFormatted} – Kalan: ${kalanBorcFormatted}`,
                '/veli/panel?tab=aidat',
                'aidat'
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        res.redirect(`/api/ogrenci/profil/${ogrenci_id}?yil=${yil}`);
    } catch (e) {
        console.error(e);
        res.redirect(`/api/ogrenci/profil/${ogrenci_id}`);
    }
};


// =====================================================
// 10. PAKET / DERS SATIŞI (Push Bildirim Eklendi)
// =====================================================
exports.paketSatisYap = async (req, res) => {
    const {
        ogrenci_id, satis_turu, baslik, tutar, odeme_turu, pesinat,
        taksit_sayisi, baslangic_tarihi, bitis_tarihi, toplam_saat, gecerlilik_gun
    } = req.body;

    try {
        const [ogr] = await db.execute('SELECT sube_id, ad_soyad, ozel_veri FROM ogrenciler WHERE id = ?', [ogrenci_id]);
        if (ogr.length === 0) {
            return res.json({ success: false, message: 'Öğrenci bulunamadı!' });
        }

        const toplamTutar = parseFloat(tutar) || 0;
        const pesinatTutar = parseFloat(pesinat) || 0;
        const kalanTutar = toplamTutar - pesinatTutar;

        if (toplamTutar <= 0) {
            return res.json({ success: false, message: 'Toplam tutar 0\'dan büyük olmalıdır!' });
        }

        if (odeme_turu === 'pesin' && pesinatTutar < toplamTutar) {
            return res.json({ success: false, message: 'Peşin ödemede tam tutar alınmalıdır!' });
        }

        let toplamAy = null;
        let baslamaTarihi = baslangic_tarihi ? new Date(baslangic_tarihi) : new Date();
        let bitisTarihi = bitis_tarihi ? new Date(bitis_tarihi) : null;

        if (satis_turu === 'paket' && baslangic_tarihi && bitis_tarihi) {
            const baslangic = new Date(baslangic_tarihi);
            const bitis = new Date(bitis_tarihi);
            toplamAy = (bitis.getFullYear() - baslangic.getFullYear()) * 12 + (bitis.getMonth() - baslangic.getMonth()) + 1;
        }

        if (satis_turu === 'ozel_ders' && gecerlilik_gun) {
            baslamaTarihi = new Date();
            bitisTarihi = new Date();
            bitisTarihi.setDate(bitisTarihi.getDate() + parseInt(gecerlilik_gun));
        }

        const taksitSayisiInt = odeme_turu === 'taksit' ? (parseInt(taksit_sayisi) || 4) : 1;
        
        let taksitTutari = 0;
        if (odeme_turu === 'taksit' && kalanTutar > 0 && taksitSayisiInt > 0) {
            taksitTutari = Math.ceil(kalanTutar / taksitSayisiInt * 100) / 100;
        }

        const [satisResult] = await db.execute(`
            INSERT INTO satislar (
                ogrenci_id, satis_turu, baslik, tutar, odenen, kalan,
                taksit_sayisi, baslangic_tarihi, bitis_tarihi, odeme_turu, toplam_ay, durum
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
        `, [
            ogrenci_id, satis_turu, baslik, toplamTutar, pesinatTutar, kalanTutar,
            taksitSayisiInt, baslamaTarihi, bitisTarihi, odeme_turu, toplamAy
        ]);

        const satisId = satisResult.insertId;

        if (odeme_turu === 'taksit' && kalanTutar > 0) {
            for (let i = 1; i <= taksitSayisiInt; i++) {
                const vadeTarihi = new Date(baslamaTarihi);
                vadeTarihi.setMonth(vadeTarihi.getMonth() + i);

                let taksitTutar = taksitTutari;
                if (i === taksitSayisiInt) {
                    const oncekiTaksitlerToplami = taksitTutari * (taksitSayisiInt - 1);
                    taksitTutar = Math.round((kalanTutar - oncekiTaksitlerToplami) * 100) / 100;
                }

                await db.execute(`
                    INSERT INTO taksitler (satis_id, ogrenci_id, taksit_no, tutar, odenen, kalan, vade_tarihi, durum)
                    VALUES (?, ?, ?, ?, 0, ?, ?, 'bekliyor')
                `, [satisId, ogrenci_id, i, taksitTutar, taksitTutar, vadeTarihi]);
            }
        }

        if (satis_turu === 'ozel_ders' && toplam_saat) {
            await db.execute(`
                INSERT INTO ozel_ders_paketleri (
                    satis_id, ogrenci_id, toplam_saat, kullanilan_saat, kalan_saat,
                    gecerlilik_gun, baslangic_tarihi, bitis_tarihi, durum
                ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'aktif')
            `, [satisId, ogrenci_id, parseInt(toplam_saat), parseInt(toplam_saat), parseInt(gecerlilik_gun), baslamaTarihi, bitisTarihi]);
        }

        if (pesinatTutar > 0) {
            const kategori = satis_turu === 'ozel_ders' ? 'Özel Ders Satışı' : 'Paket Satışı';
            const aciklama = `${ogr[0].ad_soyad} - ${baslik} ${odeme_turu === 'pesin' ? '(Peşin)' : '(Peşinat)'}`;

            await db.execute(`
                INSERT INTO kasa (sube_id, islem_turu, kategori, tutar, aciklama, tarih, islem_yapan_id)
                VALUES (?, 'gelir', ?, ?, ?, NOW(), ?)
            `, [ogr[0].sube_id, kategori, pesinatTutar, aciklama, req.session.userID]);
        }

        if (satis_turu === 'paket' && baslangic_tarihi && bitis_tarihi) {
            const baslangic = new Date(baslangic_tarihi);
            const bitis = new Date(bitis_tarihi);

            let loopDate = new Date(baslangic.getFullYear(), baslangic.getMonth(), 1);
            const sonAy = new Date(bitis.getFullYear(), bitis.getMonth(), 1);

            while (loopDate <= sonAy) {
                const yil = loopDate.getFullYear();
                const ay = loopDate.getMonth() + 1;

                const [mevcut] = await db.execute(
                    'SELECT * FROM aidatlar WHERE ogrenci_id = ? AND ay = ? AND yil = ?',
                    [ogrenci_id, ay, yil]
                );

                if (mevcut.length > 0) {
                    await db.execute(
                        'UPDATE aidatlar SET durum = "tamamlandi", odenen = odenmesi_gereken, odeme_tipi = "paket", satis_id = ? WHERE id = ?',
                        [satisId, mevcut[0].id]
                    );
                } else {
                    const [ogrenciData] = await db.execute('SELECT aidat_ucreti FROM ogrenciler WHERE id = ?', [ogrenci_id]);
                    const aidatUcreti = ogrenciData[0].aidat_ucreti || 0;

                    await db.execute(`
                        INSERT INTO aidatlar (ogrenci_id, yil, ay, odenmesi_gereken, odenen, durum, odeme_tarihi, odeme_tipi, satis_id)
                        VALUES (?, ?, ?, ?, ?, 'tamamlandi', NOW(), 'paket', ?)
                    `, [ogrenci_id, yil, ay, aidatUcreti, aidatUcreti, satisId]);
                }

                loopDate.setMonth(loopDate.getMonth() + 1);
            }
        }

        // WhatsApp Mesajı
        try {
            const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            if (satis_turu === 'ozel_ders') {
                await sendWhatsAppNotification(ogr[0].sube_id, 'ozel_ders_satis', telefonlar, {
                    ad_soyad: ogr[0].ad_soyad,
                    paket_adi: baslik,
                    toplam_saat: toplam_saat || '-',
                    gecerlilik_gun: gecerlilik_gun || '-',
                    tutar: formatTutar(toplamTutar),
                    odeme_turu: odeme_turu === 'pesin' ? 'Peşin' : 'Taksitli',
                    taksit_sayisi: odeme_turu === 'taksit' ? taksitSayisiInt : '-',
                    pesinat: odeme_turu === 'taksit' ? formatTutar(pesinatTutar) : '-',
                    taksit_tutari: odeme_turu === 'taksit' ? formatTutar(taksitTutari) : '-'
                }, tesisAdi);
            } else {
                const baslangicAyAdi = baslamaTarihi ? getAyAdi(baslamaTarihi.getMonth() + 1) : '';
                const bitisAyAdi = bitisTarihi ? getAyAdi(bitisTarihi.getMonth() + 1) : '';

                await sendWhatsAppNotification(ogr[0].sube_id, 'paket_satis', telefonlar, {
                    ad_soyad: ogr[0].ad_soyad,
                    paket_adi: baslik,
                    tutar: formatTutar(toplamTutar),
                    baslangic: baslamaTarihi ? baslamaTarihi.toLocaleDateString('tr-TR') : '-',
                    bitis: bitisTarihi ? bitisTarihi.toLocaleDateString('tr-TR') : '-',
                    baslangic_ay: baslangicAyAdi,
                    bitis_ay: bitisAyAdi,
                    odeme_turu: odeme_turu === 'pesin' ? 'Peşin' : 'Taksitli',
                    taksit_sayisi: odeme_turu === 'taksit' ? taksitSayisiInt : '-',
                    pesinat: odeme_turu === 'taksit' ? formatTutar(pesinatTutar) : '-',
                    taksit_tutari: odeme_turu === 'taksit' ? formatTutar(taksitTutari) : '-'
                }, tesisAdi);
            }
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (💼 6. Paket Satışı / 🎯 8. Özel Ders Satışı)
        try {
            let pushTitle = '';
            let pushBody = '';
            let pushType = 'satis';

            if (satis_turu === 'ozel_ders') {
                pushTitle = '🎯 Özel Ders Satıldı';
                pushBody = `${ogr[0].ad_soyad} - ${baslik} özel ders paketi satışı gerçekleştirildi. Tutar: ${formatTutar(toplamTutar)}`;
            } else {
                pushTitle = '💼 Paket Satışı Gerçekleşti';
                pushBody = `${ogr[0].ad_soyad} - ${baslik} paketi satışı yapıldı. Tutar: ${formatTutar(toplamTutar)}`;
            }

            await pushService.sendToVeli(
                ogrenci_id,
                pushTitle,
                pushBody,
                '/veli/panel?tab=aidat',
                pushType
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        res.json({ success: true, message: 'Satış başarıyla kaydedildi!', satisId: satisId });

    } catch (error) {
        console.error('Paket satış hatası:', error);
        res.json({ success: false, message: 'Satış sırasında hata oluştu: ' + error.message });
    }
};


// =====================================================
// 11. TAKSİT ÖDEME (Push Bildirim Eklendi)
// =====================================================
exports.taksitOde = async (req, res) => {
    const { taksit_id, ogrenci_id, tutar, odeme_tarihi } = req.body;
    const odemeTutari = parseFloat(tutar);

    try {
        const [taksit] = await db.execute(`
            SELECT t.*, s.baslik, s.satis_turu, o.sube_id, o.ad_soyad, o.ozel_veri
            FROM taksitler t
            LEFT JOIN satislar s ON t.satis_id = s.id
            LEFT JOIN ogrenciler o ON t.ogrenci_id = o.id
            WHERE t.id = ?
        `, [taksit_id]);

        if (taksit.length === 0) {
            return res.json({ success: false, message: 'Taksit bulunamadı' });
        }

        const taksitData = taksit[0];
        const yeniOdenen = parseFloat(taksitData.odenen) + odemeTutari;
        const yeniKalan = parseFloat(taksitData.tutar) - yeniOdenen;
        const durum = yeniKalan <= 0 ? 'odendi' : 'bekliyor';

        await db.execute(`
            UPDATE taksitler SET odenen = ?, kalan = ?, durum = ?, odeme_tarihi = ? WHERE id = ?
        `, [yeniOdenen, Math.max(0, yeniKalan), durum, odeme_tarihi || new Date(), taksit_id]);

        await db.execute(`
            UPDATE satislar SET odenen = odenen + ?, kalan = kalan - ? WHERE id = ?
        `, [odemeTutari, odemeTutari, taksitData.satis_id]);

        const [kalanTaksitler] = await db.execute(`
            SELECT SUM(kalan) as toplam_kalan FROM taksitler WHERE satis_id = ? AND durum != 'odendi'
        `, [taksitData.satis_id]);
        const toplamKalanBorc = kalanTaksitler[0]?.toplam_kalan || 0;

        const taksitTuru = taksitData.satis_turu === 'ozel_ders' ? 'Özel Ders' : 'Paket';
        const aciklama = `${taksitData.ad_soyad} - ${taksitData.baslik} (${taksitData.taksit_no}. Taksit - ${taksitTuru})`;

        await db.execute(`
            INSERT INTO kasa (sube_id, islem_turu, kategori, tutar, aciklama, tarih, islem_yapan_id)
            VALUES (?, 'gelir', 'Taksit Ödemesi', ?, ?, ?, ?)
        `, [taksitData.sube_id, odemeTutari, aciklama, odeme_tarihi || new Date(), req.session.userID]);

        // WhatsApp
        try {
            const telefonlar = extractPhoneNumbers(taksitData.ozel_veri);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            const triggerKey = taksitData.satis_turu === 'ozel_ders' ? 'ozel_taksit' : 'paket_taksit';
            const kalanBorcSonrasi = Math.max(0, toplamKalanBorc - odemeTutari);

            await sendWhatsAppNotification(taksitData.sube_id, triggerKey, telefonlar, {
                ad_soyad: taksitData.ad_soyad,
                tutar: formatTutar(odemeTutari),
                taksit_no: taksitData.taksit_no,
                paket_adi: taksitData.baslik,
                kalan: formatTutar(kalanBorcSonrasi),
                kalan_taksit: kalanBorcSonrasi > 0 ? 'Kalan borç: ' + formatTutar(kalanBorcSonrasi) : 'Tüm ödemeler tamamlandı'
            }, tesisAdi);
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (💰 Taksit Ödemesi Alındı)
        try {
            const taksitTuruEmoji = taksitData.satis_turu === 'ozel_ders' ? '🎯' : '💼';
            const kalanBorcSonrasi = Math.max(0, toplamKalanBorc - odemeTutari);

            await pushService.sendToVeli(
                ogrenci_id,
                `${taksitTuruEmoji} Taksit Ödemesi Alındı`,
                `${taksitData.ad_soyad} - ${taksitData.baslik} ${taksitData.taksit_no}. taksit ödemesi alındı. Tutar: ${formatTutar(odemeTutari)} – Kalan: ${formatTutar(kalanBorcSonrasi)}`,
                '/veli/panel?tab=aidat',
                'taksit'
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        res.json({ success: true, message: 'Taksit ödemesi alındı' });

    } catch (error) {
        console.error('Taksit ödeme hatası:', error);
        res.json({ success: false, message: 'Ödeme sırasında hata oluştu' });
    }
};


// =====================================================
// 12. ÖZEL DERS KULLANIMI KAYDET (Push Bildirim Eklendi)
// =====================================================
exports.ozelDersKullan = async (req, res) => {
    const { paket_id, ogrenci_id, kullanilan_saat, tarih, aciklama, durum } = req.body;
    const saat = parseFloat(kullanilan_saat);
    const yoklamaDurumu = durum || 'katildi';

    try {
        const [paket] = await db.execute(`
            SELECT odp.*, s.baslik as paket_adi 
            FROM ozel_ders_paketleri odp
            LEFT JOIN satislar s ON odp.satis_id = s.id
            WHERE odp.id = ?
        `, [paket_id]);

        if (paket.length === 0) {
            return res.json({ success: false, message: 'Paket bulunamadı' });
        }

        const paketData = paket[0];
        const bugun = new Date();
        const bitisTarihi = new Date(paketData.bitis_tarihi);

        if (bugun > bitisTarihi) {
            await db.execute('UPDATE ozel_ders_paketleri SET durum = "suresi_doldu" WHERE id = ?', [paket_id]);
            return res.json({ success: false, message: 'Paket süresi dolmuş!' });
        }

        const [ogr] = await db.execute('SELECT ad_soyad, sube_id, ozel_veri FROM ogrenciler WHERE id = ?', [ogrenci_id]);
        if (ogr.length === 0) {
            return res.json({ success: false, message: 'Öğrenci bulunamadı' });
        }

        let yeniKullanilan = parseFloat(paketData.kullanilan_saat);
        let yeniKalan = parseFloat(paketData.kalan_saat);
        let kayitAciklama = aciklama || '';
        let saatDusulduMu = false;

        if (yoklamaDurumu === 'katildi') {
            if (saat > paketData.kalan_saat) {
                return res.json({ success: false, message: `Yetersiz saat! Kalan: ${paketData.kalan_saat} saat` });
            }
            
            yeniKullanilan = parseFloat(paketData.kullanilan_saat) + saat;
            yeniKalan = parseFloat(paketData.toplam_saat) - yeniKullanilan;
            kayitAciklama = kayitAciklama || 'Derse katıldı';
            saatDusulduMu = true;
            
        } else if (yoklamaDurumu === 'katilmadi') {
            kayitAciklama = kayitAciklama || 'Derse katılmadı (ders hakkı düşülmedi)';
            saatDusulduMu = false;
            
        } else if (yoklamaDurumu === 'izinli') {
            kayitAciklama = kayitAciklama || 'İzinli (ders hakkı saklı)';
            saatDusulduMu = false;
        }

        await db.execute(`
            INSERT INTO ozel_ders_kullanimlari (paket_id, ogrenci_id, kullanilan_saat, tarih, durum, aciklama)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [paket_id, ogrenci_id, saatDusulduMu ? saat : 0, tarih || new Date(), yoklamaDurumu, kayitAciklama]);

        if (saatDusulduMu) {
            const paketDurum = yeniKalan <= 0 ? 'bitti' : 'aktif';
            await db.execute(`
                UPDATE ozel_ders_paketleri SET kullanilan_saat = ?, kalan_saat = ?, durum = ? WHERE id = ?
            `, [yeniKullanilan, Math.max(0, yeniKalan), paketDurum, paket_id]);
        }

        // WhatsApp
        try {
            const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);
            const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';

            let triggerKey = 'ozel_yoklama_katildi';
            if (yoklamaDurumu === 'katilmadi') triggerKey = 'ozel_yoklama_katilmadi';
            else if (yoklamaDurumu === 'izinli') triggerKey = 'ozel_yoklama_izinli';

            const guncelKalanSaat = saatDusulduMu ? Math.max(0, yeniKalan) : paketData.kalan_saat;
            const guncelKullanilanSaat = saatDusulduMu ? yeniKullanilan : paketData.kullanilan_saat;

            await sendWhatsAppNotification(ogr[0].sube_id, triggerKey, telefonlar, {
                ad_soyad: ogr[0].ad_soyad,
                paket_adi: paketData.paket_adi || paketData.baslik || 'Özel Ders Paketi',
                toplam_saat: paketData.toplam_saat,
                kullanilan_saat: guncelKullanilanSaat,
                kalan_saat: guncelKalanSaat,
                tarih: tarih ? new Date(tarih).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR'),
                aciklama: kayitAciklama,
                durum_aciklama: saatDusulduMu ? 'Ders hakkı düşüldü' : 'Ders hakkı düşülmedi'
            }, tesisAdi);
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (Özel Ders Kullanımı)
        try {
            let pushTitle = '';
            let pushBody = '';
            const guncelKalanSaat = saatDusulduMu ? Math.max(0, yeniKalan) : paketData.kalan_saat;

            if (yoklamaDurumu === 'katildi') {
                pushTitle = '✅ Özel Ders - Katıldı';
                pushBody = `${ogr[0].ad_soyad} - ${paketData.paket_adi || 'Özel Ders'} dersine katıldı. Kalan: ${guncelKalanSaat} saat`;
            } else if (yoklamaDurumu === 'katilmadi') {
                pushTitle = '❌ Özel Ders - Katılmadı';
                pushBody = `${ogr[0].ad_soyad} - ${paketData.paket_adi || 'Özel Ders'} dersine katılmadı. (Ders hakkı düşülmedi)`;
            } else if (yoklamaDurumu === 'izinli') {
                pushTitle = '📝 Özel Ders - İzinli';
                pushBody = `${ogr[0].ad_soyad} - ${paketData.paket_adi || 'Özel Ders'} dersi için izinli sayıldı.`;
            }

            await pushService.sendToVeli(
                ogrenci_id,
                pushTitle,
                pushBody,
                '/veli/panel',
                'ozel_ders'
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        let sonucMesaji = '';
        if (yoklamaDurumu === 'katildi') {
            sonucMesaji = `Yoklama kaydedildi! ${saat} saat düşüldü. Kalan: ${Math.max(0, yeniKalan)} saat`;
        } else if (yoklamaDurumu === 'katilmadi') {
            sonucMesaji = `Yoklama kaydedildi! Katılmadı - Ders hakkı düşülmedi. Kalan: ${paketData.kalan_saat} saat`;
        } else {
            sonucMesaji = `Yoklama kaydedildi! İzinli - Ders hakkı saklı. Kalan: ${paketData.kalan_saat} saat`;
        }

        res.json({ 
            success: true, 
            message: sonucMesaji,
            kalan_saat: saatDusulduMu ? Math.max(0, yeniKalan) : paketData.kalan_saat,
            saat_dusuldu: saatDusulduMu
        });

    } catch (error) {
        console.error('Özel ders kullanım hatası:', error);
        res.json({ success: false, message: 'Kayıt sırasında hata oluştu: ' + error.message });
    }
};


// =====================================================
// 13. ANALİZ EKLE (Push Bildirim Eklendi)
// =====================================================
exports.analizEkle = async (req, res) => {
    const {
        ogrenci_id, brans,
        teknik_puan, teknik_aciklama,
        fiziksel_puan, fiziksel_aciklama,
        taktik_puan, taktik_aciklama,
        mental_puan, mental_aciklama,
        disiplin_puan, disiplin_aciklama,
        takim_puan, takim_aciklama,
        genel_degerlendirme, oneriler,
        kisa_vadeli_hedef, uzun_vadeli_hedef,
        analiz_tarihi
    } = req.body;

    try {
        const puanlar = [
            parseInt(teknik_puan) || 5,
            parseInt(fiziksel_puan) || 5,
            parseInt(taktik_puan) || 5,
            parseInt(mental_puan) || 5,
            parseInt(disiplin_puan) || 5,
            parseInt(takim_puan) || 5
        ];
        const genelPuan = (puanlar.reduce((a, b) => a + b, 0) / puanlar.length).toFixed(1);

        await db.execute(`
            INSERT INTO analizler (
                ogrenci_id, brans,
                teknik_puan, teknik_aciklama,
                fiziksel_puan, fiziksel_aciklama,
                taktik_puan, taktik_aciklama,
                mental_puan, mental_aciklama,
                disiplin_puan, disiplin_aciklama,
                takim_puan, takim_aciklama,
                genel_puan, genel_degerlendirme, oneriler,
                kisa_vadeli_hedef, uzun_vadeli_hedef,
                analiz_tarihi, analizci_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            ogrenci_id, brans,
            teknik_puan, teknik_aciklama || null,
            fiziksel_puan, fiziksel_aciklama || null,
            taktik_puan, taktik_aciklama || null,
            mental_puan, mental_aciklama || null,
            disiplin_puan, disiplin_aciklama || null,
            takim_puan, takim_aciklama || null,
            genelPuan, genel_degerlendirme || null, oneriler || null,
            kisa_vadeli_hedef || null, uzun_vadeli_hedef || null,
            analiz_tarihi || new Date(), req.session.userID
        ]);

        // Öğrenci bilgisi
        const [ogr] = await db.execute('SELECT ad_soyad, sube_id, ozel_veri FROM ogrenciler WHERE id = ?', [ogrenci_id]);

        // WhatsApp
        try {
            if (ogr.length > 0) {
                const telefonlar = extractPhoneNumbers(ogr[0].ozel_veri);
                const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';
                const siteAdresi = res.locals.siteAyarlari?.site_adresi || '';

                await sendWhatsAppNotification(ogr[0].sube_id, 'analiz_eklendi', telefonlar, {
                    ad_soyad: ogr[0].ad_soyad,
                    brans: brans || '-',
                    genel_puan: genelPuan,
                    teknik_puan: teknik_puan || '-',
                    teknik_aciklama: teknik_aciklama || '-',
                    fiziksel_puan: fiziksel_puan || '-',
                    fiziksel_aciklama: fiziksel_aciklama || '-',
                    taktik_puan: taktik_puan || '-',
                    taktik_aciklama: taktik_aciklama || '-',
                    mental_puan: mental_puan || '-',
                    mental_aciklama: mental_aciklama || '-',
                    disiplin_puan: disiplin_puan || '-',
                    disiplin_aciklama: disiplin_aciklama || '-',
                    takim_puan: takim_puan || '-',
                    takim_aciklama: takim_aciklama || '-',
                    genel_degerlendirme: genel_degerlendirme || '-',
                    oneriler: oneriler || '-',
                    kisa_vadeli_hedef: kisa_vadeli_hedef || '-',
                    uzun_vadeli_hedef: uzun_vadeli_hedef || '-',
                    analiz_tarihi: analiz_tarihi ? new Date(analiz_tarihi).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR'),
                    analiz_linki: siteAdresi ? `${siteAdresi}/api/ogrenci/profil/${ogrenci_id}` : ''
                }, tesisAdi);
            }
        } catch (wpError) {
            console.error('WhatsApp mesaj hatası:', wpError.message);
        }

        // ⭐ PUSH BİLDİRİM - Veliye (📊 5. Öğrenci Analizi Eklendi)
        try {
            const ogrAdi = ogr.length > 0 ? ogr[0].ad_soyad : 'Öğrenci';
            
            await pushService.sendToVeli(
                ogrenci_id,
                '📊 Yeni Analiz Eklendi',
                `${ogrAdi} - Yeni performans analizi kaydedildi. Genel Puan: ${genelPuan}/10`,
                '/veli/panel?tab=analiz',
                'analiz'
            );
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }
		
        res.json({ success: true, message: 'Analiz başarıyla kaydedildi!' });

    } catch (error) {
        console.error('Analiz ekleme hatası:', error);
        res.json({ success: false, message: 'Analiz eklenirken hata oluştu: ' + error.message });
    }
};


// =====================================================
// 14. ANALİZ DETAY
// =====================================================
exports.analizDetay = async (req, res) => {
    const { id } = req.params;

    try {
        const [analiz] = await db.execute(`
            SELECT a.*, o.ad_soyad, k.ad_soyad as analizci_adi
            FROM analizler a
            LEFT JOIN ogrenciler o ON a.ogrenci_id = o.id
            LEFT JOIN kullanicilar k ON a.analizci_id = k.id
            WHERE a.id = ?
        `, [id]);

        if (analiz.length === 0) {
            return res.json({ success: false, message: 'Analiz bulunamadı' });
        }

        res.json({ success: true, analiz: analiz[0] });

    } catch (error) {
        console.error('Analiz detay hatası:', error);
        res.json({ success: false, message: error.message });
    }
};


// =====================================================
// 15. ANALİZ SİL
// =====================================================
exports.analizSil = async (req, res) => {
    const { id } = req.params;

    try {
        await db.execute('DELETE FROM analizler WHERE id = ?', [id]);
        res.json({ success: true, message: 'Analiz silindi' });
    } catch (error) {
        console.error('Analiz silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};