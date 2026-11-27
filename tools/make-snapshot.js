/* ===========================================================================
   tools/make-snapshot.js
   สร้าง bi-dashboard/data-snapshot.js จากไฟล์ *_ListBooking.xlsx โดยตรง
   ใช้: node tools/make-snapshot.js "C:\path\20261127050037_ListBooking.xlsx"
   =========================================================================== */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const XLSX = process.argv[2] || 'C:\\Users\\pongtap.p\\Desktop\\20261127050037_ListBooking.xlsx';
const OUT = 'D:/Test Code/bi-dashboard/data-snapshot.js';
const DIR = 'D:/Test Code/bi-dashboard';

/* ---------- zip reader (central directory) ---------- */
function readZip(file) {
  const buf = fs.readFileSync(file);
  // find EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    entries[name] = { method, csize, usize, start: dataStart };
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const raw = buf.subarray(e.start, e.start + e.csize);
      return e.method === 0 ? raw : zlib.inflateRawSync(raw);
    }
  };
}

/* ---------- shared strings ---------- */
function unesc(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}
function parseShared(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const ts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]);
    out.push(unesc(ts.join('')));
  }
  return out;
}

const colIdx = letters => {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
};
const serialToDate = v => new Date(Math.round((v - 25569) * 86400000));

/* คอลัมน์ที่เป็นวันที่ (0-based) — ใช้แปลง Excel serial เป็น Date */
const DATE_COLS = new Set([2, 32, 36, 41, 42, 47, 48, 54, 68, 70, 72, 74, 77, 78, 81, 85, 89]);

function main() {
  console.log('อ่านไฟล์:', XLSX);
  const zip = readZip(XLSX);
  const sheetName = zip.names.find(n => /^xl\/worksheets\/sheet1\.xml$/.test(n)) ||
    zip.names.find(n => /^xl\/worksheets\/.*\.xml$/.test(n));
  const sharedName = zip.names.find(n => /sharedStrings\.xml$/.test(n));

  const shared = sharedName ? parseShared(zip.read(sharedName).toString('utf8')) : [];
  console.log('shared strings:', shared.length);

  const xml = zip.read(sheetName).toString('utf8');
  console.log('sheet xml:', (xml.length / 1e6).toFixed(1) + 'M chars');

  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const arr = [];
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1], body = cm[2] || '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      if (!ref) continue;
      const ci = colIdx(ref[1]);
      const t = /\bt="([^"]+)"/.exec(attrs);
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let val = null;
      if (t && t[1] === 's') val = v ? shared[+v[1]] : null;
      else if (t && t[1] === 'inlineStr') {
        const tt = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
        val = tt ? unesc(tt[1]) : null;
      } else if (v) {
        const num = Number(v[1]);
        val = isFinite(num) ? num : unesc(v[1]);
      }
      if (DATE_COLS.has(ci) && typeof val === 'number' && val > 20000 && val < 90000) {
        val = serialToDate(val);
      }
      arr[ci] = val;
    }
    rows.push(arr);
  }
  console.log('rows parsed:', rows.length);
  /* แถว 2 (index 1) = หัวตาราง, ข้อมูลเริ่ม index 2 */
  const dataRows = rows.slice(2);
  console.log('data rows:', dataRows.length);

  /* ---------- เรียก schema.js ใน sandbox ---------- */
  const sandbox = { window: {}, console, Date, Math, Number, String, Array, Object, isFinite, isNaN, parseFloat, parseInt, JSON, RegExp };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  ['lookups.js', 'master-status.js', 'schema.js'].forEach(f => {
    const code = fs.readFileSync(path.join(DIR, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });
  const BISchema = sandbox.window.BISchema;
  if (!BISchema) throw new Error('BISchema not found');

  const data = BISchema.build(dataRows);
  console.log('built rows:', data.length);

  /* ---------- ตัวกรองเดียวกับแอป ---------- */
  const keepRe = /หยอดเหรียญ|vending/i;
  const isTest = v => {
    const t = String(v == null ? '' : v).trim();
    if (!t) return false;
    if (t === 'ตัวอย่าง') return true;
    return /ทดสอบ|^\s*(test|testing)\s*$/i.test(t);
  };
  const keep = data.filter(d => keepRe.test(String(d.group || '')) && !isTest(d.customer));
  console.log('kept rows:', keep.length, '(ตัดทดสอบ', data.length - keep.filter(d => true).length, ')');

  /* ---------- serialize ---------- */
  const ser = d => {
    const o = {};
    for (const k in d) {
      const v = d[k];
      o[k] = v instanceof Date ? { __d: v.toISOString() } : v;
    }
    return o;
  };
  const stamp = (path.basename(XLSX).match(/(\d{14})/) || [new Date().toISOString()])[0];
  const payload = {
    ver: 10,
    meta: { file: path.basename(XLSX), rows: dataRows.length, at: new Date().toISOString(), stamp: stamp },
    data: keep.map(ser)
  };
  const js = '/* snapshot ข้อมูลหยอดเหรียญสำหรับโหมดอ่านอย่างเดียว (สร้างอัตโนมัติ) */\nwindow.BI_SNAPSHOT = ' +
    JSON.stringify(payload) + ';\n';
  fs.writeFileSync(OUT, js, 'utf8');
  console.log('wrote', OUT, (js.length / 1024).toFixed(0) + 'KB');
}

main();
