const db = require('../config/db');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// WhatsApp API URL
const WA_API_URL = 'https://app.netqr.tr';

// ✅ Axios default config - SSL ve timeout ayarları
const axiosConfig = {
    httpsAgent: new https.Agent({
        rejectUnauthorized: false, // SSL sertifika hatalarını görmezden gel
        keepAlive: true,
        timeout: 60000
    }),
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'netSPOR-CRM/1.0'
    }
};

// =====================================================
// TABLO OLUŞTURMA (Otomatik)
// =====================================================
const initTables = async () => {
    try {
        // 1. devices tablosu
        await db.execute(`
            CREATE TABLE IF NOT EXISTS devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sube_id INT DEFAULT NULL,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                token VARCHAR(255) NOT NULL,
                status ENUM('connected', 'connecting', 'disconnected') DEFAULT 'disconnected',
                qr_code TEXT DEFAULT NULL,
                pairing_code VARCHAR(50) DEFAULT NULL,
                webhook_url VARCHAR(500) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sube_id (sube_id),
                INDEX idx_token (token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 2. wp_api tablosu
        await db.execute(`
            CREATE TABLE IF NOT EXISTS wp_api (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sube_id INT DEFAULT NULL,
                api_key VARCHAR(255) NOT NULL,
                durum TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sube_id (sube_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 3. whatsapp_mesaj_ayarlari tablosu (Tüm alanlarla)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS whatsapp_mesaj_ayarlari (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sube_id INT NOT NULL,
                
                -- Öğrenci İşlemleri
                ogrenci_ekle_aktif TINYINT(1) DEFAULT 0, ogrenci_ekle_mesaj TEXT,
                ogrenci_duzenle_aktif TINYINT(1) DEFAULT 0, ogrenci_duzenle_mesaj TEXT,
                ogrenci_aktif_aktif TINYINT(1) DEFAULT 0, ogrenci_aktif_mesaj TEXT,
                ogrenci_pasif_aktif TINYINT(1) DEFAULT 0, ogrenci_pasif_mesaj TEXT,
                ogrenci_dondurulmus_aktif TINYINT(1) DEFAULT 0, ogrenci_dondurulmus_mesaj TEXT,
                basvuru_veli_aktif TINYINT(1) DEFAULT 0, basvuru_veli_mesaj TEXT,
                basvuru_yonetici_aktif TINYINT(1) DEFAULT 0, basvuru_yonetici_mesaj TEXT,
                basvuru_gonderme_aktif TINYINT(1) DEFAULT 0, basvuru_gonderme_mesaj TEXT,
                veli_bilgi_aktif TINYINT(1) DEFAULT 0, veli_bilgi_mesaj TEXT,
                analiz_eklendi_aktif TINYINT(1) DEFAULT 0, analiz_eklendi_mesaj TEXT,
                dogum_gunu_aktif TINYINT(1) DEFAULT 0, dogum_gunu_mesaj TEXT, dogum_gunu_saat VARCHAR(10) DEFAULT '09:00',
                
                -- Yoklama
                yoklama_katildi_aktif TINYINT(1) DEFAULT 0, yoklama_katildi_mesaj TEXT,
                yoklama_katilmadi_aktif TINYINT(1) DEFAULT 0, yoklama_katilmadi_mesaj TEXT,
                yoklama_izinli_aktif TINYINT(1) DEFAULT 0, yoklama_izinli_mesaj TEXT,
                ozel_yoklama_katildi_aktif TINYINT(1) DEFAULT 0, ozel_yoklama_katildi_mesaj TEXT,
                ozel_yoklama_katilmadi_aktif TINYINT(1) DEFAULT 0, ozel_yoklama_katilmadi_mesaj TEXT,
                ozel_yoklama_izinli_aktif TINYINT(1) DEFAULT 0, ozel_yoklama_izinli_mesaj TEXT,

                -- Ders Programı
                ders_programi_yeni_aktif TINYINT(1) DEFAULT 0, ders_programi_yeni_mesaj TEXT,
                ders_programi_iptal_aktif TINYINT(1) DEFAULT 0, ders_programi_iptal_mesaj TEXT,

                -- Satış ve Aidat
                aidat_odendi_aktif TINYINT(1) DEFAULT 0, aidat_odendi_mesaj TEXT,
                aidat_hatirlatma_aktif TINYINT(1) DEFAULT 0, aidat_hatirlatma_mesaj TEXT, aidat_hatirlatma_gun INT DEFAULT 3,
                aidat_gecmis_aktif TINYINT(1) DEFAULT 0, aidat_gecmis_mesaj TEXT,
                paket_satis_aktif TINYINT(1) DEFAULT 0, paket_satis_mesaj TEXT,
                paket_bitim_aktif TINYINT(1) DEFAULT 0, paket_bitim_mesaj TEXT, 
                paket_bitim_7gun TINYINT(1) DEFAULT 1, paket_bitim_3gun TINYINT(1) DEFAULT 1, paket_bitim_1gun TINYINT(1) DEFAULT 1,
                paket_taksit_aktif TINYINT(1) DEFAULT 0, paket_taksit_mesaj TEXT,
                paket_taksit_hatirlatma_aktif TINYINT(1) DEFAULT 0, paket_taksit_hatirlatma_mesaj TEXT,
                ozel_ders_satis_aktif TINYINT(1) DEFAULT 0, ozel_ders_satis_mesaj TEXT,
                ozel_ders_bitim_aktif TINYINT(1) DEFAULT 0, ozel_ders_bitim_mesaj TEXT,
                ozel_ders_bitim_7gun TINYINT(1) DEFAULT 1, ozel_ders_bitim_3gun TINYINT(1) DEFAULT 1, ozel_ders_bitim_1gun TINYINT(1) DEFAULT 1,
                ozel_taksit_aktif TINYINT(1) DEFAULT 0, ozel_taksit_mesaj TEXT,
                ozel_taksit_hatirlatma_aktif TINYINT(1) DEFAULT 0, ozel_taksit_hatirlatma_mesaj TEXT,

                -- Ürün Satışı ve Stok Uyarısı
                urun_satis_aktif TINYINT(1) DEFAULT 0, urun_satis_mesaj TEXT,
                urun_stok_az_aktif TINYINT(1) DEFAULT 0, urun_stok_az_mesaj TEXT,

                -- Cron Saatleri
                cron_dogum_gunu_saat VARCHAR(10) DEFAULT '09:00',
                cron_aidat_hatirlatma_saat VARCHAR(10) DEFAULT '10:00',
                cron_paket_bitim_saat VARCHAR(10) DEFAULT '10:00',
                cron_taksit_hatirlatma_saat VARCHAR(10) DEFAULT '10:00',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sube_id (sube_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('✅ WhatsApp tabloları hazır');
    } catch (error) {
        console.error('Tablo oluşturma hatası:', error.message);
    }
};

// Uygulama başlangıcında tabloları oluştur
initTables();

// =====================================================
// QR SAYFA GÖSTERİMİ
// =====================================================
exports.qrSayfasi = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        // Şubeleri çek (yönetici için dropdown)
        let subeler = [];
        if (isYonetici) {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
        }

        // URL'den şube seçilmiş mi?
        if (req.query.sube_id && isYonetici) {
            subeId = parseInt(req.query.sube_id);
        }

        // Yönetici ve şube seçilmemişse, seçim sayfası göster
        if (isYonetici && !subeId && subeler.length > 0) {
            return res.render('whatsapp-qr.html', {
                user: {
                    ad_soyad: req.session.adSoyad,
                    rol: req.session.rol,
                    sube_id: null,
                    yetkiler: req.session.yetkiler || {}
                },
                siteAyarlari: res.locals.siteAyarlari,
                device: null,
                subeler: subeler,
                secilenSubeId: null,
                subeSecimGerekli: true
            });
        }

        // Bu şubeye ait cihazı getir
        let device = null;
        if (subeId) {
            const [devices] = await db.execute(
                'SELECT * FROM devices WHERE sube_id = ? ORDER BY id DESC LIMIT 1',
                [subeId]
            );
            device = devices.length > 0 ? devices[0] : null;
        }

        // Seçilen şube adını bul
        let secilenSubeAdi = '';
        if (subeId && subeler.length > 0) {
            const sube = subeler.find(s => s.id === subeId);
            secilenSubeAdi = sube ? sube.sube_adi : '';
        }

        res.render('whatsapp-qr.html', {
            user: {
                ad_soyad: req.session.adSoyad,
                rol: req.session.rol,
                sube_id: subeId,
                yetkiler: req.session.yetkiler || {}
            },
            siteAyarlari: res.locals.siteAyarlari,
            device: device,
            subeler: subeler,
            secilenSubeId: subeId,
            secilenSubeAdi: secilenSubeAdi,
            subeSecimGerekli: false
        });

    } catch (error) {
        console.error('QR sayfa hatası:', error);
        res.status(500).send('Sunucu hatası: ' + error.message);
    }
};

// =====================================================
// CİHAZ EKLEME
// =====================================================
exports.addDevice = async (req, res) => {
    try {
        const { name, phone, sube_id } = req.body;
        const isYonetici = req.session.rol === 'yonetici';
        
        // Şube ID belirleme
        let subeId = req.session.subeId;
        if (isYonetici && sube_id) {
            subeId = parseInt(sube_id);
        }

        // Validasyon
        if (!name || !phone) {
            return res.json({ success: false, message: 'Cihaz adı ve telefon gerekli' });
        }

        if (!subeId) {
            return res.json({ success: false, message: 'Şube seçimi gerekli' });
        }

        // Telefon formatı kontrolü
        if (!phone.startsWith('90') || phone.length < 12) {
            return res.json({ success: false, message: 'Telefon numarası 90 ile başlamalı ve 12 haneli olmalıdır' });
        }

        // Bu şubede zaten cihaz var mı?
        const [existing] = await db.execute(
            'SELECT id FROM devices WHERE sube_id = ?',
            [subeId]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: 'Bu şube için zaten bir cihaz tanımlı' });
        }

        // Webhook URL oluştur
        const webhookUrl = `https://${req.get('host')}/api/whatsapp/webhook`;

        console.log(`📤 WhatsApp API'ye cihaz ekleme isteği: ${WA_API_URL}/api/device/create`);
        console.log(`📤 Payload:`, { name, phone, sube_id: subeId });

        // Node.js API'ye istek at (timeout artırıldı)
        const apiResponse = await axios.post(`${WA_API_URL}/api/device/create`, {
            name,
            phone,
            sube_id: subeId,
            webhook_url: webhookUrl
        }, {
            ...axiosConfig,
            timeout: 15000, // 8 saniyeden 15 saniyeye çıkarıldı
            validateStatus: (status) => status < 500
        });

        if (apiResponse.data.success) {
            const token = apiResponse.data.data.token;

            // Yerel veritabanına kaydet
            await db.execute(
                'INSERT INTO devices (sube_id, name, phone, token, status, webhook_url) VALUES (?, ?, ?, ?, ?, ?)',
                [subeId, name, phone, token, 'disconnected', webhookUrl]
            );

            res.json({ success: true, message: 'Cihaz başarıyla eklendi', token });
        } else {
            res.json({ success: false, message: apiResponse.data.message || 'API hatası' });
        }

    } catch (error) {
        console.error('❌ Cihaz ekleme hatası:', error.message);
        console.error('❌ Hata kodu:', error.code);
        console.error('❌ Response:', error.response?.data);
        
        // Daha açıklayıcı hata mesajı
        let errorMsg = 'Cihaz eklenirken hata';
        
        if (error.code === 'ECONNABORTED') {
            errorMsg = `WhatsApp API zaman aşımı (8 saniye içinde yanıt vermedi)`;
        } else if (error.code === 'ECONNREFUSED') {
            errorMsg = `WhatsApp API bağlantı reddedildi (${WA_API_URL} sunucusuna erişilemiyor)`;
        } else if (error.code === 'ENOTFOUND') {
            errorMsg = `DNS hatası: ${WA_API_URL} domain'i çözümlenemiyor`;
        } else if (error.code === 'ETIMEDOUT') {
            errorMsg = `Network timeout: ${WA_API_URL} sunucusuna ulaşılamıyor`;
        } else if (error.response?.status >= 500) {
            errorMsg = `WhatsApp API sunucu hatası (${error.response.status}): ${error.response.data?.message || 'Bilinmeyen hata'}`;
        } else {
            errorMsg += ': ' + error.message;
        }
        
        res.json({ 
            success: false, 
            message: errorMsg,
            debug: {
                url: WA_API_URL,
                code: error.code,
                status: error.response?.status
            }
        });
    }
};

// =====================================================
// CİHAZ BAĞLAMA (QR/CODE)
// =====================================================
exports.connectDevice = async (req, res) => {
    try {
        const { token, method } = req.body;

        if (!token) {
            return res.json({ success: false, message: 'Token gerekli' });
        }

        // API'ye bağlantı isteği gönder
        const apiResponse = await axios.post(`${WA_API_URL}/api/device/connect`, {
            token,
            method: method || 'qr'
        }, {
            ...axiosConfig,
            timeout: 5000
        });

        res.json(apiResponse.data);

    } catch (error) {
        console.error('Bağlantı hatası:', error);
        
        let errorMsg = 'Bağlantı hatası';
        if (error.code === 'ECONNABORTED') {
            errorMsg = 'WhatsApp API zaman aşımı';
        } else {
            errorMsg += ': ' + error.message;
        }
        
        res.json({ success: false, message: errorMsg });
    }
};

// =====================================================
// CİHAZ DURUMU SORGULAMA (Cache KAPALI - test için)
// =====================================================
const statusCache = new Map(); // Token -> {data, timestamp}
const CACHE_TTL = 0; // CACHE KAPALI - QR/kod gecikmesini önlemek için

exports.deviceStatus = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.json({ success: false, message: 'Token gerekli' });
        }

        // Cache kontrolü
        const cached = statusCache.get(token);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < CACHE_TTL) {
            // Cache'den döndür
            return res.json(cached.data);
        }

        // API'den durum sorgula
        const apiResponse = await axios.get(`${WA_API_URL}/api/device/status?token=${token}`, {
            ...axiosConfig,
            timeout: 3000
        });

        // Cache'e kaydet
        statusCache.set(token, {
            data: apiResponse.data,
            timestamp: now
        });

        // Eski cache'leri temizle (100'den fazla varsa)
        if (statusCache.size > 100) {
            const oldestKey = statusCache.keys().next().value;
            statusCache.delete(oldestKey);
        }

        res.json(apiResponse.data);

    } catch (error) {
        console.error('Durum sorgulama hatası:', error.message);
        res.json({ success: false, message: 'Durum sorgulanamadı' });
    }
};

// =====================================================
// DURUM GÜNCELLEME (Yerel DB)
// =====================================================
exports.updateStatus = async (req, res) => {
    try {
        const { token, status, sube_id } = req.body;
        const isYonetici = req.session.rol === 'yonetici';
        
        let subeId = req.session.subeId;
        if (isYonetici && sube_id) {
            subeId = parseInt(sube_id);
        }

        if (!token || !status) {
            return res.json({ success: false, message: 'Token ve status gerekli' });
        }

        // Token'dan şubeyi bul (yönetici için)
        if (!subeId) {
            const [deviceRows] = await db.execute('SELECT sube_id FROM devices WHERE token = ?', [token]);
            if (deviceRows.length > 0) {
                subeId = deviceRows[0].sube_id;
            }
        }

        // Devices tablosunu güncelle
        await db.execute(
            'UPDATE devices SET status = ? WHERE token = ?',
            [status, token]
        );

        // Bağlantı başarılıysa wp_api tablosunu güncelle
        if (status === 'connected' && subeId) {
            // Mevcut kayıt var mı kontrol et
            const [existing] = await db.execute(
                'SELECT id FROM wp_api WHERE sube_id = ?',
                [subeId]
            );

            if (existing.length > 0) {
                await db.execute(
                    'UPDATE wp_api SET api_key = ?, durum = 1 WHERE sube_id = ?',
                    [token, subeId]
                );
            } else {
                await db.execute(
                    'INSERT INTO wp_api (sube_id, api_key, durum) VALUES (?, ?, 1)',
                    [subeId, token]
                );
            }
        } else if (status === 'disconnected' && subeId) {
            // Bağlantı kesildiyse wp_api'yi pasife çek
            await db.execute(
                'UPDATE wp_api SET durum = 0 WHERE sube_id = ?',
                [subeId]
            );
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// ÇIKIŞ YAPMA (LOGOUT)
// =====================================================
exports.logoutDevice = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.json({ success: false, message: 'Token gerekli' });
        }

        // API'ye logout isteği gönder
        await axios.post(`${WA_API_URL}/api/device/logout`, { token }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        res.json({ success: true });

    } catch (error) {
        console.error('Logout hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// CİHAZ SİLME
// =====================================================
exports.deleteDevice = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.json({ success: false, message: 'Token gerekli' });
        }

        // Token'dan şubeyi bul
        const [deviceRows] = await db.execute('SELECT sube_id FROM devices WHERE token = ?', [token]);
        const subeId = deviceRows.length > 0 ? deviceRows[0].sube_id : null;

        // API'den cihazı sil
        try {
            await axios.delete(`${WA_API_URL}/api/device/delete`, {
                data: { token },
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000
            });
        } catch (apiError) {
            console.log('API silme hatası (önemsiz):', apiError.message);
        }

        // Yerel veritabanından sil
        await db.execute('DELETE FROM devices WHERE token = ?', [token]);

        // wp_api tablosunu güncelle
        if (subeId) {
            await db.execute(
                'UPDATE wp_api SET durum = 0, api_key = "" WHERE sube_id = ?',
                [subeId]
            );
        }

        res.json({ success: true, message: 'Cihaz silindi' });

    } catch (error) {
        console.error('Cihaz silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// WEBHOOK (WhatsApp'tan gelen bildirimler) - ESKİ
// =====================================================
exports.webhook = async (req, res) => {
    try {
        const data = req.body;
        console.log('📩 WhatsApp Webhook:', JSON.stringify(data, null, 2));

        // Webhook verilerini işle (örn: gelen mesaj, durum değişikliği vb.)
        if (data.event === 'status_change') {
            const { token, status } = data;
            if (token && status) {
                await db.execute(
                    'UPDATE devices SET status = ? WHERE token = ?',
                    [status, token]
                );
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Webhook hatası:', error);
        res.json({ success: false });
    }
};

// =====================================================
// MESAJ GÖNDERME (Helper Function)
// =====================================================
exports.sendMessage = async (subeId, phone, message) => {
    try {
        // Bu şubenin API anahtarını al
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            throw new Error('WhatsApp bağlantısı yok');
        }

        const token = apiData[0].api_key;

        // Mesaj gönder
        const response = await axios.post(`${WA_API_URL}/api/message/send`, {
            token,
            phone,
            message
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        return response.data;

    } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        throw error;
    }
};

// =====================================================
// API: AKTİF Mİ KONTROL
// =====================================================
exports.checkConnection = async (req, res) => {
    try {
        const subeId = req.session.subeId;

        const [devices] = await db.execute(
            'SELECT status FROM devices WHERE sube_id = ? LIMIT 1',
            [subeId]
        );

        const isConnected = devices.length > 0 && devices[0].status === 'connected';

        res.json({ success: true, connected: isConnected });

    } catch (error) {
        res.json({ success: false, connected: false });
    }
};

// =====================================================
// OTOMATİK MESAJLAR SAYFASI
// =====================================================
exports.otomatikMesajlarSayfasi = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        // Yönetici için şube seçimi
        let subeler = [];
        if (isYonetici) {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
            if (req.query.sube_id) subeId = parseInt(req.query.sube_id);
        }

        // Şube seçilmemişse uyarı sayfası
        if (isYonetici && !subeId) {
            return res.render('whatsapp-otomatik-mesajlar.html', {
                user: req.session,
                siteAyarlari: res.locals.siteAyarlari,
                ayarlar: null,
                subeler: subeler,
                secilenSubeId: null,
                subeSecimGerekli: true,
                isConnected: false
            });
        }

        // Cihaz durumu
        const [devices] = await db.execute('SELECT status FROM devices WHERE sube_id = ? LIMIT 1', [subeId]);
        const isConnected = devices.length > 0 && devices[0].status === 'connected';

        // Ayarları çek
        let ayarlar = {};
        const [ayarRows] = await db.execute('SELECT * FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?', [subeId]);
        
        if (ayarRows.length > 0) {
            ayarlar = ayarRows[0];
        } else {
            // Varsayılan boş ayarlar
            ayarlar = {
                cron_dogum_gunu_saat: '09:00',
                cron_aidat_hatirlatma_saat: '10:00',
                cron_paket_bitim_saat: '10:00',
                cron_taksit_hatirlatma_saat: '10:00'
            };
        }

        res.render('whatsapp-otomatik-mesajlar.html', {
            user: { ...req.session, sube_id: subeId },
            siteAyarlari: res.locals.siteAyarlari,
            ayarlar: ayarlar,
            subeler: subeler,
            secilenSubeId: subeId,
            subeSecimGerekli: false,
            isConnected: isConnected
        });

    } catch (error) {
        console.error('Sayfa hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// =====================================================
// AYARLARI KAYDET (TÜMÜNÜ KAYDET)
// =====================================================
exports.mesajAyarlariKaydet = async (req, res) => {
    try {
        const data = req.body;
        const subeId = parseInt(data.sube_id);

        if (!subeId) return res.json({ success: false, message: 'Şube ID eksik' });

        // Checkbox'lar (TÜM ALANLAR)
        const checkboxFields = [
            'ogrenci_ekle_aktif', 'ogrenci_duzenle_aktif', 'ogrenci_aktif_aktif', 'ogrenci_pasif_aktif', 'ogrenci_dondurulmus_aktif',
            'basvuru_veli_aktif', 'basvuru_yonetici_aktif', 'basvuru_gonderme_aktif', 'veli_bilgi_aktif', 'analiz_eklendi_aktif',
            'dogum_gunu_aktif', 'yoklama_katildi_aktif', 'yoklama_katilmadi_aktif', 'yoklama_izinli_aktif',
            'ozel_yoklama_katildi_aktif', 'ozel_yoklama_katilmadi_aktif', 'ozel_yoklama_izinli_aktif',
            'aidat_odendi_aktif', 'aidat_hatirlatma_aktif', 'aidat_gecmis_aktif',
            'paket_satis_aktif', 'paket_bitim_aktif', 'paket_bitim_7gun', 'paket_bitim_3gun', 'paket_bitim_1gun',
            'paket_taksit_aktif', 'paket_taksit_hatirlatma_aktif',
            'ozel_ders_satis_aktif', 'ozel_ders_bitim_aktif', 'ozel_ders_bitim_7gun', 'ozel_ders_bitim_3gun', 'ozel_ders_bitim_1gun',
            'ozel_taksit_aktif', 'ozel_taksit_hatirlatma_aktif',
            'ders_programi_yeni_aktif', 'ders_programi_iptal_aktif',
            // ÜRÜN SATIŞ VE STOK ALANLARI
            'urun_satis_aktif', 'urun_stok_az_aktif'
        ];

        // Mevcut kayıt kontrolü
        const [existing] = await db.execute('SELECT id FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?', [subeId]);

        // Verileri hazırla
        let updateData = {};
        
        checkboxFields.forEach(field => {
            updateData[field] = data[field] === 'on' ? 1 : 0;
        });

        // Metin alanları (TÜM ALANLAR)
        const textFields = [
            'ogrenci_ekle_mesaj', 'ogrenci_duzenle_mesaj', 'ogrenci_aktif_mesaj', 'ogrenci_pasif_mesaj', 'ogrenci_dondurulmus_mesaj',
            'basvuru_veli_mesaj', 'basvuru_yonetici_mesaj', 'basvuru_gonderme_mesaj', 'veli_bilgi_mesaj', 'analiz_eklendi_mesaj',
            'dogum_gunu_mesaj', 'yoklama_katildi_mesaj', 'yoklama_katilmadi_mesaj', 'yoklama_izinli_mesaj',
            'ozel_yoklama_katildi_mesaj', 'ozel_yoklama_katilmadi_mesaj', 'ozel_yoklama_izinli_mesaj',
            'aidat_odendi_mesaj', 'aidat_hatirlatma_mesaj', 'aidat_gecmis_mesaj',
            'paket_satis_mesaj', 'paket_bitim_mesaj', 'paket_taksit_mesaj', 'paket_taksit_hatirlatma_mesaj',
            'ozel_ders_satis_mesaj', 'ozel_ders_bitim_mesaj', 'ozel_taksit_mesaj', 'ozel_taksit_hatirlatma_mesaj',
            'dogum_gunu_saat', 'aidat_hatirlatma_gun', 
            'cron_dogum_gunu_saat', 'cron_aidat_hatirlatma_saat', 'cron_paket_bitim_saat', 'cron_taksit_hatirlatma_saat',
            'ders_programi_yeni_mesaj', 'ders_programi_iptal_mesaj',
            // ÜRÜN SATIŞ VE STOK MESAJLARI
            'urun_satis_mesaj', 'urun_stok_az_mesaj'
        ];

        textFields.forEach(field => {
            updateData[field] = data[field] || null;
        });

        if (existing.length > 0) {
            // UPDATE
            const setClause = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
            const values = [...Object.values(updateData), subeId];
            await db.execute(`UPDATE whatsapp_mesaj_ayarlari SET ${setClause} WHERE sube_id = ?`, values);
        } else {
            // INSERT
            const columns = ['sube_id', ...Object.keys(updateData)].join(', ');
            const placeholders = ['?', ...Object.keys(updateData).map(() => '?')].join(', ');
            const values = [subeId, ...Object.values(updateData)];
            await db.execute(`INSERT INTO whatsapp_mesaj_ayarlari (${columns}) VALUES (${placeholders})`, values);
        }

        res.json({ success: true, message: 'Ayarlar başarıyla kaydedildi' });

    } catch (error) {
        console.error('Ayarları kaydetme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// TEK BİR AYARI GÜNCELLE (Toggle için - Eski uyumluluk)
// =====================================================
exports.tekAyarGuncelle = async (req, res) => {
    try {
        const { alan, deger, sube_id } = req.body;
        const isYonetici = req.session.rol === 'yonetici';
        
        let subeId = req.session.subeId;
        if (isYonetici && sube_id) {
            subeId = parseInt(sube_id);
        }

        if (!subeId || !alan) {
            return res.json({ success: false, message: 'Geçersiz istek' });
        }

        // İzin verilen alanlar (Güvenlik)
        const izinliAlanlar = [
            'ogrenci_ekle_aktif', 'ogrenci_duzenle_aktif', 'ogrenci_aktif_aktif',
            'ogrenci_pasif_aktif', 'ogrenci_dondurulmus_aktif', 'basvuru_veli_aktif',
            'basvuru_yonetici_aktif', 'basvuru_gonderme_aktif', 'veli_bilgi_aktif',
            'analiz_eklendi_aktif', 'dogum_gunu_aktif', 'yoklama_katildi_aktif',
            'yoklama_katilmadi_aktif', 'yoklama_izinli_aktif', 'ozel_yoklama_katildi_aktif',
            'ozel_yoklama_katilmadi_aktif', 'ozel_yoklama_izinli_aktif',
            'aidat_odendi_aktif', 'aidat_hatirlatma_aktif', 'aidat_gecmis_aktif',
            'paket_satis_aktif', 'paket_bitim_aktif', 'paket_bitim_7gun', 'paket_bitim_3gun', 'paket_bitim_1gun',
            'paket_taksit_aktif', 'paket_taksit_hatirlatma_aktif',
            'ozel_ders_satis_aktif', 'ozel_ders_bitim_aktif', 'ozel_ders_bitim_7gun', 'ozel_ders_bitim_3gun', 'ozel_ders_bitim_1gun',
            'ozel_taksit_aktif', 'ozel_taksit_hatirlatma_aktif',
            'ders_programi_yeni_aktif', 'ders_programi_iptal_aktif',
            // ÜRÜN SATIŞ VE STOK
            'urun_satis_aktif', 'urun_stok_az_aktif'
        ];

        if (!izinliAlanlar.includes(alan)) {
            return res.json({ success: false, message: 'Geçersiz alan' });
        }

        const [existing] = await db.execute('SELECT id FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?', [subeId]);
        const yeniDeger = deger ? 1 : 0;

        if (existing.length > 0) {
            await db.execute(`UPDATE whatsapp_mesaj_ayarlari SET ${alan} = ? WHERE sube_id = ?`, [yeniDeger, subeId]);
        } else {
            await db.execute(`INSERT INTO whatsapp_mesaj_ayarlari (sube_id, ${alan}) VALUES (?, ?)`, [subeId, yeniDeger]);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Tek ayar güncelleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};


// =====================================================
// =====================================================
// WHATSAPP CHAT SİSTEMİ - YENİ FONKSİYONLAR
// =====================================================
// =====================================================

// =====================================================
// WEBHOOK - WhatsApp'tan Gelen Mesajlar (YENİ)
// =====================================================
exports.webhookReceive = async (req, res) => {
    try {
        const data = req.body;
        
        // Detaylı log
        console.log('📩 ===== WEBHOOK ALINDI =====');
        console.log('📩 Event:', data.event);
        console.log('📩 Sube ID:', data.sube_id);
        console.log('📩 Data Keys:', data.data ? Object.keys(data.data) : 'YOK');
        console.log('📩 Full Data:', JSON.stringify(data.data, null, 2));
        console.log('📩 ===========================');

        // Log'a kaydet (debug için)
        try {
            await db.execute(
                'INSERT INTO whatsapp_webhook_log (sube_id, event_type, payload) VALUES (?, ?, ?)',
                [data.sube_id || null, data.event || 'unknown', JSON.stringify(data)]
            );
        } catch (logErr) {
            console.log('Webhook log hatası:', logErr.message);
        }

        // Event tipine göre işle
        switch (data.event) {
            case 'message.received':
            case 'message':
            case 'messages.upsert':
                await handleIncomingMessage(data);
                break;
            case 'message.status':
            case 'message.update':
                await handleMessageStatus(data);
                break;
            case 'connection.open':
            case 'open':
                await handleConnectionOpen(data);
                break;
            case 'connection.closed':
            case 'close':
                await handleConnectionClosed(data);
                break;
            default:
                console.log('⚠️ Bilinmeyen webhook event:', data.event);
        }

        res.json({ success: true, message: 'Webhook alındı' });

    } catch (error) {
        console.error('❌ Webhook işleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// Gelen mesajı işle
async function handleIncomingMessage(data) {
    try {
        const { sube_id, data: msgData } = data;
        
        if (!sube_id || !msgData || !msgData.phone) {
            console.log('Eksik veri:', data);
            return;
        }

        // Farklı API yapılarını destekle
        const phone = msgData.phone || msgData.from || msgData.sender;
        const sender_name = msgData.sender_name || msgData.pushName || msgData.name || null;
        const profile_picture = msgData.profile_picture || msgData.profilePicture || msgData.avatar || null;
        const message_type = msgData.message_type || msgData.type || msgData.messageType || 'text';
        const message = msgData.message || msgData.text || msgData.body || msgData.caption || '';
        const message_id = msgData.message_id || msgData.messageId || msgData.id || null;
        const media_url = msgData.media_url || msgData.mediaUrl || msgData.url || msgData.image || msgData.imageUrl || null;
        const media_caption = msgData.media_caption || msgData.caption || msgData.text || null;

        console.log('📩 Gelen mesaj:', { phone, message_type, message: message?.substring(0, 30) });

        // =====================================================
        // 🔒 VELİ TELEFON KONTROLÜ - Sadece kayıtlı veliler
        // =====================================================
        const ogrenciBilgisi = await checkVeliTelefon(sube_id, phone);
        
        if (!ogrenciBilgisi) {
            console.log(`⛔ Kayıtsız numara, mesaj kaydedilmedi: ${phone}`);
            return; // Kayıtsız numaradan gelen mesajı kaydetme
        }
        
        console.log(`✅ Veli eşleşti: ${phone} -> Öğrenci: ${ogrenciBilgisi.ad_soyad} (${ogrenciBilgisi.veli_tipi})`);
        // =====================================================

        // Konuşma var mı kontrol et, yoksa oluştur
        let konusmaId;
        const [existing] = await db.execute(
            'SELECT id FROM whatsapp_konusmalar WHERE sube_id = ? AND telefon = ?',
            [sube_id, phone]
        );

        // Son mesaj metnini belirle
        let sonMesaj = message;
        if (message_type === 'image' || message_type === 'IMAGE') {
            sonMesaj = media_caption || '📷 Resim';
        } else if (message_type === 'video' || message_type === 'VIDEO') {
            sonMesaj = '🎥 Video';
        } else if (message_type === 'audio' || message_type === 'AUDIO' || message_type === 'ptt') {
            sonMesaj = '🎵 Ses';
        } else if (message_type === 'document' || message_type === 'DOCUMENT') {
            sonMesaj = '📄 Dosya';
        } else if (message_type === 'sticker' || message_type === 'STICKER') {
            sonMesaj = '🏷️ Çıkartma';
        }

        // İsim belirleme: Veritabanından gelen veli bilgisi veya WhatsApp ismi
        const displayName = ogrenciBilgisi.veli_adi || sender_name || phone;

        if (existing.length > 0) {
            konusmaId = existing[0].id;
            
            // Konuşmayı güncelle
            await db.execute(`
                UPDATE whatsapp_konusmalar SET 
                    isim = COALESCE(?, isim),
                    profil_foto = COALESCE(?, profil_foto),
                    son_mesaj = ?,
                    son_mesaj_zamani = NOW(),
                    okunmamis_sayi = okunmamis_sayi + 1,
                    durum = 'aktif',
                    ogrenci_id = COALESCE(ogrenci_id, ?),
                    veli_tipi = COALESCE(veli_tipi, ?)
                WHERE id = ?
            `, [displayName, profile_picture, sonMesaj, ogrenciBilgisi.ogrenci_id, ogrenciBilgisi.veli_tipi, konusmaId]);
        } else {
            // Yeni konuşma oluştur
            const [result] = await db.execute(`
                INSERT INTO whatsapp_konusmalar 
                (sube_id, telefon, isim, profil_foto, son_mesaj, son_mesaj_zamani, okunmamis_sayi, durum, ogrenci_id, veli_tipi)
                VALUES (?, ?, ?, ?, ?, NOW(), 1, 'aktif', ?, ?)
            `, [sube_id, phone, displayName, profile_picture, sonMesaj, ogrenciBilgisi.ogrenci_id, ogrenciBilgisi.veli_tipi]);
            
            konusmaId = result.insertId;
        }

        // Mesaj tipini normalize et
        let normalizedType = 'text';
        if (['image', 'IMAGE', 'photo'].includes(message_type)) normalizedType = 'image';
        else if (['video', 'VIDEO'].includes(message_type)) normalizedType = 'video';
        else if (['audio', 'AUDIO', 'ptt', 'voice'].includes(message_type)) normalizedType = 'audio';
        else if (['document', 'DOCUMENT', 'file'].includes(message_type)) normalizedType = 'document';
        else if (['sticker', 'STICKER'].includes(message_type)) normalizedType = 'sticker';

        // Mesajı kaydet
        await db.execute(`
            INSERT INTO whatsapp_mesajlar 
            (konusma_id, sube_id, telefon, mesaj_tipi, mesaj, medya_url, medya_caption, gonderen, whatsapp_mesaj_id, okundu)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'musteri', ?, 0)
        `, [konusmaId, sube_id, phone, normalizedType, message || sonMesaj, media_url, media_caption, message_id]);

        console.log(`✅ Mesaj kaydedildi: ${phone} -> Öğrenci: ${ogrenciBilgisi.ad_soyad}`);

    } catch (error) {
        console.error('Mesaj kaydetme hatası:', error);
    }
}

// =====================================================
// 🔍 VELİ TELEFON KONTROLÜ
// =====================================================
async function checkVeliTelefon(subeId, phone) {
    try {
        // Telefon numarasını normalize et (son 10 hane)
        const cleanPhone = phone.replace(/\D/g, '');
        const last10 = cleanPhone.slice(-10);
        
        // Farklı formatları dene
        const phoneVariants = [
            phone,
            cleanPhone,
            last10,
            '0' + last10,
            '90' + last10,
            '+90' + last10
        ];
        
        // LIKE pattern oluştur
        const likePattern = '%' + last10;

        const [rows] = await db.execute(`
            SELECT 
                o.id as ogrenci_id,
                o.ad_soyad,
                o.sube_id,
                o.ozel_veri,
                CASE 
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.baba_telefon')) LIKE ? THEN 'baba'
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.anne_telefon')) LIKE ? THEN 'anne'
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.acil_durumda_aranacak_kisi')) LIKE ? THEN 'acil'
                    ELSE NULL
                END as veli_tipi,
                CASE 
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.baba_telefon')) LIKE ? 
                        THEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.baba_ad_soyad'))
                    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.anne_telefon')) LIKE ? 
                        THEN JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.anne_ad_soyad'))
                    ELSE NULL
                END as veli_adi
            FROM ogrenciler o
            WHERE o.sube_id = ?
            AND o.durum = 'aktif'
            AND (
                JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.baba_telefon')) LIKE ? OR
                JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.anne_telefon')) LIKE ? OR
                JSON_UNQUOTE(JSON_EXTRACT(o.ozel_veri, '$.acil_durumda_aranacak_kisi')) LIKE ?
            )
            LIMIT 1
        `, [likePattern, likePattern, likePattern, likePattern, likePattern, subeId, likePattern, likePattern, likePattern]);

        if (rows.length > 0) {
            return {
                ogrenci_id: rows[0].ogrenci_id,
                ad_soyad: rows[0].ad_soyad,
                veli_tipi: rows[0].veli_tipi,
                veli_adi: rows[0].veli_adi
            };
        }

        return null; // Eşleşen öğrenci yok

    } catch (error) {
        console.error('Veli telefon kontrol hatası:', error);
        return null;
    }
}

// Mesaj durumu güncelle
async function handleMessageStatus(data) {
    try {
        const { data: statusData } = data;
        if (!statusData || !statusData.message_id) return;

        // Mesaj durumunu güncelle (opsiyonel - ileride kullanılabilir)
        console.log(`📊 Mesaj durumu: ${statusData.message_id} -> ${statusData.status}`);

    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
    }
}

// Bağlantı açıldı
async function handleConnectionOpen(data) {
    try {
        const { sube_id, device_id } = data;
        console.log(`🟢 WhatsApp bağlantısı açıldı: Şube ${sube_id}`);

        // Devices tablosunu güncelle
        if (device_id) {
            await db.execute(
                'UPDATE devices SET status = ? WHERE id = ?',
                ['connected', device_id]
            );
        }
    } catch (error) {
        console.error('Connection open hatası:', error);
    }
}

// Bağlantı kapandı
async function handleConnectionClosed(data) {
    try {
        const { sube_id, device_id } = data;
        console.log(`🔴 WhatsApp bağlantısı kapandı: Şube ${sube_id}`);

        // Devices tablosunu güncelle
        if (device_id) {
            await db.execute(
                'UPDATE devices SET status = ? WHERE id = ?',
                ['disconnected', device_id]
            );
        }
    } catch (error) {
        console.error('Connection closed hatası:', error);
    }
}

// =====================================================
// CHAT SAYFASI
// =====================================================
exports.chatSayfasi = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        // Şubeleri çek (yönetici için dropdown)
        let subeler = [];
        if (isYonetici) {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
            if (req.query.sube_id) subeId = parseInt(req.query.sube_id);
        }

        // Şube seçilmemişse
        if (isYonetici && !subeId && subeler.length > 0) {
            return res.render('whatsapp-chat.html', {
                user: { ...req.session, sube_id: null },
                siteAyarlari: res.locals.siteAyarlari,
                konusmalar: [],
                subeler: subeler,
                secilenSubeId: null,
                subeSecimGerekli: true,
                isConnected: false
            });
        }

        // Cihaz durumu
        const [devices] = await db.execute('SELECT status FROM devices WHERE sube_id = ? LIMIT 1', [subeId]);
        const isConnected = devices.length > 0 && devices[0].status === 'connected';

        // Konuşmaları çek
        const [konusmalar] = await db.execute(`
            SELECT * FROM whatsapp_konusmalar 
            WHERE sube_id = ? AND durum = 'aktif'
            ORDER BY son_mesaj_zamani DESC
        `, [subeId]);

        res.render('whatsapp-chat.html', {
            user: { ...req.session, sube_id: subeId },
            siteAyarlari: res.locals.siteAyarlari,
            konusmalar: konusmalar,
            subeler: subeler,
            secilenSubeId: subeId,
            subeSecimGerekli: false,
            isConnected: isConnected
        });

    } catch (error) {
        console.error('Chat sayfa hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// =====================================================
// CHAT DETAY (Mesajlar)
// =====================================================
exports.chatDetay = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.query.sube_id) {
            subeId = parseInt(req.query.sube_id);
        }

        // Konuşmayı getir
        const [konusmalar] = await db.execute(
            'SELECT * FROM whatsapp_konusmalar WHERE id = ? AND sube_id = ?',
            [konusmaId, subeId]
        );

        if (konusmalar.length === 0) {
            return res.status(404).send('Konuşma bulunamadı');
        }

        const konusma = konusmalar[0];

        // Mesajları getir
        const [mesajlar] = await db.execute(`
            SELECT * FROM whatsapp_mesajlar 
            WHERE konusma_id = ?
            ORDER BY created_at ASC
        `, [konusmaId]);

        // Okunmamış mesajları okundu olarak işaretle
        await db.execute(
            'UPDATE whatsapp_mesajlar SET okundu = 1 WHERE konusma_id = ? AND gonderen = "musteri"',
            [konusmaId]
        );
        await db.execute(
            'UPDATE whatsapp_konusmalar SET okunmamis_sayi = 0 WHERE id = ?',
            [konusmaId]
        );

        // Cihaz durumu
        const [devices] = await db.execute('SELECT status FROM devices WHERE sube_id = ? LIMIT 1', [subeId]);
        const isConnected = devices.length > 0 && devices[0].status === 'connected';

        // Şubeler (yönetici için)
        let subeler = [];
        if (isYonetici) {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
        }

        res.render('whatsapp-chat-detay.html', {
            user: { ...req.session, sube_id: subeId },
            siteAyarlari: res.locals.siteAyarlari,
            konusma: konusma,
            mesajlar: mesajlar,
            subeler: subeler,
            secilenSubeId: subeId,
            isConnected: isConnected
        });

    } catch (error) {
        console.error('Chat detay hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// =====================================================
// MESAJ GÖNDER (Panel'den)
// =====================================================
exports.chatMesajGonder = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        const { mesaj } = req.body;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        if (!mesaj || !mesaj.trim()) {
            return res.json({ success: false, message: 'Mesaj boş olamaz' });
        }

        // Konuşmayı getir
        const [konusmalar] = await db.execute(
            'SELECT * FROM whatsapp_konusmalar WHERE id = ? AND sube_id = ?',
            [konusmaId, subeId]
        );

        if (konusmalar.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı' });
        }

        const konusma = konusmalar[0];

        // WhatsApp API'ye mesaj gönder
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            return res.json({ success: false, message: 'WhatsApp bağlantısı yok' });
        }

        const token = apiData[0].api_key;

        // API'ye gönder
        const apiResponse = await axios.post(`${WA_API_URL}/api/message/text`, {
            token: token,
            to: konusma.telefon,
            text: mesaj
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (apiResponse.data.success) {
            // Mesajı veritabanına kaydet
            await db.execute(`
                INSERT INTO whatsapp_mesajlar 
                (konusma_id, sube_id, telefon, mesaj_tipi, mesaj, gonderen, okundu)
                VALUES (?, ?, ?, 'text', ?, 'sistem', 1)
            `, [konusmaId, subeId, konusma.telefon, mesaj]);

            // Konuşmayı güncelle
            await db.execute(`
                UPDATE whatsapp_konusmalar SET 
                    son_mesaj = ?,
                    son_mesaj_zamani = NOW()
                WHERE id = ?
            `, [mesaj, konusmaId]);

            res.json({ success: true, message: 'Mesaj gönderildi' });
        } else {
            res.json({ success: false, message: apiResponse.data.message || 'Mesaj gönderilemedi' });
        }

    } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// YENİ MESAJLARI KONTROL ET (Polling)
// =====================================================
exports.chatCheckUpdates = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.query.sube_id) {
            subeId = parseInt(req.query.sube_id);
        }

        // Tüm aktif konuşmaları getir
        const [konusmalar] = await db.execute(`
            SELECT id, telefon, isim, son_mesaj, son_mesaj_zamani, okunmamis_sayi, grup, tutturuldu, profil_foto
            FROM whatsapp_konusmalar 
            WHERE sube_id = ? AND durum = 'aktif'
            ORDER BY tutturuldu DESC, son_mesaj_zamani DESC
        `, [subeId]);

        res.json({
            success: true,
            conversations: konusmalar,
            serverTime: Date.now()
        });

    } catch (error) {
        console.error('Check updates hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// KONUŞMA ARŞİVLE
// =====================================================
exports.chatArsivle = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        await db.execute(
            'UPDATE whatsapp_konusmalar SET durum = "arsivlendi" WHERE id = ? AND sube_id = ?',
            [konusmaId, subeId]
        );

        res.json({ success: true, message: 'Konuşma arşivlendi' });

    } catch (error) {
        console.error('Arşivleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// KONUŞMA DETAY MESAJLARI (AJAX) + OKUNDU İŞARETLE
// =====================================================
exports.chatMesajlariGetir = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.query.sube_id) {
            subeId = parseInt(req.query.sube_id);
        }

        // Mesajları okundu olarak işaretle
        await db.execute('UPDATE whatsapp_mesajlar SET okundu = 1 WHERE konusma_id = ? AND gonderen = "musteri"', [konusmaId]);
        await db.execute('UPDATE whatsapp_konusmalar SET okunmamis_sayi = 0 WHERE id = ?', [konusmaId]);

        const [mesajlar] = await db.execute(`
            SELECT * FROM whatsapp_mesajlar 
            WHERE konusma_id = ? AND sube_id = ?
            ORDER BY created_at ASC
        `, [konusmaId, subeId]);

        res.json({ success: true, mesajlar: mesajlar });

    } catch (error) {
        console.error('Mesajlar getirme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// GRUP GÜNCELLE (Aktif/Düşünceli/Pasif)
// =====================================================
exports.chatGrupGuncelle = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        const { grup } = req.body;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        // Geçerli grup değerleri
        const gecerliGruplar = ['aktif', 'dusunceli', 'pasif', null];
        if (!gecerliGruplar.includes(grup)) {
            return res.json({ success: false, message: 'Geçersiz grup' });
        }

        await db.execute(
            'UPDATE whatsapp_konusmalar SET grup = ? WHERE id = ? AND sube_id = ?',
            [grup, konusmaId, subeId]
        );

        res.json({ success: true, message: 'Grup güncellendi' });

    } catch (error) {
        console.error('Grup güncelleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// BAŞA TUTTUR / KALDIR
// =====================================================
exports.chatTuttur = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        const { tuttur } = req.body;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        await db.execute(
            'UPDATE whatsapp_konusmalar SET tutturuldu = ? WHERE id = ? AND sube_id = ?',
            [tuttur ? 1 : 0, konusmaId, subeId]
        );

        res.json({ success: true, message: tuttur ? 'Başa tutturuldu' : 'Tutturma kaldırıldı' });

    } catch (error) {
        console.error('Tutturma hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// YENİ KİŞİ KAYDET
// =====================================================
exports.chatKisiKaydet = async (req, res) => {
    try {
        const { telefon, isim } = req.body;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        if (!telefon) {
            return res.json({ success: false, message: 'Telefon numarası gerekli' });
        }

        // Telefon formatı
        let phone = telefon.toString().replace(/\D/g, '');
        if (phone.length === 10 && ['5', '8', '2', '3', '4'].includes(phone[0])) {
            phone = '90' + phone;
        } else if (phone.length === 11 && phone[0] === '0') {
            phone = '90' + phone.substring(1);
        }

        // Zaten var mı?
        const [existing] = await db.execute(
            'SELECT id FROM whatsapp_konusmalar WHERE sube_id = ? AND telefon = ?',
            [subeId, phone]
        );

        if (existing.length > 0) {
            // İsmi güncelle
            if (isim) {
                await db.execute(
                    'UPDATE whatsapp_konusmalar SET isim = ? WHERE id = ?',
                    [isim, existing[0].id]
                );
            }
            return res.json({ success: true, message: 'Kişi zaten mevcut', konusma_id: existing[0].id });
        }

        // Yeni kayıt
        const [result] = await db.execute(`
            INSERT INTO whatsapp_konusmalar 
            (sube_id, telefon, isim, durum, okunmamis_sayi)
            VALUES (?, ?, ?, 'aktif', 0)
        `, [subeId, phone, isim || phone]);

        res.json({ success: true, message: 'Kişi kaydedildi', konusma_id: result.insertId });

    } catch (error) {
        console.error('Kişi kaydetme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// RESİM GÖNDER (Base64 -> Dosya -> URL)
// =====================================================
exports.chatResimGonder = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        const { resim, caption } = req.body; // base64 resim
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        if (!resim) {
            return res.json({ success: false, message: 'Resim gerekli' });
        }

        // Konuşmayı getir
        const [konusmalar] = await db.execute(
            'SELECT * FROM whatsapp_konusmalar WHERE id = ? AND sube_id = ?',
            [konusmaId, subeId]
        );

        if (konusmalar.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı' });
        }

        const konusma = konusmalar[0];

        // WhatsApp API token al
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            return res.json({ success: false, message: 'WhatsApp bağlantısı yok' });
        }

        const token = apiData[0].api_key;

        // Base64'ü dosyaya kaydet
        let imageUrl = '';
        try {
            // Base64 header'ı ayır
            const matches = resim.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) {
                return res.json({ success: false, message: 'Geçersiz resim formatı' });
            }
            
            const ext = matches[1]; // jpg, png, gif vs.
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Dosya adı oluştur
            const fileName = `wa_${subeId}_${Date.now()}.${ext}`;
            
            // Uploads klasörü kontrol et / oluştur
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'whatsapp');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            // Dosyayı kaydet
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, buffer);
            
            // URL oluştur (sunucu adresi ile)
            imageUrl = `https://spor.netqr.tr/uploads/whatsapp/${fileName}`;
            
            console.log('📷 Resim kaydedildi:', filePath);
            console.log('🔗 Resim URL:', imageUrl);
            
        } catch (fileError) {
            console.error('Dosya kaydetme hatası:', fileError);
            return res.json({ success: false, message: 'Resim kaydedilemedi: ' + fileError.message });
        }

        // API'ye URL ile gönder
        let apiResponse;
        try {
            apiResponse = await axios.post(`${WA_API_URL}/api/message/image`, {
                token: token,
                to: konusma.telefon,
                url: imageUrl,
                caption: caption || ''
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });
        } catch (apiError) {
            console.error('WhatsApp API Hatası:', apiError.response?.data || apiError.message);
            return res.json({ 
                success: false, 
                message: 'WhatsApp API hatası: ' + (apiError.response?.data?.message || apiError.message) 
            });
        }

        if (apiResponse.data.success) {
            // Mesajı veritabanına kaydet
            await db.execute(`
                INSERT INTO whatsapp_mesajlar 
                (konusma_id, sube_id, telefon, mesaj_tipi, mesaj, medya_url, gonderen, okundu)
                VALUES (?, ?, ?, 'image', ?, ?, 'sistem', 1)
            `, [konusmaId, subeId, konusma.telefon, caption || '[Resim]', imageUrl]);

            // Konuşmayı güncelle
            await db.execute(`
                UPDATE whatsapp_konusmalar SET 
                    son_mesaj = ?,
                    son_mesaj_zamani = NOW()
                WHERE id = ?
            `, [caption || '📷 Resim', konusmaId]);

            res.json({ success: true, message: 'Resim gönderildi' });
        } else {
            res.json({ success: false, message: apiResponse.data.message || 'Resim gönderilemedi' });
        }

    } catch (error) {
        console.error('Resim gönderme hatası:', error);
        res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
};

// =====================================================
// ARŞİVLENMİŞ KONUŞMALARI GETİR
// =====================================================
exports.chatArsivListesi = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.query.sube_id) {
            subeId = parseInt(req.query.sube_id);
        }

        const [arsivler] = await db.execute(`
            SELECT * FROM whatsapp_konusmalar 
            WHERE sube_id = ? AND durum = 'arsivlendi'
            ORDER BY son_mesaj_zamani DESC
        `, [subeId]);

        res.json({ success: true, arsivler: arsivler });

    } catch (error) {
        console.error('Arşiv listesi hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// ARŞİVDEN ÇIKAR
// =====================================================
exports.chatArsivdenCikar = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        await db.execute(
            'UPDATE whatsapp_konusmalar SET durum = "aktif" WHERE id = ? AND sube_id = ?',
            [konusmaId, subeId]
        );

        res.json({ success: true, message: 'Arşivden çıkarıldı' });

    } catch (error) {
        console.error('Arşivden çıkarma hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// KİŞİ İSİM GÜNCELLE
// =====================================================
exports.chatIsimGuncelle = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        const { isim } = req.body;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        await db.execute(
            'UPDATE whatsapp_konusmalar SET isim = ? WHERE id = ? AND sube_id = ?',
            [isim, konusmaId, subeId]
        );

        res.json({ success: true, message: 'İsim güncellendi' });

    } catch (error) {
        console.error('İsim güncelleme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// SOHBET SİL
// =====================================================
exports.chatSil = async (req, res) => {
    try {
        const konusmaId = req.params.id;
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        if (isYonetici && req.body.sube_id) {
            subeId = parseInt(req.body.sube_id);
        }

        // Önce mesajları sil
        await db.execute('DELETE FROM whatsapp_mesajlar WHERE konusma_id = ? AND sube_id = ?', [konusmaId, subeId]);

        // Sonra konuşmayı sil
        await db.execute('DELETE FROM whatsapp_konusmalar WHERE id = ? AND sube_id = ?', [konusmaId, subeId]);

        res.json({ success: true, message: 'Sohbet silindi' });

    } catch (error) {
        console.error('Sohbet silme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// EVRENSEL TELEFON NUMARASI NORMALİZASYONU
// =====================================================
function normalizePhoneNumber(telefon) {
    if (!telefon) return null;
    
    // Tüm non-digit karakterleri temizle
    let phone = telefon.toString().replace(/[^\d]/g, '');
    
    // Boşsa veya çok kısaysa null döndür
    if (!phone || phone.length < 7) return null;
    
    // Eğer 00 ile başlıyorsa, 00'ı kaldır (uluslararası format)
    if (phone.startsWith('00')) {
        phone = phone.substring(2);
    }
    
    // Türkiye numarası kontrolü (opsiyonel 90 ekleme)
    if (phone.length === 10 && ['5'].includes(phone[0])) {
        phone = '90' + phone;
    }
    else if (phone.length === 11 && phone[0] === '0') {
        phone = '90' + phone.substring(1);
    }
    
    // Minimum ve maksimum uzunluk kontrolü
    if (phone.length < 10 || phone.length > 15) {
        return null;
    }
    
    return phone;
}

// =====================================================
// HELPER: Site Adresini Veritabanından Al (DİNAMİK)
// =====================================================
async function getSiteAdresi() {
    try {
        const [ayarlar] = await db.execute('SELECT site_adresi FROM genel_ayarlar LIMIT 1');
        let url = ayarlar.length > 0 && ayarlar[0].site_adresi ? ayarlar[0].site_adresi : 'https://localhost';
        return url.replace(/\/$/, '');
    } catch (error) {
        console.error('Site adresi alınamadı:', error.message);
        return 'https://localhost';
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
async function saveBase64Image(base64Data, subeId) {
    try {
        const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) return null;
        
        const ext = matches[1];
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');
        
        const fileName = `toplu_${subeId}_${Date.now()}.${ext}`;
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'whatsapp');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, buffer);
        
        const siteAdresi = await getSiteAdresi();
        
        return `${siteAdresi}/uploads/whatsapp/${fileName}`;
    } catch (error) {
        console.error('Resim kaydetme hatası:', error);
        return null;
    }
}

async function sendImageMessage(subeId, telefon, imageUrl, caption) {
    const [apiData] = await db.execute(
        'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
        [subeId]
    );
    
    if (apiData.length === 0) {
        throw new Error('WhatsApp bağlantısı yok');
    }
    
    const token = apiData[0].api_key;
    
    await axios.post(`${WA_API_URL}/api/message/image`, {
        token: token,
        to: telefon,
        url: imageUrl,
        caption: caption || ''
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanOldMedia() {
    const mediaDir = path.join(__dirname, '..', 'public', 'uploads', 'whatsapp');
    if (!fs.existsSync(mediaDir)) return;
    
    const now = Date.now();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    
    try {
        const files = fs.readdirSync(mediaDir);
        let deletedCount = 0;
        
        files.forEach(file => {
            if (file.startsWith('toplu_') || file.startsWith('wa_')) {
                const filePath = path.join(mediaDir, file);
                const stat = fs.statSync(filePath);
                const fileAge = now - stat.mtimeMs;
                
                if (fileAge > tenDaysMs) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
        });
        
        if (deletedCount > 0) {
            console.log(`🗑️ ${deletedCount} eski WhatsApp medya dosyası silindi.`);
        }
    } catch (e) {
        console.log('Medya temizleme hatası:', e.message);
    }
}

// =====================================================
// TOPLU İŞLEMLER SAYFASI
// =====================================================
exports.topluIslemlerSayfasi = async (req, res) => {
    try {
        let subeId = req.session.subeId;
        const isYonetici = req.session.rol === 'yonetici';

        // Şubeleri çek
        let subeler = [];
        if (isYonetici) {
            const [subeRows] = await db.execute('SELECT id, sube_adi FROM subeler ORDER BY sube_adi');
            subeler = subeRows;
            if (req.query.sube_id) subeId = parseInt(req.query.sube_id);
        }

        // Şube seçilmemişse
        if (!subeId && subeler.length > 0) {
            subeId = subeler[0].id;
        }

        // Eski medya dosyalarını temizle
        cleanOldMedia();

        // Cihaz durumu
        const [devices] = await db.execute('SELECT status FROM devices WHERE sube_id = ? LIMIT 1', [subeId]);
        const isConnected = devices.length > 0 && devices[0].status === 'connected';

        // Branşlar
        const [branslar] = await db.execute(
            'SELECT id, brans_adi FROM branslar WHERE sube_id = ? ORDER BY brans_adi',
            [subeId]
        );

        // Gruplar
        const [gruplar] = await db.execute(`
            SELECT g.id, g.grup_adi, g.brans_id,
                (SELECT COUNT(*) FROM ogrenciler WHERE grup_id = g.id AND durum = 'aktif') as ogrenci_sayisi
            FROM gruplar g
            JOIN branslar b ON g.brans_id = b.id
            WHERE b.sube_id = ?
            ORDER BY g.grup_adi
        `, [subeId]);

        // İstatistikler
        const bugun = new Date().toISOString().split('T')[0];
        const haftaBasi = new Date();
        haftaBasi.setDate(haftaBasi.getDate() - haftaBasi.getDay());
        const ayBasi = new Date();
        ayBasi.setDate(1);

        let stats = { bugun: 0, buHafta: 0, buAy: 0, basarili: 0, hatali: 0, toplam: 0 };
        let mesajlar = [];

        try {
            const [bugunkuMesajlar] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ? AND DATE(created_at) = ?',
                [subeId, bugun]
            );

            const [haftaninMesajlari] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ? AND created_at >= ?',
                [subeId, haftaBasi.toISOString().split('T')[0]]
            );

            const [ayinMesajlari] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ? AND created_at >= ?',
                [subeId, ayBasi.toISOString().split('T')[0]]
            );

            const [basariliMesajlar] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ? AND durum = "gonderildi"',
                [subeId]
            );

            const [hataliMesajlar] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ? AND durum = "hata"',
                [subeId]
            );

            const [toplamMesajlar] = await db.execute(
                'SELECT COUNT(*) as sayi FROM whatsapp_toplu_mesajlar WHERE sube_id = ?',
                [subeId]
            );

            stats = {
                bugun: bugunkuMesajlar[0].sayi,
                buHafta: haftaninMesajlari[0].sayi,
                buAy: ayinMesajlari[0].sayi,
                basarili: basariliMesajlar[0].sayi,
                hatali: hataliMesajlar[0].sayi,
                toplam: toplamMesajlar[0].sayi
            };

            const [sonMesajlar] = await db.execute(`
                SELECT * FROM whatsapp_toplu_mesajlar 
                WHERE sube_id = ?
                ORDER BY created_at DESC
                LIMIT 25
            `, [subeId]);
            
            mesajlar = sonMesajlar;

        } catch (dbError) {
            console.log('Toplu mesaj tablosu henüz oluşmamış:', dbError.message);
        }

        res.render('whatsapp-toplu-islemler.html', {
            user: { ...req.session, sube_id: subeId },
            siteAyarlari: res.locals.siteAyarlari,
            subeler: subeler,
            secilenSubeId: subeId,
            isConnected: isConnected,
            branslar: branslar,
            gruplar: gruplar,
            stats: stats,
            mesajlar: mesajlar
        });

    } catch (error) {
        console.error('Toplu işlemler sayfa hatası:', error);
        res.status(500).send('Hata: ' + error.message);
    }
};

// =====================================================
// MANUEL MESAJ GÖNDER (EVRENSEL TELEFON DESTEĞİ)
// =====================================================
exports.manuelMesajGonder = async (req, res) => {
    try {
        const { sube_id, telefonlar, mesaj, resim, planli, planli_tarih } = req.body;
        
        let subeId = sube_id || req.session.subeId;
        
        if (!telefonlar || telefonlar.length === 0) {
            return res.json({ success: false, message: 'Telefon listesi boş' });
        }
        
        if (!mesaj && !resim) {
            return res.json({ success: false, message: 'Mesaj veya resim gerekli' });
        }

        // Telefonları normalize et
        const normalizedPhones = [];
        const invalidPhones = [];
        
        for (const tel of telefonlar) {
            const normalized = normalizePhoneNumber(tel);
            if (normalized) {
                normalizedPhones.push(normalized);
            } else {
                invalidPhones.push(tel);
            }
        }
        
        if (normalizedPhones.length === 0) {
            return res.json({ success: false, message: 'Geçerli telefon numarası bulunamadı' });
        }

        let medyaUrl = null;
        if (resim) {
            medyaUrl = await saveBase64Image(resim, subeId);
        }

        // Planlı gönderim
        if (planli && planli_tarih) {
            for (const telefon of normalizedPhones) {
                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, tip, mesaj, medya_url, durum, planli_tarih)
                    VALUES (?, ?, 'manuel', ?, ?, 'bekliyor', ?)
                `, [subeId, telefon, mesaj, medyaUrl, planli_tarih]);
            }
            
            let responseMsg = `${normalizedPhones.length} mesaj ${planli_tarih} tarihinde gönderilmek üzere planlandı`;
            if (invalidPhones.length > 0) {
                responseMsg += `. ${invalidPhones.length} geçersiz numara atlandı`;
            }
            
            return res.json({ success: true, message: responseMsg });
        }

        // Anlık gönderim - API token al
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            return res.json({ success: false, message: 'WhatsApp bağlantısı yok' });
        }

        const token = apiData[0].api_key;
        let basarili = 0;
        let hatali = 0;

        for (const telefon of normalizedPhones) {
            try {
                if (medyaUrl) {
                    await sendImageMessage(subeId, telefon, medyaUrl, mesaj);
                } else {
                    await axios.post(`${WA_API_URL}/api/message/text`, {
                        token: token,
                        to: telefon,
                        text: mesaj
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    });
                }

                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, tip, mesaj, medya_url, durum)
                    VALUES (?, ?, 'manuel', ?, ?, 'gonderildi')
                `, [subeId, telefon, mesaj, medyaUrl]);

                basarili++;
                
                if (normalizedPhones.indexOf(telefon) < normalizedPhones.length - 1) {
                    await sleep(2000);
                }

            } catch (err) {
                console.error(`Mesaj hatası (${telefon}):`, err.message);
                
                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, tip, mesaj, medya_url, durum, hata_mesaji)
                    VALUES (?, ?, 'manuel', ?, ?, 'hata', ?)
                `, [subeId, telefon, mesaj, medyaUrl, err.message]);

                hatali++;
            }
        }

        let responseMsg = `${basarili} başarılı, ${hatali} hatalı mesaj gönderildi`;
        if (invalidPhones.length > 0) {
            responseMsg += `. ${invalidPhones.length} geçersiz numara atlandı`;
        }

        res.json({ success: true, message: responseMsg });

    } catch (error) {
        console.error('Manuel mesaj gönderme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// TOPLU MESAJ GÖNDER (BRANŞ/GRUP)
// =====================================================
exports.topluMesajGonder = async (req, res) => {
    try {
        const { sube_id, gruplar, mesaj, resim, planli, planli_tarih } = req.body;
        
        let subeId = sube_id || req.session.subeId;
        
        if (!gruplar || gruplar.length === 0) {
            return res.json({ success: false, message: 'Grup seçilmedi' });
        }
        
        if (!mesaj && !resim) {
            return res.json({ success: false, message: 'Mesaj veya resim gerekli' });
        }

        const placeholders = gruplar.map(() => '?').join(',');
        const [ogrenciler] = await db.execute(`
            SELECT id, ad_soyad, ozel_veri 
            FROM ogrenciler 
            WHERE grup_id IN (${placeholders}) AND durum = 'aktif'
        `, gruplar);

        if (ogrenciler.length === 0) {
            return res.json({ success: false, message: 'Seçili gruplarda aktif öğrenci yok' });
        }

        let telefonlar = [];
        
        for (const ogrenci of ogrenciler) {
            const ozelVeri = ogrenci.ozel_veri ? JSON.parse(ogrenci.ozel_veri) : {};
            
            const telefonAlanlari = ['baba_telefon', 'anne_telefon', 'acil_durumda_aranacak_kisi'];
            
            telefonAlanlari.forEach(alan => {
                let telefon = ozelVeri[alan];
                if (telefon) {
                    const normalized = normalizePhoneNumber(telefon);
                    
                    if (normalized && !telefonlar.find(t => t.telefon === normalized)) {
                        telefonlar.push({
                            telefon: normalized,
                            ogrenci_id: ogrenci.id,
                            ogrenci_adi: ogrenci.ad_soyad
                        });
                    }
                }
            });
        }

        if (telefonlar.length === 0) {
            return res.json({ success: false, message: 'Geçerli telefon numarası bulunamadı' });
        }

        let medyaUrl = null;
        if (resim) {
            medyaUrl = await saveBase64Image(resim, subeId);
        }

        // Planlı gönderim
        if (planli && planli_tarih) {
            for (const item of telefonlar) {
                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, ogrenci_id, ogrenci_adi, tip, mesaj, medya_url, durum, planli_tarih)
                    VALUES (?, ?, ?, ?, 'toplu', ?, ?, 'bekliyor', ?)
                `, [subeId, item.telefon, item.ogrenci_id, item.ogrenci_adi, mesaj, medyaUrl, planli_tarih]);
            }
            
            return res.json({ 
                success: true, 
                message: `${telefonlar.length} mesaj ${planli_tarih} tarihinde gönderilmek üzere planlandı`
            });
        }

        // Anlık gönderim - API token al
        const [apiData] = await db.execute(
            'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
            [subeId]
        );

        if (apiData.length === 0) {
            return res.json({ success: false, message: 'WhatsApp bağlantısı yok' });
        }

        const token = apiData[0].api_key;
        let basarili = 0;
        let hatali = 0;

        for (const item of telefonlar) {
            try {
                if (medyaUrl) {
                    await sendImageMessage(subeId, item.telefon, medyaUrl, mesaj);
                } else {
                    await axios.post(`${WA_API_URL}/api/message/text`, {
                        token: token,
                        to: item.telefon,
                        text: mesaj
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    });
                }

                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, ogrenci_id, ogrenci_adi, tip, mesaj, medya_url, durum)
                    VALUES (?, ?, ?, ?, 'toplu', ?, ?, 'gonderildi')
                `, [subeId, item.telefon, item.ogrenci_id, item.ogrenci_adi, mesaj, medyaUrl]);

                basarili++;
                
                if (telefonlar.indexOf(item) < telefonlar.length - 1) {
                    await sleep(2000);
                }

            } catch (err) {
                console.error(`Toplu mesaj hatası (${item.telefon}):`, err.message);
                
                await db.execute(`
                    INSERT INTO whatsapp_toplu_mesajlar 
                    (sube_id, telefon, ogrenci_id, ogrenci_adi, tip, mesaj, medya_url, durum, hata_mesaji)
                    VALUES (?, ?, ?, ?, 'toplu', ?, ?, 'hata', ?)
                `, [subeId, item.telefon, item.ogrenci_id, item.ogrenci_adi, mesaj, medyaUrl, err.message]);

                hatali++;
            }
        }

        res.json({ 
            success: true, 
            message: `${basarili} başarılı, ${hatali} hatalı mesaj gönderildi`
        });

    } catch (error) {
        console.error('Toplu mesaj gönderme hatası:', error);
        res.json({ success: false, message: error.message });
    }
};

// =====================================================
// PLANLI GÖNDERİM CRON JOB (Duplicate önlemeli)
// =====================================================
let cronIsRunning = false;

async function checkPlanliMesajlar() {
    // Eğer zaten çalışıyorsa, atla
    if (cronIsRunning) {
        console.log('⚠️ Planlı mesaj işlemi zaten çalışıyor, atlanıyor...');
        return;
    }
    
    cronIsRunning = true;
    
    try {
        const now = new Date();
        
        // MySQL formatında tarih
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const nowStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        // 1. Gönderilecek mesajları seç (sadece ID'leri - max 30 adet)
        const [bekleyenMesajlar] = await db.execute(`
            SELECT id FROM whatsapp_toplu_mesajlar 
            WHERE durum = 'bekliyor' AND planli_tarih <= ?
            ORDER BY planli_tarih ASC, created_at ASC
            LIMIT 30
        `, [nowStr]);
        
        if (bekleyenMesajlar.length === 0) {
            cronIsRunning = false;
            return;
        }
        
        const mesajIdler = bekleyenMesajlar.map(m => m.id);
        const placeholders = mesajIdler.map(() => '?').join(',');
        
        // 2. Seçilen mesajları "gonderiliyor" yap
        await db.execute(
            `UPDATE whatsapp_toplu_mesajlar SET durum = 'gonderiliyor' WHERE id IN (${placeholders})`,
            mesajIdler
        );
        
        console.log(`📬 [${hours}:${minutes}:${seconds}] ${mesajIdler.length} planlı mesaj işleme alındı...`);
        
        // 3. Mesaj detaylarını çek
        const [mesajlar] = await db.execute(`
            SELECT * FROM whatsapp_toplu_mesajlar WHERE id IN (${placeholders})
        `, mesajIdler);
        
        let basarili = 0;
        let hatali = 0;
        
        // 4. Mesajları gönder
        for (const mesaj of mesajlar) {
            try {
                // API token al
                const [apiData] = await db.execute(
                    'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1',
                    [mesaj.sube_id]
                );
                
                if (apiData.length === 0) {
                    throw new Error('WhatsApp bağlantısı yok');
                }
                
                const token = apiData[0].api_key;
                
                if (mesaj.medya_url) {
                    await sendImageMessage(mesaj.sube_id, mesaj.telefon, mesaj.medya_url, mesaj.mesaj);
                } else {
                    await axios.post(`${WA_API_URL}/api/message/text`, {
                        token: token,
                        to: mesaj.telefon,
                        text: mesaj.mesaj
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    });
                }
                
                // Başarılı
                await db.execute(
                    'UPDATE whatsapp_toplu_mesajlar SET durum = "gonderildi", gonderim_zamani = NOW() WHERE id = ?',
                    [mesaj.id]
                );
                
                basarili++;
                console.log(`  ✅ ${mesaj.telefon} - Gönderildi`);
                
                // Sonraki mesaj için 2 saniye bekle
                if (mesajlar.indexOf(mesaj) < mesajlar.length - 1) {
                    await sleep(2000);
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
        
        // Takılı kalmış mesajları düzelt
        try {
            await db.execute(`
                UPDATE whatsapp_toplu_mesajlar 
                SET durum = 'bekliyor' 
                WHERE durum = 'gonderiliyor' 
                AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            `);
        } catch (e) {}
        
    } finally {
        cronIsRunning = false;
    }
}

// Export cron fonksiyonu
module.exports.checkPlanliMesajlar = checkPlanliMesajlar;