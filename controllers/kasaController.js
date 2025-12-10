const db = require('../config/db');
const pushService = require('../services/pushService');

// KASA SAYFASI
exports.kasaSayfasi = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');

    try {
        const { baslangic, bitis, tur } = req.query;
        
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

        const filterStart = baslangic || firstDay;
        const filterEnd = bitis || lastDay;

        const [kategoriler] = await db.execute('SELECT * FROM kasa_kategorileri ORDER BY tur, ad');

        let sql = `
            SELECT k.*, s.sube_adi, u.ad_soyad as islem_yapan 
            FROM kasa k 
            JOIN subeler s ON k.sube_id = s.id
            LEFT JOIN kullanicilar u ON k.islem_yapan_id = u.id
            WHERE k.tarih BETWEEN ? AND ?
        `;
        let params = [filterStart + ' 00:00:00', filterEnd + ' 23:59:59'];

        if (req.session.rol !== 'yonetici') {
            sql += ` AND k.sube_id = ?`;
            params.push(req.session.subeId);
        }

        if (tur && tur !== 'hepsi') {
            sql += ` AND k.islem_turu = ?`;
            params.push(tur);
        }

        sql += ` ORDER BY k.tarih DESC`;

        const [hareketler] = await db.execute(sql, params);

        // --- VERİ ANALİZİ ---
        let gunlukVeri = {};
        let kategoriVerisi = {}; 
        let toplamGelir = 0;
        let toplamGider = 0;

        hareketler.forEach(h => {
            const gun = new Date(h.tarih).toLocaleDateString('tr-TR');
            const tutar = parseFloat(h.tutar);

            // 1. Günlük Grafik Verisi
            if (!gunlukVeri[gun]) gunlukVeri[gun] = { gelir: 0, gider: 0 };

            // 2. Kategori Grafik Verisi
            const analizTuru = (tur === 'gelir') ? 'gelir' : 'gider'; 
            
            if (h.islem_turu === analizTuru) {
                if (!kategoriVerisi[h.kategori]) kategoriVerisi[h.kategori] = 0;
                kategoriVerisi[h.kategori] += tutar;
            }

            if (h.islem_turu === 'gelir') {
                gunlukVeri[gun].gelir += tutar;
                toplamGelir += tutar;
            } else {
                gunlukVeri[gun].gider += tutar;
                toplamGider += tutar;
            }
        });

        // Kategori verisini sırala
        const siraliKategoriler = Object.entries(kategoriVerisi)
            .sort(([,a], [,b]) => b - a)
            .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

        const bakiye = toplamGelir - toplamGider;
        const [subeler] = await db.execute('SELECT * FROM subeler');

        res.render('accounting.html', { 
            user: { ad_soyad: req.session.adSoyad, rol: req.session.rol, sube_id: req.session.subeId },
            siteAyarlari: res.locals.siteAyarlari,
            hareketler: hareketler,
            kategoriler: kategoriler,
            subeler: subeler,
            ozet: { gelir: toplamGelir, gider: toplamGider, bakiye: bakiye },
            filtre: { baslangic: filterStart, bitis: filterEnd, tur: tur || 'hepsi' },
            grafikVerisi: JSON.stringify(gunlukVeri),
            kategoriVerisi: JSON.stringify(siraliKategoriler),
            kategoriListesi: siraliKategoriler 
        });

    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

// İŞLEM EKLE
exports.islemEkle = async (req, res) => {
    const { sube_id, islem_turu, kategori_id, tutar, aciklama, belge_no, vergi_dairesi, islem_tarihi } = req.body;
    try {
        const [kat] = await db.execute('SELECT ad FROM kasa_kategorileri WHERE id = ?', [kategori_id]);
        const kategoriAdi = kat[0].ad;
        const kayitTarihi = islem_tarihi ? islem_tarihi + ' ' + new Date().toTimeString().split(' ')[0] : new Date();

        await db.execute(`INSERT INTO kasa (sube_id, islem_turu, kategori, tutar, aciklama, belge_no, vergi_dairesi, tarih, islem_yapan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [sube_id || req.session.subeId, islem_turu, kategoriAdi, tutar, aciklama, belge_no, vergi_dairesi, kayitTarihi, req.session.userID]);

        // ⭐ PUSH BİLDİRİM - Ödeme alındığında yöneticilere
        try {
            if (islem_turu === 'gelir') {
                const tutarFormatli = parseFloat(tutar).toLocaleString('tr-TR');
                await pushService.sendToYoneticiler(
                    '💰 Ödeme Alındı',
                    `${kategoriAdi} - ${tutarFormatli}₺`,
                    '/api/kasa'
                );
            }
        } catch (pushErr) {
            console.error('Push bildirim hatası:', pushErr.message);
        }

        res.redirect('/api/kasa');
    } catch (error) { console.error(error); res.redirect('/api/kasa'); }
};

// İŞLEM DÜZENLE
exports.islemDuzenle = async (req, res) => {
    const { id, aciklama, belge_no, vergi_dairesi, tarih, tutar } = req.body;
    try {
        await db.execute(
            `UPDATE kasa SET aciklama=?, belge_no=?, vergi_dairesi=?, tarih=?, tutar=? WHERE id=?`, 
            [aciklama, belge_no, vergi_dairesi, tarih, tutar, id]
        );
        res.redirect('/api/kasa');
    } catch (error) { 
        console.error(error); 
        res.redirect('/api/kasa'); 
    }
};

// KATEGORİ İŞLEMLERİ
exports.kategoriEkle = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    try {
        await db.execute('INSERT INTO kasa_kategorileri (tur, ad, renk) VALUES (?, ?, ?)', [req.body.tur, req.body.ad, req.body.renk]);
        res.redirect('/api/kasa');
    } catch (e) { console.error(e); res.redirect('/api/kasa'); }
};

exports.kategoriSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.redirect('/');
    try {
        await db.execute('DELETE FROM kasa_kategorileri WHERE id = ?', [req.params.id]);
        res.redirect('/api/kasa');
    } catch (e) { console.error(e); res.redirect('/api/kasa'); }
};

// SİLME İŞLEMİ (Stabil ve Aidat Bağlantılı)
exports.islemSil = async (req, res) => {
    if (req.session.rol !== 'yonetici') return res.status(403).send("Yetkisiz");

    const id = req.params.id;

    try {
        // 1. Önce kaydı bulalım (Aidat bağlantısı var mı?)
        const [kayitlar] = await db.execute('SELECT * FROM kasa WHERE id = ?', [id]);
        
        if (kayitlar.length > 0) {
            const kayit = kayitlar[0];

            // 2. Eğer bu bir Aidat ödemesi ise, Aidat tablosunu güncelle (Borçlu yap)
            if (kayit.aidat_id) {
                await db.execute('UPDATE aidatlar SET durum = "odenmedi", odenme_tarihi = NULL WHERE id = ?', [kayit.aidat_id]);
            }
        }

        // 3. Kasadan sil
        await db.execute('DELETE FROM kasa WHERE id = ?', [id]);
        
        res.redirect('/api/kasa');

    } catch (error) {
        console.error("Silme Hatası:", error);
        res.redirect('/api/kasa');
    }
};