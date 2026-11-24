// รีเซ็ตข้อมูล QA: ลบโครงการทั้งหมด + ล้าง Log (เก็บ archive)
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
function api(p) {
  const qs = Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k] == null ? '' : p[k]); }).join('&');
  return g(B + '?api=1&' + qs).then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, error: String(t).slice(0, 200) }; } });
}
(async function () {
  const login = await api({ action: 'login', email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;
  const list = (await api({ action: 'projectsV2', token: tk })).projects || [];
  for (const p of list) {
    const r = await api({ action: 'delProject', token: tk, no: p.id });
    console.log('del project', p.id, r.ok ? 'ok' : r.error);
  }
  console.log('projects left:', ((await api({ action: 'projectsV2', token: tk })).projects || []).length);
  console.log('clear logs:', JSON.stringify(await api({ action: 'logsClear', token: tk })));
})();
