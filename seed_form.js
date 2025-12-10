// seed_form.js - Form Alanlarını Sıfırlar ve Varsayılanları Yükler
const db = require('./config/db');

async function formAlanlariniKur() {
    console.log("Form alanları yapılandırılıyor...");

    try {
        // Önce temizle (Çakışma olmasın)
        await db.execute("TRUNCATE TABLE ogrenci_form_ayarlari");

        // Senin İstediğin Varsayılan Liste
        const varsayilanAlanlar = [
            // Veli Bilgileri - BABA
            { ad: "Baba Ad Soyad", tip: "text", zorunlu: 0, sira: 1 },
            { ad: "Baba Telefon", tip: "tel", zorunlu: 0, sira: 2 },
            { ad: "Baba Meslek", tip: "text", zorunlu: 0, sira: 3 },
            
            // Veli Bilgileri - ANNE
            { ad: "Anne Ad Soyad", tip: "text", zorunlu: 0, sira: 4 },
            { ad: "Anne Telefon", tip: "tel", zorunlu: 0, sira: 5 },
            { ad: "Anne Meslek", tip: "text", zorunlu: 0, sira: 6 },
            
            // İkametgah
            { ad: "İkametgah Adresi", tip: "textarea", zorunlu: 0, sira: 7 },
            
            // Ekstra Örnek (Sonradan panelden silinebilir)
            { ad: "Acil Durumda Aranacak Kişi", tip: "text", zorunlu: 0, sira: 8 }
        ];

        for (const alan of varsayilanAlanlar) {
            await db.execute(`
                INSERT INTO ogrenci_form_ayarlari (alan_adi, alan_tipi, zorunlu_mu, sira, gosterim_aktif) 
                VALUES (?, ?, ?, ?, 1)
            `, [alan.ad, alan.tip, alan.zorunlu, alan.sira]);
        }

        console.log("✅ Varsayılan form alanları (Baba, Anne, Adres vb.) yüklendi.");
        process.exit();

    } catch (error) {
        console.error("Hata:", error);
        process.exit(1);
    }
}

formAlanlariniKur();