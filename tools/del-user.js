// ลบผู้ใช้ออกจากระบบผ่าน API (สิทธิ์ owner)
// ใช้: node tools/del-user.js <email>
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const OWNER = 'aodpongtaptsr@gmail.com';
const PASSWORD = 'Tsr@2026';
const target = process.argv[2];

function get(url, depth = 0) {
  return new Promise((resolve) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && depth < 6) {
        r.resume();
        resolve(get(r.headers.location, depth + 1));
        return;
      }
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
  });
}
async function json(url) {
  const r = await get(url);
  try { return JSON.parse(r.body); } catch (e) { return { ok: false, error: r.body.slice(0, 180) }; }
}

(async () => {
  if (!target) { console.log('usage: node tools/del-user.js <email>'); return; }
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error || login); return; }
  const r = await json(BASE + '?api=1&action=remove&token=' + encodeURIComponent(login.token) + '&email=' + encodeURIComponent(target));
  console.log(r.ok ? 'DELETED ' : 'ERR ', target, r.ok ? '' : (r.error || ''));
  const us = await json(BASE + '?api=1&action=users&token=' + encodeURIComponent(login.token));
  console.log('remaining users:', (us.users || []).length);
  (us.users || []).forEach((u) => console.log(' -', u.email, u.level));
})();
