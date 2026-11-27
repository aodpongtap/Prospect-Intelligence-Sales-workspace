/* สรุปยอดรวมจากโมเดล Power BI สำหรับเดือน/กลุ่มที่กำหนด เพื่อเทียบกับเว็บ
   ใช้: node tools/qa-aggregate.js [yyyy-mm]
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
const header = parse(recs[0]);
const idx = {};
header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
const num = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; };

let rows = 0, rev = 0, units = 0, setSum = 0;
const byStatus = {}, byGroup = {}, byTeam = {};
const soSet = new Set();

for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[idx['Mth SO']] || '').slice(0, 7) !== MTH) continue;
  const grp = c[idx['กลุ่มสินค้า']] || '';
  if (!/หยอดเหรียญ/.test(grp)) continue;
  rows++;
  rev += num(c[idx['revenue']]);
  const u = num(c[idx['จำนวนเครื่องซักผ้า']]);
  units += u;
  setSum += num(c[idx['จำนวน Set']]);
  const so = String(c[idx['เลขที่ใบสั่งซื้อ']] || '').trim();
  if (so) soSet.add(so);
  const st = String(c[idx['สถานะใบงาน3']] || '').trim() || '(blank)';
  byStatus[st] = (byStatus[st] || 0) + 1;
  byGroup[grp] = (byGroup[grp] || 0) + 1;
  const tm = String(c[idx['Grp ทีมขาย']] || '').trim() || '(blank)';
  byTeam[tm] = (byTeam[tm] || 0) + 1;
}

console.log(JSON.stringify({
  mth: MTH, rows, distinctSO: soSet.size,
  revenue: Math.round(rev * 100) / 100,
  units, setSum,
  byStatus, byGroup, byTeam
}, null, 2));
