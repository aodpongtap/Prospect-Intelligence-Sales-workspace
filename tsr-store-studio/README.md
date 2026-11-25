# TSR Store Studio

โปรแกรมออกแบบผังร้านสะดวกซัก + ถอดปริมาณ + ประมาณราคา (BOQ) — **ไฟล์เดียวจบ** `index.html`
หน้าตาอ้างอิง AutoCAD (Ribbon · Command line · Drafting toggles · Crosshair)

## เปิดใช้งาน

- **ออนไลน์ (GitHub Pages):** https://aodpongtap.github.io/Prospect-Intelligence-Sales-workspace/tsr-store-studio/
- **ในเครื่อง:** เปิดไฟล์ `index.html` ด้วย Chrome/Edge (กด `Ctrl+F5` หนึ่งครั้งหลังอัปเดต)

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [`USER-GUIDE.md`](USER-GUIDE.md) | คู่มือการใช้งานฉบับเต็ม (12 บท) |
| [`VIDEO-SCRIPT.md`](VIDEO-SCRIPT.md) | สคริปต์วิดีโอสอน 8 ฉาก (~7 นาที) |
| [`QA-QC-REPORT.md`](QA-QC-REPORT.md) | รายงาน QA/QC และ defect ที่แก้แล้ว |

## ฟีเจอร์หลัก

- วาดผัง + ผนัง + ปรับขนาดวัตถุด้วยจุดจับมุม (resize grips)
- งานระบบ MEP: ไฟ · น้ำ · เส้นท่อ (ถอดปริมาณอัตโนมัติ)
- ห้องเซอร์วิส (BOH) สร้างผนังรอบห้องอัตโนมัติ
- BOQ 6 หมวด พร้อม *ที่มาของปริมาณ* ทุกบรรทัด
- ต้นทุนกลาง (วัสดุ + ค่าแรง + เครื่องทุ่นแรง + เผื่อสูญเสีย)
- พิมพ์ BOQ 3 หน้า + title block และสเปคสำหรับลูกค้า (ไม่มีต้นทุน)
- ภาพ 3 มิติ (ISO / ด้านบน / ด้านหน้า / Wireframe)
- บันทึกอัตโนมัติ + ส่งออก/นำเข้าไฟล์ผัง + Excel

## เทคโนโลยี

HTML + CSS + JavaScript ในไฟล์เดียว · Three.js (3D) · SheetJS (Excel) ผ่าน CDN
ไม่ต้องติดตั้ง ไม่ต้อง build — เปิดไฟล์ก็ใช้ได้
