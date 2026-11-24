// ตรวจบัญชีที่เว็บแอปรันอยู่ (effective user) + สิทธิ์ Drive/Trigger
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
      r.on('end', function () { resolve(d); });
    }).on('error', function (e) { resolve('ERR ' + e.message); });
  });
}

(async function () {
  const body = await get(BASE + '?api=1&action=whoami');
  console.log('whoami raw:', String(body).slice(0, 600));
})();
