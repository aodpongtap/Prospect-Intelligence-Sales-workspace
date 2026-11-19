// ตั้งระดับ/สายงานให้ผู้ใช้ 1 คน ผ่าน API (สิทธิ์ owner)
// ใช้: node tools/set-role.js <email> <level> [parentEmail]
// level = admin | bu | head | sup | sale | agent
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const OWNER = 'aodpongtaptsr@gmail.com';
const PASSWORD = 'Tsr@2026';

const email = process.argv[2];
const level = process.argv[3];
const parent = process.argv[4] || '';

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
  if (!email || !level) {
    console.log('usage: node tools/set-role.js <email> <level> [parentEmail]');
    return;
  }
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error || login); return; }

  const url = BASE + '?api=1&action=update&token=' + encodeURIComponent(login.token)
    + '&email=' + encodeURIComponent(email)
    + '&level=' + encodeURIComponent(level)
    + '&parent=' + encodeURIComponent(parent);
  const r = await json(url);
  console.log(r.ok ? 'OK ' : 'ERR', email, '->', level, r.ok ? '' : (r.error || ''));

  const us = await json(BASE + '?api=1&action=users&token=' + encodeURIComponent(login.token));
  (us.users || []).forEach((x) => console.log(' -', x.email, '=>', x.level, '| parent:', x.parent || '-'));
})();
