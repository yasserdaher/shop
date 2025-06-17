require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'myshop_secret_key',
  resave: false,
  saveUninitialized: false,
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '20082008';

function requireLogin(req, res, next) {
  if (req.session && req.session.admin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// --- صفحات الأدمن ---
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.admin = { username };
    res.redirect('/admin/dashboard');
  } else {
    res.render('admin/login', { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin/dashboard', requireLogin, (req, res) => {
  db.all('SELECT * FROM products', [], (err, products) => {
    if (err) return res.send('خطأ في جلب المنتجات');
    res.render('admin/dashboard', { admin: req.session.admin, products });
  });
});

app.get('/admin/products/add', requireLogin, (req, res) => {
  res.render('admin/add-product');
});

app.post('/admin/products/add', requireLogin, (req, res) => {
  const { title, description, price, image, download_link } = req.body;
  const sql = `INSERT INTO products (title, description, price, image, download_link) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [title, description, price, image, download_link], function(err) {
    if (err) return res.send('حدث خطأ أثناء إضافة المنتج.');
    res.redirect('/admin/dashboard');
  });
});

app.get('/admin/products/edit/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err || !product) return res.send('المنتج غير موجود.');
    res.render('admin/edit-product', { product });
  });
});

app.post('/admin/products/edit/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  const { title, description, price, image, download_link } = req.body;
  const sql = `UPDATE products SET title=?, description=?, price=?, image=?, download_link=? WHERE id=?`;
  db.run(sql, [title, description, price, image, download_link, id], function(err) {
    if (err) return res.send('حدث خطأ أثناء تعديل المنتج.');
    res.redirect('/admin/dashboard');
  });
});

app.post('/admin/products/delete/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) return res.send('حدث خطأ أثناء حذف المنتج.');
    res.redirect('/admin/dashboard');
  });
});

// --- واجهة المتجر ---
app.get('/', (req, res) => {
  res.render('store');
});

app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب المنتجات:', err.message);
      return res.status(500).json({ error: 'فشل في جلب المنتجات' });
    }
    res.json(rows);
  });
});

// مسار تحميل مجاني
app.get('/free-download/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err || !product) return res.send('المنتج غير موجود.');
    if (product.price > 0) return res.send('هذا المنتج غير مجاني.');
    res.redirect(product.download_link);
  });
});

// إنشاء جلسة دفع Stripe (أو تحميل مجاني)
app.post('/create-checkout-session', (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'معرف المنتج مطلوب' });

  db.get('SELECT * FROM products WHERE id = ?', [productId], async (err, product) => {
    if (err || !product) return res.status(400).json({ error: 'المنتج غير موجود' });

    // إذا كان مجاني، نعيد رابط مباشر للتحميل
    if (product.price === 0) {
      return res.json({ freeDownload: true, downloadLink: `/free-download/${productId}` });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: product.title,
                description: product.description,
              },
              unit_amount: Math.round(product.price * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `http://localhost:${PORT}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://localhost:${PORT}/cancel`,
      });
      res.json({ id: session.id });
    } catch (stripeErr) {
      console.error('Stripe error:', stripeErr);
      res.status(500).json({ error: 'خطأ من Stripe أثناء إنشاء جلسة الدفع' });
    }
  });
});

// مسار لتحميل المنتج المجاني
app.get('/free-download-link/:productId', (req, res) => {
  const productId = parseInt(req.params.productId);
  db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
    if (err || !product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (parseFloat(product.price) !== 0) {
      return res.status(403).json({ error: 'هذا المنتج ليس مجانياً' });
    }

    return res.json({ url: product.download_link });
  });
});


app.get('/success', (req, res) => {
  res.render('success', { sessionId: req.query.session_id });
});

app.get('/cancel', (req, res) => {
  res.render('cancel');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

