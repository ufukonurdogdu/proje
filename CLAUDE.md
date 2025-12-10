# CLAUDE.md - netSPOR Student Tracking System

## Project Overview

**netSPOR** is a Turkish student tracking and management system designed for sports training facilities (spor tesisi). This is a full-stack Express.js application with MySQL backend and EJS templating.

- **Language**: JavaScript (Node.js 22)
- **Framework**: Express.js 4.18.2
- **Database**: MySQL 8.0+ with mysql2 driver
- **Templating**: EJS (server-side HTML rendering)
- **Architecture**: MVC (Model-View-Controller)

## Quick Start

```bash
# Install dependencies
npm install

# Development (with auto-restart)
npm run dev

# Production
npm start
```

The server runs on port 3000 by default. Database tables are automatically created on first startup.

**Default Admin Credentials**: `netspor` / `102030`

## Project Structure

```
/home/user/proje/
├── config/
│   └── db.js                 # MySQL connection pool (50 connections)
├── controllers/              # Business logic (16 controllers)
│   ├── adminController.js    # System settings, user management
│   ├── authController.js     # Login/logout authentication
│   ├── basvuruController.js  # Application/enrollment process
│   ├── dersController.js     # Lessons/classes management
│   ├── envanterController.js # Inventory management
│   ├── indexController.js    # Dashboard, statistics
│   ├── kasaController.js     # Accounting/cash management
│   ├── landingController.js  # Public landing page
│   ├── ogrenciController.js  # Student management (59KB - largest)
│   ├── veliController.js     # Parent/guardian portal
│   ├── websiteController.js  # Website management
│   ├── whatsappController.js # WhatsApp integration (89KB)
│   ├── yoklamaController.js  # Attendance tracking
│   └── ...
├── middleware/
│   └── authMiddleware.js     # Permission-based access control
├── routes/                   # API route definitions (16 files)
├── services/                 # Business logic services
│   ├── cronService.js        # Scheduled WhatsApp messages
│   ├── pushService.js        # PWA push notifications
│   └── whatsappService.js    # WhatsApp API integration
├── views/                    # EJS/HTML templates (40+ files)
│   └── partials/             # Reusable components
├── public/                   # Static assets
│   ├── images/               # Logos, favicons
│   ├── uploads/              # User uploads (gallery, WhatsApp)
│   └── service-worker.js     # PWA service worker
├── database/
│   └── sema.sql              # Database schema
├── server.js                 # Main entry point (23KB)
├── setup_db.js               # Database setup script
├── seed.js                   # Admin user seeding
└── seed_form.js              # Form field configuration
```

## Key Conventions

### Code Language
- **All code comments, variable names, and database columns are in Turkish**
- Common Turkish terms:
  - `ogrenci` = student
  - `veli` = parent/guardian
  - `ders` = lesson/class
  - `yoklama` = attendance
  - `kasa` = cash/accounting
  - `aidat` = monthly fee
  - `sube` = branch/location
  - `envanter` = inventory
  - `yonetici` = admin/manager
  - `personel` = staff

### Database Patterns

```javascript
// Always use parameterized queries
const [rows] = await db.execute('SELECT * FROM ogrenci WHERE id = ?', [id]);

// Destructure query results
const [ogrenciler] = await db.execute('SELECT * FROM ogrenci');

// Connection pool is at config/db.js
const db = require('./config/db');
```

- Database uses `utf8mb4` charset for full Unicode support
- Tables use `snake_case` naming in Turkish
- Primary keys are `id INT AUTO_INCREMENT`
- Timestamps: `created_at`, `updated_at`

### Authentication & Authorization

**Session-based authentication** stored in MySQL:
```javascript
// Check authentication
if (!req.session.userID) {
    return res.redirect('/api/auth/login');
}

// User roles
req.session.rol      // 'yonetici' (admin), 'personel' (staff), 'veli' (parent)
req.session.yetkiler // Permission object for staff
req.session.subeId   // Branch ID (multi-tenant)
```

**Permission middleware** (`middleware/authMiddleware.js`):
```javascript
const yetkiKontrol = require('./middleware/authMiddleware');

// Use in routes - admin bypasses all checks
router.get('/page', yetkiKontrol('ogrenci_goruntule'), controller.method);
```

### API Routes

All routes are prefixed with `/api/`:
| Route | Purpose |
|-------|---------|
| `/api/auth` | Authentication (login/logout) |
| `/api/admin` | Admin settings, users, branches |
| `/api/ogrenci` | Student CRUD operations |
| `/api/yoklama` | Attendance tracking |
| `/api/kasa` | Accounting/payments |
| `/api/ders` | Lesson/class management |
| `/api/whatsapp` | WhatsApp integration |
| `/api/envanter` | Inventory management |
| `/api/push` | Push notifications |
| `/veli` | Parent portal |
| `/basvuru` | Public application form |

### Controller Pattern

Controllers export functions that handle HTTP requests:
```javascript
// controllers/exampleController.js
const db = require('../config/db');

exports.listItems = async (req, res) => {
    try {
        const subeId = req.session.subeId;
        const [items] = await db.execute(
            'SELECT * FROM items WHERE sube_id = ?',
            [subeId]
        );
        res.render('items.html', { items, user: req.session });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
```

### Phone Number Formatting

Common helper function used throughout:
```javascript
function formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().trim().replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '0') {
        return '90' + cleaned.substring(1); // Turkish format
    }
    return cleaned;
}
```

### Error Handling

- Use try-catch with async/await
- Log errors with `console.error()`
- Return JSON for API calls: `{ success: false, message: 'error' }`
- Render error pages for HTML responses
- Non-critical errors should not crash the server

### File Uploads

Using `multer` for file uploads:
```javascript
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' });

router.post('/upload', upload.single('file'), controller.handleUpload);
```

Upload directories:
- `public/uploads/galeri/` - Gallery images
- `public/uploads/whatsapp/` - WhatsApp media (auto-cleaned after 10 days)

## External Integrations

### WhatsApp API
- External service at `https://app.netqr.tr`
- API key stored per branch in `wp_api` table
- Supports text and image messages
- Automatic scheduled messages via cron

### Push Notifications
- Uses `web-push` with VAPID keys
- Service worker at `public/service-worker.js`
- Subscriptions stored in database

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `kullanicilar` | Users (admin, staff) |
| `ogrenci` | Students |
| `veli` | Parents/guardians |
| `subeler` | Branches/locations |
| `dersler` | Classes/lessons |
| `yoklama` | Attendance records |
| `aidat` | Monthly fees |
| `kasa` | Financial transactions |
| `genel_ayarlar` | Global settings |
| `wp_api` | WhatsApp API keys per branch |
| `whatsapp_mesaj_log` | WhatsApp message logs |

## Development Notes

### No Build Step
This project has no bundling/compilation. Files are served directly.

### No Testing Framework
Currently no test suite exists. Manual testing is required.

### Auto-initialization
On startup, `server.js` automatically:
1. Creates missing database tables
2. Seeds default admin user
3. Initializes default settings
4. Starts cron jobs for WhatsApp

### Multi-tenancy
The system supports multiple branches (`sube`). Most queries filter by `sube_id` from the user's session.

### Session Configuration
- Sessions stored in MySQL via `express-mysql-session`
- 30-day expiration
- Cookie cleared on browser close

## Common Tasks

### Adding a New Route
1. Create controller in `controllers/`
2. Create route file in `routes/`
3. Register in `server.js`:
```javascript
const newRoutes = require('./routes/newRoutes');
app.use('/api/new', newRoutes);
```

### Adding a New View
1. Create `.html` file in `views/`
2. Use EJS syntax: `<%= variable %>`, `<%- rawHtml %>`
3. Include partials: `<%- include('partials/sidebar') %>`
4. Render from controller: `res.render('newpage.html', { data })`

### Working with WhatsApp Messages
1. Get API key: `SELECT api_key FROM wp_api WHERE sube_id = ?`
2. Send via axios to `https://app.netqr.tr/api/message/text`
3. Log in `whatsapp_mesaj_log` table

## Environment Variables

Required in `.env`:
```
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=<username>
DB_PASS=<password>
DB_NAME=netspor
SESSION_SECRET=<secret>
VAPID_PUBLIC_KEY=<key>
VAPID_PRIVATE_KEY=<key>
VAPID_EMAIL=mailto:email@example.com
```

## Security Considerations

- Always use parameterized queries (SQL injection prevention)
- Validate user input before database operations
- Check `req.session.userID` for authentication
- Use `yetkiKontrol()` middleware for authorization
- Passwords are hashed with bcryptjs (cost factor 10)
- Session secrets should be rotated regularly

## Code Style

- Use `async/await` for database operations
- Destructure query results: `const [rows] = await db.execute(...)`
- Use template literals for dynamic strings
- Comments with emoji indicators (e.g., `// ✅ Success`, `// ❌ Error`)
- Turkish language for user-facing strings and comments
