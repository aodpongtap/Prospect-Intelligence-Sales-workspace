/* พิสูจน์ว่า memo แบบ CONCATENATE (ไม่ trim) ทำให้คีย์ตรงกับตาราง Master Stutus
   ใช้: node tools/qa-memo.js SO...
*/
const fs = require('fs');

/* 1) โหลดตาราง Master Stutus จาก master-status.js */
const src = fs.readFileSync('D:\\Test Code\\bi-dashboard\\master-status.js', 'utf8');
const m = src.match(/\[\[.*\]\]/s);
if (!m) { console.log('parse master-status failed'); process.exit(1); }
const table = JSON.parse(m[0]);
const map = new Map();
table.forEach(r => { if (!map.has(r[0])) map.set(r[0], r[2]); });
console.log('table keys:', map.size);

/* 2) อ่านแถวจากโมเดล (คอลัมน์อ้างอิงตามที่หัวตารางกำหนด) */
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const text = fs.readFileSync(CSV, 'utf8');
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
const lines = [];
let cur = '', q = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '"') { q = !q; cur += ch; continue; }
  if (!q && ch === '\n') { lines.push(cur.replace(/\r$/, '')); cur = ''; continue; }
  cur += ch;
}
const targets = new Set(process.argv.slice(2));
const C_OWNER = 52, C_ALL = 53, C_STAGE = 78, C_MAP = 82, C_ST3 = 85;

lines.forEach((line, i) => {
  if (!line) return;
  const c = parse(line);
  const so = String(c[1] || '').trim();
  if (!targets.has(so)) return;
  const owner = c[C_OWNER] || '', all = c[C_ALL] || '', stage = c[C_STAGE] || '';
  const memoRaw = owner + all + stage;
  const memoTrim = owner.trim() + all.trim() + stage.trim();
  console.log(so,
    '| owner=', JSON.stringify(owner),
    '| all=', JSON.stringify(all),
    '| stage=', JSON.stringify(stage));
  console.log('   memoRaw =', JSON.stringify(memoRaw), '=> lookup:', map.get(memoRaw) || '(miss)');
  console.log('   memoTrim=', JSON.stringify(memoTrim), '=> lookup:', map.get(memoTrim) || '(miss)');
  console.log('   model MapStutus=', JSON.stringify(c[C_MAP]), '| model สถานะใบงาน3=', JSON.stringify(c[C_ST3]));
});
