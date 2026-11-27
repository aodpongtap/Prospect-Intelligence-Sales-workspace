/* ตรวจคีย์ที่มีปัญหาของ Master Stutus: แจกแจงสถานะตามเดือน
   ใช้: node tools/qa-status-conflict.js
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
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
const KEY = 82, ST = 85, MTH = 71;
const map = new Map();
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const k = String(c[KEY] || '').trim();
  const s = String(c[ST] || '').trim();
  if (!k || !s) continue;
  let e = map.get(k);
  if (!e) { e = new Map(); map.set(k, e); }
  const m = String(c[MTH] || '').slice(0, 7);
  const kk = s + '|' + m;
  e.set(kk, (e.get(kk) || 0) + 1);
}
let conflict = 0;
[...map.keys()].sort().forEach(k => {
  const e = map.get(k);
  const statuses = new Set([...e.keys()].map(x => x.split('|')[0]));
  if (statuses.size < 2) return;
  conflict++;
  console.log('CONFLICT:', JSON.stringify(k), '->', JSON.stringify([...e.entries()].sort()));
});
console.log('keys with conflicts:', conflict);
