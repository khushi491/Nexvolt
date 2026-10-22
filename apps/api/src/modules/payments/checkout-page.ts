import { formatINR } from '@nexvolt/shared';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export interface CheckoutPageInput {
  nonce: string;
  token: string;
  paymentId: string;
  provider: 'RAZORPAY' | 'DEMO';
  keyId: string | null;
  orderId: string;
  amountMinor: number;
  bookingCode: string;
  title: string;
  startText: string;
  payable: boolean;
}

/**
 * Minimal hosted checkout used by both web and the mobile WebView. On completion it
 * posts the result to the native app (ReactNativeWebView) or the opener window; the
 * server re-verifies everything — the page itself is never trusted.
 */
export function renderCheckoutPage(i: CheckoutPageInput): string {
  const data = JSON.stringify({
    token: i.token,
    paymentId: i.paymentId,
    provider: i.provider,
    keyId: i.keyId,
    orderId: i.orderId,
    amount: i.amountMinor,
    bookingCode: i.bookingCode,
  }).replace(/</g, '\\u003c');
  const isDemo = i.provider === 'DEMO';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nexvolt checkout</title>
<style nonce="${i.nonce}">
  body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F9FC;color:#101F35}
  .wrap{max-width:440px;margin:0 auto;padding:24px}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(16,31,53,.08);padding:24px}
  .brand{font-weight:700;letter-spacing:.2px}.brand span{color:#12B8A6}
  .muted{color:#66758C;font-size:14px}.amt{font-size:32px;font-weight:700;margin:12px 0}
  .demo{background:#FFF4E0;border:2px dashed #E6A23C;color:#8a5a00;border-radius:12px;padding:12px;font-weight:700;text-align:center;margin:16px 0}
  button{width:100%;min-height:48px;border:0;border-radius:12px;font-size:16px;font-weight:600;margin-top:12px;cursor:pointer}
  button:focus-visible{outline:3px solid #12B8A6;outline-offset:2px}
  .primary{background:#12B8A6;color:#fff}.secondary{background:#fff;color:#DC4C57;border:1px solid #DC4C57}
  #status{margin-top:16px;font-weight:600}
</style></head><body><div class="wrap"><div class="card">
<div class="brand">Nex<span>volt</span></div>
<p class="muted">Booking ${esc(i.bookingCode)} · ${esc(i.title)}<br>${esc(i.startText)}</p>
<div class="amt">${formatINR(i.amountMinor, { showPaise: true })}</div>
${isDemo ? '<div class="demo" role="alert">DEMO PAYMENT — no real money moves. Local development only.</div>' : '<p class="muted">Secure payment by Razorpay (UPI, cards, netbanking).</p>'}
${
  !i.payable
    ? '<p id="status">This payment is no longer pending. Return to the app.</p>'
    : isDemo
      ? '<button class="primary" id="ok">Simulate successful DEMO payment</button><button class="secondary" id="fail">Simulate failed DEMO payment</button>'
      : '<button class="primary" id="pay">Pay now</button>'
}
<p id="status" role="status" aria-live="polite"></p>
</div></div>
${isDemo || !i.payable ? '' : '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>'}
<script nonce="${i.nonce}">
(function(){
  var d = ${data};
  var st = document.getElementById('status');
  function done(result){
    st.textContent = result.ok ? 'Payment verified. Returning to Nexvolt…' : (result.message || 'Payment not completed.');
    var msg = JSON.stringify({ type: 'nexvolt-payment', ok: !!result.ok, bookingId: result.bookingId, bookingStatus: result.bookingStatus, isDemo: d.provider === 'DEMO' });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    if (window.opener) { try { window.opener.postMessage(msg, '*'); } catch (e) {} }
  }
  function post(path, body){
    return fetch('/api/v1/payments/checkout/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok && j.bookingStatus === 'CONFIRMED', bookingId: j.bookingId, bookingStatus: j.bookingStatus, message: j.message }; }); })
      .catch(function(){ return { ok: false, message: 'Network error. If money was debited it will be reconciled automatically.' }; });
  }
  var ok = document.getElementById('ok'), fail = document.getElementById('fail'), pay = document.getElementById('pay');
  if (ok) ok.onclick = function(){ st.textContent = 'Processing DEMO payment…'; post('demo', { token: d.token, outcome: 'SUCCESS' }).then(done); };
  if (fail) fail.onclick = function(){ st.textContent = 'Processing DEMO failure…'; post('demo', { token: d.token, outcome: 'FAILURE' }).then(done); };
  if (pay) pay.onclick = function(){
    var rzp = new Razorpay({
      key: d.keyId, amount: d.amount, currency: 'INR', order_id: d.orderId, name: 'Nexvolt',
      description: 'Booking ' + d.bookingCode, theme: { color: '#12B8A6' },
      handler: function(resp){
        st.textContent = 'Verifying payment…';
        post('verify', { token: d.token, providerOrderId: resp.razorpay_order_id, providerPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }).then(done);
      },
      modal: { ondismiss: function(){ st.textContent = 'Payment window closed. You can try again.'; } }
    });
    rzp.on('payment.failed', function(){ st.textContent = 'Payment failed. You have not been charged; you can retry.'; });
    rzp.open();
  };
})();
</script></body></html>`;
}
