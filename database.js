const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'store.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ خطأ في فتح قاعدة البيانات:', err.message);
  } else {
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح.');
    createTables();
  }
});

function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT NOT NULL,
      download_link TEXT NOT NULL
    );
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول المنتجات:', err.message);
    } else {
      console.log('✅ تم إنشاء جدول المنتجات.');
    }
  });
}

module.exports = { db };
