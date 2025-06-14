require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database'); // تأكد أن ملف قاعدة البيانات موجود ومهيأ صح
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = 3000;

// إعدادات العرض
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ملفات ثابتة (css, js, صور...)
app.use(express.static(path.join(__dirname, 'public')));

// body parser (للتعامل مع POST body)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// إعدادات الجلسة
app.use(session({
  secret: 'mysecret123',
  resave: false,
  saveUninitialized: true,
}));

// تحقق دخول الأدمن
function checkAdminAuth(req, res, next) {
  if (req.session && req.session.admin) {
    next();
  } else {
    res.redirect('/login');
  }
}

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password], (err, admin) => {
    if (err) throw err;
    if (admin) {
      req.session.admin = admin;
      res.redirect('/admin');
    } else {
      res.render('login', { error: 'اسم المستخدم أو كلمة المرور خاطئة' });
    }
  });
});

// تسجيل خروج الأدمن
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// لوحة تحكم الأدمن - عرض المنتجات
app.get('/admin', checkAdminAuth, (req, res) => {
  db.all('SELECT * FROM products', (err, products) => {
    if (err) throw err;
    res.render('admin-dashboard', { admin: req.session.admin, products });
  });
});

// إضافة منتج جديد
app.get('/admin/products/add', checkAdminAuth, (req, res) => {
  res.render('add-product');
});

app.post('/admin/products/add', checkAdminAuth, (req, res) => {
  const { title, description, price, image, download_link } = req.body;
  db.run('INSERT INTO products (title, description, price, image, download_link) VALUES (?, ?, ?, ?, ?)',
    [title, description, price, image, download_link], (err) => {
      if (err) throw err;
      res.redirect('/admin');
    });
});

// تعديل منتج
app.get('/admin/products/edit/:id', checkAdminAuth, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err) throw err;
    if (!product) return res.redirect('/admin');
    res.render('edit-product', { product });
  });
});

app.post('/admin/products/edit/:id', checkAdminAuth, (req, res) => {
  const id = req.params.id;
  const { title, description, price, image, download_link } = req.body;
  db.run('UPDATE products SET title=?, description=?, price=?, image=?, download_link=? WHERE id=?',
    [title, description, price, image, download_link, id], (err) => {
      if (err) throw err;
      res.redirect('/admin');
    });
});

// حذف منتج
app.post('/admin/products/delete/:id', checkAdminAuth, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM products WHERE id = ?', [id], (err) => {
    if (err) throw err;
    res.redirect('/admin');
  });
});

// واجهة المتجر - عرض جميع المنتجات
app.get('/', (req, res) => {
  db.all('SELECT * FROM products', (err, products) => {
    if (err) throw err;
    res.render('store', { products });
  });
});

// إنشاء جلسة Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  const { productId } = req.body;
  try {
    const product = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.title,
            description: product.description,
            images: product.image ? [product.image] : [],
          },
          unit_amount: Math.round(product.price * 100), // السعر بالسنت
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `http://localhost:${PORT}/success?session_id={CHECKOUT_SESSION_ID}&product_id=${product.id}`,
      cancel_url: `http://localhost:${PORT}/`,
    });

    res.json({ id: session.id });

  } catch (err) {
    console.error('Stripe checkout session error:', err);
    res.status(500).json({ error: 'حدث خطأ في إنشاء جلسة الدفع' });
  }
});

// صفحة نجاح الدفع وعرض رابط التحميل
app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;
  const productId = req.query.product_id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
        if (err) throw err;
        if (!product) return res.send('المنتج غير موجود');
        res.render('success', { product });
      });
    } else {
      res.send('الدفع لم يكتمل بعد.');
    }
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.send('حدث خطأ في التحقق من حالة الدفع.');
  }
});

// صفحة تحميل المنتج (حالياً بدون تحقق، يمكن تطوير نظام تحقق لاحقاً)
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err) throw err;
    if (!product) return res.status(404).send('المنتج غير موجود');
    res.redirect(product.download_link || '/');
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
