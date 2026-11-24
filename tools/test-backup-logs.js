// ทดสอบ API: installBackup / backupNow / backupInfo / logs
// ใช้: node tools/test-backup-logs.js
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
  try { return JSON.parse(r.body); } catch (e) { return { ok: false, error: r.body.slice(0, 200) }; }
}

(async () => {
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error || JSON.stringify(login).slice(0, 200)); return; }
  const tk = encodeURIComponent(login.token);
  console.log('login ok:', login.email, login.level);

  const info0 = await json(BASE + '?api=1&action=backupInfo&token=' + tk);
  console.log('backupInfo (before):', JSON.stringify(info0));

  const inst = await json(BASE + '?api=1&action=installBackup&token=' + tk);
  console.log('installBackup:', JSON.stringify(inst));

  const now = await json(BASE + '?api=1&action=backupNow&token=' + tk);
  console.log('backupNow:', JSON.stringify(now).slice(0, 400));

  const info1 = await json(BASE + '?api=1&action=backupInfo&token=' + tk);
  console.log('backupInfo (after):', JSON.stringify(info1));

  const logs = await json(BASE + '?api=1&action=logs&token=' + tk + '&limit=10');
  console.log('logs.ok:', logs.ok, 'count:', logs.count, 'returned:', (logs.logs || []).length);
  console.log('counts:', JSON.stringify(logs.counts));
  console.log('actions:', JSON.stringify((logs.actions || []).slice(0, 12)));
  console.log('first log:', JSON.stringify((logs.logs || [])[0]));
})();
