/* สร้าง bi-dashboard/data-snapshot.js จากไฟล์ ListBooking (อ่านอย่างเดียว)
   - ใช้สูตรชุดเดียวกับเว็บ (lookups.js + master-status.js + schema.js)
   - เก็บเฉพาะกลุ่มสินค้า "หยอดเหรียญ"
   ใช้: node tools/build-snapshot.js "<ไฟล์ ListBooking.xlsx>"
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const XLSX = process.argv[2] || 'C:\\Users\\pongtap.p\\Desktop\\20261127050037_ListBooking.xlsx';
const ROOT = 'D:\\Test Code\\bi-dashboard';
const OUT = path.join(ROOT, 'data-snapshot.js');

/* ---------- zip ---------- */
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    out.push({ name, method, csize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}
function readEntry(buf, ent) {
  const nameLen = buf.readUInt16LE(ent.lho + 26);
  const extraLen = buf.readUInt16LE(ent.lho + 28);
  const start = ent.lho + 30 + nameLen + extraLen;
  const data = buf.slice(start, start + ent.csize);
  return ent.method === 0 ? data : zlib.inflateRawSync(data);
}

/* ---------- xml ---------- */
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = ref => {
  const letters = String(ref).replace(/\d+/g, '').toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
};

function parseShared(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    let txt = '';
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(inner))) txt += t[1];
    out.push(unesc(txt));
  }
  return out;
}

const DATE_COLS = new Set([2, 32, 47, 54]);
const excelSerialToDate = s => new Date(Math.round((s - 25569) * 86400000));

function parseSheet(xml, shared, startRow, nCols) {
  const rows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rn = Number(rm[1]);
    if (rn < startRow) continue;
    const arr = new Array(nCols).fill(undefined);
    const cellRe = /<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const ci = colIndex(cm[1]);
      if (ci < 0 || ci >= nCols) continue;
      const attrs = cm[2] || '', inner = cm[3] || '';
      const tAttr = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
      const vRaw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val;
      if (tAttr === 's') val = vRaw != null ? shared[Number(vRaw)] : undefined;
      else if (tAttr === 'inlineStr') val = unesc(((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
      else if (tAttr === 'str') val = vRaw != null ? unesc(vRaw) : '';
      else if (vRaw != null) {
        const num = Number(vRaw);
        if (DATE_COLS.has(ci) && !isNaN(num) && num > 20000 && num < 80000) val = excelSerialToDate(num);
        else val = isNaN(num) ? unesc(vRaw) : num;
      }
      arr[ci] = val;
    }
    rows.push(arr.map(v => (v === undefined ? '' : v)));
  }
  return rows;
}

/* ---------- โหลดสูตรของเว็บเข้า sandbox ---------- */
function loadSandbox() {
  const sandbox = { window: {}, console, Date, Math, Number, String, isNaN, parseFloat, Intl };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  ['lookups.js', 'master-status.js', 'schema.js'].forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });
  return sandbox.window;
}

/* ---------- main ---------- */
const buf = fs.readFileSync(XLSX);
const entries = zipEntries(buf);
const get = n => entries.find(e => e.name === n);
const sharedXml = readEntry(buf, get('xl/sharedStrings.xml')).toString('utf8');
const shared = parseShared(sharedXml);
console.log('shared strings:', shared.length);

const sheetXml = readEntry(buf, get('xl/worksheets/sheet1.xml')).toString('utf8');
const raw = parseSheet(sheetXml, shared, 3, 90);
console.log('raw rows:', raw.length);

const win = loadSandbox();
const data = win.BISchema.build(raw);
console.log('computed rows:', data.length);

const keep = data.filter(d => /หยอดเหรียญ|vending/i.test(String(d.group == null ? '' : d.group)));
console.log('coin-op rows:', keep.length);

/* กรองลูกค้าที่เป็นข้อมูลทดสอบออก (เช่น "ทดสอบ ไอที", "Test", "ตัวอย่าง")
   ใช้เฉพาะชื่อลูกค้า — ไม่กรองชื่องาน เพราะงานจริงมีขั้นตอนชื่อ "ทดสอบ/Testing" */
const TEST_CUST_RE = /ทดสอบ|^\s*(test|testing)\s*$/i;
const isTestCustomer = v => {
  const t = String(v == null ? '' : v).trim();
  if (!t) return false;
  if (t === 'ตัวอย่าง') return true;
  return TEST_CUST_RE.test(t);
};
const beforeCount = keep.length;
const clean = keep.filter(d => !isTestCustomer(d.customer));
console.log('test rows dropped:', beforeCount - clean.length, '| remaining:', clean.length);

const ser = d => {
  const o = {};
  for (const k in d) { const v = d[k]; o[k] = v instanceof Date ? { __d: v.toISOString() } : v; }
  return o;
};
const stamp = (path.basename(XLSX).match(/(\d{14})/) || [])[1] || '';
const payload = {
  ver: 9,
  meta: { file: path.basename(XLSX), rows: data.length, at: new Date().toISOString(), stamp: stamp },
  data: clean.map(ser)
};
const js = '/* snapshot ข้อมูลหยอดเหรียญสำหรับโหมดอ่านอย่างเดียว (สร้างโดย tools/build-snapshot.js) */\n' +
  'window.BI_SNAPSHOT = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(OUT, js, 'utf8');
console.log('->', OUT, '|', (js.length / 1048576).toFixed(2), 'MB');
