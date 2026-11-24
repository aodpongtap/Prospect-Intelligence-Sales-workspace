// ทดสอบ Projects API: list / save / log / delete
const https = require('https');
const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
const OWNER = 'aodpongtaptsr@gmail.com';
const PASSWORD = 'Tsr@2026';

function get(url, depth) {
  depth = depth || 0;
  return new Promise(function (resolve) {
    https.get(url, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && depth < 6) {
        r.resume(); resolve(get(r.headers.location, depth + 1)); return;
      }
      let d = '';
      r.on('data', function (c) { d += c; });
      r.on('end', function () { resolve(d); });
    }).on('error', function (e) { resolve('ERR ' + e.message); });
  });
}
async function api(params) {
  const qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k] == null ? '' : params[k]); }).join('&');
  const b = await get(BASE + '?api=1&' + qs);
  try { return JSON.parse(b); } catch (e) { return { ok: false, error: String(b).slice(0, 200) }; }
}

(async function () {
  const login = await api({ action: 'login', email: OWNER, password: PASSWORD });
  if (!login.ok) { console.log('login failed', login.error); return; }
  const tk = login.token;

  console.log('--- schema (setupSchema) ---');
  const sch = await api({ action: 'setupSchema', token: tk });
  console.log(JSON.stringify(sch).slice(0, 400));

  console.log('--- list (before) ---');
  const b = await api({ action: 'projectsV2', token: tk });
  console.log('ok:', b.ok, 'count:', (b.projects || []).length);

  const proj = {
    id: 'QA-PJ-' + Date.now(),
    name: 'QA โครงการทดสอบซิงก์', customer: 'QA บจก. คลาวด์',
    owner: 'ทดสอบ AE 2', sale: 'ทดสอบ AE 2', team: 'BU-SML', stage: 2,
    startDate: '2026-11-24', deadline: '2026-12-20', blocker: '-',
    note: 'ทดสอบ cloud sync', drRef: '', progress: 50,
    tasks: [{ id: 'T1', name: 'QA task 1', owner: 'ทดสอบ AE 2', due: '2026-12-01', status: 'เสร็จแล้ว' }]
  };
  console.log('--- save ---');
  const sv = await api({ action: 'saveProject', token: tk, project: JSON.stringify(proj) });
  console.log(JSON.stringify(sv));

  const a = await api({ action: 'projectsV2', token: tk });
  const found = (a.projects || []).filter(function (p) { return p.id === proj.id; })[0];
  console.log('--- list (after) --- count:', (a.projects || []).length, '| found:', !!found);
  if (found) console.log('   ', JSON.stringify({ name: found.name, stage: found.stage, tasks: (found.tasks || []).length, team: found.team, progress: found.progress }));

  console.log('--- logs ---');
  const lg = await api({ action: 'logs', token: tk, kind: 'project', limit: 10 });
  console.log('project logs:', (lg.logs || []).length, (lg.logs || []).slice(0, 2).map(function (l) { return l.action + ' ' + l.ref; }).join(' | '));

  console.log('--- delete ---');
  console.log(JSON.stringify(await api({ action: 'delProject', token: tk, no: proj.id })));
  const c = await api({ action: 'projectsV2', token: tk });
  console.log('after delete count:', (c.projects || []).length, '| still there:', (c.projects || []).some(function (p) { return p.id === proj.id; }));
})();
