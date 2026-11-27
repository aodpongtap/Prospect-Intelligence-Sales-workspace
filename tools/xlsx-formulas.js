/* อ่าน "สูตรจริง" จากไฟล์ Excel (Report Sale Order.xlsx) แบบไม่แก้ไฟล์
   - เปิด ZIP อ่าน xl/worksheets/sheet1.xml (stream) เอาเฉพาะแถว 2 (หัวคอลัมน์) และแถว 3 (สูตร)
   - resolve sharedStrings เพื่อได้ชื่อคอลัมน์ */
const fs = require('fs');
const zlib = require('zlib');

const XLSX = process.argv[2] || 'D:\\Report\\Report Sale Order.xlsx';
const OUT = process.argv[3] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\excel-formulas.json';

/* ---------- minimal zip central directory ---------- */
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

function streamEntry(buf, ent, onChunk) {
  const nameLen = buf.readUInt16LE(ent.lho + 26);
  const extraLen = buf.readUInt16LE(ent.lho + 28);
  const start = ent.lho + 30 + nameLen + extraLen;
  const data = buf.slice(start, start + ent.csize);
  return new Promise((resolve, reject) => {
    if (ent.method === 0) { onChunk(data); return resolve(); }
    const inf = zlib.createInflateRaw();
    let stop = false;
    inf.on('data', d => { if (!stop) stop = onChunk(d) === true; if (stop) inf.destroy(); });
    inf.on('end', resolve);
    inf.on('close', resolve);
    inf.on('error', e => (stop ? resolve() : reject(e)));
    inf.end(data);
  });
}

/* ---------- xml helpers ---------- */
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseRow(xml) {
  const cells = {};
  const re = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(xml))) {
    const col = m[1], attrs = m[3] || '', inner = m[4] || '';
    const f = (inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const isStr = /t="s"/.test(attrs);
    const inl = (inner.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/) || [])[1];
    cells[col] = {
      f: f != null ? unesc(f) : null,
      v: v != null ? unesc(v) : (inl != null ? unesc(inl) : null),
      shared: isStr
    };
  }
  return cells;
}

async function main() {
  const buf = fs.readFileSync(XLSX);
  const entries = zipEntries(buf);
  const find = n => entries.find(e => e.name === n);
  console.log('files:', entries.length);

  // sharedStrings
  let shared = [];
  const ss = find('xl/sharedStrings.xml');
  if (ss) {
    let acc = '';
    await streamEntry(buf, ss, d => { acc += d.toString('utf8'); });
    shared = [...acc.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => unesc(x[1])).join(''));
    console.log('sharedStrings:', shared.length);
  }

  // หา sheet ที่ชื่อ Data
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = find('xl/workbook.xml'), rels = find('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    let w = '', r = '';
    await streamEntry(buf, wb, d => { w += d.toString('utf8'); });
    await streamEntry(buf, rels, d => { r += d.toString('utf8'); });
    const sheets = [...w.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map(m => ({ name: unesc(m[1]), rid: m[2] }));
    const relMap = {};
    [...r.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].forEach(m => { relMap[m[1]] = m[2]; });
    const target = sheets.find(s => /^data/i.test(s.name.trim()));
    if (target && relMap[target.rid]) {
      const t = relMap[target.rid].replace(/^\//, '');
      sheetPath = t.startsWith('xl/') ? t : 'xl/' + t;
    }
    console.log('sheets:', sheets.map(s => s.name).join(', '), '| using', sheetPath);
  }

  const sheet = find(sheetPath);
  if (!sheet) throw new Error('sheet not found: ' + sheetPath);

  let acc = '';
  await streamEntry(buf, sheet, d => {
    acc += d.toString('utf8');
    if (/r="A4"/.test(acc)) return true;   // เอาแค่แถว 1-3
  });

  const row2 = parseRow((acc.match(/<row r="1"[\s\S]*?<\/row>/) || [''])[0]);
  const row3 = parseRow((acc.match(/<row r="3"[\s\S]*?<\/row>/) || [''])[0]);

  const cols = Object.keys(row3).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const out = [];
  cols.forEach(c => {
    const h = row2[c];
    const name = h ? (h.shared ? shared[+h.v] : h.v) : null;
    out.push({ col: c, header: name, formula: row3[c] ? row3[c].f : null, value: row3[c] ? row3[c].v : null });
  });

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
  console.log('cols:', out.length, '| with formula:', out.filter(x => x.formula).length);
  console.log('report ->', OUT);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
