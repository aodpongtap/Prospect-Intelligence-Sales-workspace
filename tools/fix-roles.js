// ปรับระดับ/สายงานของผู้ใช้ผ่าน API (รันด้วยสิทธิ์ owner)
// ใช้: node tools/fix-roles.js
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const OWNER = 'aodpongtaptsr@gmail.com';
const PASSWORD = 'Tsr@2026';

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
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error || login); return; }
  const tk = encodeURIComponent(login.token);
  console.log('login ok:', login.email, login.level);

  const tasks = [
    { email: 'sittharphon.1994@gmail.com', level: 'head', parent: OWNER },
    { email: 'chanphaphat.k@gmail.com', level: 'head', parent: OWNER },
    { email: 'demo.sale@example.com', level: 'sale', parent: '' },
  ];

  for (const t of tasks) {
    const url = BASE + '?api=1&action=update&token=' + tk
      + '&email=' + encodeURIComponent(t.email)
      + '&level=' + encodeURIComponent(t.level)
      + '&parent=' + encodeURIComponent(t.parent || '');
    const r = await json(url);
    console.log((r.ok ? 'OK  ' : 'ERR '), t.email, '->', t.level, r.ok ? '' : (r.error || ''));
  }

  const us = await json(BASE + '?api=1&action=users&token=' + tk);
  console.log('--- final ---');
  (us.users || []).forEach((x) => console.log(' -', x.email, '=>', x.level, '| parent:', x.parent || '-'));
})();
