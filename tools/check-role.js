// ตรวจระดับสิทธิ์ของผู้ใช้จาก API (ล็อกอินเป็น owner)
// ใช้: node tools/check-role.js [email] [password]
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const EMAIL = process.argv[2] || 'aodpongtaptsr@gmail.com';
const PASSWORD = process.argv[3] || 'Tsr@2026';

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

(async () => {
  const login = await get(BASE + '?api=1&action=login&email=' + encodeURIComponent(EMAIL) + '&password=' + encodeURIComponent(PASSWORD));
  let j = null;
  try { j = JSON.parse(login.body); } catch (e) {}
  if (!j || !j.ok) {
    console.log('login failed:', login.status, login.body.slice(0, 160));
    return;
  }
  console.log('login ok:', j.email, '| level:', j.level);

  const us = await get(BASE + '?api=1&action=users&token=' + encodeURIComponent(j.token));
  let u = null;
  try { u = JSON.parse(us.body); } catch (e) {}
  if (!u || !u.ok) {
    console.log('users failed:', us.status, us.body.slice(0, 200));
    return;
  }
  console.log('levels:', (u.levels || []).join(','));
  (u.users || []).forEach((x) => {
    console.log(' -', x.email, '=>', x.level, '| parent:', x.parent || '-', '|', x.status);
  });
})();
