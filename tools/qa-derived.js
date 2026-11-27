/* ตรวจสูตรที่เว็บประมาณค่า เทียบกับคอลัมน์ที่คำนวณไว้ในโมเดล
   - GRP SML (col 135) vs เกณฑ์เว็บ
   - Grp Pack (col 77) vs จำนวนงวด == 1
   - เกิน 21 วัน (col 145)
   ใช้: node tools/qa-derived.js [yyyy-mm]
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const MTH = process.argv[2] || '2026-11';

const text = fs.readFileSync(CSV, 'utf8');
const recs = [];
let cur = '', q = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '"') { q = !q; cur += ch; continue; }
  if (!q && ch === '\n') { recs.push(cur.replace(/\r$/, '')); cur = ''; continue; }
  cur += ch;
}
function parse(line) {
  const out = []; let c = '', q2 = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q2) { if (ch === '"') { if (line[i + 1] === '"') { c += '"'; i++; } else q2 = false; } else c += ch; }
    else if (ch === '"') q2 = true;
    else if (ch === ',') { out.push(c); c = ''; }
    else c += ch;
  }
  out.push(c);
  return out;
}
const num = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; };
const smlOf = v => { if (v < 60000) return 'SS'; if (v <= 100000) return 'S'; if (v <= 500000) return 'M'; if (v <= 1000000) return 'L'; return 'XL'; };

let n = 0, smlOk = 0, packOk = 0, old21 = 0, old21Open = 0;
const smlBad = [], packBad = [], old21Samples = [];
const C_SML = 135, C_PACK = 77, C_INST = 19, C_REV = 95, C_21 = 145, C_ST = 85;

for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  if (!/หยอดเหรียญ/.test(c[12] || '')) continue;
  n++;
  const rev = num(c[C_REV]);
  const expSml = String(c[C_SML] || '').trim();
  const gotSml = smlOf(rev);
  if (expSml === gotSml) smlOk++;
  else if (smlBad.length < 5) smlBad.push({ so: c[1], rev: Math.round(rev), exp: expSml, got: gotSml });

  const expPack = String(c[C_PACK] || '').trim();
  const gotPack = num(c[C_INST]) === 1 ? 'เงินสด' : 'ผ่อน';
  if (expPack === gotPack) packOk++;
  else if (packBad.length < 5) packBad.push({ so: c[1], inst: c[C_INST], exp: expPack, got: gotPack });

  const v21 = String(c[C_21] || '').trim();
  if (v21) {
    old21++;
    const st = String(c[C_ST] || '').trim();
    if (st === '2.Pending') old21Open++;
    if (old21Samples.length < 4) old21Samples.push({ so: c[1], v21: v21, status3: st });
  }
}

console.log('rows', n);
console.log('GRP SML  ตรง', smlOk, '/', n, '(' + (smlOk / n * 100).toFixed(1) + '%)', JSON.stringify(smlBad));
console.log('Grp Pack ตรง', packOk, '/', n, '(' + (packOk / n * 100).toFixed(1) + '%)', JSON.stringify(packBad));
console.log('เกิน 21 วัน: มีค่า', old21, '| เป็น Pending', old21Open, JSON.stringify(old21Samples));
