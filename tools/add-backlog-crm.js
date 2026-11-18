// เพิ่มการ์ดงาน (Issues) เข้า GitHub Project board — ชุดวิเคราะห์ช่องว่างของ Partner CRM
// ใช้: node tools/add-backlog-crm.js
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
    title: '[P0] เชื่อมข้อมูล Partner CRM เข้า Google Sheets แทน localStorage',
    body: 'ตอนนี้ partner-crm เก็บข้อมูลในเบราว์เซอร์ (ใช้คนเดียว/เครื่องเดียว)\n\nงานที่ต้องทำ\n- เพิ่มแท็บ Partners / Orders / Pipeline / Privileges / Settings ใน Google Sheet\n- เพิ่ม action ใน Code.gs: partners, orders, addOrder, pipeline, privs, saveSettings\n- ฝั่งเว็บเปลี่ยน data layer จาก localStorage เป็น PIAuth API (มี token อยู่แล้ว)\n- คง Export/Import JSON ไว้เป็น backup',
  },
  {
    title: '[P0] สิทธิ์ผู้ใช้ + Audit log',
    body: 'ต้องมีบทบาท Admin / Manager / AE และบันทึกว่าใครแก้อะไร\n\n- RBAC: AE เห็นเฉพาะคู่ค้าที่ตัวเองดูแล, Manager เห็นทีม, Admin ตั้งค่าได้\n- Audit log: ใครเปลี่ยน Tier / GP / Commission / ลบออเดอร์ เมื่อไร ค่าเดิม-ค่าใหม่\n- เก็บ log ลงชีต AuditLog (append only)',
  },
  {
    title: '[P0] เพิ่มต้นทุนสินค้า (Cost) เพื่อคำนวณ GP จริง + เพดาน Max GP',
    body: 'ปัจจุบัน GP คำนวณเป็น % ของราคาขาย (ยังไม่ใช่กำไรจริง)\n\n- เพิ่ม field cost ต่อสินค้า (ต้นทุน/หน่วย)\n- GP = net − (cost × qty) และ GP% = GP / net\n- เพดานส่วนลด: ถ้า discount ทำให้ GP ต่ำกว่า Max GP ที่ตั้งไว้ ให้ฟอร์มเตือน/บล็อก\n- รายงาน GP Contribution ต้องอิง GP จริง',
  },
  {
    title: '[P0] เป้ายอดขายรายคู่ค้า/รายเดือน + Period lock',
    body: '- เป้าแยกตามคู่ค้าและตามเดือน (ไม่ใช้เป้ากลางค่าเดียว)\n- ใช้ทั้ง Retention Alert และ Volume Rebate\n- Period lock: ปิดงวดเดือนแล้วห้ามแก้ออเดอร์ย้อนหลัง (ต้องมีสิทธิ์ Admin + log)',
  },
  {
    title: '[P0] Sell-out เป็นรายการ (Transaction) ต่อ SKU/เดือน',
    body: 'ตอนนี้ Sell-out กรอกเป็นยอดรวมมือ ทำให้ตรวจสอบย้อนหลังไม่ได้\n\n- เพิ่มตาราง SellOut: partnerId, เดือน, SKU, จำนวน, ช่องทาง\n- KPI Sell-out / Repeat Purchase คำนวณจากรายการจริง\n- ใช้คำนวณ Sell-through = sell-out ÷ ยอดซื้อ",
  },
  {
    title: '[P1] Commission แยกตาม Tier + ผูกสิทธิประโยชน์กับ Tier',
    body: '- อัตรา Commission ต่างกันตาม Tier (AG/AG EX/DL/KEY DL/KEYVIP/VVIP)\n- สิทธิประโยชน์ (Lead/Demo/Content/Business Plan) มีโควตาตาม Tier + ตรวจ quota ก่อนอนุมัติ\n- เมทริกซ์ Tier × สิทธิ์ แก้ได้ในหน้าตั้งค่า',
  },
  {
    title: '[P1] เงินผ่อน/เครดิตเทอม: ตารางผ่อน + มัดจำ/ส่วนที่เหลือ',
    body: '- ฟิลด์: เงินมัดจำ, ยอดจัดไฟแนนซ์, จำนวนงวด, ดอกเบี้ย, วันครบกำหนด\n- สถานะเครดิต: รอตรวจ / อนุมัติ / ปฏิเสธ\n- ติดตามเก็บเงินส่วนที่เหลือ + แจ้งเตือน overdue\n- ใบกำกับ/เลขที่เอกสารอ้างอิง',
  },
  {
    title: '[P1] Convert Lead → Partner + Checklist MOU/อบรม + ไฟล์แนบ',
    body: '- ปุ่ม "อนุมัติเป็นคู่ค้า" จาก Kanban → สร้างข้อมูล partner (พกประวัติลีดไปด้วย)\n- Checklist ต่อสถานะ: MOU เซ็นแล้ว, อบรมสินค้า, อบรมระบบขาย, อบรมติดตั้ง\n- แนบไฟล์ (MOU/สัญญา/รูปหน้างาน) ผ่าน Google Drive link',
  },
  {
    title: '[P1] Approval workflow + แจ้งเตือน LINE/Email',
    body: '- คำขออนุมัติ: Rebate, สิทธิประโยชน์, Business Plan, ส่วนลดเกินเพดาน\n- ผู้อนุมัติ + ประวัติการอนุมัติ\n- แจ้งเตือน: Retention Alert, งวดใกล้ครบกำหนด, ใบเสนอราคาค้าง',
  },
  {
    title: '[P2] Export รายงาน Excel/PDF + ตัวกรองไตรมาส/ปี',
    body: '- Export ตารางคู่ค้า/ออเดอร์/Rebate เป็น CSV/XLSX\n- พิมพ์รายงานสรุปผู้บริหารเป็น PDF\n- Dashboard เลือกช่วงเวลา: เดือน / ไตรมาส / ปี + เทียบเป้า',
  },
];

let added = 0;
for (const it of issues) {
  const url = gh(['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', it.title, '--body', it.body]).trim();
  const item = JSON.parse(gh(['project', 'item-add', PROJECT, '--owner', OWNER, '--url', url, '--format', 'json']));
  gh(['project', 'item-edit', '--id', item.id, '--project-id', PROJECT_ID, '--field-id', STATUS_FIELD, '--single-select-option-id', OPT.todo]);
  added++;
  console.log(`[todo] ${it.title} -> ${url}`);
}
console.log(`เพิ่ม ${added} การ์ดเข้า board`);
