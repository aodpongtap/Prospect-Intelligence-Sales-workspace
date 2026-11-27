/* เทียบสูตรเว็บ กับค่าที่คำนวณไว้ในโมเดล Power BI (อ่าน CSV ที่ pbi-tools export)
   - parser รองรับ field ที่มี comma / quote / ขึ้นบรรทัดใหม่ใน quote */
const fs = require('fs');

const CSV = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const TARGET = process.argv[3] || '2026-10';

const isBlank = v => v == null || String(v).trim() === '';
const numOr0 = v => { const x = Number(String(v).replace(/,/g, '').trim()); return isFinite(x) ? x : 0; };

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

function main() {
  const fd = fs.openSync(CSV, 'r');
  const buf = Buffer.alloc(1 << 20);
  let rest = '';
  let inQuote = false;
  let header = null;
  const idx = {};
  const need = ['เลขที่ใบสั่งซื้อ', 'สถานะใบงาน3', 'revenue', 'ราคาเงินสด', 'ราคาขาย', 'ส่วนลด',
    'จำนวน Set', 'จำนวนเครื่องซักผ้า', 'กลุ่มสินค้า', 'Date SO', 'Mth SO', 'วันที่สร้าง'];

  let total = 0, coinop = 0;
  const byDateSO = {}, byCreated = {}, byMthSO = {};
  const stat = {};
  const grpMonth = {};
  const soMonth = new Set();
  const soByStatus = {};
  let dupSo = 0;
  const soSeen = new Set();
  const badRev = [];
  const samples = [];
  let setNeqMachines = 0;

  function handleRecord(line) {
    if (!header) {
      header = parseRecord(line);
      header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
      const miss = need.filter(k => idx[k] === undefined);
      console.log('HEADER COLS:', header.length, '| MISSING:', miss.length ? miss.join(',') : '-');
      return;
    }
    if (!line) return;
    const c = parseRecord(line);
    total++;

    const dso = (c[idx['Date SO']] || '').slice(0, 7);
    const crt = (c[idx['วันที่สร้าง']] || '').slice(0, 7);
    const mso = (c[idx['Mth SO']] || '').slice(0, 7);
    byDateSO[dso] = (byDateSO[dso] || 0) + 1;
    byCreated[crt] = (byCreated[crt] || 0) + 1;
    byMthSO[mso] = (byMthSO[mso] || 0) + 1;

    const grp = c[idx['กลุ่มสินค้า']] || '';
    if (dso === TARGET) grpMonth[grp] = (grpMonth[grp] || 0) + 1;
    const so = (c[idx['เลขที่ใบสั่งซื้อ']] || '').trim();
    if (dso === TARGET && so) soMonth.add(so);
    if (dso === TARGET) {
      const k2 = so + '|' + dso;
      if (soSeen.has(k2)) dupSo++; else soSeen.add(k2);
    }
    if (!/หยอดเหรียญ/.test(grp) || /ชงกาแฟ/.test(grp)) return;
    coinop++;

    const st3 = (c[idx['สถานะใบงาน3']] || '').trim();
    const k = dso + '|' + (st3 || '(blank)');
    stat[k] = (stat[k] || 0) + 1;
    const sk = dso + '|' + (st3 || '(blank)');
    soByStatus[sk] = soByStatus[sk] || new Set();
    if (so) soByStatus[sk].add(so);

    const cash = c[idx['ราคาเงินสด']], list = c[idx['ราคาขาย']], disc = c[idx['ส่วนลด']];
    const base = isBlank(cash) ? numOr0(list) : numOr0(cash);
    const calc = base - numOr0(disc) / 1.07;
    const real = numOr0(c[idx['revenue']]);
    if (Math.abs(calc - real) > 0.02 && badRev.length < 8) {
      badRev.push({ so: c[idx['เลขที่ใบสั่งซื้อ']], calc: +calc.toFixed(2), real: +real.toFixed(2), cash, list, disc });
    }
    if (numOr0(c[idx['จำนวน Set']]) !== numOr0(c[idx['จำนวนเครื่องซักผ้า']])) setNeqMachines++;

    if (samples.length < 3) {
      samples.push({
        so: c[idx['เลขที่ใบสั่งซื้อ']], st3, revRaw: c[idx['revenue']],
        sets: c[idx['จำนวน Set']], machines: c[idx['จำนวนเครื่องซักผ้า']], grp
      });
    }
  }

  for (;;) {
    const read = fs.readSync(fd, buf, 0, buf.length, null);
    if (!read) break;
    rest += buf.toString('utf8', 0, read);
    let start = 0;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '"') {
        if (inQuote && rest[i + 1] === '"') { i++; continue; }
        inQuote = !inQuote;
      } else if (ch === '\n' && !inQuote) {
        let rec = rest.slice(start, i);
        if (rec.endsWith('\r')) rec = rec.slice(0, -1);
        handleRecord(rec);
        start = i + 1;
      }
    }
    rest = rest.slice(start);
  }
  fs.closeSync(fd);

  const tail = o => Object.keys(o).sort().slice(-5).map(k => k + '=' + o[k]).join('  ');
  console.log('ROWS total:', total, '| coin-op:', coinop);
  console.log('Date SO   :', tail(byDateSO));
  console.log('วันที่สร้าง :', tail(byCreated));
  console.log('Mth SO    :', tail(byMthSO));
  console.log('--- coin-op status (Date SO = ' + TARGET + ') ---');
  Object.keys(stat).filter(k => k.startsWith(TARGET + '|')).sort().forEach(k => console.log('  ', k, '=', stat[k]));
  console.log('--- rows by product group (', TARGET, ') ---');
  Object.entries(grpMonth).sort((a, b) => b[1] - a[1]).forEach(e => console.log('   ' + e[1] + '  ' + e[0]));
  console.log('DISTINCT SO in', TARGET, '=', soMonth.size, '| duplicate SO rows =', dupSo);
  Object.keys(soByStatus).filter(k => k.startsWith(TARGET + '|')).sort().forEach(k =>
    console.log('   ', k, ' rows=', stat[k], ' distinctSO=', soByStatus[k].size));
  console.log('REVENUE mismatch found:', badRev.length, '| Set != Machines rows:', setNeqMachines);
  badRev.forEach(b => console.log('   ', JSON.stringify(b)));
  console.log('SAMPLES:', JSON.stringify(samples));
}

main();
