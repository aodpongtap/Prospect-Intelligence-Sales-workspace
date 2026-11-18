// สร้างไฟล์ HTML แบบ self-contained (ไม่ต้องมีโฟลเดอร์ assets) ออกมาที่ dist/
// ใช้: node tools/build-html.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const PAGES = ['index.html', 'login.html', 'users.html'];

fs.mkdirSync(OUT, { recursive: true });

const authJs = fs.readFileSync(path.join(ROOT, 'assets', 'auth-sheets.js'), 'utf8');

let count = 0;
for (const page of PAGES) {
  const src = path.join(ROOT, page);
  if (!fs.existsSync(src)) {
    console.log('ข้าม (ไม่พบไฟล์):', page);
    continue;
  }
  let html = fs.readFileSync(src, 'utf8');

  // ฝัง assets/auth-sheets.js เข้าไปในหน้าเว็บเลย
  const inline = '<script>\n/* ==== inlined: assets/auth-sheets.js ==== */\n' + authJs + '\n</script>';
  const before = html.length;
  html = html.replace(/<script\s+src="assets\/auth-sheets\.js[^"]*"\s*><\/script>/, inline);
  if (html.length === before) console.log('คำเตือน: ไม่พบ <script src="assets/auth-sheets.js"> ใน', page);

  fs.writeFileSync(path.join(OUT, page), html, 'utf8');
  count++;
  console.log('✔ dist/' + page, '(' + Math.round(html.length / 1024) + ' KB)');
}

// เว็บชุดใหม่ที่เป็นไฟล์เดียวอยู่แล้ว — คัดลอกออกมาให้ดาวน์โหลดได้ที่ dist/
const SINGLE = [
  ['partner-crm/index.html', 'partner-crm.html', 'TSR Partner Management (CRM คู่ค้า)'],
  ['partner-care/index.html', 'partner-care.html', 'Partner Care Center (ดูแล Partner + Monitor ทีมขาย)']
];
for (const [srcRel, outName, label] of SINGLE) {
  const src = path.join(ROOT, srcRel);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(OUT, outName));
  console.log('✔ dist/' + outName + ' — ' + label);
}

// หน้าแนะนำการใช้งาน
const readme = `Prospect Intelligence Sales workspace — ชุดไฟล์ HTML (self-contained)================================================================

ไฟล์ในโฟลเดอร์นี้สร้างจาก tools/build-html.js
CSS/JS ทั้งหมดฝังอยู่ในแต่ละไฟล์แล้ว ไม่ต้องมีโฟลเดอร์ assets/

วิธีใช้
1) เปิดผ่านเว็บเซิร์ฟเวอร์ (แนะนำ) — เพราะเบราว์เซอร์บล็อก fetch ตอนเปิดด้วย file://
   • วางทั้งโฟลเดอร์ dist/ ขึ้นเว็บ แล้วเปิด index.html
   • ระหว่างพัฒนา: npx serve dist   (หรือ python -m http.server)

2) อัปขึ้น GitHub Pages / โฮสต์อะไรก็ได้ (static hosting)

ลำดับการทำงาน
- index.html  → ถ้าไม่มี session จะเด้งไป login.html
- login.html  → เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน (ตรวจกับ Google Sheets)
- users.html  → User Management (เฉพาะ admin)

หมายเหตุ
- ข้อมูลผู้ใช้และดีลเรียกผ่าน Google Apps Script Web App ที่Deploy ไว้แล้ว
- ต้องมีอินเทอร์เน็ต (โหลด Chart.js / Font Awesome / ฟอนต์ Prompt จาก CDN)
`;
fs.writeFileSync(path.join(OUT, 'README.txt'), readme, 'utf8');
console.log('✔ dist/README.txt');
console.log('สร้างเสร็จ ' + count + ' หน้า →', OUT);
