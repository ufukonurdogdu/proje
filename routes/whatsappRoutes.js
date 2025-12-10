const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const whatsappService = require('../services/whatsappService');
const cronService = require('../services/cronService'); // ⭐ EKLENDI
const db = require('../config/db');

// Middleware: Oturum kontrolü
const authCheck = (req, res, next) => {
    if (!req.session.userID) {
        return res.redirect('/api/auth/login');
    }
    next();
};

// Middleware: Yönetici kontrolü
const adminCheck = (req, res, next) => {
    if (req.session.rol !== 'yonetici') {
        return res.status(403).send('Bu sayfaya erişim yetkiniz yok');
    }
    next();
};

// =====================================================
// ⚠️ WEBHOOK - AUTH GEREKTİRMEZ (EN ÜSTTE!)
// =====================================================
router.post('/webhook', whatsappController.webhookReceive);

router.get('/webhook-test', (req, res) => {
    res.json({ success: true, message: 'Webhook route çalışıyor!' });
});

// =====================================================
// SAYFA ROTALARI
// =====================================================

// QR Bağlantı Sayfası
router.get('/qr', authCheck, adminCheck, whatsappController.qrSayfasi);

// Otomatik Mesajlar Sayfası
router.get('/otomatik-mesajlar', authCheck, adminCheck, whatsappController.otomatikMesajlarSayfasi);

// =====================================================
// 🆕 WHATSAPP CHAT SAYFALARI
// =====================================================

// Chat Ana Sayfası
router.get('/chat', authCheck, whatsappController.chatSayfasi);

// ⚠️ ÖNEMLİ: Parametresiz route'lar :id'den ÖNCE tanımlanmalı!
router.get('/chat/check-updates', authCheck, whatsappController.chatCheckUpdates);
router.get('/chat/arsiv-listesi', authCheck, whatsappController.chatArsivListesi);
router.post('/chat/kisi-kaydet', authCheck, whatsappController.chatKisiKaydet);

// Parametreli route'lar
router.get('/chat/:id', authCheck, whatsappController.chatDetay);
router.get('/chat/:id/mesajlar', authCheck, whatsappController.chatMesajlariGetir);
router.post('/chat/:id/gonder', authCheck, whatsappController.chatMesajGonder);
router.post('/chat/:id/arsivle', authCheck, whatsappController.chatArsivle);
router.post('/chat/:id/arsivden-cikar', authCheck, whatsappController.chatArsivdenCikar);
router.post('/chat/:id/grup', authCheck, whatsappController.chatGrupGuncelle);
router.post('/chat/:id/tuttur', authCheck, whatsappController.chatTuttur);
router.post('/chat/:id/resim-gonder', authCheck, whatsappController.chatResimGonder);
router.post('/chat/:id/isim-guncelle', authCheck, whatsappController.chatIsimGuncelle);
router.delete('/chat/:id/sil', authCheck, whatsappController.chatSil);

// =====================================================
// 🆕 TOPLU İŞLEMLER (Manuel & Toplu Mesaj)
// =====================================================

// Toplu İşlemler Sayfası
router.get('/toplu-islemler', authCheck, whatsappController.topluIslemlerSayfasi);

// Manuel Mesaj Gönder (Toplu İşlemler Sayfasından)
router.post('/toplu-islemler/manuel-gonder', authCheck, whatsappController.manuelMesajGonder);

// Toplu Mesaj Gönder (Grup/Branş bazlı)
router.post('/toplu-islemler/toplu-gonder', authCheck, whatsappController.topluMesajGonder);

// =====================================================
// API ROTALARI
// =====================================================

// ⭐ WhatsApp API Health Check
router.get('/api-health', authCheck, adminCheck, async (req, res) => {
    try {
        const axios = require('axios');
        const WA_API_URL = 'https://app.netqr.tr';
        
        const healthCheck = await axios.get(`${WA_API_URL}/api/health`, {
            timeout: 3000
        });
        
        res.json({
            success: true,
            apiStatus: 'online',
            data: healthCheck.data
        });
    } catch (error) {
        res.json({
            success: false,
            apiStatus: 'offline',
            message: error.message
        });
    }
});

// Ayarları Kaydet
router.post('/settings/save', authCheck, adminCheck, whatsappController.mesajAyarlariKaydet);

// Cihaz Ekleme
router.post('/device/add', authCheck, adminCheck, whatsappController.addDevice);

// Cihaz Bağlama (QR/Code)
router.post('/device/connect', authCheck, adminCheck, whatsappController.connectDevice);

// Cihaz Durumu Sorgulama
router.get('/device/status', authCheck, adminCheck, whatsappController.deviceStatus);

// Durum Güncelleme (Yerel DB)
router.post('/device/update-status', authCheck, adminCheck, whatsappController.updateStatus);

// Çıkış Yapma (Logout)
router.post('/device/logout', authCheck, adminCheck, whatsappController.logoutDevice);

// Cihaz Silme
router.delete('/device/delete', authCheck, adminCheck, whatsappController.deleteDevice);

// Bağlantı Kontrolü
router.get('/check-connection', authCheck, whatsappController.checkConnection);

// =====================================================
// ŞABLONLAR
// =====================================================
router.get('/sablonlar', authCheck, async (req, res) => {
    const subeId = req.query.sube_id || req.session.subeId;
    
    try {
        const [sablonlar] = await db.execute(`
            SELECT * FROM whatsapp_sablonlar 
            WHERE (sube_id = ? OR sube_id IS NULL) AND aktif = 1
            ORDER BY sira ASC
        `, [subeId]);
        
        res.json({ success: true, sablonlar: sablonlar });
    } catch (error) {
        console.error('Şablon getirme hatası:', error);
        res.json({ success: false, message: error.message });
    }
});

// =====================================================
// BAŞVURU FORMU MESAJ GÖNDERİMİ
// =====================================================
router.post('/send-basvuru', authCheck, async (req, res) => {
    const { sube_id, telefon, mesaj } = req.body;
    
    if (!sube_id || !telefon || !mesaj) {
        return res.status(400).json({ success: false, message: 'Eksik parametreler' });
    }
    
    try {
        // Telefon formatla
        let phone = telefon.toString().replace(/\D/g, '');
        
        if (phone.length === 11 && phone[0] === '0') {
            phone = '90' + phone.substring(1);
        } else if (phone.length === 10) {
            phone = '90' + phone;
        }
        
        // whatsappService ile gönder
        await whatsappService.sendManualMessage(sube_id, phone, mesaj);
        
        res.json({ success: true, message: 'Mesaj gönderildi' });
        
    } catch (error) {
        console.error('WhatsApp mesaj hatası:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Mesaj gönderilemedi' });
    }
});

// =====================================================
// MANUEL MESAJ GÖNDER (Öğrenci Listesi için)
// =====================================================
router.post('/send-manual', authCheck, async (req, res) => {
    const { sube_id, telefon, mesaj } = req.body;
    
    console.log('📱 Manuel mesaj isteği:', { sube_id, telefon: telefon?.substring(0, 5) + '***', mesajUzunluk: mesaj?.length });
    
    if (!telefon || !mesaj) {
        return res.status(400).json({ success: false, message: 'Telefon ve mesaj gerekli' });
    }
    
    try {
        // Telefon formatla
        let phone = telefon.toString().replace(/\D/g, '');
        
        // Türkiye formatı
        if (phone.length === 10 && ['5', '8', '2', '3', '4'].includes(phone[0])) {
            phone = '90' + phone;
        } else if (phone.length === 11 && phone[0] === '0') {
            phone = '90' + phone.substring(1);
        }
        
        // Şube ID belirle
        const subeIdToUse = sube_id || req.session.subeId;
        
        if (!subeIdToUse) {
            return res.status(400).json({ success: false, message: 'Şube ID bulunamadı' });
        }
        
        console.log('📤 Mesaj gönderiliyor:', { subeId: subeIdToUse, phone });
        
        // whatsappService ile gönder
        await whatsappService.sendManualMessage(subeIdToUse, phone, mesaj);
        
        console.log('✅ Mesaj gönderildi');
        res.json({ success: true, message: 'Mesaj gönderildi' });
        
    } catch (error) {
        console.error('❌ WhatsApp mesaj hatası:', error);
        res.status(500).json({ success: false, message: error.message || 'Mesaj gönderilemedi' });
    }
});

module.exports = router;

// =====================================================
// 🧪 CRON TEST (Sadece Yönetici)
// =====================================================

router.get('/cron/test-all', authCheck, adminCheck, async (req, res) => {
    try {
        const cronService = require('../services/cronService');
        console.log('🧪 Manuel cron testi başlatıldı...');
        await cronService.runAllCrons();
        res.json({ success: true, message: 'Tüm cronlar çalıştırıldı. Konsol loglarını kontrol edin.' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

router.get('/cron/test-dogum-gunu', authCheck, adminCheck, async (req, res) => {
    try {
        const cronService = require('../services/cronService');
        await cronService.dogumGunuCron();
        res.json({ success: true, message: 'Doğum günü cron çalıştırıldı.' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

router.get('/cron/test-aidat', authCheck, adminCheck, async (req, res) => {
    try {
        const cronService = require('../services/cronService');
        await cronService.aidatHatirlatmaCron();
        res.json({ success: true, message: 'Aidat hatırlatma cron çalıştırıldı.' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

router.get('/cron/test-paket', authCheck, adminCheck, async (req, res) => {
    try {
        const cronService = require('../services/cronService');
        await cronService.paketBitimCron();
        res.json({ success: true, message: 'Paket bitiş cron çalıştırıldı.' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});