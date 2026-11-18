# SAFE1210-Project

โปรเจกต์รวมเว็บ SAFE1210 + Dashboard ทีมขาย (Prospect Intelligence Sales workspace)

## โครงสร้าง

| Path | รายละเอียด |
|---|---|
| `index.html` | **Prospect Intelligence Sales workspace** — Dashboard (Prospect, Pipeline, Project, After-Sale, Customer Intelligence, Reports, Settings) |
| `SAFE1210_App.html` | หน้า landing/ทางลัดสินค้า SAFE1210 |
| `SAFE1210Android/` | ซอร์สแอป Android (Kotlin) + `SAFE1210iOS/` (Swift) |
| `SAFE1210_Android_Source.zip`, `SAFE1210_Mobile_Projects.zip` | แพ็กซอร์ส/โปรเจกต์มือถือ |
| `SAFE1210_website_summary_TH.pptx` | สรุปข้อมูลเว็บไซต์ (ภาษาไทย) |
| `Code.txt` | โน้ตประกอบโปรเจกต์ |
| `auth-backend/` | Backend ล็อกอิน/RBAC (Node.js ล้วน ไม่มี dependency) + nginx config ตัวอย่าง |

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

> `auth-backend/data/` (users.json, sessions.json) เป็นข้อมูล runtime ที่มี hash รหัสผ่าน — **ไม่ถูก track ใน git** (ดู `.gitignore`)

## เว็บที่รันอยู่

- http://203.146.170.85:9501/ — static site ผ่าน nginx (root: `/var/www/tsr3`)
- โฟลเดอร์ต้นทางบนเซิร์ฟเวอร์: `/home/mngr-tom/Test tsr - 3`
- sync ขึ้น web root: `bash /home/mngr-tom/sync-tsr3.sh` (มี cron รันทุก 1 นาที)
