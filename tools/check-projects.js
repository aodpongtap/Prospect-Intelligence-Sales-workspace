// ตรวจรายการโครงการบนคลาวด์
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
  const r = JSON.parse(await g(B + '?api=1&action=projectsV2&token=' + encodeURIComponent(login.token)));
  console.log('projects on cloud:', (r.projects || []).length);
  (r.projects || []).forEach(function (p) {
    console.log(' -', p.id, '|', p.name, '| owner:', p.owner, '| stage', p.stage, '| prog', p.progress, '| tasks', (p.tasks || []).length, '| team', p.team);
  });
})();
