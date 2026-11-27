/* พิมพ์ค่าคอลัมน์ตาม index ที่ระบุ สำหรับ SO ที่ระบุ (ดีบักสูตร)
   ใช้: node tools/qa-col.js SO...
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const COLS = [30, 49, 50, 52, 53, 55, 56, 78, 82, 85, 92, 93, 94, 101, 159];
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

let n = 0;
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const so = String(c[1] || '').trim();
  if (!targets.has(so)) continue;
  n++;
  const o = {};
  COLS.forEach(i => { o[i + ':' + (header[i] || '?')] = c[i]; });
  console.log(so, JSON.stringify(o, null, 0));
}
console.log('matched:', n, 'of', targets.size);
