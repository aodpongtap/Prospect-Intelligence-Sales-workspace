/**
 * ล้างข้อมูลทดสอบออกจากระบบ (soft delete บน Sheet) + ล้าง Log (archive)
 * ใช้: node tools/purge-test-data.js            → ดูรายการก่อน (dry run)
 *      node tools/purge-test-data.js --apply    → ลบจริง
 */
const https = require('https');
const B = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const ADMIN = { email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' };
const APPLY = process.argv.indexOf('--apply') >= 0;
const TEST_RE = /ทดสอบ|test|\bqa\b|\bqc\b|demo|prod|ตัวอย่าง|sample/i;

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
  const login = await api({ action: 'login', email: ADMIN.email, password: ADMIN.password });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;

  const deals = (await api({ action: 'dealsV2', token: tk })).deals || [];
  const projects = (await api({ action: 'projectsV2', token: tk })).projects || [];

  const badDeals = deals.filter(function (d) { return TEST_RE.test(d.customer || '') || TEST_RE.test(d.job || ''); });
  const badProjects = projects.filter(function (p) { return TEST_RE.test(p.name || '') || TEST_RE.test(p.customer || ''); });

  console.log('โหมด:', APPLY ? 'ลบจริง' : 'dry run (ใส่ --apply เพื่อลบ)');
  console.log('\nดีลที่จะลบ (' + badDeals.length + '):');
  badDeals.forEach(function (d) { console.log('  ' + d.no + ' | ' + d.customer + ' | ' + d.job + ' | ฿' + Number(d.amount || 0).toLocaleString('th-TH')); });
  console.log('\nดีลที่จะเก็บ (' + (deals.length - badDeals.length) + '):');
  deals.filter(function (d) { return badDeals.indexOf(d) < 0; }).forEach(function (d) { console.log('  ' + d.no + ' | ' + d.customer); });
  console.log('\nโครงการที่จะลบ (' + badProjects.length + '):');
  badProjects.forEach(function (p) { console.log('  ' + p.id + ' | ' + p.name); });

  if (!APPLY) { console.log('\n(dry run — ยังไม่ลบอะไร)'); return; }

  console.log('\n--- ลบดีล ---');
  for (const d of badDeals) {
    const r = await api({ action: 'delDeal', token: tk, no: d.no });
    console.log('  ' + d.no + ' → ' + (r.ok ? 'deleted' : 'ERR ' + r.error));
  }
  console.log('--- ลบโครงการ ---');
  for (const p of badProjects) {
    const r = await api({ action: 'delProject', token: tk, no: p.id });
    console.log('  ' + p.id + ' → ' + (r.ok ? 'deleted' : 'ERR ' + r.error));
  }
  console.log('--- ล้าง Log ---');
  console.log('  ' + JSON.stringify(await api({ action: 'logsClear', token: tk })));

  const afterDeals = (await api({ action: 'dealsV2', token: tk })).deals || [];
  const afterProjects = (await api({ action: 'projectsV2', token: tk })).projects || [];
  console.log('\nเหลือดีล:', afterDeals.length, afterDeals.map(function (d) { return d.no; }).join(', '));
  console.log('เหลือโครงการ:', afterProjects.length);
})();
