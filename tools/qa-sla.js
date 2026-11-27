/* วิเคราะห์ความสัมพันธ์ระหว่าง (Date Admin - Date SO) กับ SLA Admin ในโมเดล
   ใช้: node tools/qa-sla.js [yyyy-mm]
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const MTH = (process.argv[2] || '2026-11');

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
const header = parse(recs[0]);
const idx = {};
header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });

const day = v => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
};

const table = new Map();   // diff -> { sla: count }
let blankAdmin = 0, total = 0;
const examples = [];

for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const m = String(c[idx['Mth SO']] || '').slice(0, 7);
  if (m !== MTH) continue;
  const grp = c[idx['กลุ่มสินค้า']] || '';
  if (!/หยอดเหรียญ/.test(grp)) continue;
  total++;
  const d1 = day(c[idx['Date SO']]);
  const d2 = day(c[idx['Date Admin']]);
  const sla = Number(String(c[idx['SLA Admin']] || '').replace(/,/g, '').trim());
  if (d1 == null || d2 == null) { blankAdmin++; continue; }
  const diff = Math.round((d2 - d1) / 86400000);
  if (!table.has(diff)) table.set(diff, new Map());
  const mm = table.get(diff);
  mm.set(sla, (mm.get(sla) || 0) + 1);
  if (examples.length < 8) examples.push({ so: c[idx['เลขที่ใบสั่งซื้อ']], dateSO: c[idx['Date SO']], dateAdmin: c[idx['Date Admin']], diff, sla });
}

console.log('MTH', MTH, '| rows', total, '| no Date Admin', blankAdmin);
console.log('diffDays -> {SLA Admin: count}');
[...table.keys()].sort((a, b) => a - b).slice(0, 14).forEach(d => {
  console.log('  ' + d + ' -> ' + JSON.stringify([...table.get(d).entries()].sort((x, y) => x[0] - y[0])));
});
console.log('examples:', JSON.stringify(examples, null, 0));
