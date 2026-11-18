# Prospect Intelligence Sales workspace

[![Deploy to server](https://github.com/aodpongtap/Prospect-Intelligence-Sales-workspace/actions/workflows/deploy.yml/badge.svg)](https://github.com/aodpongtap/Prospect-Intelligence-Sales-workspace/actions/workflows/deploy.yml)

**Live demo (GitHub Pages):** https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/
**Production (มี login):** http://203.146.170.85:9501/
**Google Apps Script Web App (ล็อกอิน Google):** https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec
**User Management (Apps Script):** https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec?page=users
**GitHub Project board (แผนงาน):** https://github.com/users/aodpongtap/projects/1

Dashboard สำหรับทีมขาย: ติดตาม Prospect, Pipeline, Project, After-Sale Service และ Customer Intelligence

## โครงสร้าง

| Path | รายละเอียด |
|---|---|
| `index.html` | ตัวแอปหลัก **Prospect Intelligence Sales workspace** — Dashboard (Prospect, Pipeline, Project, After-Sale, Customer Intelligence, Reports, Settings) |
| `auth-backend/` | Backend ล็อกอิน/RBAC (Node.js ล้วน ไม่มี dependency) + nginx config ตัวอย่าง |
| `.github/workflows/deploy.yml` | Auto-deploy ขึ้นเซิร์ฟเวอร์ทุกครั้งที่ push เข้า `main` |
| `README.md` | เอกสารนี้ |

> ไฟล์โมบายล์ (Android/iOS), ไฟล์ zip และไฟล์นำเสนอของ SAFE1210 ย้ายออกจาก repo นี้แล้ว แยกเก็บไว้นอกโปรเจกต์

## auth-backend

- `server.js` — HTTP server (127.0.0.1:9511), session cookie `tsr3_sid` (HttpOnly, 12 ชม. sliding), รหัสผ่านเก็บเป็น scrypt hash
- `public/login.html`, `public/users.html`, `public/rbac.js` — หน้า login / จัดการผู้ใช้ / ตัวช่วยฝั่ง client
- `nginx-tsr3.conf` — ตัวอย่าง config nginx ที่ใช้ `auth_request` บังคับล็อกอินทุกหน้า

### เริ่มใช้งาน

```bash
cd auth-backend
node server.js --init-master <username> <password>   # สร้าง master admin ครั้งแรก
node server.js                                       # รัน (หรือใช้ pm2)
```

### User Management (จัดการผู้ใช้)

- เข้าที่ **`/admin/users`** — หรือเมนู **User Management** ที่แสดงเฉพาะ Master Admin
- ทำได้: สร้างบัญชี · กำหนดระดับสิทธิ์ (Master Admin / Admin / Editor / Viewer) · รีเซ็ตรหัสผ่าน · ปิด/ลบบัญชี
- ระดับสิทธิ์: `master` = ทุกอย่าง + จัดการผู้ใช้ (มีได้บัญชีเดียว), `admin` = ดู/แก้ข้อมูล + export + settings, `editor` = ดู/แก้ + export, `viewer` = ดูเท่านั้น
- หน้านี้ต้องล็อกอินและเรียก API ของ backend — **ไม่ทำงานบน GitHub Pages** (static) ให้ใช้ลิงก์ production แทน

> `auth-backend/data/` (users.json, sessions.json) เป็นข้อมูล runtime ที่มี hash รหัสผ่าน — **ไม่ถูก track ใน git** (ดู `.gitignore`)

## เว็บที่รันอยู่

- http://203.146.170.85:9501/ — static site ผ่าน nginx (root: `/var/www/tsr3`)
- โฟลเดอร์ต้นทางบนเซิร์ฟเวอร์: `/home/mngr-tom/Test tsr - 3`
- sync ขึ้น web root: `bash /home/mngr-tom/sync-tsr3.sh` (มี cron รันทุก 1 นาที)

## สร้างไฟล์ HTML แบบ self-contained (`dist/`)

```bash
node tools/build-html.js      # รวม CSS/JS ลงในแต่ละหน้า → dist/index.html, login.html, users.html
node tools/serve-dist.js 8123 # ทดสอบในเครื่อง → http://localhost:8123
```

- ไฟล์ใน `dist/` ไม่ต้องมีโฟลเดอร์ `assets/` (ฝัง `auth-sheets.js` ไปแล้ว)
- มี `dist/Prospect-Intelligence-HTML.zip` พร้อมดาวน์โหลด/ส่งต่อ
- ต้องเปิดผ่าน http(s) หรือโฮสต์ static (เบราว์เซอร์บล็อก fetch เมื่อเปิดด้วย `file://`)

## Google Apps Script Web App (`apps-script/`)

โฮสต์บน Google แทน server — หน้าตา/สิทธิ์เหมือนเวอร์ชัน GitHub Pages ทุกอย่าง

- `Code.gs` — `doGet()` เสิร์ฟ `Index.html` (หรือ `?page=users` / `?page=login`), JSON API (`?api=1`), `include()` สำหรับฝังไฟล์ HTML
- `Login.html` — ล็อกอินอีเมล/รหัสผ่าน (เก็บทั้ง `tsr3_token` และ `pi_session_v2`)
- `Users.html` — หน้า User Management (เรียกผ่าน `google.script.run`)
- `Index.html` — **สำเนาของ `index.html` ฝั่ง GitHub Pages** (สคริปต์เดียวกัน: `__applyMe__`, กรองเมนู/ข้อมูลเฉพาะ Sale, KPI จากดีลตัวเอง, ปุ่ม “เพิ่มดีลของฉัน”)
- `AuthSheets.html` — ฝัง `assets/auth-sheets.js` เข้า template (`<?!= include('AuthSheets'); ?>`)
- `appsscript.json` — `webapp: { executeAs: USER_DEPLOYING, access: ANYONE_ANONYMOUS }` + scopes `userinfo.email`, `spreadsheets`
- `.clasp.json` — ผูกกับโปรเจกต์ Apps Script ที่สร้างไว้

### หลักการ sync สองเวอร์ชัน

1. แก้ UI ที่ `index.html` (ต้นฉบับ) → commit/push ขึ้น GitHub Pages
2. คัดลอกเป็น `apps-script/Index.html` แล้วแก้เฉพาะจุดนี้:
   - `<script src="assets/auth-sheets.js?v=3"></script>` → `<?!= include('AuthSheets'); ?>`
   - บล็อก `// โหมด GitHub Pages` → บล็อก `// โหมด Google Apps Script` (อ่าน `tsr3_token` + `google.script.run.getMe`)
3. `clasp push --force` → `clasp create-version` → `clasp update-deployment <deployment-id> -V <n>`
4. ตรวจด้วย `node tools/check-gas.js` (ไม่ต้องใช้บัญชี Google)

### User Management บน Apps Script

- เก็บผู้ใช้ใน Google Sheet ชื่อ **"Prospect Intelligence - Users"** (สร้างอัตโนมัติใน Drive ของเจ้าของสคริปต์)
- คอลัมน์: `email | level | status | createdAt | lastLogin` (+ ชีต `Deals` สำหรับดีลของแต่ละคน)
- Master Admin = `aodpongtaptsr@gmail.com` (กำหนดตายตัว) — เพิ่ม/แก้สิทธิ์/เปิด-ปิด/ลบผู้ใช้ได้
- ระดับสิทธิ์: `admin`, `sale`, `editor`, `viewer` · สถานะ: `active`, `disabled`
- ถ้าเจอ error เรื่องสิทธิ์/ชีต: เปิด Apps Script Editor แล้ว Run ฟังก์ชัน **`resetUserSheet`** (ล้าง Sheet ID แล้วสร้างชีตใหม่)
- ระบบดัก error ที่ `doGet()` แล้วแสดงหน้าแจ้งปัญหาพร้อมวิธีแก้ (ไม่ขึ้นหน้า exception ดิบ)

```bash
clasp login                    # บัญชี aodpongtaptsr@gmail.com
cd apps-script
clasp push --force
clasp create-version "v15 ..."  # จำเลข version ที่ได้
clasp update-deployment <deployment-id> -V <version>
```

รายละเอียดโปรเจกต์ Apps Script:
- Script ID: `1lkYiKjFqgjKO7gCDGgxaJuk8A5PIxcKbYsqJxDsdHrfpPOfGC5bXH8NV`
- เจ้าของ: **aodpongtaptsr@gmail.com** (บัญชีเดียว)
- ต้องเปิด Google Apps Script API ที่ https://script.google.com/home/usersettings ก่อนใช้ clasp
