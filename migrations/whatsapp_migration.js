/**
 * WhatsApp Tabloları Migration
 * 
 * Kullanım:
 * node migrations/whatsapp_migration.js
 * 
 * Veya uygulama başlangıcında otomatik çalıştırılabilir
 */

const db = require('../config/db');

const runMigration = async () => {
    console.log('🚀 WhatsApp tabloları oluşturuluyor...\n');

    try {
        // 1. DEVICES TABLOSU
        console.log('📱 devices tablosu oluşturuluyor...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS devices (
                id INT(11) NOT NULL AUTO_INCREMENT,
                sube_id INT(11) DEFAULT NULL COMMENT 'Şube ID',
                name VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Cihaz adı',
                phone VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Telefon numarası',
                token VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API token',
                status ENUM('connected', 'connecting', 'disconnected') COLLATE utf8mb4_unicode_ci DEFAULT 'disconnected' COMMENT 'Bağlantı durumu',
                qr_code TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'QR kod base64',
                pairing_code VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Eşleştirme kodu',
                webhook_url VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Webhook URL',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_sube_id (sube_id),
                KEY idx_token (token),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WhatsApp cihaz bilgileri'
        `);
        console.log('   ✅ devices tablosu hazır\n');


        // 2. WP_API TABLOSU
        console.log('🔑 wp_api tablosu oluşturuluyor...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS wp_api (
                id INT(11) NOT NULL AUTO_INCREMENT,
                sube_id INT(11) DEFAULT NULL COMMENT 'Şube ID',
                api_key VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API anahtarı',
                durum TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Aktif, 0=Pasif',
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_sube_id (sube_id),
                KEY idx_durum (durum)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WhatsApp API anahtarları'
        `);
        console.log('   ✅ wp_api tablosu hazır\n');


        // 3. WHATSAPP_OTOMATIK_MESAJLAR TABLOSU
        console.log('🤖 whatsapp_otomatik_mesajlar tablosu oluşturuluyor...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS whatsapp_otomatik_mesajlar (
                id INT(11) NOT NULL AUTO_INCREMENT,
                sube_id INT(11) DEFAULT NULL COMMENT 'Şube ID',
                
                -- Hoşgeldin Mesajı
                hosgeldin_aktif TINYINT(1) DEFAULT 0,
                hosgeldin_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                
                -- Doğum Günü Mesajı
                dogum_gunu_aktif TINYINT(1) DEFAULT 0,
                dogum_gunu_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                dogum_gunu_saat TIME DEFAULT '09:00:00',
                
                -- Aidat Hatırlatma
                aidat_hatirlatma_aktif TINYINT(1) DEFAULT 0,
                aidat_hatirlatma_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                aidat_hatirlatma_gun INT(11) DEFAULT 3,
                
                -- Yoklama Bildirimi
                yoklama_bildirim_aktif TINYINT(1) DEFAULT 0,
                yoklama_bildirim_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                
                -- Ders Hatırlatma
                ders_hatirlatma_aktif TINYINT(1) DEFAULT 0,
                ders_hatirlatma_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                ders_hatirlatma_saat INT(11) DEFAULT 2,
                
                -- Ödeme Onay
                odeme_onay_aktif TINYINT(1) DEFAULT 0,
                odeme_onay_mesaj TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_sube_id (sube_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WhatsApp otomatik mesaj ayarları'
        `);
        console.log('   ✅ whatsapp_otomatik_mesajlar tablosu hazır\n');


        // 4. WHATSAPP_MESAJ_LOG TABLOSU
        console.log('📋 whatsapp_mesaj_log tablosu oluşturuluyor...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS whatsapp_mesaj_log (
                id INT(11) NOT NULL AUTO_INCREMENT,
                sube_id INT(11) DEFAULT NULL,
                telefon VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Alıcı telefon',
                mesaj TEXT COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Gönderilen mesaj',
                mesaj_tipi ENUM('hosgeldin', 'dogum_gunu', 'aidat', 'yoklama', 'ders', 'odeme', 'manuel') DEFAULT 'manuel',
                durum ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
                hata_mesaji TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                ogrenci_id INT(11) DEFAULT NULL,
                gonderim_tarihi TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                teslim_tarihi TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                KEY idx_sube_id (sube_id),
                KEY idx_telefon (telefon),
                KEY idx_durum (durum),
                KEY idx_mesaj_tipi (mesaj_tipi),
                KEY idx_tarih (gonderim_tarihi)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WhatsApp mesaj logları'
        `);
        console.log('   ✅ whatsapp_mesaj_log tablosu hazır\n');


        console.log('═══════════════════════════════════════════════');
        console.log('🎉 Tüm WhatsApp tabloları başarıyla oluşturuldu!');
        console.log('═══════════════════════════════════════════════\n');

        console.log('📊 Oluşturulan Tablolar:');
        console.log('   • devices                    - Cihaz bilgileri');
        console.log('   • wp_api                     - API anahtarları');
        console.log('   • whatsapp_otomatik_mesajlar - Otomatik mesaj ayarları');
        console.log('   • whatsapp_mesaj_log         - Mesaj logları');
        console.log('');

        return true;

    } catch (error) {
        console.error('❌ Migration hatası:', error.message);
        return false;
    }
};

// Direkt çalıştırılırsa
if (require.main === module) {
    runMigration()
        .then(success => {
            if (success) {
                console.log('✅ Migration tamamlandı.');
            } else {
                console.log('❌ Migration başarısız.');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

// Export et (başka yerden çağrılabilir)
module.exports = { runMigration };