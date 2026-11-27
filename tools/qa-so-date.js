/* พิมพ์ Date SO (70) ของ SO ที่ระบุ — ใช้เทียบกับฝั่งเว็บ
   ใช้: node tools/qa-so-date.js SO...
*/
const fs = require('fs');
const CSV = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\Data saleOrder.csv';
const targets = new Set(process.argv.slice(2));
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
const out = {};
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  const so = String(c[1] || '').trim();
  if (!targets.has(so)) continue;
  out[so] = { created: String(c[2] || '').slice(0, 10), dateSO: String(c[70] || '').slice(0, 10), mth: String(c[71] || '').slice(0, 7) };
}
console.log(JSON.stringify(out));
