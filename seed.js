// seed.js - Veritabanına ilk verileri ekler
const db = require('./config/db');
const bcrypt = require('bcryptjs');

async function ilkKurulum() {
    try {
        console.log("Kurulum başlıyor...");

        // 1. Genel Ayarları Ekle (Eğer yoksa)
        const [ayarlar] = await db.execute('SELECT * FROM genel_ayarlar');
        if (ayarlar.length === 0) {
            await db.execute(`
                INSERT INTO genel_ayarlar (site_adresi, tesis_adi, ana_renk, ara_renk, kurulum_yapildi_mi) 
                VALUES ('http://localhost:3000', 'netSPOR', '#007bff', '#6c757d', 1)
            `);
            console.log("✅ Genel ayarlar oluşturuldu.");
        }

        // 2. Ana Yöneticiyi Ekle (netspor / 102030)
        const [users] = await db.execute('SELECT * FROM kullanicilar WHERE kullanici_adi = ?', ['netspor']);
        if (users.length === 0) {
            // Şifreyi güvenli hale getiriyoruz (Hashing)
            const sifreHash = await bcrypt.hash('102030', 10);
            
            await db.execute(`
                INSERT INTO kullanicilar (ad_soyad, kullanici_adi, sifre, rol, durum) 
                VALUES (?, ?, ?, 'yonetici', 1)
            `, ['Ana Yönetici', 'netspor', sifreHash]);
            
            console.log("✅ Ana Yönetici (netspor) oluşturuldu.");
        } else {
            console.log("ℹ️ Yönetici zaten mevcut.");
        }

        console.log("Kurulum tamamlandı. Çıkış yapılıyor...");
        process.exit();

    } catch (error) {
        console.error("Hata:", error);
        process.exit(1);
    }
}

ilkKurulum();