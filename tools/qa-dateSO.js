/* เทียบ วันที่สร้าง (2) กับ Date SO (70) ในโมเดล
   ใช้: node tools/qa-dateSO.js [yyyy-mm]
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
const d10 = v => String(v || '').slice(0, 10);
let n = 0, same = 0, diff = 0;
const byDelta = new Map();
const samples = [];
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  if (!/หยอดเหรียญ/.test(c[12] || '')) continue;
  n++;
  const a = d10(c[2]), b = d10(c[70]);
  if (a === b) same++;
  else {
    diff++;
    const da = new Date(a + 'T00:00:00Z'), db = new Date(b + 'T00:00:00Z');
    const k = Math.round((db - da) / 86400000);
    byDelta.set(k, (byDelta.get(k) || 0) + 1);
    if (samples.length < 5) samples.push({ so: c[1], created: c[2], dateSO: c[70], delta: k });
  }
}
console.log('rows', n, '| created == DateSO', same, '| ต่าง', diff);
console.log('delta dist:', JSON.stringify([...byDelta.entries()]));
console.log('samples:', JSON.stringify(samples));
