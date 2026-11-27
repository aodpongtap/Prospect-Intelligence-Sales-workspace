/* แจกแจงค่าคอลัมน์ "เกิน 21 วัน" (145) และเทียบกับเกณฑ์ slaClose > 21
   ใช้: node tools/qa-aging21.js [yyyy-mm]
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
const num = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; };
const dist = new Map();
let ours = 0, model = 0, both = 0;
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  if (!/หยอดเหรียญ/.test(c[12] || '')) continue;
  const v = String(c[145] || '').trim();
  dist.set(v, (dist.get(v) || 0) + 1);
  const slaClose = num(c[118]);
  const st = String(c[85] || '').trim();
  const ourFlag = (st === '2.Pending') && slaClose > 21;
  const modelFlag = v === 'เกิน 21';
  if (ourFlag) ours++;
  if (modelFlag) model++;
  if (ourFlag && modelFlag) both++;
}
console.log('dist(145):', JSON.stringify([...dist.entries()]));
console.log('model เกิน 21 =', model, '| เว็บ (Pending & slaClose>21) =', ours, '| ตรงกัน =', both);
