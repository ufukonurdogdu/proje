const db = require('../config/db');

// VAPID Ayarları - Lazy load için
let webpush = null;
let vapidConfigured = false;

async function getWebPush() {
    if (!webpush) {
        try {
            const module = await import('web-push');
            webpush = module.default || module;
            
            if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && !vapidConfigured) {
                webpush.setVapidDetails(
                    process.env.VAPID_EMAIL || 'mailto:info@netqr.tr',
                    process.env.VAPID_PUBLIC_KEY,
                    process.env.VAPID_PRIVATE_KEY
                );
                vapidConfigured = true;
                console.log('✅ Push Notification servisi hazır');
            }
        } catch (e) {
            console.error('❌ web-push yüklenemedi:', e.message);
            return null;
        }
    }
    return webpush;
}

/**
 * Tek bir aboneliğe bildirim gönder
 */
async function sendToSubscription(subscription, payload) {
    try {
        const wp = await getWebPush();
        if (!wp) return { success: false, error: 'web-push yüklenemedi' };
        
        await wp.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, JSON.stringify(payload));
        return { success: true };
    } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
            await db.execute('UPDATE push_abonelikler SET aktif = 0 WHERE endpoint = ?', [subscription.endpoint]);
        }
        return { success: false, error: error.message };
    }
}

/**
 * Belirli bir kullanıcıya bildirim gönder
 */
async function sendToUser(kullaniciId, title, body, url = '/', icon = null) {
    if (!process.env.VAPID_PUBLIC_KEY) return { success: false };
    try {
        const [abonelikler] = await db.execute(
            'SELECT * FROM push_abonelikler WHERE kullanici_id = ? AND aktif = 1',
            [kullaniciId]
        );
        if (abonelikler.length === 0) return { success: false };

        const payload = { title, body, icon: icon || '/uploads/logo-192.png', url };
        let basarili = 0;
        for (const abone of abonelikler) {
            const result = await sendToSubscription(abone, payload);
            if (result.success) basarili++;
        }
        return { success: true, gonderilen: basarili };
    } catch (error) {
        console.error('Push user hatası:', error.message);
        return { success: false };
    }
}

/**
 * Tüm aktif abonelere bildirim gönder
 */
async function sendToAll(title, body, url = '/', icon = null) {
    if (!process.env.VAPID_PUBLIC_KEY) return { success: false };
    try {
        const [abonelikler] = await db.execute('SELECT * FROM push_abonelikler WHERE aktif = 1');
        if (abonelikler.length === 0) return { success: false };

        const payload = { title, body, icon: icon || '/uploads/logo-192.png', url };
        let basarili = 0;
        for (const abone of abonelikler) {
            const result = await sendToSubscription(abone, payload);
            if (result.success) basarili++;
        }
        return { success: true, gonderilen: basarili };
    } catch (error) {
        console.error('Push all hatası:', error.message);
        return { success: false };
    }
}

/**
 * Yöneticilere bildirim gönder
 */
async function sendToYoneticiler(title, body, url = '/', subeId = null) {
    if (!process.env.VAPID_PUBLIC_KEY) return { success: false };
    try {
        let sql = `
            SELECT pa.* FROM push_abonelikler pa
            JOIN kullanicilar k ON pa.kullanici_id = k.id
            WHERE k.rol = 'yonetici' AND pa.aktif = 1
        `;
        let params = [];
        if (subeId) {
            sql += ' AND k.sube_id = ?';
            params.push(subeId);
        }

        const [abonelikler] = await db.execute(sql, params);
        if (abonelikler.length === 0) return { success: false };

        const payload = { title, body, icon: '/uploads/logo-192.png', url };
        let basarili = 0;
        for (const abone of abonelikler) {
            const result = await sendToSubscription(abone, payload);
            if (result.success) basarili++;
        }
        return { success: true, gonderilen: basarili };
    } catch (error) {
        console.error('Push yonetici hatası:', error.message);
        return { success: false };
    }
}

/**
 * Veliye bildirim gönder (öğrenci ID üzerinden)
 */
async function sendToVeli(ogrenciId, title, body, url = '/veli/panel', type = 'genel') {
    if (!process.env.VAPID_PUBLIC_KEY) {
        console.log('⚠️ VAPID key yok, push gönderilemedi');
        return { success: false };
    }
    try {
        // Öğrenci ID'sine göre abonelikleri bul
        const [abonelikler] = await db.execute(`
            SELECT * FROM push_abonelikler 
            WHERE ogrenci_id = ? AND aktif = 1
        `, [ogrenciId]);
        
        if (abonelikler.length === 0) {
            console.log(`ℹ️ Öğrenci ${ogrenciId} için aktif push subscription yok`);
            return { success: true, gonderilen: 0 };
        }

        const payload = { 
            title, 
            body, 
            icon: '/uploads/logo-192.png', 
            url,
            type,
            timestamp: Date.now()
        };
        
        let basarili = 0;
        for (const abone of abonelikler) {
            const result = await sendToSubscription(abone, payload);
            if (result.success) basarili++;
        }
        
        console.log(`🔔 Push gönderildi: Öğrenci ${ogrenciId} - ${title} (${basarili} cihaz)`);
        return { success: true, gonderilen: basarili };
    } catch (error) {
        console.error('Push veli hatası:', error.message);
        return { success: false };
    }
}

/**
 * VAPID Public Key döndür
 */
function getVapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || '';
}

module.exports = { sendToUser, sendToAll, sendToYoneticiler, sendToVeli, getVapidPublicKey };
