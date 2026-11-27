/* แสดงค่าที่ไม่ซ้ำของคอลัมน์ที่เกี่ยวกับสถานะ (เพื่อยืนยันว่าคอลัมน์ AN ใน ListBooking คือ 'สถานะใบงาน') */
const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const CSV = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const COLS = ['สถานะใบงาน', 'สถานะ ALL', 'ผู้รับผิดชอบ'];

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
const maps = {};
COLS.forEach(c => maps[c] = new Map());
const REPORT = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\col-values.json';
const samples = [];

function handle(line) {
  if (!header) {
    header = parseRecord(line);
    header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
    return;
  }
  if (!line) return;
  const c = parseRecord(line);
  COLS.forEach(k => {
    if (idx[k] === undefined) return;
    const v = T(c[idx[k]]);
    maps[k].set(v, (maps[k].get(v) || 0) + 1);
  });
  if (samples.length < 5) samples.push({ st: T(c[idx['สถานะใบงาน']]), all: T(c[idx['สถานะ ALL']]), map: T(c[idx['MapStutus']]) });
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

const out = {};
COLS.forEach(k => {
  out[k] = [...maps[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
});
out._samples = samples;
fs.writeFileSync(REPORT, JSON.stringify(out, null, 1), 'utf8');
console.log('report ->', REPORT);
