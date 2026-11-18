Prospect Intelligence Sales workspace — ชุดไฟล์ HTML (self-contained)================================================================

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
