const fs = require('fs');
const vm = require('vm');
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('D:/Test Code/bi-dashboard/data-snapshot.js', 'utf8'), sandbox);
const rows = sandbox.window.BI_SNAPSHOT.data;

/* จัดกลุ่มสินค้าแบบ cross-sell: ซัก / อบ / Stack / อื่น ๆ */
function prodCat(p) {
  const s = String(p || '');
  if (/Stack|ซ้อน/i.test(s)) return 'Stack (ซัก+อบ)';
  if (/อบ/i.test(s)) return 'อบผ้า';
  if (/ซัก/i.test(s)) return 'ซักผ้า';
  if (/กาแฟ/i.test(s)) return 'กาแฟ';
  if (/น้ำ|ตู้น้ำ/i.test(s)) return 'ตู้น้ำ';
  if (/Snack|ขนม/i.test(s)) return 'Snack';
  return 'อื่น ๆ';
}
const sizeOf = v => v > 1000000 ? 'L' : v > 500000 ? 'M' : v > 300000 ? 'S' : v > 100000 ? 'SS' : '-';

const cust = new Map();
rows.forEach(d => {
  const k = String(d.customer || '').trim();
  if (!k) return;
  const o = cust.get(k) || { rev: 0, cats: new Set(), so: 0, team: d.team, prov: d.province, last: null };
  o.rev += d.revenue || 0;
  o.so += 1;
  o.cats.add(prodCat(d.product));
  cust.set(k, o);
});
const all = [...cust.values()];
const multi = all.filter(x => x.cats.size > 1);
const single = all.filter(x => x.cats.size === 1);
console.log('ลูกค้าทั้งหมด:', all.length);
console.log('ซื้อหลายกลุ่ม:', multi.length, '(' + (multi.length / all.length * 100).toFixed(1) + '%)');
console.log('ซื้อกลุ่มเดียว:', single.length, '(' + (single.length / all.length * 100).toFixed(1) + '%)');

const catCount = {};
rows.forEach(d => { const c = prodCat(d.product); catCount[c] = (catCount[c] || 0) + 1; });
console.log('จำนวนใบตามกลุ่ม:', JSON.stringify(catCount));

const sizeCount = { SS: 0, S: 0, M: 0, L: 0, '-': 0 };
all.forEach(x => { sizeCount[sizeOf(x.rev)] += 1; });
console.log('ขนาดลูกค้าตามยอดสะสม:', JSON.stringify(sizeCount));

/* โอกาส cross-sell: ลูกค้าซื้อกลุ่มเดียว แต่ยอดสูง */
const opp = single.filter(x => x.rev >= 300000).sort((a, b) => b.rev - a.rev);
console.log('\nโอกาส cross-sell (กลุ่มเดียว + ยอด >= 300k):', opp.length);
opp.slice(0, 10).forEach((x, i) => console.log('  ' + (i + 1) + '. ' + [...x.cats][0] + ' · ' + x.so + ' ใบ · ' + Math.round(x.rev).toLocaleString() + ' บ.'));

/* ชุดสินค้าที่ลูกค้าซื้อร่วมบ่อย */
const pair = {};
multi.forEach(x => {
  const a = [...x.cats].sort();
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const k = a[i] + ' + ' + a[j];
    pair[k] = (pair[k] || 0) + 1;
  }
});
console.log('\nคู่สินค้าที่ซื้อร่วม:', JSON.stringify(Object.entries(pair).sort((a, b) => b[1] - a[1]).slice(0, 6)));
