// ล้าง Log ทั้งหมด (สำรองอัตโนมัติ) + ตรวจผล
const https = require('https');
const B = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
function g(u, d) {
  d = d || 0;
  return new Promise(function (res) {
    https.get(u, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && d < 6) { r.resume(); return res(g(r.headers.location, d + 1)); }
      let b = '';
      r.on('data', function (c) { b += c; });
      r.on('end', function () { res(b); });
    }).on('error', function (e) { res('ERR ' + e.message); });
  });
}
function api(p) {
  const qs = Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k] == null ? '' : p[k]); }).join('&');
  return g(B + '?api=1&' + qs).then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, error: String(t).slice(0, 200) }; } });
}
(async function () {
  const login = await api({ action: 'login', email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;

  const before = await api({ action: 'logs', token: tk, limit: 5 });
  console.log('logs before:', before.counts ? JSON.stringify(before.counts) : '?');

  console.log('--- clear ---');
  console.log(JSON.stringify(await api({ action: 'logsClear', token: tk })));

  const after = await api({ action: 'logs', token: tk, limit: 5 });
  console.log('logs after:', (after.logs || []).length, 'rows |', JSON.stringify(after.counts));

  // ตรวจว่า non-admin เรียกไม่ได้
  const bad = await api({ action: 'logsClear' });
  console.log('logsClear without token:', JSON.stringify(bad).slice(0, 120));
})();
