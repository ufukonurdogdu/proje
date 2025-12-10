const db = require('../config/db');
const crypto = require('crypto');

// =====================================================
// CANLI DESTEK - Görüşme Başlat
// =====================================================
exports.startChat = async (req, res) => {
    try {
        const { ad_soyad, telefon, tesis_adi } = req.body;

        if (!ad_soyad || !telefon) {
            return res.json({ success: false, message: 'Ad soyad ve telefon zorunludur' });
        }

        // Benzersiz session ID oluştur
        const sessionId = crypto.randomBytes(16).toString('hex');

        // Konuşmayı veritabanına kaydet
        await db.execute(`
            INSERT INTO canli_destek_konusmalar (session_id, ad_soyad, telefon, durum)
            VALUES (?, ?, ?, 'beklemede')
        `, [sessionId, ad_soyad, telefon]);

        // Hoş geldin mesajı ekle
        const [konusma] = await db.execute(
            'SELECT id FROM canli_destek_konusmalar WHERE session_id = ?',
            [sessionId]
        );

        if (konusma.length > 0) {
            await db.execute(`
                INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
                VALUES (?, 'sistem', ?)
            `, [konusma[0].id, `Yeni destek talebi: ${ad_soyad} - ${telefon}`]);
        }

        console.log(`📞 Yeni canlı destek talebi: ${ad_soyad} - ${telefon}`);

        res.json({ success: true, sessionId });

    } catch (error) {
        console.error('Canlı destek başlatma hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// CANLI DESTEK - Mesaj Gönder
// =====================================================
exports.sendMessage = async (req, res) => {
    try {
        const { sessionId, mesaj } = req.body;

        if (!sessionId || !mesaj) {
            return res.json({ success: false, message: 'Eksik bilgi' });
        }

        // Konuşmayı bul
        const [konusma] = await db.execute(
            'SELECT id FROM canli_destek_konusmalar WHERE session_id = ?',
            [sessionId]
        );

        if (konusma.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı' });
        }

        // Mesajı kaydet
        const [result] = await db.execute(`
            INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
            VALUES (?, 'musteri', ?)
        `, [konusma[0].id, mesaj]);

        // Son mesaj zamanını güncelle
        await db.execute(`
            UPDATE canli_destek_konusmalar 
            SET son_mesaj_zamani = NOW(), durum = 'aktif'
            WHERE id = ?
        `, [konusma[0].id]);

        res.json({ success: true, messageId: result.insertId });

    } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// CANLI DESTEK - Mesajları Getir (Polling)
// =====================================================
exports.getMessages = async (req, res) => {
    try {
        const { sessionId, lastId } = req.query;

        if (!sessionId) {
            return res.json({ success: false, message: 'Session ID gerekli' });
        }

        const [konusma] = await db.execute(
            'SELECT id FROM canli_destek_konusmalar WHERE session_id = ?',
            [sessionId]
        );

        if (konusma.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı' });
        }

        // Son mesajları getir (sadece temsilci mesajları)
        const [mesajlar] = await db.execute(`
            SELECT id, gonderen, mesaj, created_at 
            FROM canli_destek_mesajlar 
            WHERE konusma_id = ? AND id > ? AND gonderen = 'temsilci'
            ORDER BY id ASC
        `, [konusma[0].id, lastId || 0]);

        res.json({ success: true, mesajlar });

    } catch (error) {
        console.error('Mesaj getirme hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// CANLI DESTEK - Chat Geçmişi (Sayfa Yenilendiğinde)
// =====================================================
exports.getChatHistory = async (req, res) => {
    try {
        const { sessionId } = req.query;

        if (!sessionId) {
            return res.json({ success: false, message: 'Session ID gerekli' });
        }

        // Konuşmayı bul (kapanmamış olanlar)
        const [konusma] = await db.execute(
            'SELECT id, durum FROM canli_destek_konusmalar WHERE session_id = ? AND durum != ?',
            [sessionId, 'kapatildi']
        );

        if (konusma.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı veya kapatılmış' });
        }

        // Tüm mesajları getir (sistem mesajları hariç)
        const [mesajlar] = await db.execute(`
            SELECT id, mesaj, gonderen, created_at 
            FROM canli_destek_mesajlar 
            WHERE konusma_id = ? AND gonderen != 'sistem'
            ORDER BY id ASC
        `, [konusma[0].id]);

        res.json({ success: true, mesajlar, durum: konusma[0].durum });

    } catch (error) {
        console.error('Chat geçmişi hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// E-BÜLTEN KAYIT (Telefon)
// =====================================================
exports.newsletter = async (req, res) => {
    try {
        const { telefon } = req.body;

        if (!telefon) {
            return res.json({ success: false, message: 'Telefon numarası gerekli' });
        }

        // Telefonu temizle
        const cleanPhone = telefon.replace(/\D/g, '');

        // Daha önce kayıtlı mı kontrol et
        const [existing] = await db.execute(
            'SELECT id FROM landing_ebulten WHERE telefon = ?',
            [cleanPhone]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: 'Bu numara zaten kayıtlı' });
        }

        // Kaydet
        await db.execute(
            'INSERT INTO landing_ebulten (telefon) VALUES (?)',
            [cleanPhone]
        );

        console.log(`📱 Yeni e-bülten kaydı: ${cleanPhone}`);

        res.json({ success: true, message: 'Kayıt başarılı' });

    } catch (error) {
        console.error('E-bülten kayıt hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// İLETİŞİM FORMU
// =====================================================
exports.contact = async (req, res) => {
    try {
        const { ad_soyad, telefon, email, mesaj } = req.body;

        if (!ad_soyad || !telefon) {
            return res.json({ success: false, message: 'Ad soyad ve telefon zorunludur' });
        }

        await db.execute(`
            INSERT INTO landing_iletisim (ad_soyad, telefon, email, mesaj, dogrulandi)
            VALUES (?, ?, ?, ?, 1)
        `, [ad_soyad, telefon, email || null, mesaj || null]);

        console.log(`📧 Yeni iletişim formu: ${ad_soyad} - ${telefon}`);

        res.json({ success: true, message: 'Mesajınız alındı' });

    } catch (error) {
        console.error('İletişim formu hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ADMIN - Canlı Destek Konuşmalarını Listele
// =====================================================
exports.getChats = async (req, res) => {
    try {
        const [konusmalar] = await db.execute(`
            SELECT 
                c.*,
                u.ad_soyad as temsilci_adi,
                (SELECT COUNT(*) FROM canli_destek_mesajlar WHERE konusma_id = c.id AND okundu = 0 AND gonderen = 'musteri') as okunmamis
            FROM canli_destek_konusmalar c
            LEFT JOIN kullanicilar u ON c.temsilci_id = u.id
            ORDER BY c.son_mesaj_zamani DESC
            LIMIT 50
        `);

        res.json({ success: true, konusmalar });

    } catch (error) {
        console.error('Konuşma listesi hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ADMIN - Konuşma Detayını Getir
// =====================================================
exports.getChatDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const [konusma] = await db.execute(
            'SELECT * FROM canli_destek_konusmalar WHERE id = ?',
            [id]
        );

        if (konusma.length === 0) {
            return res.json({ success: false, message: 'Konuşma bulunamadı' });
        }

        const [mesajlar] = await db.execute(`
            SELECT * FROM canli_destek_mesajlar 
            WHERE konusma_id = ? 
            ORDER BY created_at ASC
        `, [id]);

        // Mesajları okundu olarak işaretle
        await db.execute(
            'UPDATE canli_destek_mesajlar SET okundu = 1 WHERE konusma_id = ?',
            [id]
        );

        res.json({ success: true, konusma: konusma[0], mesajlar });

    } catch (error) {
        console.error('Konuşma detay hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ADMIN - Temsilci Mesaj Gönder
// =====================================================
exports.sendAdminMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { mesaj } = req.body;
        const temsilciId = req.session.userID;

        if (!mesaj) {
            return res.json({ success: false, message: 'Mesaj gerekli' });
        }

        // Mesajı kaydet
        await db.execute(`
            INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
            VALUES (?, 'temsilci', ?)
        `, [id, mesaj]);

        // Konuşmayı güncelle
        await db.execute(`
            UPDATE canli_destek_konusmalar 
            SET temsilci_id = ?, son_mesaj_zamani = NOW(), durum = 'aktif'
            WHERE id = ?
        `, [temsilciId, id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Admin mesaj hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ADMIN - Konuşmayı Kapat
// =====================================================
exports.closeChat = async (req, res) => {
    try {
        const { id } = req.params;

        await db.execute(
            'UPDATE canli_destek_konusmalar SET durum = "kapatildi" WHERE id = ?',
            [id]
        );

        // Kapanış mesajı ekle
        await db.execute(`
            INSERT INTO canli_destek_mesajlar (konusma_id, gonderen, mesaj)
            VALUES (?, 'sistem', 'Görüşme sonlandırıldı.')
        `, [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Konuşma kapatma hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
};

// =====================================================
// ZİYARETÇİ KAYIT (Analytics)
// =====================================================
exports.trackVisit = async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || '';
        const userAgent = req.headers['user-agent'] || '';
        const { sayfa, referrer } = req.body;

        // Cihaz ve tarayıcı tespiti
        let cihaz = 'Desktop';
        if (/mobile/i.test(userAgent)) cihaz = 'Mobile';
        else if (/tablet|ipad/i.test(userAgent)) cihaz = 'Tablet';

        let tarayici = 'Diğer';
        if (/edg/i.test(userAgent)) tarayici = 'Edge';
        else if (/chrome/i.test(userAgent)) tarayici = 'Chrome';
        else if (/firefox/i.test(userAgent)) tarayici = 'Firefox';
        else if (/safari/i.test(userAgent)) tarayici = 'Safari';
        else if (/opera|opr/i.test(userAgent)) tarayici = 'Opera';

        const cleanIp = ip.split(',')[0].trim();
        const cleanUserAgent = userAgent.substring(0, 500);
        const cleanSayfa = sayfa || '/';
        const cleanReferrer = referrer || '';

        await db.execute(`
            INSERT INTO landing_ziyaretci (ip_adresi, user_agent, sayfa, referrer, cihaz, tarayici, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [cleanIp, cleanUserAgent, cleanSayfa, cleanReferrer, cihaz, tarayici]);

        console.log(`👁️ Yeni ziyaret: ${cleanSayfa} | ${cihaz} | ${tarayici} | ${cleanIp}`);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Ziyaret kayıt hatası:', error.message);
        // Hata olsa bile sessizce geç
        res.json({ success: true });
    }
};
