/* QA: สร้างชุดข้อมูลอ้างอิงจากโมเดล Power BI (CSV export) เพื่อตรวจสูตรของเว็บ
   ใช้: node tools/qa-formula-sample.js [yyyy-mm|yyyymm]
   ผลลัพธ์: tools/qa-expected.json
*/
const fs = require('fs');

const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const RAW = process.argv[2] || '2026-11';
const MTH_DASH = RAW.length === 6 ? RAW.slice(0, 4) + '-' + RAW.slice(4) : RAW;
const MTH_PLAIN = MTH_DASH.replace('-', '');
const LIMIT = 400;
const OUT = 'D:\\Test Code\\tools\\qa-expected.json';

function splitRecords(text) {
  const recs = [];
  let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && ch === '\n') { recs.push(cur.replace(/\r$/, '')); cur = ''; continue; }
    cur += ch;
  }
  if (cur) recs.push(cur.replace(/\r$/, ''));
  return recs;
}

function parseRecord(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const text = fs.readFileSync(CSV, 'utf8');
const recs = splitRecords(text);
console.log('records:', recs.length);

const header = parseRecord(recs[0]);
const idx = {};
header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
console.log('columns:', header.length);

const C_SO = idx['เลขที่ใบสั่งซื้อ'];
const C_GRP = idx['กลุ่มสินค้า'];
const C_MTH = idx['Mth SO'];
const C_TEAM = idx['Grp ทีมขาย'] !== undefined ? idx['Grp ทีมขาย'] : idx['ทีมขาย'];
const C_ST3 = idx['สถานะใบงาน3'];
const C_UNIT = idx['จำนวนเครื่องซักผ้า'];
const C_REV = idx['revenue'];
const C_SLA = idx['SLA Admin'];

const numOr0 = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '').trim()); return isFinite(x) ? x : 0; };

const data = {};
let scanned = 0, kept = 0, sampleMth = null, dupes = 0;

for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parseRecord(recs[r]);
  scanned++;
  const m = String(c[C_MTH] || '').trim();
  if (sampleMth == null) sampleMth = m;
  if (!(m === MTH_DASH || m.slice(0, 7) === MTH_DASH || m.slice(0, 7) === MTH_PLAIN)) continue;
  const grp = c[C_GRP] || '';
  if (!/หยอดเหรียญ/.test(grp)) continue;
  const so = String(c[C_SO] || '').trim();
  if (!so) continue;
  if (data[so]) { dupes++; continue; }
  if (kept >= LIMIT) continue;
  kept++;
  data[so] = [
    String(c[C_TEAM] || '').trim(),
    String(c[C_ST3] || '').trim(),
    numOr0(c[C_UNIT]),
    numOr0(c[C_REV]),
    numOr0(c[C_SLA])
  ];
}

fs.writeFileSync(OUT, JSON.stringify({ mth: MTH_DASH, count: kept, scanned, data }), 'utf8');
console.log('sample Mth SO value:', JSON.stringify(sampleMth));
console.log('scanned:', scanned, '| kept:', kept, '| dup SO skipped:', dupes);
console.log('->', OUT);
