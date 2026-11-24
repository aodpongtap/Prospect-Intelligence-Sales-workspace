# Production Runbook — Prospect Intelligence Sales workspace

**เวอร์ชัน Production:** v1.0 · 24 พ.ย. 2569
**Apps Script deployment:** `AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-` @ `PROD v1.0 2026-11-24`

## 1) URL ที่ใช้งานจริง
| ส่วน | URL |
|---|---|
| เว็บแอป (Frontend) | https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/ |
| Login | https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/login.html |
| User Management | https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/users.html |
| Backend API (JSONP) | https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec |
| ฐานข้อมูล (Google Sheet) | https://docs.google.com/spreadsheets/d/1yhezIwYagz8lmA0p7F79oSuG1t0f1ZAvLWq4Nv5MNYc/edit |
| Apps Script project | https://script.google.com/home/projects/1lkYiKjFqgjKO7gCDGgxaJuk8A5PIxcKbYsqJxDsdHrfpPOfGC5bXH8NV/edit |
| GitHub repo | https://github.com/aodpongtap/Prospect-Intelligence-Sales-workspace |

## 2) โครงสร้างข้อมูล (แท็บใน Sheet)
`Users` · `Deals` · `DailyReports` · `Targets` · `Teams` · `Products` · `Projects` · `Logs`
(+ `Logs_archive_*` จากการล้าง log, `BK *` แท็บสำรองชั่วคราว)

## 3) Backup
- **อัตโนมัติ:** GitHub Actions `daily-sheet-backup` ทุกวัน 19:00 UTC (02:00 ไทย) → เรียก `?api=1&action=backupDaily`
- **ระหว่างวัน:** สำรองเมื่อมีผู้ใช้เข้าระบบครั้งแรก (lazy) + ปุ่ม "สำรองเดี๋ยวนี้"
- **ปลายทาง:** ไฟล์ Google Sheet แยกใน Drive แบบหมุนเวียน **7 ชุด** (`PI-backup-yyyyMMdd-HHmm`)
- **กู้คืน:** เปิดไฟล์ `PI-backup-…` ที่ต้องการ → คัดลอกแท็บกลับเข้าไฟล์หลัก
- **ล้าง Log:** Activity Log → ปุ่ม "ล้าง Log" (สำรองลง `Logs_archive_*` อัตโนมัติ)

## 4) สิทธิ์ (RBAC)
| ระดับ | เห็น |
|---|---|
| L1 Admin | ทั้งเครือข่าย + Activity Log + Backup |
| L2 BU | ทั้งเครือข่าย (ไม่เห็น Activity Log) |
| L3 Head Team | ทีมที่ดูแล |
| L4 Supervisor | AE + ตัวแทนในทีม |
| L5 AE | ตัวเอง + ตัวแทนที่ผูก (saleId) |
| L6 ตัวแทน/MCN | เฉพาะงานตัวเอง |

## 5) ขั้นตอน Deploy (เมื่อแก้โค้ด)
```powershell
# 1) build + ตรวจ syntax
node tools/build-html.js
node tools/lint-inline.js            # ต้องได้ problems = 0

# 2) backend
cd apps-script
node <clasp> push -f
node <clasp> create-version "<ข้อความ>"
node <clasp> deploy -i AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW- -V <n>

# 3) frontend
git add -A && git commit -m "<ข้อความ>" && git push pi main
# GitHub Pages ใช้เวลาประมาณ 60–90 วินาที
```
> ทุกครั้งที่แก้ asset ให้ bump `?v=` ใน `index.html` เสมอ ไม่งั้นเบราว์เซอร์จะใช้ไฟล์เก่า

## 6) Health check (read-only)
- เปิด Dashboard → ตัวเลข Target / ปิดงานแล้ว / Forecast ต้องตรงกับ Reports
- Activity Log → เห็นรายการล่าสุด + แผง Backup แสดง "สำรองล่าสุด"
- `?api=1&action=whoami&token=…` (admin) → ตรวจสิทธิ์ Drive/Trigger

## 7) ข้อจำกัดที่ทราบ
- Drive scope ของสคริปต์ยังไม่ได้รับอนุมัติ → สำรองเป็น **ไฟล์แยกแบบหมุนเวียน** (7 ชุด) แทนโฟลเดอร์ `PI Backups`
- Activity Log ครั้งแรกอาจใช้ 3–6 วินาที (Apps Script cold start)
- GitHub Actions cron อาจล่าช้าได้ 5–15 นาทีในชั่วโมงเร่งด่วน
