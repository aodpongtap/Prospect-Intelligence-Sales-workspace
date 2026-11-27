/* สร้าง bi-dashboard/master-status.js จากโมเดล Power BI จริง
   key = MapStutus (คอลัมน์ 82) , PIC = PIC ผู้รับผิดชอบ (groups) (คอลัมน์ 96) , status = สถานะใบงาน3 (85)
   ใช้: node tools/gen-master-status.js
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const OUT = 'D:\\Test Code\\bi-dashboard\\master-status.js';

const text = fs.readFileSync(CSV, 'utf8');
const recs = [];
let cur = '', q = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '"') { q = !q; cur += ch; continue; }
  if (!q && ch === '\n') { recs.push(cur.replace(/\r$/, '')); cur = ''; continue; }
  cur += ch;
}
function parse(line) {
  const out = []; let c = '', q2 = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q2) { if (ch === '"') { if (line[i + 1] === '"') { c += '"'; i++; } else q2 = false; } else c += ch; }
    else if (ch === '"') q2 = true;
    else if (ch === ',') { out.push(c); c = ''; }
    else c += ch;
  }
  out.push(c);
  return out;
}

const C_KEY = 82, C_PIC = 96, C_ST = 85, C_MTH = 71;
const map = new Map();   // key -> { byMth: Map(mth -> Map(status->n)), pic }
let conflicts = 0;

for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const key = String(c[C_KEY] || '').trim();
  const st = String(c[C_ST] || '').trim();
  if (!key || !st) continue;
  const mth = String(c[C_MTH] || '').slice(0, 7);
  const pic = String(c[C_PIC] || '').trim();
  let e = map.get(key);
  if (!e) { e = { byMth: new Map(), pic: pic }; map.set(key, e); }
  let mm = e.byMth.get(mth);
  if (!mm) { mm = new Map(); e.byMth.set(mth, mm); }
  mm.set(st, (mm.get(st) || 0) + 1);
  if (!e.pic && pic) e.pic = pic;
}

const rows = [];
[...map.keys()].sort().forEach(k => {
  const e = map.get(k);
  /* เดือนล่าสุดที่คีย์นี้ปรากฏ = กฎปัจจุบัน (Master Stutus ถูกแก้ไขตามเวลา) */
  const mths = [...e.byMth.keys()].filter(Boolean).sort();
  const latest = mths.length ? e.byMth.get(mths[mths.length - 1]) : null;
  const allStatuses = new Set();
  e.byMth.forEach(mm => { mm.forEach((n, s) => allStatuses.add(s)); });
  if (allStatuses.size > 1) conflicts++;
  const pick = latest
    ? [...latest.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : '2.Pending';
  rows.push([k, e.pic || '', pick]);
});

const body = '/* ===== สร้างจากโมเดล Power BI จริง (pbi-tools export-data) — อย่าแก้ด้วยมือ ===== */\n' +
  '(function () {\n' +
  '  window.BI_LOOKUPS = window.BI_LOOKUPS || {};\n' +
  '  window.BI_LOOKUPS["Master Stutus!D:F"] = ' + JSON.stringify(rows) + ';\n' +
  '})();\n';

fs.writeFileSync(OUT, body, 'utf8');
console.log('keys:', rows.length, '| keys with >1 status (ประวัติ):', conflicts, '| ->', OUT);
console.log('sample:', JSON.stringify(rows.slice(0, 3)));
