const db = require('../config/db');
const pushService = require('../services/pushService');

// =====================================================
// VAPID PUBLIC KEY DÖNDÜR
// =====================================================
exports.getVapidPublicKey = (req, res) => {
    res.json({ 
        success: true, 
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' 
    });
};

// =====================================================
// ABONELİK KAYDET (Yönetici için)
// =====================================================
exports.aboneOl = async (req, res) => {
    try {
        const { subscription, cihazTipi, tarayici } = req.body;
        const userId = req.session.userID || null;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: 'Geçersiz subscription' });
        }

        const { endpoint, keys } = subscription;
        const { p256dh, auth } = keys || {};

        if (!p256dh || !auth) {
            return res.status(400).json({ success: false, message: 'Eksik key bilgisi' });
        }

        // Mevcut abonelik var mı kontrol et
        const [existing] = await db.execute(
            'SELECT id FROM push_abonelikler WHERE endpoint = ?',
            [endpoint]
        );

        if (existing.length > 0) {
            await db.execute(`
                UPDATE push_abonelikler 
                SET kullanici_id = ?, p256dh = ?, auth = ?, 
                    cihaz_tipi = ?, tarayici = ?, aktif = 1, updated_at = NOW()
                WHERE endpoint = ?
            `, [userId, p256dh, auth, cihazTipi || 'web', tarayici || 'Unknown', endpoint]);
            
            console.log(`🔔 Push abonelik güncellendi: Kullanıcı ${userId}`);
        } else {
            await db.execute(`
                INSERT INTO push_abonelikler 
                (kullanici_id, endpoint, p256dh, auth, cihaz_tipi, tarayici, aktif, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
            `, [userId, endpoint, p256dh, auth, cihazTipi || 'web', tarayici || 'Unknown']);
            
            console.log(`🔔 Yeni push abonelik: Kullanıcı ${userId}`);
        }

        res.json({ success: true, message: 'Push bildirimleri aktif' });
    } catch (error) {
        console.error('Push abonelik hatası:', error);
        res.status(500).json({ success: false, message: 'Abonelik kaydedilemedi' });
    }
};

// =====================================================
// ABONELİK İPTAL
// =====================================================
exports.abonelikIptal = async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ success: false, message: 'Endpoint gerekli' });
        }

        await db.execute(
            'UPDATE push_abonelikler SET aktif = 0 WHERE endpoint = ?',
            [endpoint]
        );

        console.log('🔕 Push abonelik iptal edildi');
        res.json({ success: true, message: 'Abonelik iptal edildi' });
    } catch (error) {
        console.error('Push iptal hatası:', error);
        res.status(500).json({ success: false, message: 'İptal edilemedi' });
    }
};

// =====================================================
// PUSH ABONELİK İSTATİSTİKLERİ
// =====================================================
exports.getStats = async (req, res) => {
    try {
        const [toplam] = await db.execute(
            'SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1'
        );
        
        const [veli] = await db.execute(
            'SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1 AND (veli_id IS NOT NULL OR ogrenci_id IS NOT NULL)'
        );
        
        const [yonetici] = await db.execute(
            'SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1 AND kullanici_id IS NOT NULL'
        );

        res.json({
            success: true,
            stats: {
                toplam: toplam[0].count,
                veli: veli[0].count,
                yonetici: yonetici[0].count
            }
        });
    } catch (error) {
        console.error('Push stats hatası:', error);
        res.status(500).json({ success: false, message: 'İstatistikler alınamadı' });
    }
};

// =====================================================
// ⭐ TOPLU PUSH BİLDİRİM GÖNDER
// pushService fonksiyonlarını kullanır (Android uyumlu)
// =====================================================
exports.topluBildirim = async (req, res) => {
    try {
        const { baslik, mesaj, tur, hedef } = req.body;

        console.log('========================================');
        console.log('📤 TOPLU PUSH BİLDİRİM BAŞLADI');
        console.log('========================================');
        console.log('📝 İstek:', { baslik, mesaj, tur, hedef });

        if (!baslik || !mesaj) {
            return res.status(400).json({ success: false, message: 'Başlık ve mesaj gerekli' });
        }

        // VAPID kontrolü
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.error('❌ VAPID keys eksik!');
            return res.status(500).json({ 
                success: false, 
                message: 'VAPID yapılandırması eksik. .env dosyasını kontrol edin.' 
            });
        }

        // Hedef kitleye göre aboneleri al
        let query = 'SELECT * FROM push_abonelikler WHERE aktif = 1';
        
        if (hedef === 'veli') {
            query += ' AND (ogrenci_id IS NOT NULL OR veli_id IS NOT NULL)';
        } else if (hedef === 'yonetici') {
            query += ' AND kullanici_id IS NOT NULL AND ogrenci_id IS NULL AND veli_id IS NULL';
        }
        // hedef === 'hepsi' ise tüm aktif aboneler

        console.log('🔍 SQL Query:', query);

        const [aboneler] = await db.execute(query);

        console.log(`📋 Bulunan abone sayısı: ${aboneler.length}`);

        if (aboneler.length === 0) {
            return res.json({ 
                success: true, 
                message: 'Gönderilecek aktif abone bulunamadı', 
                gonderilen: 0 
            });
        }

        let basarili = 0;
        let hatali = 0;
        const gonderilmisOgrenciler = new Set();
        const gonderilmisKullanicilar = new Set();

        for (const abone of aboneler) {
            try {
                console.log(`\n📨 Gönderiliyor: Abone ${abone.id} (cihaz: ${abone.cihaz_tipi})...`);

                // Öğrenci ID varsa sendToVeli kullan
                if (abone.ogrenci_id) {
                    // Aynı öğrenciye birden fazla göndermeyi önle
                    if (gonderilmisOgrenciler.has(abone.ogrenci_id)) {
                        console.log(`   ⏭️ Öğrenci ${abone.ogrenci_id} zaten gönderildi, atlanıyor`);
                        continue;
                    }
                    
                    const result = await pushService.sendToVeli(
                        abone.ogrenci_id, 
                        baslik, 
                        mesaj, 
                        '/', 
                        tur || 'genel'
                    );
                    
                    if (result.success && result.gonderilen > 0) {
                        basarili += result.gonderilen;
                        console.log(`   ✅ Öğrenci ${abone.ogrenci_id} - ${result.gonderilen} cihaza gönderildi`);
                    } else {
                        console.log(`   ⚠️ Öğrenci ${abone.ogrenci_id} - gönderilemedi`);
                    }
                    gonderilmisOgrenciler.add(abone.ogrenci_id);
                }
                // Kullanıcı ID varsa sendToUser kullan (Yöneticiler)
                else if (abone.kullanici_id) {
                    // Aynı kullanıcıya birden fazla göndermeyi önle
                    if (gonderilmisKullanicilar.has(abone.kullanici_id)) {
                        console.log(`   ⏭️ Kullanıcı ${abone.kullanici_id} zaten gönderildi, atlanıyor`);
                        continue;
                    }
                    
                    const result = await pushService.sendToUser(
                        abone.kullanici_id, 
                        baslik, 
                        mesaj, 
                        '/'
                    );
                    
                    if (result.success && result.gonderilen > 0) {
                        basarili += result.gonderilen;
                        console.log(`   ✅ Kullanıcı ${abone.kullanici_id} - ${result.gonderilen} cihaza gönderildi`);
                    } else {
                        console.log(`   ⚠️ Kullanıcı ${abone.kullanici_id} - gönderilemedi`);
                    }
                    gonderilmisKullanicilar.add(abone.kullanici_id);
                }

            } catch (e) {
                hatali++;
                console.error(`   ❌ Hata: ${e.message}`);
            }
        }

        console.log('\n========================================');
        console.log(`📊 SONUÇ: ${basarili} başarılı, ${hatali} hatalı`);
        console.log('========================================\n');

        res.json({
            success: basarili > 0,
            message: basarili > 0 
                ? `${basarili} kişiye bildirim gönderildi` 
                : 'Bildirim gönderilemedi',
            gonderilen: basarili,
            hatali: hatali
        });

    } catch (error) {
        console.error('❌ Toplu push genel hatası:', error);
        res.status(500).json({ success: false, message: 'Hata: ' + error.message });
    }
};

// =====================================================
// TEST BİLDİRİMİ GÖNDER (Kendi hesabına)
// =====================================================
exports.testBildirim = async (req, res) => {
    try {
        const userId = req.session.userID;
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Oturum gerekli' });
        }

        const result = await pushService.sendToUser(
            userId, 
            '🔔 Test Bildirimi', 
            'Push bildirimleri çalışıyor! ' + new Date().toLocaleTimeString('tr-TR'), 
            '/'
        );

        if (result.success && result.gonderilen > 0) {
            res.json({ success: true, message: `Test bildirimi ${result.gonderilen} cihaza gönderildi` });
        } else {
            res.json({ success: false, message: 'Aktif push aboneliği bulunamadı' });
        }
    } catch (error) {
        console.error('Test bildirim hatası:', error);
        res.status(500).json({ success: false, message: 'Bildirim gönderilemedi' });
    }
};

// =====================================================
// TEST: Belirli ID'ye bildirim gönder
// Kullanım: /api/push/test-by-id/19
// =====================================================
exports.testById = async (req, res) => {
    try {
        const aboneId = req.params.id;
        
        console.log(`🧪 Test bildirimi: Abone ID ${aboneId}`);
        
        // Aboneyi bul
        const [rows] = await db.execute(
            'SELECT * FROM push_abonelikler WHERE id = ? AND aktif = 1',
            [aboneId]
        );
        
        if (rows.length === 0) {
            return res.json({
                success: false,
                error: `ID ${aboneId} bulunamadı veya aktif değil`
            });
        }
        
        const abone = rows[0];
        
        console.log(`   Abone bilgileri:`, {
            id: abone.id,
            ogrenci_id: abone.ogrenci_id,
            veli_id: abone.veli_id,
            kullanici_id: abone.kullanici_id,
            cihaz_tipi: abone.cihaz_tipi
        });
        
        let result;
        const testMesaj = 'Bu test bildirimi ID ' + aboneId + ' için gönderildi - ' + new Date().toLocaleTimeString('tr-TR');
        
        // Öğrenci ID varsa sendToVeli kullan
        if (abone.ogrenci_id) {
            console.log(`   📱 sendToVeli kullanılıyor (ogrenci_id: ${abone.ogrenci_id})`);
            result = await pushService.sendToVeli(
                abone.ogrenci_id,
                '🔔 Test Bildirimi',
                testMesaj,
                '/veli/panel',
                'test'
            );
        }
        // Kullanıcı ID varsa sendToUser kullan
        else if (abone.kullanici_id) {
            console.log(`   👤 sendToUser kullanılıyor (kullanici_id: ${abone.kullanici_id})`);
            result = await pushService.sendToUser(
                abone.kullanici_id,
                '🔔 Test Bildirimi',
                testMesaj,
                '/'
            );
        } 
        else {
            return res.json({
                success: false,
                error: 'Abone için ogrenci_id veya kullanici_id bulunamadı',
                abone: {
                    id: abone.id,
                    ogrenci_id: abone.ogrenci_id,
                    veli_id: abone.veli_id,
                    kullanici_id: abone.kullanici_id
                }
            });
        }
        
        console.log(`   Sonuç:`, result);
        
        res.json({
            success: result.success,
            message: result.success ? 'Bildirim gönderildi!' : 'Gönderilemedi',
            aboneId: aboneId,
            gonderilen: result.gonderilen || 0,
            cihazTipi: abone.cihaz_tipi,
            tarayici: abone.tarayici,
            ogrenciId: abone.ogrenci_id,
            kullaniciId: abone.kullanici_id
        });
        
    } catch (error) {
        console.error('Test by ID hatası:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
};

// =====================================================
// DEBUG: Tüm bilgileri göster
// Kullanım: /api/push/debug
// =====================================================
exports.debug = async (req, res) => {
    try {
        const [aboneler] = await db.execute(`
            SELECT 
                id, kullanici_id, veli_id, ogrenci_id, 
                cihaz_tipi, tarayici, 
                LEFT(endpoint, 80) as endpoint_kisaltma,
                LENGTH(p256dh) as p256dh_uzunluk,
                LENGTH(auth) as auth_uzunluk,
                aktif, created_at, updated_at
            FROM push_abonelikler 
            ORDER BY id DESC 
            LIMIT 20
        `);
        
        const vapidStatus = {
            publicKey: process.env.VAPID_PUBLIC_KEY 
                ? '✅ VAR (' + process.env.VAPID_PUBLIC_KEY.substring(0, 20) + '...)' 
                : '❌ YOK',
            privateKey: process.env.VAPID_PRIVATE_KEY ? '✅ VAR' : '❌ YOK',
            email: process.env.VAPID_EMAIL || 'varsayılan kullanılacak'
        };
        
        const [toplamResult] = await db.execute('SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1');
        const [veliResult] = await db.execute('SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1 AND ogrenci_id IS NOT NULL');
        const [yoneticiResult] = await db.execute('SELECT COUNT(*) as count FROM push_abonelikler WHERE aktif = 1 AND kullanici_id IS NOT NULL');
        
        res.json({
            success: true,
            vapid: vapidStatus,
            istatistik: {
                toplamAktif: toplamResult[0].count,
                veliAbone: veliResult[0].count,
                yoneticiAbone: yoneticiResult[0].count
            },
            aboneler: aboneler,
            testEndpoints: {
                testById: '/api/push/test-by-id/{id}',
                stats: '/api/push/stats',
                topluBildirim: 'POST /api/push/toplu-bildirim'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// =====================================================
// KULLANICIYA ÖZEL BİLDİRİM GÖNDER
// =====================================================
exports.kullaniciBildirim = async (req, res) => {
    try {
        const { kullanici_id, baslik, mesaj, tur, url } = req.body;

        if (!kullanici_id || !mesaj) {
            return res.status(400).json({ success: false, message: 'Kullanıcı ID ve mesaj gerekli' });
        }

        const result = await pushService.sendToUser(
            kullanici_id, 
            baslik || 'Bildirim', 
            mesaj, 
            url || '/'
        );

        res.json({ 
            success: result.success, 
            message: result.success ? `${result.gonderilen} cihaza bildirim gönderildi` : 'Gönderilemedi',
            gonderilen: result.gonderilen || 0
        });
    } catch (error) {
        console.error('Kullanıcı bildirim hatası:', error);
        res.status(500).json({ success: false, message: 'Bildirim gönderilemedi' });
    }
};

// =====================================================
// VELİYE BİLDİRİM GÖNDER (Yoklama, Aidat vb. için)
// =====================================================
exports.veliBildirim = async (req, res) => {
    try {
        const { ogrenci_id, baslik, mesaj, tur, url } = req.body;

        if (!ogrenci_id || !mesaj) {
            return res.status(400).json({ success: false, message: 'Öğrenci ID ve mesaj gerekli' });
        }

        const result = await pushService.sendToVeli(
            ogrenci_id, 
            baslik || 'Bildirim', 
            mesaj, 
            url || '/veli/panel',
            tur || 'genel'
        );

        res.json({ 
            success: result.success, 
            message: result.success ? `${result.gonderilen} cihaza bildirim gönderildi` : 'Gönderilemedi',
            gonderilen: result.gonderilen || 0
        });
    } catch (error) {
        console.error('Veli bildirim hatası:', error);
        res.status(500).json({ success: false, message: 'Bildirim gönderilemedi' });
    }
};