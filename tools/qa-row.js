/* พิมพ์ค่าคอลัมน์ดิบของ SO ที่ระบุจากโมเดล Power BI
   ใช้: node tools/qa-row.js SO261102092 SO261101892 ...
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const WANT = ['เลขที่ใบสั่งซื้อ', 'Date SO', 'Date Admin', 'SLA Admin', 'สถานะใบงาน3',
  'สถานะ Admin', 'สถานะใบงาน', 'วันที่ปิดงาน', 'SLA ปิดงาน', 'Grp ทีมขาย', 'revenue', 'Mth SO'];
const targets = new Set(process.argv.slice(2));

const text = fs.readFileSync(CSV, 'utf8');
const recs = [];
let cur = '', q = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '"') { q = !q; cur += ch; continue; }
  if (!q && ch === '\n') { recs.push(cur.replace(/\r$/, '')); cur = ''; continue; }
  cur += ch;
}
if (cur) recs.push(cur);

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
header.forEach((h, i) => { if (WANT.indexOf(h) >= 0 && idx[h] === undefined) idx[h] = i; });
console.log('found columns:', JSON.stringify(Object.keys(idx)));

let n = 0;
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const so = String(c[idx['เลขที่ใบสั่งซื้อ']] || '').trim();
  if (!targets.has(so)) continue;
  n++;
  const o = {};
  Object.keys(idx).forEach(k => { o[k] = c[idx[k]]; });
  console.log(so, '=>', JSON.stringify(o));
}
console.log('matched rows:', n, 'of', targets.size);
