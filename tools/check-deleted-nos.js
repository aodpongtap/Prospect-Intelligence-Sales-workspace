// ตรวจ response ของ dealsV2 ว่ามี deletedNos หรือไม่
const https = require('https');
const B = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
function g(u, d) {
  d = d || 0;
  return new Promise(function (res) {
    https.get(u, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && d < 6) { r.resume(); return res(g(r.headers.location, d + 1)); }
      let b = '';
      r.on('data', function (c) { b += c; });
      r.on('end', function () { res(b); });
    }).on('error', function (e) { res('ERR ' + e.message); });
  });
}
(async function () {
  const login = JSON.parse(await g(B + '?api=1&action=login&email=aodpongtaptsr%40gmail.com&password=Tsr%402026'));
  const r = JSON.parse(await g(B + '?api=1&action=dealsV2&token=' + encodeURIComponent(login.token) + '&_ts=' + Date.now()));
  console.log('deals:', (r.deals || []).length, (r.deals || []).map(function (d) { return d.no; }).join(','));
  console.log('deletedNos:', JSON.stringify(r.deletedNos || null));
})();
