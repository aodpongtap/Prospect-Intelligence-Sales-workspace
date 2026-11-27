/* สรุปยอดต่อสถานะจากโมเดล (สำหรับ reconcile หน้า Summary)
   ใช้: node tools/qa-recon.js [yyyy-mm]
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
const by = {};
let rev = 0, units = 0, n = 0;
const soList = [];
const teamRev = {}, grpUnits = {}, areaCnt = {};
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  if (!/หยอดเหรียญ/.test(c[12] || '')) continue;
  n++;
  const st = String(c[85] || '').trim() || '(blank)';
  const rv = num(c[95]), un = num(c[87]);
  rev += rv; units += un;
  by[st] = by[st] || { n: 0, rev: 0, units: 0 };
  by[st].n++; by[st].rev += rv; by[st].units += un;
  soList.push(String(c[1] || '').trim());
  const tm = String(c[73] || '').trim(); teamRev[tm] = (teamRev[tm] || 0) + rv;
  const gp = String(c[12] || '').trim(); grpUnits[gp] = (grpUnits[gp] || 0) + un;
  const ar = String(c[133] || '').trim(); areaCnt[ar] = (areaCnt[ar] || 0) + 1;
}
Object.keys(by).forEach(k => { by[k].rev = Math.round(by[k].rev); });
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + '=' + Math.round(v));
console.log(JSON.stringify({ mth: MTH, n, rev: Math.round(rev), units, byStatus: by, topTeamRev: top(teamRev), grpUnits: top(grpUnits), areaCnt: top(areaCnt) }, null, 2));
fs.writeFileSync('D:\\Test Code\\tools\\qa-model-sos.json', JSON.stringify(soList), 'utf8');
console.log('wrote tools/qa-model-sos.json (' + soList.length + ')');
