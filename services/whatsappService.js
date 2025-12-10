const db = require('../config/db');
const axios = require('axios');
const https = require('https');

const WA_API_URL = 'https://app.netqr.tr';

// ✅ Axios config - SSL bypass
const axiosConfig = {
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true
    })
};

class WhatsappService {

    processTemplate(template, variables) {
        if (!template) return '';
        let message = template;
        
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{${key}}`, 'g');
            let value = variables[key];

            if (value === null || value === undefined) value = '';
            else if (value instanceof Date) value = value.toLocaleDateString('tr-TR');

            message = message.replace(regex, value);
        });

        return message;
    }

    async getApiToken(subeId) {
        try {
            const [rows] = await db.execute(
                'SELECT api_key FROM wp_api WHERE sube_id = ? AND durum = 1 LIMIT 1', 
                [subeId]
            );
            if (rows.length > 0) return rows[0].api_key;
            
            const [devRows] = await db.execute(
                'SELECT token FROM devices WHERE sube_id = ? AND status = "connected" ORDER BY id DESC LIMIT 1',
                [subeId]
            );
            if (devRows.length > 0) return devRows[0].token;

            return null;
        } catch (error) {
            console.error('Token hatası:', error.message);
            return null;
        }
    }

    async sendAutoMessage(subeId, triggerKey, phone, variables = {}) {
        if (!subeId || !phone) return;

        try {
            const [settings] = await db.execute(
                `SELECT ${triggerKey}_aktif, ${triggerKey}_mesaj FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?`, 
                [subeId]
            );

            if (settings.length === 0 || settings[0][`${triggerKey}_aktif`] !== 1) return;

            let template = settings[0][`${triggerKey}_mesaj`];
            if (!template) return;

            const messageText = this.processTemplate(template, variables);
            const token = await this.getApiToken(subeId);
            
            if (token) {
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                await axios.post(`${WA_API_URL}/api/message/text`, {
                    token: token,
                    to: cleanPhone,
                    text: messageText
                }, { 
                    ...axiosConfig,
                    headers: { 'Content-Type': 'application/json' }, 
                    timeout: 5000 
                });
                
                console.log(`✅ WA Oto: ${triggerKey} -> ${cleanPhone}`);
            }
        } catch (error) {
            console.error(`❌ WA Hata (${triggerKey}):`, error.message);
        }
    }

    async sendManualMessage(subeId, phone, message) {
        try {
            const token = await this.getApiToken(subeId);
            if (!token) throw new Error('Aktif WhatsApp bağlantısı yok.');

            const cleanPhone = phone.replace(/[^0-9]/g, '');

            await axios.post(`${WA_API_URL}/api/message/text`, {
                token: token,
                to: cleanPhone,
                text: message
            }, { 
                ...axiosConfig,
                headers: { 'Content-Type': 'application/json' }, 
                timeout: 5000 
            });

            return true;
        } catch (error) {
            throw error;
        }
    }

    async notifyAdmin(subeId, triggerKey, variables = {}) {
        try {
            const [settings] = await db.execute(
                `SELECT ${triggerKey}_aktif, ${triggerKey}_mesaj FROM whatsapp_mesaj_ayarlari WHERE sube_id = ?`, 
                [subeId]
            );

            if (settings.length === 0 || settings[0][`${triggerKey}_aktif`] !== 1) return;

            let template = settings[0][`${triggerKey}_mesaj`];
            const messageText = this.processTemplate(template, variables);

            const [admins] = await db.execute('SELECT telefon FROM kullanicilar WHERE sube_id = ? AND rol = "yonetici" LIMIT 1', [subeId]);
            let adminPhone = admins.length > 0 ? admins[0].telefon : null;

            if (adminPhone) {
                const token = await this.getApiToken(subeId);
                if(token) {
                    await axios.post(`${WA_API_URL}/api/message/text`, {
                        token: token,
                        to: adminPhone.replace(/[^0-9]/g, ''),
                        text: messageText
                    });
                }
            }
        } catch (e) { console.error('Admin bildirim hatası:', e.message); }
    }
}

module.exports = new WhatsappService();