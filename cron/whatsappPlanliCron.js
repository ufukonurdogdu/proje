/**
 * WhatsApp Planlı Mesaj Cron Job
 * Her dakika çalışır, planlı mesajları gönderir
 * 
 * Kullanım:
 * - crontab -e ile: * * * * * /usr/bin/node /path/to/cron/whatsappPlanliCron.js >> /var/log/wa-cron.log 2>&1
 * - veya node-cron ile app.js içinde çağırılabilir
 */

const db = require('../config/db');
const axios = require('axios');

const WA_API_URL = 'https://app.netqr.tr';
const MESAJ_ARASI_BEKLEME = 2000; // 2 saniye
const BATCH_SIZE = 30; // Her cron çalışmasında max 30 mesaj (1 dakikada tamamlanabilir)

// Kilit dosyası için global değişken
let isRunning = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getSiteAdresi() {
    try {
        const [ayarlar] = await db.execute('SELECT site_adresi FROM genel_ayarlar LIMIT 1');
        let url = ayarlar.length > 0 && ayarlar[0].site_adresi ? ayarlar[0].site_adresi : 'https://localhost';
        return url.replace(/\/$/, '');
    } catch (error) {
        return 'https://localhost';
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
        timeout: 15000
    });
}

async function runPlanliMesajCron() {
    // Eğer zaten çalışıyorsa, çık (duplicate önleme)
    if (isRunning) {
        console.log('⚠️ Cron zaten çalışıyor, atlanıyor...');
        return;
    }
    
    isRunning = true;
    const startTime = Date.now();
    
    try {
        const now = new Date();
        const nowStr = now.toISOString().slice(0, 16).replace('T', ' ');
        
        console.log(`\n📅 [${now.toLocaleString('tr-TR')}] Planlı mesaj kontrolü başladı...`);
        
        // 1. ADIM: Gönderilecek mesajları SEÇ ve HEMEN "gonderiliyor" olarak işaretle
        // Bu sayede bir sonraki cron çalışmasında bu mesajlar tekrar seçilmez
        const [bekleyenMesajlar] = await db.execute(`
            SELECT id FROM whatsapp_toplu_mesajlar 
            WHERE durum = 'bekliyor' AND planli_tarih <= ?
            ORDER BY planli_tarih ASC, created_at ASC
            LIMIT ?
        `, [nowStr, BATCH_SIZE]);
        
        if (bekleyenMesajlar.length === 0) {
            console.log('📭 Gönderilecek planlı mesaj yok.');
            isRunning = false;
            return;
        }
        
        // Seçilen mesajların ID'lerini al
        const mesajIdler = bekleyenMesajlar.map(m => m.id);
        const placeholders = mesajIdler.map(() => '?').join(',');
        
        // 2. ADIM: Seçilen mesajları "gonderiliyor" olarak işaretle (ATOMIK)
        await db.execute(
            `UPDATE whatsapp_toplu_mesajlar SET durum = 'gonderiliyor' WHERE id IN (${placeholders})`,
            mesajIdler
        );
        
        console.log(`📬 ${mesajIdler.length} mesaj işleme alındı (durum: gonderiliyor)`);
        
        // 3. ADIM: Mesaj detaylarını çek
        const [mesajlar] = await db.execute(`
            SELECT * FROM whatsapp_toplu_mesajlar 
            WHERE id IN (${placeholders})
            ORDER BY planli_tarih ASC, created_at ASC
        `, mesajIdler);
        
        let basarili = 0;
        let hatali = 0;
        
        // 4. ADIM: Mesajları sırayla gönder
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
                
                // Mesaj gönder
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
                
                // Başarılı - durumu güncelle
                await db.execute(
                    'UPDATE whatsapp_toplu_mesajlar SET durum = "gonderildi", gonderim_zamani = NOW() WHERE id = ?',
                    [mesaj.id]
                );
                
                basarili++;
                console.log(`  ✅ [${basarili}/${mesajlar.length}] ${mesaj.telefon} - Gönderildi`);
                
                // Sonraki mesaj için bekle (son mesaj değilse)
                if (mesajlar.indexOf(mesaj) < mesajlar.length - 1) {
                    await sleep(MESAJ_ARASI_BEKLEME);
                }
                
            } catch (err) {
                hatali++;
                console.error(`  ❌ ${mesaj.telefon} - Hata: ${err.message}`);
                
                // Hata durumunu kaydet
                await db.execute(
                    'UPDATE whatsapp_toplu_mesajlar SET durum = "hata", hata_mesaji = ? WHERE id = ?',
                    [err.message.substring(0, 500), mesaj.id]
                );
            }
        }
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n📊 Sonuç: ${basarili} başarılı, ${hatali} hatalı (${elapsed} saniye)`);
        
    } catch (error) {
        console.error('❌ Cron genel hatası:', error.message);
        
        // Hata durumunda "gonderiliyor" kalan mesajları tekrar "bekliyor" yap
        // (5 dakikadan eski olanları - takılı kalmış olabilir)
        try {
            await db.execute(`
                UPDATE whatsapp_toplu_mesajlar 
                SET durum = 'bekliyor' 
                WHERE durum = 'gonderiliyor' 
                AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            `);
        } catch (e) {
            console.error('Takılı mesaj düzeltme hatası:', e.message);
        }
        
    } finally {
        isRunning = false;
    }
}

// Eğer doğrudan çalıştırılıyorsa (crontab ile)
if (require.main === module) {
    runPlanliMesajCron()
        .then(() => {
            console.log('Cron tamamlandı, çıkılıyor...');
            process.exit(0);
        })
        .catch(err => {
            console.error('Cron hatası:', err);
            process.exit(1);
        });
}

// Module olarak export (app.js içinde node-cron ile kullanım için)
module.exports = { runPlanliMesajCron };