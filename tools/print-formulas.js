/* พิมพ์สูตรของคอลัมน์ที่สนใจจาก excel-formulas.json */
const fs = require('fs');
const FILE = process.argv[2] || 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\excel-formulas.json';
const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const want = [
  'revenue', 'สถานะใบงาน3', 'Check SV. Cancel', 'MapStutus', 'SLA Admin', 'Date Admin',
  'จำนวนเครื่องซักผ้า', '(เช็คเครื่องซักผ้า)', 'MEMO ทีม', 'Grp ทีมขาย', 'Grp Pack',
  'สถานะใบงาน', 'Mth SO', 'Date SO', 'วันที่ปิดงาน', 'Package', 'สถานะ Admin',
  'จังหวัด (groups)', 'สถานะใบงาน3 (groups)', 'PIC ผู้รับผิดชอบ'
];

const out = [];
want.forEach(w => {
  const hit = rows.filter(r => (r.header || '').trim() === w);
  if (!hit.length) { out.push({ header: w, col: '-', formula: '(ไม่พบในไฟล์)', value: null }); return; }
  hit.forEach(h => out.push(h));
});
fs.writeFileSync(FILE.replace('.json', '-picked.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('picked', out.length, '->', FILE.replace('.json', '-picked.json'));
out.forEach(o => console.log(o.col + ' | ' + o.header + ' => ' + (o.formula ? o.formula.slice(0, 300) : '(ค่า)')));
