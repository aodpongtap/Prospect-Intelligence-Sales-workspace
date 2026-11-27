/* แจกแจงกลุ่มสินค้าทั้งหมดในไฟล์ ListBooking (เพื่อตรวจว่ามีกลุ่มที่ถูกตัดออกหรือไม่)
   ใช้: node tools/qa-groups.js
*/
const fs = require('fs');
const zlib = require('zlib');

const XLSX = 'C:\\Users\\pongtap.p\\Desktop\\20261127050037_ListBooking.xlsx';
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
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
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const buf = fs.readFileSync(XLSX);
const entries = zipEntries(buf);
const get = n => entries.find(e => e.name === n);

const sharedXml = readEntry(buf, get('xl/sharedStrings.xml')).toString('utf8');
const shared = [];
{
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(sharedXml))) {
    let txt = ''; const tre = /<t[^>]*>([\s\S]*?)<\/t>/g; let t;
    while ((t = tre.exec(m[1]))) txt += t[1];
    shared.push(unesc(txt));
  }
}
const sheetXml = readEntry(buf, get('xl/worksheets/sheet1.xml')).toString('utf8');
const dist = new Map();
const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let rm, rows = 0;
while ((rm = rowRe.exec(sheetXml))) {
  if (Number(rm[1]) < 3) continue;
  rows++;
  // คอลัมน์ M = index 12
  const cm = rm[2].match(/<c\s+r="M\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
  if (!cm) continue;
  const attrs = cm[1] || '', inner = cm[2] || '';
  const tAttr = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
  const vRaw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  let val = '';
  if (tAttr === 's') val = shared[Number(vRaw)] || '';
  else if (tAttr === 'inlineStr') val = unesc(((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
  else if (vRaw != null) val = unesc(vRaw);
  val = String(val).trim() || '(ว่าง)';
  dist.set(val, (dist.get(val) || 0) + 1);
}
console.log('rows:', rows, '| distinct groups:', dist.size);
[...dist.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  const coin = /หยอดเหรียญ/.test(k) ? 'KEEP' : 'skip';
  console.log(coin.padEnd(5), String(v).padStart(7), k);
});
