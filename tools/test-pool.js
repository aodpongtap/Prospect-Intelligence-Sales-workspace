// ทดสอบ backup โหมด pool (ไฟล์แยกใน Drive แบบหมุนเวียน)
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

  console.log('--- backupNow (auto mode) ---');
  const now = await json(BASE + '?api=1&action=backupNow&token=' + tk);
  console.log(JSON.stringify(now).slice(0, 600));

  console.log('--- backupInfo ---');
  const info = await json(BASE + '?api=1&action=backupInfo&token=' + tk);
  console.log('lastMode:', info.lastMode, '| lastName:', info.lastName, '| poolSize:', info.poolSize, '| driveReady:', info.driveReady);
  console.log('lastUrl:', info.lastUrl);
})();
