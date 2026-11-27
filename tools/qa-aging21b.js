/* แจกแจงสถานะของงานที่คอลัมน์ 145 = "เกินกำหนด 21 วัน"
   ใช้: node tools/qa-aging21b.js [yyyy-mm]
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const MTH = process.argv[2] || '2026-11';
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
const dist = new Map();
const rows = [];
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  if (!/หยอดเหรียญ/.test(c[12] || '')) continue;
  if (String(c[145] || '').trim() !== 'เกินกำหนด 21 วัน') continue;
  const st = String(c[85] || '').trim();
  dist.set(st, (dist.get(st) || 0) + 1);
  rows.push({ so: c[1], st: st, slaClose: c[118], dateSO: c[70], close: c[88], admin: c[89] });
}
console.log('status dist:', JSON.stringify([...dist.entries()]));
console.log('sample:', JSON.stringify(rows.slice(0, 6)));
console.log('total:', rows.length);
