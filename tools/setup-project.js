// สร้างการ์ดงาน (Issues) แล้วเพิ่มเข้า GitHub Project board
// ใช้: node tools/setup-project.js
const { execFileSync } = require('child_process');

const GH = 'C:\\Users\\pongtap.p\\tools\\gh\\gh.exe';
const OWNER = 'aodpongtap';
const REPO = 'Prospect-Intelligence-Sales-workspace';
const PROJECT = '1';
const PROJECT_ID = 'PVT_kwHODJDy2M4BsJtx';
const STATUS_FIELD = 'PVTSSF_lAHODJDy2M4BsJtxzhqZJLU';
const OPT = { todo: 'f75ad846', inprogress: '47fc9ee4', done: '98236657' };

function gh(args) {
  return execFileSync(GH, args, { encoding: 'utf8' });
}

const issues = [
  {
    status: 'done',
    title: 'ระบบล็อกอิน + User Management (Google Sheets backend)',
    body: 'ล็อกอินอีเมล/รหัสผ่านด้วย Google Sheets, จัดการผู้ใช้ 4 ระดับ (admin/sale/editor/viewer), รีเซ็ตรหัส, เปิด-ปิดผู้ใช้',
  },
  {
    status: 'done',
    title: 'สิทธิ์ Sale: เห็นเฉพาะงานตัวเอง + ฟอร์มเพิ่มดีล',
    body: 'Sale เห็นเฉพาะดีลของตัวเอง, เมนูเหลือ Dashboard/Sale Monitor, KPI คำนวณจากดีลตัวเอง, ปุ่ม "เพิ่มดีลของฉัน" บันทึกลงชีต Deals',
  },
  {
    status: 'done',
    title: 'AI Prompts 4 ชุด (CRM) พร้อมข้อมูลดีลอัตโนมัติ',
    body: 'หน้า AI Prompts: วิเคราะห์ Pipeline, งานรอติดตั้ง, ร่างข้อความติดตามรายคน, สรุปผลงาน/Conversion — เติมข้อมูลจาก Google Sheets และคัดลอกไปวางใน AI ได้ทันที',
  },
  {
    status: 'done',
    title: 'Deploy: GitHub Pages + GitHub Actions + Apps Script v15',
    body: 'เว็บออนไลน์ที่ GitHub Pages, auto-deploy ผ่าน Actions ไป VPS, เว็บแอป Google Apps Script ใช้ UI ชุดเดียวกัน',
  },
  {
    status: 'inprogress',
    title: 'Sync หน้า AI Prompts ไปยังเวอร์ชัน Google Apps Script',
    body: 'คัดลอก index.html → apps-script/Index.html, patch include AuthSheets + bootstrap, clasp push/create-version/update-deployment แล้วตรวจด้วย tools/check-gas.js',
  },
  {
    status: 'todo',
    title: 'เพิ่มฟิลด์เงื่อนไขการชำระเงิน (payment) ในชีต Deals',
    body: 'รองรับ เงินสด / เงินผ่อน / เครดิตเทอม เพื่อให้ Prompt ที่ 3 และรายงาน Cash-In แม่นยำขึ้น — ต้องเพิ่มคอลัมน์ในชีต, ฟอร์มเพิ่มดีล, และ normalization ฝั่ง Code.gs',
  },
  {
    status: 'todo',
    title: 'แก้ไข/ลบดีลของตัวเอง (Edit / Delete)',
    body: 'ปัจจุบันเพิ่มดีลได้อย่างเดียว — เพิ่มปุ่มแก้ไข/ลบในตาราง โดยใช้ API updateDeal/deleteDeal ที่มีอยู่ และจำกัดสิทธิ์เจ้าของดีล',
  },
  {
    status: 'todo',
    title: 'แจ้งเตือน Follow-up ค้างเกิน 7 วัน',
    body: 'Highlight ดีลที่ไม่มี Next Action หรือไม่มีความเคลื่อนไหวเกิน 7 วัน บน Dashboard ของ Sale + สรุปให้หัวหน้าทีม',
  },
  {
    status: 'todo',
    title: 'Export รายงานเป็น Excel/CSV',
    body: 'ปุ่ม Export ที่หน้า Sale Monitor ให้ดาวน์โหลดเป็นไฟล์ .csv/.xlsx ตามตัวกรองที่เลือกอยู่',
  },
];

let added = 0;
for (const it of issues) {
  const url = gh(['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', it.title, '--body', it.body]).trim();
  const item = JSON.parse(
    gh(['project', 'item-add', PROJECT, '--owner', OWNER, '--url', url, '--format', 'json'])
  );
  gh([
    'project', 'item-edit',
    '--id', item.id,
    '--project-id', PROJECT_ID,
    '--field-id', STATUS_FIELD,
    '--single-select-option-id', OPT[it.status],
  ]);
  added++;
  console.log(`[${it.status}] ${it.title} -> ${url}`);
}
console.log(`เพิ่มเข้าระบบบอร์ด ${added} การ์ด`);
