 fetch('/create-checkout-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ productId: 1 }) // مثال: شراء المنتج رقم 1
})
.then(res => res.json())
.then(data => {
  if(data.id) {
    // تحويل المستخدم إلى صفحة الدفع في Stripe
    const stripe = Stripe('pk_test_...'); // مفتاح النشر الخاص بك
    stripe.redirectToCheckout({ sessionId: data.id });
  } else {
    alert('حدث خطأ في إنشاء جلسة الدفع');
  }
})
.catch(console.error);
