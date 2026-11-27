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
const cnt = {}, stat = {};
let all = 0, rev = 0;
for (let r = 1; r < recs.length; r++) {
  if (!recs[r]) continue;
  const c = parse(recs[r]);
  if (String(c[71] || '').slice(0, 7) !== MTH) continue;
  all++; rev += num(c[95]);
  const g = String(c[12] || '').trim() || '(blank)';
  cnt[g] = (cnt[g] || 0) + 1;
  const st = String(c[85] || '').trim() || '(blank)';
  stat[st] = stat[st] || { n: 0, rev: 0 };
  stat[st].n++; stat[st].rev += num(c[95]);
}
Object.values(stat).forEach(v => v.rev = Math.round(v.rev));
console.log(JSON.stringify({ MTH, all, rev: Math.round(rev), groups: cnt, status: stat }, null, 2));
