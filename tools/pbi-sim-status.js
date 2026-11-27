/* จำลองสูตร สถานะใบงาน3 ของเว็บ แล้วเทียบกับค่าจริงในโมเดล Power BI ทีละแถว
   สูตรเว็บ (schema.js):
     ถ้า สัญญา != ""                      -> 1.Done
     ถ้า CheckSV.Cancel != "" (หมายเหตุขึ้นต้น/มี 'ยกเลิก') -> 3.Cancel
     อย่างอื่น -> VLOOKUP(ผู้รับผิดชอบ + สถานะ ALL + สถานะใบงาน, Master Stutus)
*/
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

const CSV = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const MASTER = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\master-status.json';
const REPORT = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\sim-report.json';
const MODE = process.argv[4] || 'or';   /* or = C-code หรือมีคำว่ายกเลิก | code = C-code เท่านั้น */

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

function main() {
  const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const table = master.excel || {};          // key -> status (ถอดจากโมเดล)
  const LK = {};
  Object.keys(table).forEach(k => { LK[T(k)] = T(table[k]); });

  const fd = fs.openSync(CSV, 'r');
  const dec = new StringDecoder('utf8');
  const buf = Buffer.alloc(1 << 20);
  let rest = '', inQuote = false, header = null;
  const idx = {};

  let n = 0, agree = 0, miss = 0, blankModel = 0;
  const byReason = {};
  const samples = [];

  function handle(line) {
    if (!header) {
      header = parseRecord(line);
      header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
      return;
    }
    if (!line) return;
    const c = parseRecord(line);
    const model = T(c[idx['สถานะใบงาน3']]);
    if (!model) { blankModel++; return; }
    n++;

    const contract = T(c[idx['สัญญา']]);
    const note = String(c[idx['หมายเหตุปิดใบงาน']] || '');
    const owner = T(c[idx['ผู้รับผิดชอบ']]);
    const all = T(c[idx['สถานะ ALL']]);
    const job = T(c[idx['สถานะใบงาน']]);
    const memo = owner + all + job;

    let calc, reason;
    if (contract !== '') { calc = '1.Done'; reason = 'contract'; }
    else {
      const cancelByNote = note.toLowerCase().indexOf('ยกเลิก') >= 0;
      let cancelByCode = false;
      if (note.length >= 3 && note.charAt(0) === 'C') cancelByCode = /^\d{2}$/.test(note.substr(1, 2));
      const isCancel = MODE === 'code' ? cancelByCode : (cancelByNote || cancelByCode);
      if (isCancel) { calc = '3.Cancel'; reason = 'svcancel'; }
      else {
        const v = LK[memo];
        calc = v == null ? '' : v;
        reason = v == null ? 'lookup-miss' : 'lookup';
      }
    }

    if (calc === model) { agree++; return; }
    byReason[reason] = (byReason[reason] || 0) + 1;
    if (samples.length < 15) samples.push({ so: T(c[idx['เลขที่ใบสั่งซื้อ']]), model, calc, reason, memo });
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

  const rep = {
    compared: n, blankModelRows: blankModel, agree,
    matchPct: +(agree / (n || 1) * 100).toFixed(2),
    mismatch: n - agree, byReason, samples
  };
  fs.writeFileSync(REPORT, JSON.stringify(rep, null, 1), 'utf8');
  console.log('compared=' + n, 'agree=' + agree, 'pct=' + rep.matchPct, 'mismatch=' + rep.mismatch);
  console.log('byReason', JSON.stringify(byReason));
  console.log('report ->', REPORT);
}

main();
