# Prospect Intelligence Sales workspace

[![Deploy to server](https://github.com/aodpongtap/Prospect-Intelligence-Sales-workspace/actions/workflows/deploy.yml/badge.svg)](https://github.com/aodpongtap/Prospect-Intelligence-Sales-workspace/actions/workflows/deploy.yml)

**Live demo (GitHub Pages):** https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/
**Production (มี login):** http://203.146.170.85:9501/
**Google Apps Script Web App (ล็อกอิน Google):** https://script.google.com/macros/s/AKfycbzWa-PSZJyZN4HZe1t0LxC5wfa2m9_FJxQ34d_Ochm1CFb2QIVb3E7qCpqjAbXZtqFY/exec

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

## Google Apps Script Web App (`apps-script/`)

โฮสต์บน Google แทน server — ล็อกอินด้วยบัญชี Google อัตโนมัติ (ไม่ต้องมี backend)

- `Code.gs` — `doGet()` เสิร์ฟ `Index.html`, `getUserEmail()` คืนอีเมลผู้ใช้ที่ล็อกอิน
- `appsscript.json` — `webapp: { executeAs: USER_DEPLOYING, access: ANYONE }` + scope `userinfo.email`
- `Index.html` — dashboard (แสดงอีเมล Google ที่มุมขวา, ไม่โหลด `/api/rbac.js` บน Apps Script)
- `.clasp.json` — ผูกกับโปรเจกต์ Apps Script ที่สร้างไว้

```bash
clasp login                    # บัญชี aodpongtaptsr@gmail.com
cd apps-script
clasp push --force
clasp create-deployment --description "v2"
clasp list-deployments
```

รายละเอียดโปรเจกต์ Apps Script:
- Script ID: `1lkYiKjFqgjKO7gCDGgxaJuk8A5PIxcKbYsqJxDsdHrfpPOfGC5bXH8NV`
- เจ้าของ: **aodpongtaptsr@gmail.com** (บัญชีเดียว)
- ต้องเปิด Google Apps Script API ที่ https://script.google.com/home/usersettings ก่อนใช้ clasp
