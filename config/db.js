const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 50, // 10'dan 50'ye çıkarıldı ✅
    queueLimit: 0,
    charset: 'utf8mb4',
    multipleStatements: true,
    connectTimeout: 10000, // 10 saniye connection timeout
    acquireTimeout: 10000, // Connection pool'dan bağlantı almak için 10 saniye
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

const db = pool.promise();

module.exports = db;