const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const axios = require('axios');
const https = require('https');


// --- ROUTE DOSYALARI ---
const envanterRoutes = require('./routes/envanterRoutes');
const cronService = require('./services/cronService');

dotenv.config();
const app = express();

// ⭐ MySQL Session Store Ayarları
const sessionStoreOptions = {
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 30 * 24 * 60 * 60 * 1000,
    createDatabaseTable: true
};

const sessionStore = new MySQLStore(sessionStoreOptions, db);

// ⭐ WHATSAPP API URL
const WA_API_URL = 'https://app.netqr.tr';

// ✅ Axios default config - SSL bypass
const axiosConfig = {
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true
    })
};

// --- UPLOADS KLASÖRÜ OLUŞTUR ---
const uploadsDir = path.join(__dirname, 'public/uploads/galeri');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Uploads/galeri klasörü oluşturuldu');
}

// --- WHATSAPP UPLOADS KLASÖRÜ ---
const waUploadsDir = path.join(__dirname, 'public/uploads/whatsapp');
if (!fs.existsSync(waUploadsDir)) {
    fs.mkdirSync(waUploadsDir, { recursive: true });
    console.log('✅ Uploads/whatsapp klasörü oluşturuldu');
}

// --- ESKİ MEDYA DOSYALARINI TEMİZLE (10 günden eski) ---
function cleanOldMediaFiles() {
    const mediaDir = path.join(__dirname, 'public/uploads/whatsapp');
    if (!fs.existsSync(mediaDir)) return;
    
    const now = Date.now();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    
    try {
        const files = fs.readdirSync(mediaDir);
        let deletedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(mediaDir, file);
            const stat = fs.statSync(filePath);
            const fileAge = now - stat.mtimeMs;
            
            if (fileAge > tenDaysMs) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });
        
        if (deletedCount > 0) {
            console.log(`🗑️ ${deletedCount} eski WhatsApp medya dosyası silindi.`);
        }
    } catch (e) {
        console.log('Medya temizleme hatası:', e.message);
    }
}

cleanOldMediaFiles();
setInterval(cleanOldMediaFiles, 24 * 60 * 60 * 1000);

// --- OTOMATİK KURULUM FONKSİYONU ---
async function sistemiKontrolEtVeKur() {
    try {
        console.log("Sistem kontrol ediliyor...");

        try {
            await db.execute("SELECT 1 FROM genel_ayarlar LIMIT 1");
        } catch (err) {
            console.log("⚠️ Tablolar bulunamadı, oluşturuluyor...");
            const sqlDosyaYolu = path.join(__dirname, 'database', 'sema.sql');
            if (fs.existsSync(sqlDosyaYolu)) {
                const sqlKomutlari = fs.readFileSync(sqlDosyaYolu, 'utf8');
                await db.query(sqlKomutlari); 
                console.log("✅ Tablolar başarıyla oluşturuldu.");
            } else {
                console.log("❌ HATA: sema.sql dosyası bulunamadı!");
            }
        }

        try {
            const [ayarlar] = await db.execute('SELECT * FROM genel_ayarlar');
            if (ayarlar.length === 0) {
                await db.execute(`
                    INSERT INTO genel_ayarlar (site_adresi, tesis_adi, pwa_adi, ana_renk, ara_renk, kurulum_yapildi_mi) 
                    VALUES ('https://spor.netqr.tr', 'netSPOR', 'netSPOR App', '#007bff', '#6c757d', 1)
                `);
                console.log("✅ Varsayılan ayarlar yüklendi.");
            }
        } catch (e) {
            console.log("Ayarlar tablosu hatası:", e.message);
        }

        try {
            const [users] = await db.execute('SELECT * FROM kullanicilar WHERE kullanici_adi = ?', ['netspor']);
            if (users.length === 0) {
                const sifreHash = await bcrypt.hash('102030', 10);
                await db.execute(`
                    INSERT INTO kullanicilar (ad_soyad, kullanici_adi, sifre, rol, durum) 
                    VALUES (?, ?, ?, 'yonetici', 1)
                `, ['Ana Yönetici', 'netspor', sifreHash]);
                console.log("✅ Ana Yönetici (netspor) oluşturuldu.");
            }
        } catch (e) {
            console.log("Kullanıcı tablosu hatası:", e.message);
        }
        
        try {
            await db.execute("SELECT 1 FROM urunler LIMIT 1");
        } catch (err) {
            console.log("⚠️ Ürünler tablosu bulunamadı, oluşturuluyor...");
            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS urunler (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        urun_adi VARCHAR(255) NOT NULL,
                        fiyat DECIMAL(10,2) NOT NULL DEFAULT 0,
                        tur ENUM('stoklu', 'stoksuz') DEFAULT 'stoklu',
                        aciklama TEXT,
                        durum TINYINT DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log("✅ Ürünler tablosu oluşturuldu.");
            } catch(e) {
                console.log("Ürünler tablosu oluşturma hatası:", e.message);
            }
        }

        try {
            await db.execute("SELECT 1 FROM urun_stoklari LIMIT 1");
        } catch (err) {
            console.log("⚠️ Ürün stokları tablosu bulunamadı, oluşturuluyor...");
            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS urun_stoklari (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        urun_id INT NOT NULL,
                        beden VARCHAR(50) NOT NULL,
                        adet INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log("✅ Ürün stokları tablosu oluşturuldu.");
            } catch(e) {
                console.log("Ürün stokları tablosu oluşturma hatası:", e.message);
            }
        }

        try {
            await db.execute("SELECT 1 FROM urun_satislari LIMIT 1");
        } catch (err) {
            console.log("⚠️ Ürün satışları tablosu bulunamadı, oluşturuluyor...");
            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS urun_satislari (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        ogrenci_id INT NOT NULL,
                        urun_id INT NOT NULL,
                        stok_id INT DEFAULT NULL,
                        adet INT DEFAULT 1,
                        birim_fiyat DECIMAL(10,2) NOT NULL,
                        toplam_tutar DECIMAL(10,2) NOT NULL,
                        odeme_tipi ENUM('nakit', 'havale', 'kredi_karti') DEFAULT 'nakit',
                        aciklama VARCHAR(500),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log("✅ Ürün satışları tablosu oluşturuldu.");
            } catch(e) {
                console.log("Ürün satışları tablosu oluşturma hatası:", e.message);
            }
        }

        // ⭐ 7. WhatsApp Mesaj Log Tablosu
        try {
            await db.execute("SELECT 1 FROM whatsapp_mesaj_log LIMIT 1");
        } catch (err) {
            console.log("⚠️ WhatsApp mesaj log tablosu bulunamadı, oluşturuluyor...");
            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS whatsapp_mesaj_log (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        sube_id INT DEFAULT NULL,
                        ogrenci_id INT DEFAULT NULL,
                        telefon VARCHAR(20),
                        mesaj TEXT,
                        mesaj_tipi VARCHAR(50),
                        durum ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
                        referans_ay INT DEFAULT NULL,
                        referans_yil INT DEFAULT NULL,
                        referans_id INT DEFAULT NULL,
                        gonderim_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_ogrenci_id (ogrenci_id),
                        INDEX idx_mesaj_tipi (mesaj_tipi),
                        INDEX idx_gonderim_tarihi (gonderim_tarihi)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log("✅ WhatsApp mesaj log tablosu oluşturuldu.");
            } catch(e) {
                console.log("WhatsApp mesaj log tablosu oluşturma hatası:", e.message);
            }
        }

    } catch (error) {
        console.error("❌ KURULUM HATASI:", error);
    }
}

// Compression - sadece varsa kullan
try {
    const compression = require('compression');
    app.use(compression());
    console.log('✅ GZIP compression aktif');
} catch (e) {
    console.log('⚠️ Compression paketi bulunamadı (npm install compression)');
}

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h', // 1 saat cache
    etag: true
}));

app.use(session({
    key: 'netsport_session',
    secret: process.env.SESSION_SECRET || 'gizli_anahtar_degistir_bunu',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,  // ⭐ EKLEYİN - Her istekte cookie süresini yeniler
    cookie: { 
        secure: false,
        httpOnly: true,
        maxAge: null  // ⭐ null = tarayıcı kapanınca silinir
    }
}));

app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'views'));

app.use(async (req, res, next) => {
    res.locals.originalUrl = req.originalUrl;
    res.locals.siteAyarlari = {
        tesis_adi: 'Spor Tesisi',
        pwa_adi: 'Spor App',
        ana_renk: '#007bff',
        ara_renk: '#6c757d',
        logo_192: null,
        logo_512: null
    };

    try {
        const [rows] = await db.execute('SELECT * FROM genel_ayarlar LIMIT 1');
        if (rows.length > 0) {
            res.locals.siteAyarlari = rows[0];
        }
        next();
    } catch (error) {
        console.error("Middleware Hatası (Ayarlar Çekilemedi):", error.message);
        next();
    }
});

app.get('/manifest.json', async (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    
    try {
        let ayar = {};
        
        try {
            const [rows] = await db.execute('SELECT * FROM genel_ayarlar LIMIT 1');
            if (rows.length > 0) ayar = rows[0];
        } catch (dbError) {
            console.error("Manifest DB Hatası:", dbError.message);
        }

        const logo192 = ayar.logo_192 ? `/uploads/${ayar.logo_192}` : "/images/default-192.png";
        const logo512 = ayar.logo_512 ? `/uploads/${ayar.logo_512}` : "/images/default-512.png";

        const manifest = {
		name: ayar.pwa_adi || ayar.tesis_adi || "netSPOR",
		short_name: ayar.pwa_adi || "netSPOR",
		start_url: "/api/auth/login",  // ⭐ Burası değişti
		display: "standalone",
		background_color: "#ffffff",
		theme_color: ayar.ana_renk || "#007bff",
		orientation: "portrait",
		scope: "/",
		icons: [
			{ src: logo192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
			{ src: logo512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
		]
	};

        return res.json(manifest);
        
    } catch (error) {
        console.error("Manifest Hatası:", error);
        return res.json({
            name: "netSPOR",
            short_name: "netSPOR",
            start_url: "/",
            display: "standalone",
            icons: []
        });
    }
});

// =====================
// ROTALAR
// =====================

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const ogrenciRoutes = require('./routes/ogrenciRoutes');
app.use('/api/ogrenci', ogrenciRoutes);
app.use('/students', ogrenciRoutes); 

const kasaRoutes = require('./routes/kasaRoutes');
app.use('/api/kasa', kasaRoutes);

const yoklamaRoutes = require('./routes/yoklamaRoutes');
app.use('/api/yoklama', yoklamaRoutes);

const dersRoutes = require('./routes/dersRoutes');
app.use('/api/ders', dersRoutes);

const ozelDersYoklamaRoutes = require('./routes/ozelDersYoklamaRoutes');
app.use('/api/ozel-ders-yoklama', ozelDersYoklamaRoutes);

app.use('/api/envanter', envanterRoutes);

const indexController = require('./controllers/indexController'); 

app.post('/api/destek/ekle', indexController.destekEkle); 

const whatsappRoutes = require('./routes/whatsappRoutes');
app.use('/api/whatsapp', whatsappRoutes);

const basvuruRoutes = require('./routes/basvuruRoutes');
app.use('/basvuru', basvuruRoutes);

const landingRoutes = require('./routes/landingRoutes');
app.use('/api/landing', landingRoutes);

const websiteRoutes = require('./routes/websiteRoutes');
app.use('/api/admin/website', websiteRoutes);

// Push Notification Route
const pushRoutes = require('./routes/pushRoutes');
app.use('/api/push', pushRoutes);

// Veli Routes
const veliRoutes = require('./routes/veliRoutes');
app.use('/veli', veliRoutes);

// =====================
// ANA SAYFA
// =====================
app.get('/', async (req, res) => {
    try {
        if (!req.session.userID) {
            
            let landingAyarlar = {};
            let sliderlar = [];
            let hakkimizda = {};
            let programlar = [];
            let egitmenler = [];
            let galeri = [];
            let yorumlar = [];

            try {
                const [r] = await db.execute('SELECT * FROM landing_ayarlar LIMIT 1');
                if (r.length > 0) landingAyarlar = r[0];
            } catch (e) { console.log('landing_ayarlar tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_slider WHERE durum = 1 ORDER BY sira');
                sliderlar = r;
            } catch (e) { console.log('landing_slider tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_hakkimizda WHERE durum = 1 LIMIT 1');
                if (r.length > 0) hakkimizda = r[0];
            } catch (e) { console.log('landing_hakkimizda tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_programlar WHERE durum = 1 ORDER BY sira');
                programlar = r;
            } catch (e) { console.log('landing_programlar tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_egitmenler WHERE durum = 1 ORDER BY sira');
                egitmenler = r;
            } catch (e) { console.log('landing_egitmenler tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_galeri WHERE durum = 1 ORDER BY sira');
                galeri = r;
            } catch (e) { console.log('landing_galeri tablosu yok'); }

            try {
                const [r] = await db.execute('SELECT * FROM landing_yorumlar WHERE onay = 1 ORDER BY sira');
                yorumlar = r;
            } catch (e) { console.log('landing_yorumlar tablosu yok'); }

            return res.render('landing.html', {
                siteAyarlari: res.locals.siteAyarlari,
                landingAyarlar,
                sliderlar,
                hakkimizda,
                programlar,
                egitmenler,
                galeri,
                yorumlar
            });
        }

        if (indexController && indexController.dashboard) {
            return await indexController.dashboard(req, res);
        }

        res.render('index.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                sube_id: req.session.subeId,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari
        });

    } catch (error) {
        console.error("ANA SAYFA RENDER HATASI:", error);
        res.status(500).send("Sunucu Hatası: " + error.message);
    }
});

// =====================
// CATCH-ALL ROUTE
// =====================
app.get('*', (req, res) => {
    if (req.url === '/manifest.json') return;

    if (!req.url.startsWith('/api') && !req.url.startsWith('/students')) {
        res.redirect('/api/auth/login');
    }
});

// =====================================================
// ⭐ WHATSAPP PLANLI MESAJ CRON JOB (setInterval ile)
// =====================================================
let waCronIsRunning = false;

async function whatsappPlanliMesajCron() {
    if (waCronIsRunning) {
        return;
    }
    
    waCronIsRunning = true;
    
    try {
        const now = new Date();
        
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const nowStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        const [bekleyenMesajlar] = await db.execute(`
            SELECT id FROM whatsapp_toplu_mesajlar 
            WHERE durum = 'bekliyor' AND planli_tarih <= ?
            ORDER BY planli_tarih ASC, created_at ASC
            LIMIT 30
        `, [nowStr]);
        
        if (bekleyenMesajlar.length === 0) {
            waCronIsRunning = false;
            return;
        }
        
        const mesajIdler = bekleyenMesajlar.map(m => m.id);
        const placeholders = mesajIdler.map(() => '?').join(',');
        
        await db.execute(
            `UPDATE whatsapp_toplu_mesajlar SET durum = 'gonderiliyor' WHERE id IN (${placeholders})`,
            mesajIdler
        );
        
        console.log(`📬 [${hours}:${minutes}:${seconds}] ${mesajIdler.length} planlı mesaj işleme alındı...`);
        
        const [mesajlar] = await db.execute(`
            SELECT * FROM whatsapp_toplu_mesajlar WHERE id IN (${placeholders})
        `, mesajIdler);
        
        let basarili = 0;
        let hatali = 0;
        
        for (const mesaj of mesajlar) {
            try {
                const [apiData] = await db.execute(
                    'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
                    [mesaj.sube_id]
                );
                
                if (apiData.length === 0) {
                    throw new Error('WhatsApp bağlantısı yok');
                }
                
                const token = apiData[0].api_key;
                
                if (mesaj.medya_url) {
                    await axios.post(`${WA_API_URL}/api/message/image`, {
                        token: token,
                        to: mesaj.telefon,
                        url: mesaj.medya_url,
                        caption: mesaj.mesaj || ''
                    }, {
                        ...axiosConfig,
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    });
                } else {
                    await axios.post(`${WA_API_URL}/api/message/text`, {
                        token: token,
                        to: mesaj.telefon,
                        text: mesaj.mesaj
                    }, {
                        ...axiosConfig,
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    });
                }
                
                await db.execute(
                    'UPDATE whatsapp_toplu_mesajlar SET durum = "gonderildi", gonderim_zamani = NOW() WHERE id = ?',
                    [mesaj.id]
                );
                
                basarili++;
                console.log(`  ✅ ${mesaj.telefon} - Gönderildi`);
                
                if (mesajlar.indexOf(mesaj) < mesajlar.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (err) {
                hatali++;
                console.error(`  ❌ ${mesaj.telefon} - Hata: ${err.message}`);
                
                await db.execute(
                    'UPDATE whatsapp_toplu_mesajlar SET durum = "hata", hata_mesaji = ? WHERE id = ?',
                    [err.message.substring(0, 500), mesaj.id]
                );
            }
        }
        
        if (basarili > 0 || hatali > 0) {
            console.log(`📊 Planlı mesaj sonuç: ${basarili} başarılı, ${hatali} hatalı`);
        }
        
    } catch (error) {
        console.error('❌ Planlı mesaj cron hatası:', error.message);
        
        try {
            await db.execute(`
                UPDATE whatsapp_toplu_mesajlar 
                SET durum = 'bekliyor' 
                WHERE durum = 'gonderiliyor' 
                AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            `);
        } catch (e) {}
        
    } finally {
        waCronIsRunning = false;
    }
}

// =====================
// SUNUCUYU BAŞLAT
// =====================
const PORT = process.env.PORT || 3000;

sistemiKontrolEtVeKur().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 netSPOR Yazılımı ${PORT} portunda çalışıyor.`);
        
        // =====================================================
        // ⭐ CRON JOBS BAŞLAT
        // =====================================================
        
        // 1. WhatsApp Planlı Mesaj Cron (her 60 saniye)
        setTimeout(() => {
            console.log('✅ WhatsApp planlı mesaj cron başlatıldı (her 60 saniye)');
            whatsappPlanliMesajCron();
        }, 5000);
        
        setInterval(() => {
            whatsappPlanliMesajCron();
        }, 60000);
        
        // 2. ⭐ Otomatik Mesaj Cron (her gün 10:00)
        cronService.startCronScheduler();
    });
});

