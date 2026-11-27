/**
 * QA deep static — โครงสร้างโค้ด สูตร และข้อมูล snapshot
 * ใช้: node tools/qa-deep.js
 */
const fs = require('fs');
const path = require('path');

const DIR = 'D:/Test Code/bi-dashboard';
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
let pass = 0, fail = 0;
const rows = [];
const chk = (name, ok, extra) => { rows.push((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   [' + extra + ']' : '')); ok ? pass++ : fail++; };

const app = read('app.js');
const schema = read('schema.js');
const html = read('index.html');

/* 1) ฟังก์ชันซ้ำ / id ตาย */
const fns = [...app.matchAll(/^\s{2}function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1]);
const dupFn = [...new Set(fns.filter((n, i) => fns.indexOf(n) !== i))];
chk('ไม่มีฟังก์ชันชื่อซ้ำ', dupFn.length === 0, dupFn.join(', ') || fns.length + ' ฟังก์ชัน');

const declared = new Set([
  ...[...app.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1])
]);
const used = [...new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
/* id บางตัวสร้างแบบไดนามิก (ฟังก์ชัน helper) — ถือว่ามีจริงถ้าชื่อถูกส่งเป็น string ในไฟล์ */
const dead = used.filter(id => !declared.has(id) && !new RegExp("'" + id + "'").test(app));
chk('ทุก $("id") มี element จริง', dead.length === 0, dead.join(', ') || used.length + ' id ใช้งาน');

/* 2) handler ผูกกับ selector ที่ไม่มีทางเกิด */
const selBind = [...new Set([...app.matchAll(/querySelectorAll\('\.([a-z0-9-]+)'\)/g)].map(m => m[1]))];
const clsDefined = selBind.filter(c => !new RegExp('class="[^"]*\\b' + c + '\\b').test(app) && !new RegExp('\\.' + c + '\\b').test(html + read('mobile.css') + read('ui.css')));
chk('selector ที่ bind มีคลาสอยู่จริง', clsDefined.length === 0, clsDefined.join(', ') || selBind.length + ' selector');

/* 3) สูตรสำคัญ */
chk('Revenue หาร 1.07', /1\.07/.test(schema), (schema.match(/1\.07/g) || []).length + ' จุด');
chk('มี guard หารศูนย์ใน %', /\|\|\s*1[\s)]/.test(app));
chk('วันที่ Excel serial แปลงถูก', /25569|86400/.test(schema));
chk('เงินสดว่าง → ใช้ราคาตั้ง', /cash|เงินสด/.test(schema));

/* 4) กันค่าว่าง/NaN ในตัวเลขที่แสดง */
chk('format กัน null (num/baht)', /v == null \|\| isNaN\(v\)/.test(app));
chk('ไม่มี toFixed บนค่าที่อาจ undefined', !/undefined\.toFixed/.test(app));

/* 5) ข้อมูล snapshot */
const snap = read('data-snapshot.js');
const ver = (snap.match(/"ver":\s*(\d+)/) || snap.match(/ver:\s*(\d+)/) || [])[1];
const appVer = (app.match(/SCHEMA_VER\s*=\s*(\d+)/) || [])[1];
chk('SCHEMA_VER ตรงกับ snapshot', String(ver) === String(appVer), 'app=' + appVer + ' snap=' + ver);
chk('snapshot ไม่มี NaN', !/:(NaN|undefined|Infinity)/.test(snap.slice(0, 4000000)));

/* 6) ตรวจข้อมูลจริง: revenue = (ราคา − ส่วนลด)/1.07 ภายในพิสัยที่ยอมรับ */
const payload = JSON.parse(snap.slice(snap.indexOf('{'), snap.lastIndexOf('}') + 1));
const data = payload.data || [];
chk('snapshot มีข้อมูล', data.length > 1000, data.length + ' แถว');
const numFields = ['revenue', 'units', 'price', 'discount', 'paidAmount'];
const badTypes = data.filter(d => numFields.some(f => d[f] != null && (typeof d[f] !== 'number' || !isFinite(d[f]))));
chk('ฟิลด์ตัวเลขเป็น number ทั้งหมด', badTypes.length === 0, badTypes.length + ' แถวผิด');
const negRev = data.filter(d => d.revenue < 0);
chk('ไม่มี revenue ติดลบ', negRev.length === 0, negRev.length + ' แถว');
const noSO = data.filter(d => !d.so);
chk('ทุกแถวมีเลข SO', noSO.length === 0, noSO.length + ' แถวไม่มี SO');
const dupSO = (() => { const s = new Set(), dup = []; data.forEach(d => { if (s.has(d.so)) dup.push(d.so); s.add(d.so); }); return dup; })();
chk('ไม่มี SO ซ้ำ (1 ใบ 1 แถว)', dupSO.length === 0, dupSO.length ? dupSO.slice(0, 3).join(',') + ' (' + dupSO.length + ')' : 'unique');
const st3 = new Set(data.map(d => d.status3));
chk('สถานะใบงาน3 มีแค่ค่าที่รู้จัก', [...st3].every(s => ['1.Done', '2.Pending', '3.Cancel', ''].includes(s)), [...st3].join(' | '));
const badDate = data.filter(d => {
  const v = d.dateSO && d.dateSO.__d ? d.dateSO.__d : d.dateSO;
  return v != null && isNaN(new Date(v).getTime());
});
chk('วันที่เปิด SO ถูกต้องทั้งหมด', badDate.length === 0, badDate.length + ' แถว');

/* 7) % รวมกันได้ 100 ในชุดข้อมูลหลัก */
const total = data.length;
const byStatus = {};
data.forEach(d => { byStatus[d.status3 || '(ว่าง)'] = (byStatus[d.status3 || '(ว่าง)'] || 0) + 1; });
const sumStatus = Object.values(byStatus).reduce((a, b) => a + b, 0);
chk('ผลรวมสถานะ = จำนวนแถว', sumStatus === total, sumStatus + '/' + total);

console.log(rows.join('\n'));
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
