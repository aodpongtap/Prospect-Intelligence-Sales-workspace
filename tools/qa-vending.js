/* นับแถวของกลุ่ม "ตู้กดสินค้า Vending" แยกตามเดือน (เพื่อประเมินผลกระทบถ้าเพิ่มเข้า scope)
   ใช้: node tools/qa-vending.js
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
    const cmtLen = buf.readUInt32LE(off + 32);
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
    while ((t = tre.exec(inner2(sharedXml, m)))) txt += t[1];
    shared.push(unesc(txt));
  }
}
function inner2(_x, m) { return m[1]; }

const sheetXml = readEntry(buf, get('xl/worksheets/sheet1.xml')).toString('utf8');
const byMth = new Map();
const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let rm;
function cell(idxLetter, xml) {
  const re = new RegExp('<c\\s+r="' + idxLetter + '\\d+"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)');
  const m = xml.match(re);
  if (!m) return '';
  const attrs = m[1] || '', inner = m[2] || '';
  const tAttr = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
  const vRaw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  if (tAttr === 's') return shared[Number(vRaw)] || '';
  if (tAttr === 'inlineStr') return unesc(((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
  return vRaw != null ? unesc(vRaw) : '';
}
while ((rm = rowRe.exec(sheetXml))) {
  if (Number(rm[1]) < 3) continue;
  const g = String(cell('M', rm[2])).trim();
  if (g !== 'ตู้กดสินค้า Vending') continue;
  const cRaw = cell('C', rm[2]);   // วันที่สร้าง (serial)
  let mth = '?';
  if (cRaw && !isNaN(Number(cRaw))) {
    const d = new Date(Math.round((Number(cRaw) - 25569) * 86400000));
    mth = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  byMth.set(mth, (byMth.get(mth) || 0) + 1);
}
console.log('ตู้กดสินค้า Vending by month:');
[...byMth.entries()].sort().forEach(([k, v]) => console.log(' ', k, v));
console.log('total:', [...byMth.values()].reduce((a, b) => a + b, 0));
