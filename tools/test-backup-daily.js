// ทดสอบ endpoint สำหรับตัวตั้งเวลาภายนอก: action=backupDaily (ไม่ต้องมี key)
const https = require('https');
const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';

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
      r.on('end', function () { resolve({ status: r.statusCode, body: d }); });
    }).on('error', function (e) { resolve({ status: 0, body: 'ERR ' + e.message }); });
  });
}

(async function () {
  const r = await get(BASE + '?api=1&action=backupDaily');
  console.log('HTTP', r.status);
  console.log(String(r.body).slice(0, 300));
})();
