// ทดสอบ backupNow + logs
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
  try { return JSON.parse(r.body); } catch (e) { return { ok: false, error: (r.body || '').slice(0, 300) }; }
}

(async () => {
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error); return; }
  const tk = encodeURIComponent(login.token);

  console.log('--- backupNow ---');
  console.log(JSON.stringify(await json(BASE + '?api=1&action=backupNow&token=' + tk)).slice(0, 500));

  console.log('--- backupInfo ---');
  console.log(JSON.stringify(await json(BASE + '?api=1&action=backupInfo&token=' + tk)).slice(0, 500));

  console.log('--- logs ---');
  const logs = await json(BASE + '?api=1&action=logs&token=' + tk + '&limit=10');
  console.log('ok:', logs.ok, 'count:', logs.count, 'returned:', (logs.logs || []).length);
  console.log('counts:', JSON.stringify(logs.counts));
  console.log('first:', JSON.stringify((logs.logs || [])[0]));
})();
