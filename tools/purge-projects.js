// ลบโครงการทดสอบทั้งหมด (soft delete บน Sheet) แล้วยืนยันผล
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
function api(params) {
  const qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k] == null ? '' : params[k]); }).join('&');
  return g(B + '?api=1&' + qs).then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, error: String(t).slice(0, 200) }; } });
}
(async function () {
  const login = await api({ action: 'login', email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;

  const before = await api({ action: 'projectsV2', token: tk });
  const list = before.projects || [];
  console.log('projects before:', list.length);
  list.forEach(function (p) { console.log('  -', p.id, '|', p.name); });

  for (const p of list) {
    const r = await api({ action: 'delProject', token: tk, no: p.id });
    console.log('  del', p.id, '→', r.ok ? 'ok' : ('ERR ' + r.error));
  }

  const after = await api({ action: 'projectsV2', token: tk });
  console.log('projects after:', (after.projects || []).length);
})();
