/**
 * QA suite — ตรวจ API + สิทธิ์ + validation + backup (สร้าง/ลบข้อมูลทดสอบให้เอง)
 * ใช้: node tools/qa-full.js
 */
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const ADMIN = { email: 'aodpongtaptsr@gmail.com', password: 'Tsr@2026' };
const TEMP_EMAIL = 'qa.temp.' + Date.now() + '@example.com';

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra).slice(0, 160) });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   [' + String(extra).slice(0, 160) + ']' : ''));
}

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
async function api(params) {
  const qs = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k] == null ? '' : params[k]);
  }).join('&');
  const body = await get(BASE + '?api=1&' + qs);
  try { return JSON.parse(body); } catch (e) { return { ok: false, error: String(body).slice(0, 200) }; }
}

(async function () {
  console.log('=== 1) AUTH & DATA ===');
  const login = await api({ action: 'login', email: ADMIN.email, password: ADMIN.password });
  check('admin login', login.ok === true && login.level === 'admin', login.error || login.level);
  const tk = login.token;
  if (!tk) { console.log('abort: no token'); return; }

  const users = await api({ action: 'users', token: tk });
  check('users list', users.ok && Array.isArray(users.users) && users.users.length > 0, (users.users || []).length + ' users');
  const withEmp = (users.users || []).filter(function (u) { return u.empCode || u.startDate || u.nickname; }).length;
  check('employee profile fields present', withEmp > 0, withEmp + ' users มีข้อมูลพนักงาน');

  const deals = await api({ action: 'dealsV2', token: tk });
  check('dealsV2', deals.ok && Array.isArray(deals.deals), (deals.deals || []).length + ' deals');
  const badProb = (deals.deals || []).filter(function (d) {
    const map = { 0: 25, 1: 50, 2: 75, 3: 90, 4: 100, 5: 0 };
    return Number(d.prob) !== map[Number(d.status)];
  });
  check('prob ล็อกตามสถานะครบทุกดีล', badProb.length === 0, badProb.length + ' ผิด');

  const targets = await api({ action: 'targetsV2', token: tk });
  check('targetsV2', targets.ok && Array.isArray(targets.targets), (targets.targets || []).length + ' targets');
  const daily = await api({ action: 'dailyV2', token: tk });
  check('dailyV2', daily.ok && Array.isArray(daily.items), (daily.items || []).length + ' daily');

  console.log('\n=== 2) ACTIVITY LOG ===');
  const logs = await api({ action: 'logs', token: tk, limit: 50 });
  check('logs list', logs.ok === true && Array.isArray(logs.logs), (logs.logs || []).length + ' rows (0 = เริ่มนับใหม่ได้)');
  const sorted = (logs.logs || []).every(function (l, i, a) { return i === 0 || String(a[i - 1].ts) >= String(l.ts); });
  check('logs เรียงใหม่→เก่า', sorted);
  const flt = await api({ action: 'logs', token: tk, kind: 'deal', limit: 50 });
  check('logs filter kind=deal', flt.ok && (flt.logs || []).every(function (l) { return l.action.indexOf('deal') === 0; }), (flt.logs || []).length + ' rows');
  const byUser = (logs.logs || [])[0] ? (logs.logs || [])[0].by : '';
  const flt2 = await api({ action: 'logs', token: tk, by: byUser, limit: 50 });
  check('logs filter by user', flt2.ok && (flt2.logs || []).every(function (l) { return l.by === byUser; }), byUser);

  console.log('\n=== 3) BACKUP / OPS ===');
  const info = await api({ action: 'backupInfo', token: tk });
  check('backupInfo', info.ok === true, 'mode=' + info.lastMode + ' pool=' + info.poolSize + ' cron=' + !!info.cronUrl);
  check('backupInfo มี cronUrl (admin)', !!info.cronUrl);
  const now = await api({ action: 'backupNow', token: tk });
  check('backupNow สร้างไฟล์สำรอง', now.ok === true && !!now.file, now.mode + ' · ' + now.file);
  const who = await api({ action: 'whoami', token: tk });
  check('whoami (admin) ทำงาน', who.ok === true, 'drive=' + who.drive + ' trigger=' + who.trigger);
  const whoNoTok = await api({ action: 'whoami' });
  check('whoami ปฏิเสธเมื่อไม่มี token', whoNoTok.ok === false);
  const dailyNoKey = await api({ action: 'backupDaily' });
  check('backupDaily (ไม่ต้อง key) ตอบได้', dailyNoKey.ok === true, 'skipped=' + dailyNoKey.skipped);

  console.log('\n=== 4) VALIDATION (Deal) ===');
  const noDoc = await api({
    action: 'saveDeal', token: tk, deal: JSON.stringify({
      customer: 'QA ไม่มีอินวอย', job: 'QA test', amount: 1000, status: 4, saleId: (users.users[0] || {}).saleId || 'S01',
      product: 'P1', payment: 'cash', year: 2026, month: 11
    })
  });
  check('ปิดงานแล้วต้องมีเลขอินวอย (ต้องถูกปฏิเสธ)', noDoc.ok === false && /อินวอย|สัญญา|SO/.test(String(noDoc.error || '')), noDoc.error);

  const noSale = await api({
    action: 'saveDeal', token: tk, deal: JSON.stringify({
      customer: 'QA ไม่มี AE', job: 'QA test', amount: 1000, status: 1, saleId: '',
      product: 'P1', payment: 'cash', year: 2026, month: 11
    })
  });
  check('ต้องมี AE ผู้รับผิดชอบ (ต้องถูกปฏิเสธ)', noSale.ok === false, noSale.error);

  console.log('\n=== 5) CRUD ROUND-TRIP ===');
  const adminSaleId = (users.users || []).filter(function (u) { return u.saleId; })[0];
  const created = await api({
    action: 'saveDeal', token: tk, deal: JSON.stringify({
      customer: 'QA Automation', job: 'QA round-trip', amount: 4242, status: 1,
      saleId: adminSaleId ? adminSaleId.saleId : 'S01', product: 'P1', payment: 'cash', year: 2026, month: 11,
      note: 'created by qa-full.js', quoteDate: '2026-11-24'
    })
  });
  check('สร้างดีลทดสอบ', created.ok === true && !!created.no, created.no || created.error);
  const no = created.no;

  if (no) {
    const after = await api({ action: 'dealsV2', token: tk });
    check('ดีลใหม่อยู่ในรายการ', (after.deals || []).some(function (d) { return d.no === no; }), no);
    const hist = await api({ action: 'dealLogs', token: tk, no: no });
    check('มีประวัติดีล (timeline)', hist.ok === true && (hist.logs || []).length > 0, (hist.logs || []).length + ' entries');
    const logsAfter = await api({ action: 'logs', token: tk, q: no, limit: 20 });
    check('มี log การสร้างดีล', logsAfter.ok && (logsAfter.logs || []).length > 0, (logsAfter.logs || []).length + ' rows');
    const del = await api({ action: 'delDeal', token: tk, no: no });
    check('ลบดีลทดสอบ', del.ok === true, del.error);
    const after2 = await api({ action: 'dealsV2', token: tk });
    check('ดีลถูกลบออกจากรายการ', !(after2.deals || []).some(function (d) { return d.no === no && !d.deleted; }), no);
  }

  console.log('\n=== 6) RBAC (สร้าง user ชั่วคราว) ===');
  const added = await api({
    action: 'add', token: tk, email: TEMP_EMAIL, name: 'QA Temp AE', level: 'sale',
    parent: ADMIN.email, saleId: 'S05', team: 'BU-DLAG',
    extra: JSON.stringify({ empCode: 'QA-001', nickname: 'QA', phone: '0800000000' })
  });
  check('admin สร้าง user ทดสอบ', added.ok === true && !!added.password, TEMP_EMAIL);

  if (added.ok) {
    const li = await api({ action: 'login', email: TEMP_EMAIL, password: added.password });
    check('user ทดสอบ login ได้', li.ok === true && li.level === 'sale', 'saleId=' + li.saleId);

    if (li.ok) {
      const myDeals = await api({ action: 'dealsV2', token: li.token });
      const otherOwner = (myDeals.deals || []).filter(function (d) { return d.saleId && d.saleId !== li.saleId; });
      check('AE เห็นเฉพาะดีลของตัวเอง/ตัวแทน', myDeals.ok && otherOwner.length === 0, (myDeals.deals || []).length + ' deals, หลุดขอบเขต ' + otherOwner.length);

      const l1 = await api({ action: 'logs', token: li.token });
      check('AE เรียก logs ไม่ได้', l1.ok === false, l1.error);
      const b1 = await api({ action: 'backupInfo', token: li.token });
      check('AE เรียก backupInfo ไม่ได้', b1.ok === false, b1.error);
      const b2 = await api({ action: 'backupNow', token: li.token });
      check('AE เรียก backupNow ไม่ได้', b2.ok === false, b2.error);
      const w1 = await api({ action: 'whoami', token: li.token });
      check('AE เรียก whoami ไม่ได้', w1.ok === false, w1.error);
      const u1 = await api({ action: 'users', token: li.token });
      const leaked = (u1.users || []).filter(function (u) { return u.email !== TEMP_EMAIL && u.email !== ADMIN.email; });
      check('AE เห็นรายชื่อผู้ใช้ตามสายงานเท่านั้น', u1.ok && leaked.length === 0, (u1.users || []).length + ' users');
    }
    const delUser = await api({ action: 'remove', token: tk, email: TEMP_EMAIL });
    check('ลบ user ทดสอบ (cleanup)', delUser.ok === true, delUser.error);
  }

  const pass = results.filter(function (r) { return r.pass; }).length;
  console.log('\n=== SUMMARY: ' + pass + '/' + results.length + ' PASS ===');
  const failed = results.filter(function (r) { return !r.pass; });
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach(function (r) { console.log(' - ' + r.name + ' :: ' + r.extra); });
  }
})();
