const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function tablolariKur() {
    console.log("Tablolar oluşturuluyor...");

    try {
        // 1. Veritabanı bağlantısı oluştur (Çoklu sorgu izni ile)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            multipleStatements: true // SQL dosyasındaki tüm komutları tek seferde işlemek için şart
        });

        // 2. SQL dosyasını oku
        const sqlDosyaYolu = path.join(__dirname, 'database', 'sema.sql');
        const sqlKomutlari = fs.readFileSync(sqlDosyaYolu, 'utf8');

        // 3. Komutları çalıştır
        await connection.query(sqlKomutlari);

        console.log("✅ Tüm tablolar başarıyla oluşturuldu!");
        
        await connection.end();

    } catch (error) {
        console.error("❌ Tablo oluşturma hatası:", error);
    }
}

tablolariKur();