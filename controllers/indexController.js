const db = require('../config/db');

// DASHBOARD GÖRÜNTÜLEME
exports.dashboard = async (req, res) => {
    if (!req.session.userID) return res.redirect('/api/auth/login');

    // Personel için dashboard yetkisi kontrolü
    if (req.session.rol === 'personel') {
        const yetkiler = req.session.yetkiler || {};
        if (!yetkiler.dashboard) {
            return res.status(403).send(`
                <body style="background:#f3f5f9; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
                    <div style="background:white; padding:40px; border-radius:20px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                        <h1 style="color:#ef4444; font-size:60px; margin:0;">403</h1>
                        <h3 style="color:#2d3748;">Erişim Yetkiniz Yok</h3>
                        <p style="color:#64748b;">Dashboard sayfasına erişim yetkiniz bulunmamaktadır.</p>
                        <a href="/api/ogrenci/liste" style="display:inline-block; margin-top:20px; text-decoration:none; background:#007bff; color:white; padding:10px 20px; border-radius:10px;">Öğrenci Listesine Git</a>
                    </div>
                </body>
            `);
        }
    }

    try {
        const subeId = req.session.subeId;
        const rol = req.session.rol;
        
        // --- TARİH AYARLARI ---
        const bugun = new Date();
        const bugunStr = bugun.toISOString().split('T')[0];
        const buAy = bugun.getMonth() + 1;
        const buYil = bugun.getFullYear();
        
        const ayBaslangic = new Date(buYil, bugun.getMonth(), 1).toISOString().split('T')[0];
        const ayBitis = new Date(buYil, bugun.getMonth() + 1, 0).toISOString().split('T')[0];
        
        const gunlerDB = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
        const bugunGunDB = gunlerDB[bugun.getDay()]; 

        // --- YETKİ FİLTRESİ ---
        let subeSql = "";
        let params = [];
        if (rol !== 'yonetici') {
            subeSql = " AND sube_id = ?";
            params.push(subeId);
        }

        // 1. İSTATİSTİKLER
        const p = [...params, ...params, ...params, ...params];
        const [stats] = await db.execute(`
            SELECT 
                (SELECT COUNT(*) FROM ogrenciler WHERE 1=1 ${subeSql}) as toplam_ogrenci,
                (SELECT COUNT(*) FROM ogrenciler WHERE durum = 'aktif' ${subeSql}) as aktif_ogrenci,
                (SELECT COUNT(*) FROM ogrenciler WHERE durum = 'pasif' ${subeSql}) as pasif_ogrenci,
                (SELECT COUNT(*) FROM kullanicilar WHERE 1=1 ${subeSql}) as toplam_personel
        `, p);

        // 2. FİNANS
        let finansParams = [ayBaslangic + ' 00:00:00', ayBitis + ' 23:59:59'];
        if (rol !== 'yonetici') finansParams.push(subeId);

        const [finans] = await db.execute(`
            SELECT 
                COALESCE(SUM(CASE WHEN islem_turu = 'gelir' THEN tutar ELSE 0 END), 0) as gelir,
                COALESCE(SUM(CASE WHEN islem_turu = 'gider' THEN tutar ELSE 0 END), 0) as gider
            FROM kasa 
            WHERE tarih BETWEEN ? AND ? ${rol !== 'yonetici' ? 'AND sube_id = ?' : ''}
        `, finansParams);

        const gelir = parseFloat(finans[0]?.gelir || 0);
        const gider = parseFloat(finans[0]?.gider || 0);
        const bakiye = gelir - gider;

        // 3. GRAFİK VERİSİ
        let chartParams = [];
        let chartSql = `
            SELECT DATE(tarih) as gun, islem_turu, SUM(tutar) as toplam 
            FROM kasa 
            WHERE tarih >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `;
        if (rol !== 'yonetici') {
            chartSql += ` AND sube_id = ?`;
            chartParams.push(subeId);
        }
        chartSql += ` GROUP BY DATE(tarih), islem_turu ORDER BY gun ASC`;
        
        const [chartDataRaw] = await db.execute(chartSql, chartParams);

        let labels = [];
        let dataGelir = [];
        let dataGider = [];
        
        for(let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('tr-TR', {weekday: 'short'}));
            const gGelir = chartDataRaw.find(x => new Date(x.gun).toISOString().split('T')[0] === dateStr && x.islem_turu === 'gelir');
            const gGider = chartDataRaw.find(x => new Date(x.gun).toISOString().split('T')[0] === dateStr && x.islem_turu === 'gider');
            dataGelir.push(gGelir ? parseFloat(gGelir.toplam) : 0);
            dataGider.push(gGider ? parseFloat(gGider.toplam) : 0);
        }

        // 4. BUGÜNKÜ DERSLER
        let dersParams = [bugunGunDB]; 
        if (rol !== 'yonetici') dersParams.push(subeId);

        const [dersler] = await db.execute(`
            SELECT 
                TIME_FORMAT(d.baslangic_saati, '%H:%i') as baslangic, 
                TIME_FORMAT(d.bitis_saati, '%H:%i') as bitis, 
                g.grup_adi, 
                b.brans_adi 
            FROM ders_programi d
            JOIN gruplar g ON d.grup_id = g.id
            JOIN branslar b ON g.brans_id = b.id
            WHERE d.gun = ? ${rol !== 'yonetici' ? 'AND b.sube_id = ?' : ''}
            ORDER BY d.baslangic_saati ASC
        `, dersParams);

        // 5. BUGÜN DOĞUM GÜNÜ OLANLAR
        let dgParams = [buAy, bugun.getDate()];
        if (rol !== 'yonetici') dgParams.push(subeId);

        const [dogumGunleri] = await db.execute(`
            SELECT ad_soyad, profil_foto, sube_id,
            YEAR(CURDATE()) - YEAR(dogum_tarihi) as yas,
            (SELECT sube_adi FROM subeler WHERE id = ogrenciler.sube_id) as sube_adi
            FROM ogrenciler 
            WHERE MONTH(dogum_tarihi) = ? AND DAY(dogum_tarihi) = ? 
            ${rol !== 'yonetici' ? 'AND sube_id = ?' : ''}
            LIMIT 10
        `, dgParams);

        // 6. GECİKEN AİDATLAR
        let borcParams = [buYil, buAy];
        if (rol !== 'yonetici') borcParams.push(subeId);

        const [borclularRaw] = await db.execute(`
            SELECT o.id, o.ad_soyad, o.aidat_hatirlatma_gunu, o.aidat_ucreti, o.profil_foto, o.sube_id,
            (SELECT sube_adi FROM subeler WHERE id = o.sube_id) as sube_adi,
            (SELECT COUNT(*) FROM aidatlar a WHERE a.ogrenci_id = o.id AND a.yil = ? AND a.ay = ? AND a.durum = 'tamamlandi') as odendi_mi
            FROM ogrenciler o
            WHERE o.durum = 'aktif'
            ${rol !== 'yonetici' ? 'AND o.sube_id = ?' : ''}
        `, borcParams);

        let gecikenler = [];
        borclularRaw.forEach(ogr => {
            if (ogr.odendi_mi > 0) return;
            const hatirlatmaGunu = ogr.aidat_hatirlatma_gunu || 1; 
            const vadeTarihi = new Date(buYil, buAy - 1, hatirlatmaGunu);
            vadeTarihi.setHours(23, 59, 59);
            if (bugun > vadeTarihi) {
                const diffTime = Math.abs(bugun - vadeTarihi);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                gecikenler.push({
                    id: ogr.id,
                    ad_soyad: ogr.ad_soyad,
                    tutar: ogr.aidat_ucreti,
                    resim: ogr.profil_foto,
                    gecikme: diffDays,
                    sube_adi: ogr.sube_adi
                });
            }
        });
        gecikenler.sort((a, b) => b.gecikme - a.gecikme);

        // =====================================================
        // 7. DEPO & STOKLAR
        // =====================================================
        let urunler = [];
        let toplamStok = 0;
        let toplamUrun = 0;
        let dusukStokUrunler = [];

        try {
            const [urunlerResult] = await db.execute(`
                SELECT id, urun_adi, fiyat, tur, durum
                FROM urunler WHERE durum = 1
                ORDER BY urun_adi
            `);

            for (let urun of urunlerResult) {
                let stoklar = [];
                let urunToplamStok = 0;

                if (urun.tur === 'stoklu') {
                    const [stokResult] = await db.execute(`
                        SELECT beden, adet FROM urun_stoklari WHERE urun_id = ?
                        ORDER BY CASE beden WHEN 'xs' THEN 1 WHEN 's' THEN 2 WHEN 'm' THEN 3 WHEN 'l' THEN 4 WHEN 'xl' THEN 5 WHEN 'xxl' THEN 6 ELSE 7 END
                    `, [urun.id]);

                    stoklar = stokResult.map(s => ({
                        beden: s.beden ? s.beden.toUpperCase() : '-',
                        adet: parseInt(s.adet) || 0
                    }));
                    urunToplamStok = stoklar.reduce((acc, s) => acc + s.adet, 0);
                    toplamStok += urunToplamStok;

                    if (urunToplamStok <= 3 && urunToplamStok > 0) {
                        dusukStokUrunler.push({ urun_adi: urun.urun_adi, toplam_stok: urunToplamStok });
                    }
                }

                urunler.push({
                    id: urun.id,
                    urun_adi: urun.urun_adi,
                    fiyat: parseFloat(urun.fiyat),
                    tur: urun.tur,
                    stoklar: stoklar,
                    toplam_stok: urunToplamStok
                });
            }
            toplamUrun = urunler.length;
        } catch (e) {
            console.log('Ürün/stok verileri alınamadı:', e.message);
        }

        // =====================================================
        // 8. ÜRÜN SATIŞLARI
        // =====================================================
        let urunSatisStats = { satis_adedi: 0, toplam_tutar: 0 };
        let sonSatislar = [];

        try {
            let satisStatsParams = [ayBaslangic + ' 00:00:00', ayBitis + ' 23:59:59'];
            let satisStatsSql = `
                SELECT COUNT(*) as satis_adedi, COALESCE(SUM(us.toplam_tutar), 0) as toplam_tutar
                FROM urun_satislari us
                JOIN ogrenciler o ON us.ogrenci_id = o.id
                WHERE us.created_at BETWEEN ? AND ?
            `;
            if (rol !== 'yonetici') {
                satisStatsSql += ` AND o.sube_id = ?`;
                satisStatsParams.push(subeId);
            }

            const [satisStatsResult] = await db.execute(satisStatsSql, satisStatsParams);
            if (satisStatsResult.length > 0) {
                urunSatisStats = {
                    satis_adedi: satisStatsResult[0].satis_adedi || 0,
                    toplam_tutar: parseFloat(satisStatsResult[0].toplam_tutar || 0)
                };
            }

            let sonSatislarParams = [];
            let sonSatislarSql = `
                SELECT us.id, us.created_at, us.adet, us.toplam_tutar, us.odeme_tipi,
                    u.urun_adi, st.beden, o.ad_soyad, o.profil_foto, o.sube_id, s.sube_adi
                FROM urun_satislari us
                JOIN urunler u ON us.urun_id = u.id
                JOIN ogrenciler o ON us.ogrenci_id = o.id
                LEFT JOIN urun_stoklari st ON us.stok_id = st.id
                LEFT JOIN subeler s ON o.sube_id = s.id
                WHERE 1=1
            `;
            if (rol !== 'yonetici') {
                sonSatislarSql += ` AND o.sube_id = ?`;
                sonSatislarParams.push(subeId);
            }
            sonSatislarSql += ` ORDER BY us.created_at DESC LIMIT 10`;

            const [satislarResult] = await db.execute(sonSatislarSql, sonSatislarParams);
            sonSatislar = satislarResult.map(s => ({
                id: s.id,
                tarih: s.created_at,
                adet: s.adet,
                tutar: parseFloat(s.toplam_tutar),
                odeme_tipi: s.odeme_tipi,
                urun_adi: s.urun_adi,
                beden: s.beden || '-',
                ogrenci_adi: s.ad_soyad,
                ogrenci_foto: s.profil_foto,
                sube_adi: s.sube_adi || '-'
            }));
        } catch (e) {
            console.log('Satış verileri alınamadı:', e.message);
        }

        // =====================================================
        // 9. GÜNLÜK YOKLAMA ANALİZİ
        // =====================================================
        let gunlukYoklama = { katildi: 0, katilmadi: 0, izinli: 0, toplam: 0 };
        let gunlukOzelDers = { katildi: 0, katilmadi: 0, izinli: 0, toplam: 0 };

        try {
            // Normal yoklama - bugün
            let yoklamaSql = `
                SELECT y.durum, COUNT(*) as sayi
                FROM yoklamalar y
                JOIN gruplar g ON y.grup_id = g.id
                JOIN branslar b ON g.brans_id = b.id
                WHERE y.tarih = ?
            `;
            let yoklamaParams = [bugunStr];
            if (rol !== 'yonetici') {
                yoklamaSql += ` AND b.sube_id = ?`;
                yoklamaParams.push(subeId);
            }
            yoklamaSql += ` GROUP BY y.durum`;

            const [yoklamaResult] = await db.execute(yoklamaSql, yoklamaParams);
            yoklamaResult.forEach(r => {
                if (r.durum === 'katildi') gunlukYoklama.katildi = r.sayi;
                else if (r.durum === 'katilmadi') gunlukYoklama.katilmadi = r.sayi;
                else if (r.durum === 'izinli') gunlukYoklama.izinli = r.sayi;
            });
            gunlukYoklama.toplam = gunlukYoklama.katildi + gunlukYoklama.katilmadi + gunlukYoklama.izinli;

            // Özel ders yoklama - bugün
            let ozelDersSql = `
                SELECT odk.durum, COUNT(*) as sayi
                FROM ozel_ders_kullanimlari odk
                JOIN ogrenciler o ON odk.ogrenci_id = o.id
                WHERE odk.tarih = ?
            `;
            let ozelDersParams = [bugunStr];
            if (rol !== 'yonetici') {
                ozelDersSql += ` AND o.sube_id = ?`;
                ozelDersParams.push(subeId);
            }
            ozelDersSql += ` GROUP BY odk.durum`;

            const [ozelDersResult] = await db.execute(ozelDersSql, ozelDersParams);
            ozelDersResult.forEach(r => {
                if (r.durum === 'katildi') gunlukOzelDers.katildi = r.sayi;
                else if (r.durum === 'katilmadi') gunlukOzelDers.katilmadi = r.sayi;
                else if (r.durum === 'izinli') gunlukOzelDers.izinli = r.sayi;
            });
            gunlukOzelDers.toplam = gunlukOzelDers.katildi + gunlukOzelDers.katilmadi + gunlukOzelDers.izinli;

        } catch (e) {
            console.log('Günlük yoklama alınamadı:', e.message);
        }

        // =====================================================
        // 10. BU AY YOKLAMA - EN ÇOK KATILAN/KATILMAYAN
        // =====================================================
        let enCokKatilanlar = [];
        let enCokKatilmayanlar = [];

        try {
            // En çok katılan öğrenciler (bu ay)
            let katilanSql = `
                SELECT o.id, o.ad_soyad, o.profil_foto, o.sube_id, s.sube_adi,
                    COUNT(CASE WHEN y.durum = 'katildi' THEN 1 END) as katilim_sayisi,
                    COUNT(*) as toplam_ders
                FROM yoklamalar y
                JOIN ogrenciler o ON y.ogrenci_id = o.id
                JOIN gruplar g ON y.grup_id = g.id
                JOIN branslar b ON g.brans_id = b.id
                LEFT JOIN subeler s ON o.sube_id = s.id
                WHERE y.tarih BETWEEN ? AND ?
            `;
            let katilanParams = [ayBaslangic, ayBitis];
            if (rol !== 'yonetici') {
                katilanSql += ` AND b.sube_id = ?`;
                katilanParams.push(subeId);
            }
            katilanSql += ` GROUP BY o.id ORDER BY katilim_sayisi DESC, toplam_ders DESC LIMIT 10`;

            const [katilanResult] = await db.execute(katilanSql, katilanParams);
            enCokKatilanlar = katilanResult.map(r => ({
                id: r.id,
                ad_soyad: r.ad_soyad,
                profil_foto: r.profil_foto,
                sube_adi: r.sube_adi,
                katilim: r.katilim_sayisi,
                toplam: r.toplam_ders,
                oran: r.toplam_ders > 0 ? Math.round((r.katilim_sayisi / r.toplam_ders) * 100) : 0
            }));

            // En çok katılmayan öğrenciler (bu ay)
            let katilmayanSql = `
                SELECT o.id, o.ad_soyad, o.profil_foto, o.sube_id, s.sube_adi,
                    COUNT(CASE WHEN y.durum = 'katilmadi' THEN 1 END) as katilmadi_sayisi,
                    COUNT(*) as toplam_ders
                FROM yoklamalar y
                JOIN ogrenciler o ON y.ogrenci_id = o.id
                JOIN gruplar g ON y.grup_id = g.id
                JOIN branslar b ON g.brans_id = b.id
                LEFT JOIN subeler s ON o.sube_id = s.id
                WHERE y.tarih BETWEEN ? AND ?
            `;
            let katilmayanParams = [ayBaslangic, ayBitis];
            if (rol !== 'yonetici') {
                katilmayanSql += ` AND b.sube_id = ?`;
                katilmayanParams.push(subeId);
            }
            katilmayanSql += ` GROUP BY o.id HAVING katilmadi_sayisi > 0 ORDER BY katilmadi_sayisi DESC LIMIT 10`;

            const [katilmayanResult] = await db.execute(katilmayanSql, katilmayanParams);
            enCokKatilmayanlar = katilmayanResult.map(r => ({
                id: r.id,
                ad_soyad: r.ad_soyad,
                profil_foto: r.profil_foto,
                sube_adi: r.sube_adi,
                katilmadi: r.katilmadi_sayisi,
                toplam: r.toplam_ders,
                oran: r.toplam_ders > 0 ? Math.round((r.katilmadi_sayisi / r.toplam_ders) * 100) : 0
            }));

        } catch (e) {
            console.log('Aylık yoklama alınamadı:', e.message);
        }

        // =====================================================
        // 11. ÖĞRENCİ GELİŞİM ANALİZİ - EN BAŞARILI 10
        // =====================================================
        let enBasarililar = [];

        try {
            let analizSql = `
                SELECT a.id, a.ogrenci_id, a.brans, a.genel_puan, a.analiz_tarihi,
                    a.teknik_puan, a.fiziksel_puan, a.taktik_puan, a.mental_puan, a.disiplin_puan, a.takim_puan,
                    o.ad_soyad, o.profil_foto, o.sube_id, s.sube_adi
                FROM analizler a
                JOIN ogrenciler o ON a.ogrenci_id = o.id
                LEFT JOIN subeler s ON o.sube_id = s.id
                WHERE a.id IN (
                    SELECT MAX(id) FROM analizler GROUP BY ogrenci_id
                )
            `;
            let analizParams = [];
            if (rol !== 'yonetici') {
                analizSql += ` AND o.sube_id = ?`;
                analizParams.push(subeId);
            }
            analizSql += ` ORDER BY a.genel_puan DESC LIMIT 10`;

            const [analizResult] = await db.execute(analizSql, analizParams);
            enBasarililar = analizResult.map(r => ({
                id: r.id,
                ogrenci_id: r.ogrenci_id,
                ad_soyad: r.ad_soyad,
                profil_foto: r.profil_foto,
                sube_adi: r.sube_adi,
                brans: r.brans,
                genel_puan: parseFloat(r.genel_puan),
                teknik: r.teknik_puan,
                fiziksel: r.fiziksel_puan,
                taktik: r.taktik_puan,
                mental: r.mental_puan,
                disiplin: r.disiplin_puan,
                takim: r.takim_puan,
                tarih: r.analiz_tarihi
            }));

        } catch (e) {
            console.log('Gelişim analizi alınamadı:', e.message);
        }

        // 12. BAŞVURU LİNKİ
        let basvuruLinki = '';
        try {
            const [siteAdresData] = await db.execute("SELECT ayar_degeri FROM genel_ayarlar WHERE ayar_adi = 'site_adresi' LIMIT 1");
            if (siteAdresData.length > 0 && siteAdresData[0].ayar_degeri) {
                let siteAdresi = siteAdresData[0].ayar_degeri;
                if (siteAdresi.endsWith('/')) siteAdresi = siteAdresi.slice(0, -1);
                basvuruLinki = siteAdresi + '/basvuru';
            }
        } catch (e) {}
        if (!basvuruLinki) basvuruLinki = `${req.protocol}://${req.get('host')}/basvuru`;

        // 13. ŞUBELER
        let subeler = [];
        if (rol === 'yonetici') {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
        } else {
            const [subeRow] = await db.execute('SELECT id, sube_adi FROM subeler WHERE id = ?', [subeId]);
            if (subeRow.length > 0) subeler = subeRow;
        }

        // 14. WHATSAPP AYARLARI
        let wpAyarlar = {};
        const tesisAdi = res.locals.siteAyarlari?.tesis_adi || 'Spor Tesisi';
        try {
            const [wpRows] = await db.execute('SELECT sube_id, basvuru_veli_aktif, basvuru_veli_mesaj FROM whatsapp_mesaj_ayarlari');
            wpRows.forEach(row => {
                wpAyarlar[row.sube_id] = {
                    aktif: row.basvuru_veli_aktif === 1,
                    mesaj: row.basvuru_veli_mesaj || 'Merhaba,\n\n📋 Online başvuru formumuza aşağıdaki linkten ulaşabilirsiniz:\n\n🔗 {link}\n\nSizi aramızda görmekten mutluluk duyarız!\n✨ ' + tesisAdi
                };
            });
        } catch (e) {}

        // RENDER
        const ayarlar = res.locals.siteAyarlari || { tesis_adi: 'Panel', ana_renk: '#007bff' };

        res.render('index.html', {
            user: { 
                ad_soyad: req.session.adSoyad, 
                rol: req.session.rol,
                sube_id: subeId,
                yetkiler: req.session.yetkiler || {} 
            },
            siteAyarlari: ayarlar,
            stats: stats[0] || { toplam_ogrenci:0, aktif_ogrenci:0, pasif_ogrenci:0, toplam_personel:0 },
            finans: { gelir, gider, bakiye },
            chartData: { labels, gelir: dataGelir, gider: dataGider },
            dersler: dersler || [],
            dogumGunleri: dogumGunleri || [],
            borclular: gecikenler || [],
            basvuruLinki,
            subeler,
            wpAyarlar,
            linkUrl: basvuruLinki,
            // Depo & Stoklar
            urunler,
            toplamUrun,
            toplamStok,
            dusukStokUrunler,
            // Satışlar
            urunSatisStats,
            sonSatislar,
            // Yoklama
            gunlukYoklama,
            gunlukOzelDers,
            enCokKatilanlar,
            enCokKatilmayanlar,
            // Gelişim Analizi
            enBasarililar
        });

    } catch (error) {
        console.error("DASHBOARD HATASI:", error);
        res.status(500).send(`<div style="padding:20px; font-family:monospace; color:red;"><h1>Sistem Hatası (500)</h1><pre>${error.message}</pre></div>`);
    }
};

// DESTEK TALEBİ
exports.destekEkle = async (req, res) => {
    if (!req.session.userID) return res.redirect('/');
    const { konu, aciklama, sube_id } = req.body;
    
    // Yönetici form'dan şube seçer, personel kendi şubesini kullanır
    const hedefSubeId = sube_id || req.session.subeId;
    
    try {
        // Destek talebini kaydet
        await db.execute(`INSERT INTO destek_talepleri (gonderen_id, konu, aciklama, durum, tarih) VALUES (?, ?, ?, 'bekliyor', NOW())`, [req.session.userID, konu, aciklama]);
        
        // WhatsApp bildirimi gönder
        try {
            // netspor telefon numarasını al
            const [ayarlar] = await db.execute("SELECT * FROM genel_ayarlar LIMIT 1");
            const netsporTelefon = ayarlar.length > 0 ? ayarlar[0].netspor : null;
            const tesisAdi = ayarlar.length > 0 ? ayarlar[0].tesis_adi : 'Bilinmiyor';
            
            if (netsporTelefon) {
                // Şube bilgilerini al (seçilen şube)
                const [subeData] = await db.execute("SELECT sube_adi, telefon FROM subeler WHERE id = ? LIMIT 1", [hedefSubeId]);
                const subeAdi = subeData.length > 0 ? subeData[0].sube_adi : 'Bilinmiyor';
                const subeTelefon = subeData.length > 0 && subeData[0].telefon ? subeData[0].telefon : 'Belirtilmemiş';
                
                // Tarih ve saat formatla
                const now = new Date();
                const tarihSaat = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                
                // Mesajı oluştur
                const mesaj = `🆘 *YENİ DESTEK TALEBİ !!*

📅 ${tarihSaat}
🏢 Tesis: ${tesisAdi}
🏬 Şube: ${subeAdi}
📞 Telefon: ${subeTelefon}
📋 Konu: ${konu}
📝 Açıklama: ${aciklama}`;

                // Telefon numarasını formatla
                let hedefTelefon = netsporTelefon.toString().replace(/\D/g, '');
                if (hedefTelefon.startsWith('0')) {
                    hedefTelefon = '90' + hedefTelefon.substring(1);
                } else if (hedefTelefon.length === 10) {
                    hedefTelefon = '90' + hedefTelefon;
                }
                
                // WhatsApp Service ile gönder
                const whatsappService = require('../services/whatsappService');
                await whatsappService.sendManualMessage(1, hedefTelefon, mesaj);
                
                console.log('✅ Destek talebi WhatsApp bildirimi gönderildi:', hedefTelefon);
            }
        } catch (wpError) {
            console.error('WhatsApp bildirim hatası:', wpError.message);
        }
        
        res.redirect('/');
    } catch (error) { 
        console.error('Destek talebi hatası:', error);
        res.send('Hata: ' + error.message); 
    }
};