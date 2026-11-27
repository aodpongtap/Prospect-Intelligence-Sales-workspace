/* ถอดตาราง Master Stutus จากโมเดล Power BI จริง
   เทียบ MapStutus ที่ Excel คำนวณไว้ กับที่เว็บคำนวณเอง (ผู้รับผิดชอบ + สถานะ ALL + สถานะใบงาน)
   แล้วสร้าง map key -> สถานะใบงาน3 ที่ใช้ได้จริง */
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

const CSV = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const OUT = process.argv[3] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\master-status.json';

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
const T = v => String(v == null ? '' : v).trim();

function main() {
  const fd = fs.openSync(CSV, 'r');
  const dec = new StringDecoder('utf8');
  const buf = Buffer.alloc(1 << 20);
  let rest = '', inQuote = false, header = null;
  const idx = {};
  let mapByExcel = new Map();   // MapStutus(จาก Excel) -> Set(status3)
  let mapByCalc = new Map();    // memo ที่เว็บคำนวณ -> Set(status3)
  let memoDiff = [], memoDiffN = 0;
  let contractNotDone = 0, svCancelNotCancel = 0, blankKey = 0, rows = 0;
  const conflict = [];

  const add = (map, k, v) => {
    if (!map.has(k)) map.set(k, new Map());
    const m = map.get(k);
    m.set(v, (m.get(v) || 0) + 1);
  };

  function handle(line) {
    if (!header) {
      header = parseRecord(line);
      header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
      const f = n => { const k = Object.keys(idx).find(h => h.toLowerCase().includes(n.toLowerCase())); return k; };
      console.log('COLS:', header.length);
      console.log('find "Check":', header.filter(h => /check/i.test(h)).join(' | '));
      console.log('find "Cancel":', header.filter(h => /cancel/i.test(h)).join(' | '));
      return;
    }
    if (!line) return;
    const c = parseRecord(line);
    rows++;
    const st3 = T(c[idx['สถานะใบงาน3']]);
    const mapExcel = T(c[idx['MapStutus']]);
    const memoCalc = T(c[idx['ผู้รับผิดชอบ']]) + T(c[idx['สถานะ ALL']]) + T(c[idx['สถานะใบงาน']]);
    const contract = T(c[idx['สัญญา']]);

    if (mapExcel !== memoCalc) {
      memoDiffN++;
      if (memoDiff.length < 8) memoDiff.push({ so: T(c[idx['เลขที่ใบสั่งซื้อ']]), excel: mapExcel, calc: memoCalc, st3 });
    }
    if (mapExcel) add(mapByExcel, mapExcel, st3);
    if (memoCalc) add(mapByCalc, memoCalc, st3);
    else blankKey++;

    if (contract !== '' && st3 !== '1.Done') contractNotDone++;
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
        handle(rec);
        start = i + 1;
      }
    }
    rest = rest.slice(start);
  }
  fs.closeSync(fd);

  console.log('ROWS:', rows, '| Memo mismatch:', memoDiffN, '| blank memo key:', blankKey);
  console.log('contract filled but status3 != 1.Done:', contractNotDone);
  memoDiff.forEach(d => console.log('   DIFF', JSON.stringify(d)));

  const toObj = map => {
    const o = {};
    map.forEach((v, k) => {
      const arr = [...v.entries()].sort((a, b) => b[1] - a[1]);
      o[k] = arr[0][0];
      if (arr.length > 1) conflict.push({ key: k, variants: arr });
    });
    return o;
  };
  const excel = toObj(mapByExcel);
  const calc = toObj(mapByCalc);

  const keysExcel = Object.keys(excel), keysCalc = Object.keys(calc);
  console.log('KEYS excel:', keysExcel.length, '| calc:', keysCalc.length, '| conflicts:', conflict.length);
  conflict.slice(0, 8).forEach(c => console.log('   CONFLICT', c.key, JSON.stringify(c.variants)));

  let onlyExcel = keysExcel.filter(k => !(k in calc));
  let onlyCalc = keysCalc.filter(k => !(k in excel));
  let valDiff = keysCalc.filter(k => k in excel && excel[k] !== calc[k]);
  console.log('only in model MapStutus:', onlyExcel.length, onlyExcel.slice(0, 5));
  console.log('only in calc memo      :', onlyCalc.length, onlyCalc.slice(0, 5));
  console.log('value differs          :', valDiff.length);
  valDiff.slice(0, 8).forEach(k => console.log('   ', JSON.stringify(k), 'model=', excel[k], 'calc=', calc[k]));

  fs.writeFileSync(OUT, JSON.stringify({ excel, calc }, null, 0), 'utf8');
  console.log('written ->', OUT);

  const report = {
    rows, memoMismatch: memoDiffN, blankMemoKey: blankKey, contractNotDone,
    keysExcel: keysExcel.length, keysCalc: keysCalc.length, conflicts: conflict.length,
    conflictList: conflict,
    memoDiffSamples: memoDiff,
    onlyInExcel: onlyExcel,
    onlyInCalc: onlyCalc,
    valueDiff: valDiff
  };
  const rp = OUT.replace(/\.json$/, '-report.json');
  fs.writeFileSync(rp, JSON.stringify(report, null, 1), 'utf8');
  console.log('report ->', rp);
}

main();
