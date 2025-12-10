// middleware/authMiddleware.js

const yetkiKontrol = (gerekliYetki) => {
    return (req, res, next) => {
        // 1. Giriş yapmamışsa at
        if (!req.session.userID) {
            return res.redirect('/api/auth/login');
        }

        // 2. Yönetici ise her yere girebilir (VIP)
        if (req.session.rol === 'yonetici') {
            return next();
        }

        // 3. Personelse yetkisine bak
        const kullaniciYetkileri = req.session.yetkiler || {};

        if (kullaniciYetkileri[gerekliYetki] === true) {
            return next(); // İzin var, geç
        } else {
            // İzin yoksa hata sayfası veya uyarı
            return res.status(403).send(`
                <body style="background:#f3f5f9; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
                    <div style="background:white; padding:40px; border-radius:20px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                        <h1 style="color:#ef4444; font-size:60px; margin:0;">403</h1>
                        <h3 style="color:#2d3748;">Erişim Yetkiniz Yok</h3>
                        <p style="color:#64748b;">Bu sayfayı görüntülemek için gerekli izne sahip değilsiniz.</p>
                        <a href="/" style="display:inline-block; margin-top:20px; text-decoration:none; background:#007bff; color:white; padding:10px 20px; border-radius:10px;">Ana Sayfaya Dön</a>
                    </div>
                </body>
            `);
        }
    };
};

module.exports = yetkiKontrol;