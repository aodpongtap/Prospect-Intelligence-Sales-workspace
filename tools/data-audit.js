/**
 * Data audit (read-only) — ตรวจความพร้อมของข้อมูลก่อนใช้งานจริง
 * ใช้: node tools/data-audit.js
 */
const https = require('https');
const B = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const ADMIN = { email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' };

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
const TEST_RE = /ทดสอบ|test|qa|demo|prod|ตัวอย่าง|sample/i;

(async function () {
  const login = await api({ action: 'login', email: ADMIN.email, password: ADMIN.password });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;

  const users = (await api({ action: 'users', token: tk })).users || [];
  const deals = (await api({ action: 'dealsV2', token: tk })).deals || [];
  const targets = (await api({ action: 'targetsV2', token: tk })).targets || [];
  const projects = (await api({ action: 'projectsV2', token: tk })).projects || [];

  console.log('=== USERS (' + users.length + ') ===');
  console.log(['สถานะ', 'อีเมล', 'ชื่อ', 'ระดับ', 'ทีม', 'saleId', 'ข้อมูลพนักงาน'].join(' | '));
  users.forEach(function (u) {
    const emp = [u.empCode ? 'code' : '', u.startDate ? 'start' : '', u.nickname ? 'nick' : '', u.phone ? 'phone' : '', u.lineId ? 'line' : '', u.gmail ? 'gmail' : ''].filter(Boolean);
    const flags = [];
    if (!u.saleId && ['sale', 'agent'].indexOf(String(u.level).toLowerCase()) >= 0) flags.push('!! ไม่มี saleId');
    if (!u.team) flags.push('!! ไม่มีทีม');
    if (!emp.length) flags.push('!! ไม่มีข้อมูลพนักงาน');
    console.log([u.status || '-', u.email, u.name || '-', u.level, u.team || '-', u.saleId || '-', emp.join(',') || '-'].join(' | ') + (flags.length ? '   <<< ' + flags.join(' ; ') : ''));
  });

  console.log('\n=== DEALS (' + deals.length + ') ===');
  deals.forEach(function (d) {
    const test = TEST_RE.test(d.customer || '') || TEST_RE.test(d.job || '');
    console.log([d.no, d.status, d.saleId || '-', d.customer, '|', d.job, '฿' + Number(d.amount || 0).toLocaleString('th-TH')].join(' ') + (test ? '   <<< ดูเหมือนข้อมูลทดสอบ' : ''));
  });

  console.log('\n=== TARGETS (' + targets.length + ') ===');
  targets.forEach(function (t) {
    console.log([t.team || '-', t.saleId || '(ทีม)', t.year, t.month, '฿' + Number(t.amount || 0).toLocaleString('th-TH')].join(' | '));
  });

  console.log('\n=== PROJECTS (' + projects.length + ') ===');
  projects.forEach(function (p) {
    console.log([p.id, p.name, '| owner', p.owner, '| team', p.team, '| stage', p.stage, '| tasks', (p.tasks || []).length].join(' ') + (TEST_RE.test(p.name || '') ? '   <<< ดูเหมือนข้อมูลทดสอบ' : ''));
  });

  const noSale = users.filter(function (u) { return !u.saleId && ['sale', 'agent'].indexOf(String(u.level).toLowerCase()) >= 0; });
  const noEmp = users.filter(function (u) { return !u.empCode && !u.startDate && !u.nickname && !u.phone && !u.lineId && !u.gmail; });
  const noTeam = users.filter(function (u) { return !u.team; });
  const testDeals = deals.filter(function (d) { return TEST_RE.test(d.customer || '') || TEST_RE.test(d.job || ''); });
  const testProjects = projects.filter(function (p) { return TEST_RE.test(p.name || ''); });

  console.log('\n=== SUMMARY ===');
  console.log('AE/ตัวแทนที่ยังไม่ผูก saleId:', noSale.length, noSale.map(function (u) { return u.email; }).join(', ') || '-');
  console.log('ผู้ใช้ที่ยังไม่มีข้อมูลพนักงาน:', noEmp.length + '/' + users.length);
  console.log('ผู้ใช้ที่ยังไม่ผูกทีม:', noTeam.length, noTeam.map(function (u) { return u.email; }).join(', ') || '-');
  console.log('ดีลที่ดูเหมือนข้อมูลทดสอบ:', testDeals.length, testDeals.map(function (d) { return d.no; }).join(', ') || '-');
  console.log('โครงการที่ดูเหมือนข้อมูลทดสอบ:', testProjects.length, testProjects.map(function (p) { return p.id; }).join(', ') || '-');
  console.log('Target ที่มีอยู่:', targets.length, '(ต้องมีอย่างน้อย = จำนวนทีม × เดือนที่ใช้งาน)');
})();
