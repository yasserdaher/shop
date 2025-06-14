
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'store.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // جدول الأدمن
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  // جدول المنتجات
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    price REAL,
    image TEXT,
    download_link TEXT
  )`);

  // تأكد من وجود أدمن افتراضي
  db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      db.run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', '123456']);
    }
  });
});

module.exports = db;
