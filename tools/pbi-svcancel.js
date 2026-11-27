/* หาสูตรของคอลัมน์ 'Check SV. Cancel' ที่ Excel ใช้ ให้ตรงกับโมเดล PBI */
const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const CSV = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const OUT = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\svcancel-report.json';

function parseRecord(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const T = v => String(v == null ? '' : v).trim();

const fd = fs.openSync(CSV, 'r');
const dec = new StringDecoder('utf8');
const buf = Buffer.alloc(1 << 20);
let rest = '', inQuote = false, header = null;
const idx = {};
const svValues = new Map();
const stat = { h1: 0, h2: 0, n: 0, cancelByModel: 0, cancelByH1: 0, cancelByH2: 0 };
const badH1 = [], badH2 = [];

function handle(line) {
  if (!header) {
    header = parseRecord(line);
    header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
    return;
  }
  if (!line) return;
  const c = parseRecord(line);
  const sv = T(c[idx['Check SV. Cancel']]);
  const st3 = T(c[idx['สถานะใบงาน3']]);
  if (!st3) return;
  stat.n++;
  svValues.set(sv, (svValues.get(sv) || 0) + 1);
  if (st3 === '3.Cancel') stat.cancelByModel++;

  const note = String(c[idx['หมายเหตุปิดใบงาน']] || '');
  const h1 = note.length >= 3 && note.charAt(0) === 'C' && /^\d{2}$/.test(note.substr(1, 2));
  const h2 = note.toLowerCase().indexOf('ยกเลิก') >= 0;
  if (h1) stat.cancelByH1++;
  if (h2) stat.cancelByH2++;

  // เทียบกับคอลัมน์จริง
  if (h1 === (sv !== '')) stat.h1++; else if (badH1.length < 8) badH1.push({ so: T(c[idx['เลขที่ใบสั่งซื้อ']]), sv, note: note.slice(0, 40), h1, st3 });
  if (h2 === (sv !== '')) stat.h2++; else if (badH2.length < 8) badH2.push({ so: T(c[idx['เลขที่ใบสั่งซื้อ']]), sv, note: note.slice(0, 40), h2, st3 });
}

for (;;) {
  const read = fs.readSync(fd, buf, 0, buf.length, null);
  if (!read) break;
  rest += dec.write(buf.slice(0, read));
  let start = 0;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '"') { if (inQuote && rest[i + 1] === '"') { i++; continue; } inQuote = !inQuote; }
    else if (ch === '\n' && !inQuote) {
      let rec = rest.slice(start, i);
      if (rec.endsWith('\r')) rec = rec.slice(0, -1);
      handle(rec); start = i + 1;
    }
  }
  rest = rest.slice(start);
}
fs.closeSync(fd);

const svList = [...svValues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
const rep = { ...stat, svDistinct: svList, badH1, badH2 };
fs.writeFileSync(OUT, JSON.stringify(rep, null, 1), 'utf8');
console.log('n=' + stat.n, 'cancelByModel=' + stat.cancelByModel, 'h1match=' + stat.h1, 'h2match=' + stat.h2);
console.log('report ->', OUT);
