// ทดสอบ: installBackup (lazy) + backupCronUrl + cron endpoint
const https = require('https');
const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const OWNER = 'aodpongtaptsr@gmail.com';
const PASSWORD = 'Tsr@2026';

function get(url, depth) {
  depth = depth || 0;
  return new Promise(function (resolve) {
    https.get(url, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && depth < 6) {
        r.resume();
        resolve(get(r.headers.location, depth + 1));
        return;
      }
      let d = '';
      r.on('data', function (c) { d += c; });
      r.on('end', function () { resolve(d); });
    }).on('error', function (e) { resolve('ERR ' + e.message); });
  });
}
async function json(url) {
  const b = await get(url);
  try { return JSON.parse(b); } catch (e) { return { ok: false, error: String(b).slice(0, 200) }; }
}

(async function () {
  const login = await json(BASE + '?api=1&action=login&email=' + encodeURIComponent(OWNER) + '&password=' + encodeURIComponent(PASSWORD));
  if (!login.ok) { console.log('login failed:', login.error); return; }
  const tk = encodeURIComponent(login.token);

  const info = await json(BASE + '?api=1&action=backupInfo&token=' + tk);
  console.log('cronUrl:', info.cronUrl ? info.cronUrl.replace(/key=[a-f0-9]+/, 'key=<hidden>') : '(none)');
  console.log('lazy:', info.lazy, '| driveReady:', info.driveReady, '| lastMode:', info.lastMode);

  if (info.cronUrl) {
    const cron = await json(info.cronUrl + '&mode=force');
    console.log('cron(force):', JSON.stringify(cron).slice(0, 300));
    const cron2 = await json(info.cronUrl);
    console.log('cron(auto):', JSON.stringify(cron2).slice(0, 200));
    const bad = await json(BASE + '?api=1&action=backupCron&key=wrong');
    console.log('cron(bad key):', JSON.stringify(bad).slice(0, 160));
  }

  const inst = await json(BASE + '?api=1&action=installBackup&token=' + tk);
  console.log('installBackup:', JSON.stringify(inst).slice(0, 220));
})();
