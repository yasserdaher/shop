const { db } = require('./db'); // أو عدل المسار حسب مشروعك

db.all('SELECT * FROM products', [], (err, rows) => {
  if (err) {
    return console.error('❌ خطأ في قراءة المنتجات:', err.message);
  }
  console.log('📦 المنتجات الموجودة حالياً:');
  console.table(rows);
});
