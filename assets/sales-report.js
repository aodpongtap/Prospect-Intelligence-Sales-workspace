/* ============================================================
   Sales Report & Forecast Dashboard (ภาษาไทย)
   หน้า Reports ใน Prospect Intelligence Sales workspace

   โครงสร้าง:
   1) CONFIG  — ปี / เดือน / สถานะ / สินค้า / รูปแบบการซื้อ / เป้าหมาย
   2) MOCK    — ข้อมูลจำลอง (แทนที่ด้วย Google Sheets / CSV ได้)
   3) CALC    — สูตรคำนวณทั้งหมด (แยกออกจาก UI เพื่อต่อ API ง่าย)
   4) VIEW    — render HTML + Chart.js + ตาราง
   5) EVENTS  — filter / search / sort / modal
   ============================================================ */
(function (global) {
  'use strict';

  /* ============================ 1) CONFIG ============================ */
  var YEARS = [2026, 2027];

  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  /* สถานะงาน 0–5 พร้อมน้ำหนักที่ใช้คิด Forecast */
  var STATUS = [
    { code: 0, label: 'กำลังคุย Detail', short: 'กำลังคุย', weight: 0,    cls: 's0', color: '#94A3B8' },
    { code: 1, label: 'Pipeline',        short: 'Pipeline',  weight: null, cls: 's1', color: '#A78BFA' },
    { code: 2, label: 'รอยืนยัน PO',     short: 'รอ PO',     weight: 0.8,  cls: 's2', color: '#F59E0B' },
    { code: 3, label: 'รอส่งของ',        short: 'รอส่งของ',  weight: 0.9,  cls: 's3', color: '#38BDF8' },
    { code: 4, label: 'Actual (ปิดงานแล้ว)', short: 'Actual', weight: 1,   cls: 's4', color: '#2563EB' },
    { code: 5, label: 'ยกเลิก',          short: 'ยกเลิก',    weight: 0,    cls: 's5', color: '#EF4444' }
  ];
  function st(code) { return STATUS[code] || STATUS[0]; }

  var PRODUCTS = [
    { code: 'P1', name: 'ร้านสะดวกซัก (เครื่องซักผ้า+อบ)', short: 'ร้านสะดวกซัก', color: '#2563EB' },
    { code: 'P2', name: 'ตู้กดน้ำ',                       short: 'ตู้กดน้ำ',      color: '#0EA5E9' },
    { code: 'P3', name: 'ตู้กดน้ำ + เครื่องทำน้ำแข็ง',      short: 'ตู้กดน้ำ+น้ำแข็ง', color: '#8B5CF6' }
  ];
  function product(code) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].code === code) return PRODUCTS[i];
    return { code: code, name: code, short: code, color: '#94A3B8' };
  }

  /* รูปแบบการซื้อ + สัดส่วน Cash In ที่คาดว่าจะเก็บได้ในเดือนที่ปิดงาน */
  var PAYMENTS = [
    { code: 'cash',  name: 'สด/บัตรเครดิต', cashRatio: 1,   color: '#16A34A' },
    { code: 'inst',  name: 'ผ่อนชำระ',      cashRatio: 0.3, color: '#2563EB' },
    { code: 'term',  name: 'Credit Term',   cashRatio: 1,   color: '#F59E0B' }
  ];
  function payment(code) {
    for (var i = 0; i < PAYMENTS.length; i++) if (PAYMENTS[i].code === code) return PAYMENTS[i];
    return { code: code, name: code, cashRatio: 0, color: '#94A3B8' };
  }

  /* ---------- ทีม (BU) ---------- */
  var TEAM_DEFAULT = [
    { code: 'BU-DLAG', name: 'BU-DLAG' },
    { code: 'BU-SML',  name: 'BU-SML' }
  ];
  var TEAMS = loadTeams();
  function loadTeams() {
    try {
      var a = JSON.parse(localStorage.getItem('pi_sr_teams_v1') || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]' && a.length) return a;
    } catch (e) {}
    return JSON.parse(JSON.stringify(TEAM_DEFAULT));
  }
  function saveTeams() {
    try { localStorage.setItem('pi_sr_teams_v1', JSON.stringify(TEAMS)); } catch (e) {}
  }
  function teamByCode(code) {
    for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].code === code) return TEAMS[i];
    if (String(code).toUpperCase() === 'BU-DLAG') return { code: 'BU-DLAG', name: 'BU-DLAG' };
    if (String(code).toUpperCase() === 'BU-SML') return { code: 'BU-SML', name: 'BU-SML' };
    return { code: code, name: code || '-' };
  }
  /* ---------- Head Sale → ทีมที่ดูแล ---------- */
  var TEAM_HEADS = {
    'chanphaphat.k@gmail.com': 'BU-DLAG',
    'sittharphon.1994@gmail.com': 'BU-SML'
  };
  /** ทีมที่ผู้ใช้ปัจจุบันถูกล็อกสิทธิ์ (Head Team) — คืน '' ถ้าเป็น Admin/BU */
  function viewerTeam() {
    var me = global.__ME__ || {};
    var lvl = String(me.level || '').toLowerCase();
    if (lvLvlAdmin(lvl)) return '';
    return TEAM_HEADS[String(me.email || '').toLowerCase()] || '';
  }
  function lvLvlAdmin(l) { return l === 'admin'; }

  var SALES = [
    { id: 'S01', name: 'ณัฐพงษ์ ศรีสุข',      team: 'BU-DLAG' },
    { id: 'S02', name: 'พิมพ์ชนก วัฒนกุล',    team: 'BU-DLAG' },
    { id: 'S03', name: 'ธนกร ใจดี',           team: 'BU-DLAG' },
    { id: 'S04', name: 'อรทัย บุญมาก',        team: 'BU-SML' },
    { id: 'S05', name: 'กิตติพงษ์ แก้วประเสริฐ', team: 'BU-SML' }
  ];
  function sale(id) {
    for (var i = 0; i < SALES.length; i++) if (SALES[i].id === id) return SALES[i];
    return { id: id, name: id, team: '-' };
  }

  /* ---------- เป้าหมายรายทีม รายเดือน ---------- */
  var TARGET_DEFAULT = {
    'BU-DLAG': [1500000, 1600000, 1700000, 1700000, 1800000, 1800000, 1900000, 1900000, 2000000, 2000000, 2000000, 2200000],
    'BU-SML':  [1100000, 1200000, 1200000, 1300000, 1300000, 1400000, 1400000, 1500000, 1500000, 1500000, 1500000, 1600000]
  };
  var TARGETS = loadTargets();
  function loadTargets() {
    try {
      var o = JSON.parse(localStorage.getItem('pi_sr_targets_v2') || 'null');
      if (o && typeof o === 'object') return o;
    } catch (e) {}
    return {};
  }
  function saveTargets() {
    try { localStorage.setItem('pi_sr_targets_v2', JSON.stringify(TARGETS)); } catch (e) {}
  }
  /** อาร์เรย์เป้าหมาย 12 เดือนของทีมในปีที่กำหนด (สร้างค่าเริ่มต้นให้ถ้ายังไม่มี) */
  function targetsOfTeam(code, year) {
    var y = TARGETS[year] || (TARGETS[year] = {});
    if (!y[code]) {
      var def = TARGET_DEFAULT[code];
      y[code] = def ? def.slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    return y[code];
  }
  function setTarget(code, year, monthIdx, value) {
    var arr = targetsOfTeam(code, year);
    arr[monthIdx] = num(value);
    saveTargets();
  }
  /** เป้าหมายของทีม: month = 0 หมายถึงรวมทั้งปี */
  function targetOf(code, year, month) {
    var arr = targetsOfTeam(code, year);
    if (!month) return arr.reduce(function (a, b) { return a + num(b); }, 0);
    return num(arr[month - 1]);
  }

  /* ============================ 2) MOCK DATA ============================ */
  /* prob = โอกาสปิด (%) ใช้เฉพาะสถานะ 1 (Pipeline) ตามที่กำหนด 3 ระดับ 50/40/30 */
  var DEALS = [
    /* --- 4) Actual ปิดงานแล้ว --- */
    { no: 'SO-2026-0412', customer: 'บริษัท สยามคลีน เซอร์วิส จำกัด', job: 'ร้านสะดวกซัก 8 เครื่อง (เซ็นทรัลพระราม 9)',
      so: 'INV-2026-0412', quoteDate: '2026-09-12', year: 2026, month: 11, saleId: 'S01', product: 'P1',
      amount: 620000, payment: 'inst', status: 4, prob: 100,
      note: 'ปิดงานแล้ว มัดจำ 30% รับชำระแล้วเมื่อ 05/11/2569 ส่วนที่เหลือแบ่ง 24 งวด เริ่ม ธ.ค. 2569 ลูกค้าแจ้งว่าจะขยายสาขาที่ 2 ภายใน Q2/2570' },
    { no: 'SO-2026-0427', customer: 'หจก. บ้านสะอาด นครปฐม', job: 'ร้านสะดวกซัก 5 เครื่อง',
      so: 'INV-2026-0427', quoteDate: '2026-09-20', year: 2026, month: 11, saleId: 'S02', product: 'P1',
      amount: 385000, payment: 'term', status: 4, prob: 100,
      note: 'เซ็นสัญญา 45 วัน เครดิตเทอม วางบิล 10/11/2569 ครบกำหนด 25/12/2569 ผู้ติดต่อคุณสมหมาย โทร. 081-xxx-xxxx' },
    { no: 'SO-2026-0433', customer: 'โรงงานไทยฟู้ดส์', job: 'ตู้กดน้ำ 12 จุด (โรงงาน 3 อาคาร)',
      so: 'INV-2026-0433', quoteDate: '2026-10-01', year: 2026, month: 11, saleId: 'S03', product: 'P2',
      amount: 210000, payment: 'cash', status: 4, prob: 100,
      note: 'ชำระสดเต็มจำนวน รับเงิน 08/11/2569 ต้องเข้าติดตั้งช่วงเสาร์-อาทิตย์เท่านั้น เพราะเป็นไลน์ผลิต 24 ชม.' },
    { no: 'SO-2026-0441', customer: 'บริษัท ทรีสตาร์ พร็อพเพอร์ตี้', job: 'ตู้กดน้ำ + น้ำแข็ง 6 จุด (คอนโด 3 โครงการ)',
      so: 'INV-2026-0441', quoteDate: '2026-10-06', year: 2026, month: 11, saleId: 'S01', product: 'P3',
      amount: 295000, payment: 'inst', status: 4, prob: 100,
      note: 'ปิดงาน 12/11/2569 ผ่อน 12 งวด ดอกเบี้ย 0% ผ่านบัตรเครดิตองค์กร รอทีมติดตั้งประสานงานนิติบุคคลแต่ละโครงการ' },

    /* --- 3) รอส่งของ --- */
    { no: 'SO-2026-0448', customer: 'ดีดี คอนโดมิเนียม', job: 'ร้านสะดวกซัก 4 เครื่อง',
      so: 'QT-2026-0448', quoteDate: '2026-10-10', year: 2026, month: 11, saleId: 'S02', product: 'P1',
      amount: 340000, payment: 'inst', status: 3, prob: 90,
      note: 'เซ็นสัญญาแล้ว รอส่งของจากคลัง เหลือเครื่องอบ 2 เครื่อง คาดว่าถึงไทย 22/11/2569 นัดติดตั้ง 25–27/11/2569' },
    { no: 'SO-2026-0451', customer: 'บริษัท กรีนมาร์ท จำกัด', job: 'ตู้กดน้ำ 20 จุด (สาขาทั่วกรุงเทพฯ)',
      so: 'QT-2026-0451', quoteDate: '2026-10-14', year: 2026, month: 11, saleId: 'S03', product: 'P2',
      amount: 410000, payment: 'term', status: 3, prob: 90,
      note: 'PO เรียบร้อย ส่งของรอบ 2/2569 ลูกค้าขอเครดิต 45 วัน ต้องแจ้งฝ่ายบัญชีล่วงหน้า 3 วันก่อนวางบิล' },
    { no: 'SO-2026-0455', customer: 'เอสพีเอส โฮเทล', job: 'ตู้กดน้ำ + น้ำแข็ง 4 จุด',
      so: 'QT-2026-0455', quoteDate: '2026-10-18', year: 2026, month: 11, saleId: 'S04', product: 'P3',
      amount: 168000, payment: 'cash', status: 3, prob: 90,
      note: 'ลูกค้าชำระสด รอส่งของเข้าที่พักรีสอร์ทหัวหิน ต้องรอปิดปรับปรุงล็อบบี้ให้เสร็จก่อน 30/11/2569' },

    /* --- 2) รอยืนยัน PO --- */
    { no: 'SO-2026-0462', customer: 'เมกะซัก ซิตี้', job: 'ร้านสะดวกซัก 10 เครื่อง (สาขารังสิต)',
      so: 'QT-2026-0462', quoteDate: '2026-10-20', year: 2026, month: 11, saleId: 'S01', product: 'P1',
      amount: 720000, payment: 'inst', status: 2, prob: 80,
      note: 'ผู้บริหารอนุมัติราคาแล้ว รอฝ่ายจัดซื้อออก PO ภายใน 24/11/2569 ติดเงื่อนไขขอของแถมชุดทำความสะอาด 12 ชุด' },
    { no: 'SO-2026-0466', customer: 'ไทยวัฒนา ฟู้ดส์', job: 'ตู้กดน้ำ 15 จุด',
      so: 'QT-2026-0466', quoteDate: '2026-10-22', year: 2026, month: 11, saleId: 'S05', product: 'P2',
      amount: 265000, payment: 'term', status: 2, prob: 80,
      note: 'รอ PO จากส่วนกลาง เอกสารผ่านฝ่ายกฎหมายแล้ว คาดออก PO ต้นสัปดาห์หน้า ขอให้ติดตามทุก 2 วัน' },

    /* --- 1) Pipeline (ถ่วงน้ำหนัก 50/40/30) --- */
    { no: 'SO-2026-0471', customer: 'แฟมิลี่มาร์ท สุขุมวิท', job: 'ตู้กดน้ำ + น้ำแข็ง 8 จุด',
      so: 'QT-2026-0471', quoteDate: '2026-10-24', year: 2026, month: 11, saleId: 'S02', product: 'P3',
      amount: 320000, payment: 'inst', status: 1, prob: 50,
      note: 'เสนอราคาแล้ว ผู้ตัดสินใจคือเจ้าของร้าน ติดเรื่องพื้นที่ติดตั้งชั้น 1 ไม่พอ ต้องรอปรับผังใหม่' },
    { no: 'SO-2026-0474', customer: 'บริษัท อีสเทิร์น แลนด์', job: 'ร้านสะดวกซัก 6 เครื่อง',
      so: 'QT-2026-0474', quoteDate: '2026-10-26', year: 2026, month: 11, saleId: 'S04', product: 'P1',
      amount: 455000, payment: 'term', status: 1, prob: 40,
      note: 'อยู่ระหว่างเปรียบเทียบผู้ขาย 2 ราย จุดแข็งของเราคือบริการหลังการขาย 24 ชม. ต้องส่งแผน PM ให้ลูกค้าดู' },
    { no: 'SO-2026-0478', customer: 'ซิตี้ คลีน ลอนดรี้', job: 'ร้านสะดวกซัก 3 เครื่อง',
      so: 'QT-2026-0478', quoteDate: '2026-10-28', year: 2026, month: 11, saleId: 'S05', product: 'P1',
      amount: 210000, payment: 'cash', status: 1, prob: 30,
      note: 'เพิ่งเข้ามาครั้งแรกจากงานแสดงสินค้า ยังไม่ยืนยันงบประมาณ ต้องนัดสำรวจหน้างานก่อน' },
    { no: 'SO-2026-0481', customer: 'โรงแรม บลูเวฟ', job: 'ตู้กดน้ำ 10 จุด',
      so: 'QT-2026-0481', quoteDate: '2026-10-30', year: 2026, month: 11, saleId: 'S03', product: 'P2',
      amount: 180000, payment: 'inst', status: 1, prob: 40,
      note: 'ผู้จัดการโรงแรมสนใจ แต่รออนุมัติจากส่วนกลางที่เชียงใหม่ คาดรู้ผลกลางเดือน ธ.ค. 2569' },

    /* --- 0) กำลังคุย Detail --- */
    { no: 'SO-2026-0486', customer: 'อาคารสำนักงาน อาร์เอสทาวเวอร์', job: 'ตู้กดน้ำ + น้ำแข็ง 5 จุด',
      so: '—', quoteDate: '2026-11-03', year: 2026, month: 11, saleId: 'S02', product: 'P3',
      amount: 240000, payment: 'inst', status: 0, prob: 0,
      note: 'อยู่ระหว่างเก็บ Requirement จำนวนผู้ใช้อาคาร ~1,200 คน ต้องประเมินปริมาณน้ำต่อวันก่อนเสนอราคาอีกครั้ง' },
    { no: 'SO-2026-0490', customer: 'มหาวิทยาลัยนวัตกรรม', job: 'ตู้กดน้ำ 25 จุด',
      so: '—', quoteDate: '2026-11-05', year: 2026, month: 11, saleId: 'S05', product: 'P2',
      amount: 380000, payment: 'term', status: 0, prob: 0,
      note: 'ต้องเข้าผ่านระบบจัดซื้อจัดจ้างของมหาวิทยาลัย ใช้เวลาอย่างน้อย 2 เดือน เตรียมเอกสาร TOR ภายในเดือนนี้' },

    /* --- 5) ยกเลิก --- */
    { no: 'SO-2026-0438', customer: 'บริษัท เดลต้า เทรดดิ้ง', job: 'ร้านสะดวกซัก 6 เครื่อง',
      so: 'QT-2026-0438', quoteDate: '2026-09-28', year: 2026, month: 11, saleId: 'S04', product: 'P1',
      amount: 410000, payment: 'inst', status: 5, prob: 0,
      note: 'ยกเลิกเมื่อ 20/10/2569 — ลูกค้าเปลี่ยนไปใช้เครื่องของคู่แข่งที่ให้ราคาต่ำกว่า 8% เหตุผลหลักคือเงื่อนไขการรับประกัน 1 ปี (คู่แข่งให้ 3 ปี)' },

    /* --- Pipeline เดือนอื่น (ใช้นับคอลัมน์ "งานอื่นๆ ทั้งปี") --- */
    { no: 'SO-2026-0495', customer: 'ลานซัก ผ่อนคลาย', job: 'ร้านสะดวกซัก 4 เครื่อง',
      so: 'QT-2026-0495', quoteDate: '2026-11-02', year: 2026, month: 12, saleId: 'S01', product: 'P1',
      amount: 290000, payment: 'inst', status: 1, prob: 40,
      note: 'คาดปิดภายใน ธ.ค. 2569 ลูกค้ารอเปิดสาขาใหม่ช่วงปีใหม่' },
    { no: 'SO-2026-0498', customer: 'เมืองทอง ฟู้ดคอร์ท', job: 'ตู้กดน้ำ 12 จุด',
      so: 'QT-2026-0498', quoteDate: '2026-11-04', year: 2026, month: 12, saleId: 'S03', product: 'P2',
      amount: 195000, payment: 'cash', status: 1, prob: 30,
      note: 'รอฤดูกาลเปิดศูนย์อาหารใหม่ เดือน ธ.ค. 2569' },
    { no: 'SO-2027-0007', customer: 'บริษัท นอร์ธเทิร์น รีเทล', job: 'ตู้กดน้ำ + น้ำแข็ง 9 จุด',
      so: 'QT-2027-0007', quoteDate: '2026-11-08', year: 2027, month: 1, saleId: 'S02', product: 'P3',
      amount: 320000, payment: 'term', status: 1, prob: 50,
      note: 'โครงการขยายสาขาภาคเหนือ เริ่มก่อสร้าง ม.ค. 2570 คาดเซ็นสัญญา ก.พ. 2570' }
  ];

  /* ============================ 3) CALC ============================ */
  function num(n) { return Number(n || 0); }
  function money(n) {
    var v = Math.round(num(n));
    return '฿' + v.toLocaleString('th-TH');
  }
  function pct(n) {
    return (Math.round(num(n) * 10) / 10).toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function monthLabel(y, m) { return String(m).padStart(2, '0') + '.' + TH_MONTHS[m - 1] + ' ' + (y + 543); }
  function shortDate(d) {
    if (!d) return '—';
    var p = String(d).split('-');
    if (p.length < 3) return d;
    return p[2] + '/' + p[1] + '/' + String(Number(p[0]) + 543).slice(-2);
  }

  /* Cash In ที่คาดว่าจะได้รับ (เฉพาะงานที่ปิด/รอส่ง/รอ PO) */
  function cashInOf(d) {
    if (d.status === 5 || d.status === 0 || d.status === 1) return 0;
    return num(d.amount) * payment(d.payment).cashRatio;
  }

  /* กรองเฉพาะเงื่อนไขปี + เดือน (ไม่รวม filter อื่น) — ใช้ในตารางสรุปรายคน */
  function inMonth(d, y, m) { return d.year === y && (!m || d.month === m); }
  function matchFilters(d, f) {
    if (d.year !== f.year) return false;
    if (f.month && d.month !== f.month) return false;
    if (f.team && sale(d.saleId).team !== f.team) return false;
    if (f.sale && d.saleId !== f.sale) return false;
    if (f.product && d.product !== f.product) return false;
    if (f.payment && d.payment !== f.payment) return false;
    return true;
  }

  function filteredDeals() {
    return DEALS.filter(function (d) { return matchFilters(d, state); });
  }

  /**
   * สรุปตัวเลขของชุดดีล (ใช้ทั้ง KPI และแถวรายคน)
   * weightedPipeline = Pipeline × prob รายดีล (50/40/30)
   */
  function summarize(list) {
    var s = { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, weighted1: 0, cashIn: 0, count: 0 };
    list.forEach(function (d) {
      var a = num(d.amount);
      if (d.status === 5) { s.s5 += a; return; }
      if (d.status === 4) s.s4 += a;
      else if (d.status === 3) s.s3 += a;
      else if (d.status === 2) s.s2 += a;
      else if (d.status === 1) { s.s1 += a; s.weighted1 += a * num(d.prob) / 100; }
      else s.s0 += a;
      s.count++;
      s.cashIn += cashInOf(d);
    });
    /* ยอดการันตี = 4 (100%) + 3 (90%) + 2 (80%) */
    s.secured = s.s4 + s.s3 * 0.9 + s.s2 * 0.8;
    s.forecast = s.secured + s.weighted1;
    s.totalSale = s.s4 + s.s3 + s.s2 + s.s1;
    return s;
  }

  function kpis() {
    var list = filteredDeals();
    var sum = summarize(list);
    var scopeTeams = state.team ? TEAMS.filter(function (t) { return t.code === state.team; }) : TEAMS;
    var monthTargets = scopeTeams.map(function (t) {
      return { code: t.code, name: t.name, amount: targetOf(t.code, state.year, state.month) };
    });
    var target = monthTargets.reduce(function (a, x) { return a + x.amount; }, 0);
    var headCount = SALES.filter(function (r) {
      if (state.sale) return r.id === state.sale;
      return scopeTeams.some(function (t) { return t.code === r.team; });
    }).length || 1;
    var perHead = target / headCount;
    if (state.sale) { target = perHead; }   // เลือกคนเดียว → เทียบกับเป้าหมายต่อคน
    return {
      sum: sum, list: list, target: target, headCount: headCount, perHead: perHead,
      teams: scopeTeams, monthTargets: monthTargets,
      ach4: target ? sum.s4 / target * 100 : 0,
      ach43: target ? (sum.s4 + sum.s3 * 0.9) / target * 100 : 0,
      ach432: target ? sum.secured / target * 100 : 0,
      forecastPct: target ? sum.forecast / target * 100 : 0
    };
  }

  /* ============================ 4) VIEW ============================ */
  var state = { year: 2026, month: 11, team: '', sale: '', product: '', payment: '', q: '', sortKey: 'no', sortDir: 1 };
  var ui = { targets: false };
  var charts = [];

  function cardKpi(label, value, sub, barPct, color, icon) {
    var w = Math.max(0, Math.min(100, num(barPct)));
    return ''
      + '<article class="sr-card">'
      + '  <div class="sr-card-top"><span>' + esc(label) + '</span>'
      + '    <span class="sr-ico" style="background:' + color + '18;color:' + color + '"><i class="' + icon + '"></i></span></div>'
      + '  <div class="sr-card-val" style="color:' + color + '">' + value + '</div>'
      + '  <div class="sr-bar"><span style="width:' + w + '%;background:' + color + '"></span></div>'
      + '  <div class="sr-card-sub">' + sub + '</div>'
      + '</article>';
  }

  function renderFilters(k) {
    function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }
    var yearOpts = YEARS.map(function (y) { return opt(y, 'ปี ' + (y + 543) + ' (' + y + ')', state.year); }).join('');
    var monthOpts = '<option value=""' + (state.month ? '' : ' selected') + '>ทุกเดือน</option>' +
      TH_MONTHS.map(function (m, i) { return opt(i + 1, String(i + 1).padStart(2, '0') + '.' + m, state.month); }).join('');
    var saleOpts = '<option value="">ทุกคน</option>' + SALES.map(function (s) {
      return opt(s.id, teamByCode(s.team).name + ' · ' + s.name, state.sale);
    }).join('');
    var teamOpts = '<option value="">ทุกทีม</option>' + TEAMS.map(function (t) { return opt(t.code, t.name, state.team); }).join('');
    var lockedTeam = viewerTeam();
    var teamField = lockedTeam
      ? '<div class="sr-fl"><label>ทีม (BU)</label><div class="sr-locked"><i class="fa-solid fa-lock"></i> '
        + esc(teamByCode(lockedTeam).name) + ' <span class="sr-s2">ทีมที่คุณดูแล</span></div></div>'
      : '<div class="sr-fl"><label>ทีม (BU)</label><select data-sr-filter="team">' + teamOpts + '</select></div>';
    var prodOpts = '<option value="">ทุกสินค้า</option>' + PRODUCTS.map(function (p) { return opt(p.code, p.name, state.product); }).join('');
    var payOpts = '<option value="">ทุกรูปแบบ</option>' + PAYMENTS.map(function (p) { return opt(p.code, p.name, state.payment); }).join('');

    return ''
      + '<div class="sr-filters" id="srFilters">'
      + '  <div class="sr-fl"><label>ปี</label><select data-sr-filter="year">' + yearOpts + '</select></div>'
      + '  <div class="sr-fl"><label>เดือนที่คาดว่าจะปิด</label><select data-sr-filter="month">' + monthOpts + '</select></div>'
      + teamField
      + '  <div class="sr-fl"><label>พนักงานขาย</label><select data-sr-filter="sale">' + saleOpts + '</select></div>'
      + '  <div class="sr-fl"><label>สินค้า</label><select data-sr-filter="product">' + prodOpts + '</select></div>'
      + '  <div class="sr-fl"><label>รูปแบบการซื้อ</label><select data-sr-filter="payment">' + payOpts + '</select></div>'
      + '  <div class="sr-fbtn">'
      + '    <button class="sr-btn" data-sr-reset title="ล้างตัวกรอง"><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button>'
      + '    <button class="sr-btn dark" data-sr-export title="ส่งออก CSV"><i class="fa-solid fa-download"></i> Export CSV</button>'
      + '  </div>'
      + '</div>';
  }

  function renderKpis(k) {
    var s = k.sum;
    var scope = state.month ? monthLabel(state.year, state.month) : ('ปี ' + (state.year + 543));
    var teamLine = k.monthTargets.map(function (x) { return esc(x.name) + ' ' + money(x.amount); }).join(' · ');
    var cards = [
      cardKpi('เป้าหมายทีม',
        money(k.target),
        'Head Count <b>' + k.headCount + '</b> คน · Prod./Head <b>' + money(k.perHead) + '</b>'
          + (teamLine ? '<br>' + teamLine : ''),
        undefined, '#0F2B46', 'fa-solid fa-bullseye'),
      cardKpi('Actual ปิดงานแล้ว',
        pct(k.ach4),
        money(s.s4) + ' จากเป้า ' + money(k.target),
        k.ach4, '#2563EB', 'fa-solid fa-circle-check'),
      cardKpi('Actual + รอส่งของ',
        pct(k.ach43),
        money(s.s4 + s.s3 * 0.9) + ' (รอส่งของถ่วง 90%)',
        k.ach43, '#0EA5E9', 'fa-solid fa-truck-fast'),
      cardKpi('Forecast ปิดเดือน',
        money(s.forecast),
        'การันตี <b>' + money(s.secured) + '</b> + Pipeline <b>' + money(s.weighted1) + '</b>',
        k.forecastPct, '#16A34A', 'fa-solid fa-chart-line')
    ];
    return '<div class="sr-scope"><i class="fa-regular fa-calendar"></i> ขอบเขตข้อมูล: <b>' + esc(scope) + '</b>' +
      ' · ' + k.list.length + ' ดีล · Cash In คาดรับ <b>' + money(s.cashIn) + '</b></div>'
      + '<div class="sr-kpis">' + cards.join('') + '</div>';
  }

  function renderSummaryTable() {
    var y = state.year, m = state.month;
    var monF = function (d) { return (!state.product || d.product === state.product) && (!state.payment || d.payment === state.payment); };

    /* จัดกลุ่มตามทีม (BU) */
    var blocks = [];
    TEAMS.forEach(function (t) {
      if (state.team && state.team !== t.code) return;
      var members = SALES.filter(function (r) { return r.team === t.code && (!state.sale || r.id === state.sale); });
      if (!members.length) return;
      var rows = [];
      members.forEach(function (r) {
        var monthDeals = DEALS.filter(function (d) { return d.saleId === r.id && inMonth(d, y, m) && monF(d); });
        var otherDeals = DEALS.filter(function (d) { return d.saleId === r.id && d.year === y && !inMonth(d, y, m) && monF(d); });
        /* 0.กำลังคุย และ 5.ยกเลิก นับทั้งปี (รวมเดือนที่เลือก) */
        var restDeals = DEALS.filter(function (d) { return d.saleId === r.id && d.year === y && monF(d); });
        if (!monthDeals.length && !restDeals.length) return;
        var o = summarize(otherDeals), rest = summarize(restDeals);
        o.s0 = rest.s0; o.s5 = rest.s5;
        rows.push({ sale: r, s: summarize(monthDeals), other: o });
      });
      if (!rows.length) return;
      var teamSum = summarize(DEALS.filter(function (d) {
        return d.year === y && inMonth(d, y, m) && monF(d) &&
          members.some(function (r) { return r.id === d.saleId; });
      }));
      blocks.push({ team: t, rows: rows, sum: teamSum, target: targetOf(t.code, y, m) });
    });

    var tot = { m: { s4: 0, s3: 0, s2: 0, s1: 0, totalSale: 0 }, o: { s1: 0, s0: 0, s5: 0 }, target: 0 };
    blocks.forEach(function (b) {
      b.rows.forEach(function (x) {
        tot.m.s4 += x.s.s4; tot.m.s3 += x.s.s3; tot.m.s2 += x.s.s2; tot.m.s1 += x.s.s1; tot.m.totalSale += x.s.totalSale;
        tot.o.s1 += x.other.s1; tot.o.s0 += x.other.s0; tot.o.s5 += x.other.s5;
      });
      tot.target += b.target;
    });

    var head = m ? ('01.' + TH_MONTHS[m - 1] + ' ' + (y + 543)) : ('ทั้งปี ' + (y + 543));

    var body = blocks.map(function (b) {
      var ach4 = b.target ? (b.sum.s4 / b.target * 100) : 0;
      var achFc = b.target ? (b.sum.forecast / b.target * 100) : 0;
      var headRow = '<tr class="sr-teamhead"><td colspan="9">'
        + '<i class="fa-solid fa-users"></i> <b>' + esc(b.team.name) + '</b>'
        + '<span class="sr-s2" style="display:inline;margin-left:8px">' + b.rows.length + ' คน</span>'
        + '<span class="sr-th-meta">เป้าหมาย ' + (m ? 'เดือนนี้ ' : 'ทั้งปี ') + '<b>' + money(b.target) + '</b>'
        + ' · Ach 4. <b>' + pct(ach4) + '</b>'
        + ' · Forecast (การันตี + Pipeline) <b>' + pct(achFc) + '</b></span>'
        + '</td></tr>';
      var saleRows = b.rows.map(function (x) {
        return '<tr>'
          + '<td class="sr-td-sale"><div class="sr-nm">' + esc(x.sale.name) + '</div><div class="sr-s2">' + x.sale.id + '</div></td>'
          + '<td class="sr-num">' + (x.s.s4 ? money(x.s.s4) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num" title="ถ่วงน้ำหนัก 90% = ' + money(x.s.s3 * 0.9) + '">' + (x.s.s3 ? money(x.s.s3) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num" title="ถ่วงน้ำหนัก 80% = ' + money(x.s.s2 * 0.8) + '">' + (x.s.s2 ? money(x.s.s2) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num" title="ถ่วงตามโอกาสปิด = ' + money(x.s.weighted1) + '">' + (x.s.s1 ? money(x.s.s1) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num sr-strong">' + money(x.s.totalSale) + '</td>'
          + '<td class="sr-num sr-sep">' + (x.other.s1 ? money(x.other.s1) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num">' + (x.other.s0 ? money(x.other.s0) : '<span class="sr-dim">—</span>') + '</td>'
          + '<td class="sr-num ' + (x.other.s5 ? 'sr-neg' : '') + '">' + (x.other.s5 ? ('-' + money(x.other.s5)) : '<span class="sr-dim">—</span>') + '</td>'
          + '</tr>';
      }).join('');
      return headRow + saleRows;
    }).join('');

    return ''
      + '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>สรุป Forecast แยกตามเซลส์ (Summary)</h3>'
      + '    <div class="sr-s2">น้ำหนัก: 4 = 100% · 3 = 90% · 2 = 80% · 1 = ตามโอกาสปิดรายดีล · คอลัมน์ขวาคือปี ' + (y + 543) + ' เดือนอื่น</div></div>'
      + '    <span class="sr-tag">' + esc(head) + '</span></div>'
      + '  <div class="sr-tablewrap"><table class="sr-table sr-summary"><thead><tr>'
      + '    <th rowspan="2" class="sr-td-sale">Sale</th>'
      + '    <th colspan="5" class="sr-grp">เดือนที่เลือก — ' + esc(head) + '</th>'
      + '    <th colspan="3" class="sr-grp sr-grp-alt">งานอื่นๆ ทั้งปี ' + (y + 543) + '</th>'
      + '  </tr><tr>'
      + '    <th class="sr-num">4. Actual</th><th class="sr-num">3. รอส่งของ</th>'
      + '    <th class="sr-num">2. รอ PO</th><th class="sr-num">1. Pipeline</th>'
      + '    <th class="sr-num">รวมเดือนนี้</th>'
      + '    <th class="sr-num sr-grp-alt">Pipeline เดือนอื่น</th><th class="sr-num">0.กำลังคุย Detail</th><th class="sr-num">5.ยกเลิก</th>'
      + '  </tr></thead><tbody>'
      + (body || '<tr><td colspan="9" class="sr-empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>')
      + '</tbody><tfoot><tr>'
      + '  <td class="sr-td-sale"><b>Total</b></td>'
      + '  <td class="sr-num"><b>' + money(tot.m.s4) + '</b></td>'
      + '  <td class="sr-num"><b>' + money(tot.m.s3) + '</b></td>'
      + '  <td class="sr-num"><b>' + money(tot.m.s2) + '</b></td>'
      + '  <td class="sr-num"><b>' + money(tot.m.s1) + '</b></td>'
      + '  <td class="sr-num sr-strong"><b>' + money(tot.m.totalSale) + '</b></td>'
      + '  <td class="sr-num sr-sep"><b>' + money(tot.o.s1) + '</b></td>'
      + '  <td class="sr-num"><b>' + money(tot.o.s0) + '</b></td>'
      + '  <td class="sr-num sr-neg"><b>' + (tot.o.s5 ? '-' + money(tot.o.s5) : money(0)) + '</b></td>'
      + '</tr></tfoot></table></div>'
      + '</section>';
  }

  var SORTABLE = {
    no: 'เลขที่', status: 'สถานะ', customer: 'ชื่อลูกค้า', quoteDate: 'วันที่เสนอราคา',
    month: 'เดือนที่คาดว่าจะปิด', saleId: 'Sale', product: 'สินค้า', amount: 'มูลค่า', payment: 'รูปแบบ', cashIn: 'Cash In'
  };  function sortValue(d, key) {
    if (key === 'saleId') return sale(d.saleId).name;
    if (key === 'product') return product(d.product).name;
    if (key === 'payment') return payment(d.payment).name;
    if (key === 'cashIn') return cashInOf(d);
    if (key === 'month') return d.year * 100 + d.month;
    return d[key];
  }
  function sortRows(list) {
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, state.sortKey), vb = sortValue(b, state.sortKey);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.sortDir;
      return String(va).localeCompare(String(vb), 'th') * state.sortDir;
    });
  }

  function dealRowsHtml(list) {
    var q = String(state.q || '').trim().toLowerCase();
    var rows = sortRows(list).filter(function (d) {
      if (!q) return true;
      return (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) return '<tr><td colspan="12" class="sr-empty">ไม่พบดีลที่ตรงกับเงื่อนไข</td></tr>';
    return rows.map(function (d, i) {
      var s = st(d.status), p = product(d.product), pay = payment(d.payment), ci = cashInOf(d);
      return '<tr class="sr-row" data-sr-deal="' + esc(d.no) + '">'
        + '<td class="sr-num sr-dim">' + (i + 1) + '</td>'
        + '<td><span class="sr-badge ' + s.cls + '">' + d.status + ' · ' + esc(s.label) + '</span></td>'
        + '<td><div class="sr-nm">' + esc(d.customer) + '</div><div class="sr-s2">' + esc(d.job) + '</div></td>'
        + '<td><div>' + esc(d.so) + '</div><div class="sr-s2">' + esc(d.no) + '</div></td>'
        + '<td class="sr-num">' + shortDate(d.quoteDate) + '</td>'
        + '<td class="sr-num">' + String(d.month).padStart(2, '0') + '.' + TH_MONTHS[d.month - 1] + ' ' + String(d.year + 543).slice(-2) + '</td>'
        + '<td><div class="sr-nm">' + esc(sale(d.saleId).name) + '</div><div class="sr-s2">' + esc(teamByCode(sale(d.saleId).team).name) + '</div></td>'
        + '<td><span class="sr-dot" style="background:' + p.color + '"></span>' + esc(p.short) + '</td>'
        + '<td class="sr-num sr-strong">' + money(d.amount) + '</td>'
        + '<td>' + esc(pay.name) + '</td>'
        + '<td class="sr-num">' + (ci ? money(ci) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-note-cell">' + esc(String(d.note).slice(0, 46)) + (String(d.note).length > 46 ? '…' : '') + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderDealsTable(list) {
    function th(key, label, extraCls) {
      var active = state.sortKey === key;
      var arrow = active ? (state.sortDir > 0 ? '▲' : '▼') : '';
      return '<th class="sr-sortable ' + (extraCls || '') + '" data-sr-sort="' + key + '">' + esc(label) +
        ' <span class="sr-arrow">' + arrow + '</span></th>';
    }
    return ''
      + '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>รายการดีลลูกค้า (Deal Details)</h3>'
      + '    <div class="sr-s2">คลิกที่แถวเพื่อดูหมายเหตุแบบเต็ม · คลิกหัวคอลัมน์เพื่อเรียงลำดับ</div></div>'
      + '    <div class="sr-search"><i class="fa-solid fa-magnifying-glass"></i>'
      + '      <input id="srSearch" placeholder="ค้นหาชื่อลูกค้า / เลขที่ SO" value="' + esc(state.q) + '"></div></div>'
      + '  <div class="sr-tablewrap"><table class="sr-table sr-deals"><thead><tr>'
      + th('no', 'No.', 'sr-num') + th('status', 'สถานะงาน') + th('customer', 'ชื่องาน / ลูกค้า') + th('so', 'เลขที่ SO / Inv.')
      + th('quoteDate', 'วันที่สร้างใบเสนอราคา', 'sr-num') + th('month', 'เดือนที่คาดว่าจะปิด', 'sr-num')
      + th('saleId', 'Sale ผู้รับผิดชอบ') + th('product', 'สินค้า') + th('amount', 'มูลค่างานประมาณ', 'sr-num')
      + th('payment', 'รูปแบบการซื้อ') + th('cashIn', 'Cash In', 'sr-num') + '<th>หมายเหตุ</th>'
      + '  </tr></thead><tbody id="srDealBody">' + dealRowsHtml(list) + '</tbody></table></div>'
      + '  <div class="sr-foot" id="srDealCount">แสดง ' + sortRows(list).filter(function (d) {
            var q = String(state.q || '').trim().toLowerCase();
            return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so).toLowerCase().indexOf(q) >= 0;
          }).length + ' จาก ' + list.length + ' ดีล</div>'
      + '</section>';
  }

  /* ---------- เป้าหมายรายทีม × รายเดือน (แก้ไขได้) ---------- */
  function renderTargets() {
    var y = state.year;
    var lockedTeam = viewerTeam();
    var listTeams = lockedTeam ? TEAMS.filter(function (t) { return t.code === lockedTeam; }) : TEAMS;
    var monthTh = TH_MONTHS.map(function (mth, i) {
      return '<th class="sr-num' + (state.month === i + 1 ? ' sr-hl' : '') + '">' + String(i + 1).padStart(2, '0') + '.' + mth.slice(0, 3) + '.</th>';
    }).join('');

    var rows = listTeams.map(function (t) {
      var arr = targetsOfTeam(t.code, y);
      var total = arr.reduce(function (a, b) { return a + num(b); }, 0);
      var cnt = SALES.filter(function (r) { return r.team === t.code; }).length;
      var cells = arr.map(function (v, i) {
        return '<td class="sr-num' + (state.month === i + 1 ? ' sr-hl' : '') + '">'
          + '<input class="sr-tinp" type="number" min="0" step="50000" inputmode="numeric"'
          + ' data-sr-target="' + esc(t.code) + '|' + i + '" value="' + num(v) + '"></td>';
      }).join('');
      return '<tr>'
        + '<td class="sr-td-team"><div class="sr-nm">' + esc(t.name) + '</div><div class="sr-s2">' + cnt + ' คน</div></td>'
        + cells
        + '<td class="sr-num sr-strong">' + money(total) + '</td>'
        + '<td class="sr-num"><button class="sr-xbtn" data-sr-delteam="' + esc(t.code) + '" title="ลบทีมนี้"' + (lockedTeam ? ' style="display:none"' : '') + '><i class="fa-solid fa-trash"></i></button></td>'
        + '</tr>';
    }).join('');

    /* แถวรวมรายเดือน */
    var monthTot = TH_MONTHS.map(function (mth, i) {
      var s = listTeams.reduce(function (a, t) { return a + num(targetsOfTeam(t.code, y)[i]); }, 0);
      return '<td class="sr-num' + (state.month === i + 1 ? ' sr-hl' : '') + '">' + (s ? money(s) : '<span class="sr-dim">—</span>') + '</td>';
    }).join('');
    var grand = listTeams.reduce(function (a, t) {
      return a + targetsOfTeam(t.code, y).reduce(function (x, v) { return x + num(v); }, 0);
    }, 0);

    var sumLine = listTeams.map(function (t) {
      return '<span class="sr-sum-item"><b>' + esc(t.name) + '</b> ' + money(targetOf(t.code, y, state.month)) + '</span>';
    }).join('<span class="sr-sum-sep">·</span>');

    return ''
      + '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>เป้าหมายการขายรายทีม — ปี ' + (y + 543) + '</h3>'
      + '    <div class="sr-s2">' + (state.month ? 'เป้าหมายของเดือนที่เลือก' : 'รวมทั้งปี') + '</div></div>'
      + '    <div class="sr-tools">'
      + '      <button class="sr-btn" data-sr-toggletargets>' + (ui.targets ? '<i class="fa-solid fa-chevron-up"></i> ซ่อนตารางเป้าหมาย' : '<i class="fa-solid fa-sliders"></i> แก้ไขเป้าหมาย') + '</button>'
      + '    </div></div>'
      + '<div class="sr-targets-sum">' + sumLine + '</div>'
      + (ui.targets
        ? '<div class="sr-tools" style="margin:10px 0 8px">' + (lockedTeam ? '' : '<button class="sr-btn" data-sr-addteam><i class="fa-solid fa-plus"></i> เพิ่มทีม</button>')
          + '  <button class="sr-btn" data-sr-resettargets title="คืนค่าเป้าหมายเริ่มต้น"><i class="fa-solid fa-rotate-left"></i> ค่าเริ่มต้น</button></div>'
          + '<div class="sr-tablewrap"><table class="sr-table sr-targets"><thead><tr>'
          + '    <th class="sr-td-team">ทีม (BU)</th>' + monthTh + '<th class="sr-num">รวมทั้งปี</th><th></th>'
          + '  </tr></thead><tbody>' + (rows || '<tr><td colspan="15" class="sr-empty">ยังไม่มีทีม — กด “เพิ่มทีม”</td></tr>') + '</tbody>'
          + '  <tfoot><tr><td class="sr-td-team"><b>รวมทุกทีม</b></td>' + monthTot + '<td class="sr-num sr-strong">' + money(grand) + '</td><td></td></tr></tfoot>'
          + '  </table></div>'
        : '')
      + '</section>';
  }

  /* ---------- Dashboard (เวอร์ชันย่อของ Reports — ใช้สูตร/ข้อมูลชุดเดียวกัน) ---------- */
  function renderDashboard() {
    injectCss();
    var k = kpis();
    var s = k.sum;
    var today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var teamRows = TEAMS.filter(function (t) { return !state.team || t.code === state.team; }).map(function (t) {
      var list = k.list.filter(function (d) { return sale(d.saleId).team === t.code; });
      var ts = summarize(list);
      var tg = targetOf(t.code, state.year, state.month);
      var pAch = tg ? ts.s4 / tg * 100 : 0;
      var pFc = tg ? ts.forecast / tg * 100 : 0;
      var cnt = SALES.filter(function (r) { return r.team === t.code; }).length;
      return '<div class="sr-trow">'
        + '<div class="sr-trow-h"><b>' + esc(t.name) + '</b><span>' + cnt + ' คน</span></div>'
        + '<div class="sr-trow-n">' + money(ts.s4) + ' <span>/ ' + money(tg) + '</span><em>' + pct(pAch) + '</em></div>'
        + '<div class="sr-bar"><span style="width:' + Math.max(0, Math.min(100, pAch)) + '%;background:#2563EB"></span></div>'
        + '<div class="sr-trow-f">Forecast ' + money(ts.forecast) + ' · ' + pct(pFc)
        + ' · Pipeline ' + money(ts.s1) + '</div>'
        + '</div>';
    }).join('');

    var follow = k.list.filter(function (d) { return d.status === 0 || d.status === 1; })
      .sort(function (a, b) { return num(b.amount) - num(a.amount); }).slice(0, 8);

    var followRows = follow.map(function (d) {
      var stx = st(d.status);
      return '<tr class="sr-row" data-sr-deal="' + esc(d.no) + '">'
        + '<td><span class="sr-badge ' + stx.cls + '">' + d.status + ' · ' + esc(stx.short) + '</span></td>'
        + '<td><div class="sr-nm">' + esc(d.customer) + '</div><div class="sr-s2">' + esc(d.job) + '</div></td>'
        + '<td><div>' + esc(sale(d.saleId).name) + '</div><div class="sr-s2">' + esc(teamByCode(sale(d.saleId).team).name) + '</div></td>'
        + '<td class="sr-num sr-strong">' + money(d.amount) + '</td>'
        + '<td class="sr-num">' + String(d.month).padStart(2, '0') + '.' + TH_MONTHS[d.month - 1] + ' ' + String(d.year + 543).slice(-2) + '</td>'
        + '<td class="sr-num">' + (d.status === 1 ? pct(d.prob) : '—') + '</td>'
        + '</tr>';
    }).join('');

    var cards = [
      cardKpi('เป้าหมายทีม (Target)', money(k.target),
        'Head Count <b>' + k.headCount + '</b> คน · Prod./Head <b>' + money(k.perHead) + '</b>',
        undefined, '#0F2B46', 'fa-solid fa-bullseye'),
      cardKpi('%Ach 4. (Actual ปิดงานแล้ว 100%)', pct(k.ach4),
        money(s.s4) + ' / ' + money(k.target), k.ach4, '#2563EB', 'fa-solid fa-circle-check'),
      cardKpi('%Ach 4.+3. (รวมรอส่งของ 90%)', pct(k.ach43),
        money(s.s4 + s.s3 * 0.9) + ' / ' + money(k.target), k.ach43, '#0EA5E9', 'fa-solid fa-truck-fast'),
      cardKpi('ประมาณการยอดปิดเดือน (Weighted Forecast)', money(s.forecast),
        'ยอดการันตี <b>' + money(s.secured) + '</b> + Pipeline ถ่วงน้ำหนัก <b>' + money(s.weighted1) + '</b>',
        k.forecastPct, '#16A34A', 'fa-solid fa-chart-line')
    ];

    function opt(v, tx, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(tx) + '</option>'; }
    var yearOpts = YEARS.map(function (y) { return opt(y, 'ปี ' + (y + 543), state.year); }).join('');
    var monthOpts = '<option value=""' + (state.month ? '' : ' selected') + '>ทุกเดือน</option>' +
      TH_MONTHS.map(function (mth, i) { return opt(i + 1, String(i + 1).padStart(2, '0') + '.' + mth, state.month); }).join('');
    var teamOpts = '<option value="">ทุกทีม</option>' + TEAMS.map(function (t) { return opt(t.code, t.name, state.team); }).join('');
    var lockedTeam = viewerTeam();
    var teamField = lockedTeam
      ? '<div class="sr-fl"><label>ทีม (BU)</label><div class="sr-locked"><i class="fa-solid fa-lock"></i> '
        + esc(teamByCode(lockedTeam).name) + ' <span class="sr-s2">ทีมที่คุณดูแล</span></div></div>'
      : '<div class="sr-fl"><label>ทีม (BU)</label><select data-sr-filter="team">' + teamOpts + '</select></div>';

    return '<div class="sr">'
      + '<div class="sr-head">'
      + '  <div><h1>ภาพรวมยอดขาย &amp; Forecast</h1>'
      + '    <div class="sr-sub">' + esc(today) + ' · ใช้สูตรและข้อมูลชุดเดียวกับหน้า Reports</div></div>'
      + '  <button class="sr-btn dark" data-sr-goto="reports"><i class="fa-solid fa-chart-pie"></i> เปิด Reports ฉบับเต็ม</button>'
      + '</div>'
      + '<div class="sr-filters sr-f3">'
      + '  <div class="sr-fl"><label>ปี</label><select data-sr-filter="year">' + yearOpts + '</select></div>'
      + '  <div class="sr-fl"><label>เดือนที่คาดว่าจะปิด</label><select data-sr-filter="month">' + monthOpts + '</select></div>'
      + teamField
      + '  <div class="sr-fbtn"><button class="sr-btn" data-sr-goto="reports"><i class="fa-solid fa-arrow-right"></i> ดูรายละเอียดทั้งหมด</button></div>'
      + '</div>'
      + '<div class="sr-scope"><i class="fa-regular fa-calendar"></i> '
      + esc(state.month ? monthLabel(state.year, state.month) : ('ปี ' + (state.year + 543)))
      + ' · ' + k.list.length + ' ดีล · Cash In คาดรับ <b>' + money(s.cashIn) + '</b></div>'
      + '<div class="sr-kpis">' + cards.join('') + '</div>'
      + '<div class="sr-dash-teams">' + (teamRows || '<div class="sr-trow">ยังไม่มีทีม</div>') + '</div>'
      + '<div class="sr-dash-charts">'
      + '  <section class="sr-panel">'
      + '    <div class="sr-ph"><div><h3>ยอดขายตามทีม แยกตามสถานะ</h3>'
      + '      <div class="sr-s2">4.Actual · 3.รอส่งของ · 2.รอยืนยัน PO · 1.Pipeline</div></div></div>'
      + '    <div class="sr-chartbox"><canvas id="srDashBar"></canvas></div>'
      + '  </section>'
      + '  <section class="sr-panel">'
      + '    <div class="sr-ph"><h3>สัดส่วนสถานะงาน</h3></div>'
      + '    <div class="sr-chartbox"><canvas id="srDashStatus"></canvas></div>'
      + '  </section>'
      + '</div>'
      + '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>ดีลที่ต้องติดตาม (Pipeline / กำลังคุย)</h3>'
      + '    <div class="sr-s2">เรียงตามมูลค่าสูงสุด · คลิกแถวเพื่อดูหมายเหตุ</div></div>'
      + '    <button class="sr-btn" data-sr-goto="reports"><i class="fa-solid fa-list"></i> ดูดีลทั้งหมด</button></div>'
      + '  <div class="sr-tablewrap"><table class="sr-table"><thead><tr>'
      + '    <th>สถานะ</th><th>ลูกค้า / งาน</th><th>Sale</th><th class="sr-num">มูลค่า</th>'
      + '    <th class="sr-num">คาดปิด</th><th class="sr-num">โอกาส</th>'
      + '  </tr></thead><tbody>' + (followRows || '<tr><td colspan="6" class="sr-empty">ไม่มีดีลที่ต้องติดตาม</td></tr>') + '</tbody></table></div>'
      + '</section>'
      + '</div>';
  }

  function drawDashboardCharts() {
    destroyCharts();
    if (!global.Chart) return;
    Chart.defaults.font.family = 'Prompt, sans-serif';
    Chart.defaults.font.size = 10;
    Chart.defaults.color = '#64748B';
    var k = kpis();

    var bar = document.getElementById('srDashBar');
    if (bar) {
      var teams = TEAMS.filter(function (t) { return !state.team || t.code === state.team; });
      var series = { s4: [], s3: [], s2: [], s1: [] };
      teams.forEach(function (t) {
        var ts = summarize(k.list.filter(function (d) { return sale(d.saleId).team === t.code; }));
        series.s4.push(ts.s4); series.s3.push(ts.s3); series.s2.push(ts.s2); series.s1.push(ts.s1);
      });
      charts.push(new Chart(bar, {
        type: 'bar',
        data: {
          labels: teams.map(function (t) { return t.name; }),
          datasets: [
            { label: '4.Actual', data: series.s4, backgroundColor: '#2563EB', borderRadius: 4, stack: 'a' },
            { label: '3.รอส่งของ', data: series.s3, backgroundColor: '#38BDF8', borderRadius: 4, stack: 'a' },
            { label: '2.รอยืนยัน PO', data: series.s2, backgroundColor: '#F59E0B', borderRadius: 4, stack: 'a' },
            { label: '1.Pipeline', data: series.s1, backgroundColor: '#A78BFA', borderRadius: 4, stack: 'a' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true, beginAtZero: true,
              ticks: { callback: function (v) { return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : (v / 1000) + 'K'; } },
              grid: { color: '#EFF3F8' }
            }
          }
        }
      }));
    }

    var donut = document.getElementById('srDashStatus');
    if (donut) {
      var keys = [4, 3, 2, 1, 0, 5];
      charts.push(new Chart(donut, {
        type: 'doughnut',
        data: {
          labels: keys.map(function (c) { return c + '. ' + st(c).short; }),
          datasets: [{
            data: keys.map(function (c) {
              return k.list.filter(function (d) { return d.status === c; }).reduce(function (a, d) { return a + num(d.amount); }, 0);
            }),
            backgroundColor: keys.map(function (c) { return st(c).color; }),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: { callbacks: { label: function (c) { return c.label + ': ' + money(c.parsed); } } }
          }
        }
      }));
    }
  }

  function render() {
    var k = kpis();
    return '<div class="sr">'
      + '<div class="sr-head">'
      + '  <div><h1>Sales Report &amp; Forecast</h1>'
      + '    <div class="sr-sub">สรุปยอดขาย ผลงานรายบุคคล และประมาณการปิดเดือน จากสถานะงาน 0–5</div></div>'
      + '</div>'
      + renderFilters(k)
      + renderKpis(k)
      + renderTargets()
      + '<div class="sr-charts">'
      + '  <section class="sr-panel sr-chart-wide">'
      + '    <div class="sr-ph"><div><h3>ผลงานรายบุคคล (Sale Performance)</h3>'
      + '      <div class="sr-s2">แท่งซ้อนแยกตามสถานะ · เส้นประสีแดงคือเป้าหมายต่อคน (เป้าหมายทีม ÷ Head Count = ' + money(k.perHead) + ')</div></div></div>'
      + '    <div class="sr-chartbox"><canvas id="srBarChart"></canvas></div>'
      + '  </section>'
      + '  <div class="sr-donuts">'
      + '    <section class="sr-panel">'
      + '      <div class="sr-ph"><h3>สัดส่วนสินค้า</h3></div>'
      + '      <div class="sr-chartbox sm"><canvas id="srProductChart"></canvas></div>'
      + '    </section>'
      + '    <section class="sr-panel">'
      + '      <div class="sr-ph"><h3>สัดส่วนการชำระเงิน</h3></div>'
      + '      <div class="sr-chartbox sm"><canvas id="srPayChart"></canvas></div>'
      + '      <div class="sr-cash"><span>Cash In คาดรับในเดือน</span><b>' + money(k.sum.cashIn) + '</b></div>'
      + '    </section>'
      + '  </div>'
      + '</div>'
      + renderSummaryTable()
      + renderDealsTable(k.list)
      + '</div>';
  }

  /* ---------- Charts ---------- */
  function destroyCharts() {
    charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    charts = [];
  }

  function drawCharts() {
    destroyCharts();
    if (!global.Chart) return;
    Chart.defaults.font.family = 'Prompt, sans-serif';
    Chart.defaults.font.size = 10;
    Chart.defaults.color = '#64748B';

    var k = kpis();

    /* 1) Stacked bar รายคน + เส้นเป้าหมายต่อคน */
    var bar = document.getElementById('srBarChart');
    if (bar) {
      var names = [], d4 = [], d3 = [], d2 = [], d1 = [];
      SALES.forEach(function (r) {
        if (state.sale && state.sale !== r.id) return;
        var list = k.list.filter(function (d) { return d.saleId === r.id; });
        var s = summarize(list);
        if (!list.length) return;
        names.push(r.name.split(' ')[0]);
        d4.push(s.s4); d3.push(s.s3); d2.push(s.s2); d1.push(s.s1);
      });
      var target = names.map(function () { return k.perHead; });
      charts.push(new Chart(bar, {
        type: 'bar',
        data: {
          labels: names,
          datasets: [
            { label: '4.Actual', data: d4, backgroundColor: '#2563EB', borderRadius: 4, stack: 'a' },
            { label: '3.รอส่งของ', data: d3, backgroundColor: '#38BDF8', borderRadius: 4, stack: 'a' },
            { label: '2.รอยืนยัน PO', data: d2, backgroundColor: '#F59E0B', borderRadius: 4, stack: 'a' },
            { label: '1.Pipeline', data: d1, backgroundColor: '#A78BFA', borderRadius: 4, stack: 'a' },
            {
              type: 'line', label: 'เป้าหมาย/คน', data: target, borderColor: '#EF4444',
              borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 0
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true, beginAtZero: true,
              ticks: { callback: function (v) { return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : (v / 1000) + 'K'; } },
              grid: { color: '#EFF3F8' }
            }
          }
        }
      }));
    }

    /* 2) Donut สินค้า */
    var pc = document.getElementById('srProductChart');
    if (pc) {
      var byProd = PRODUCTS.map(function (p) {
        return k.list.filter(function (d) { return d.product === p.code && d.status !== 5; })
          .reduce(function (a, d) { return a + num(d.amount); }, 0);
      });
      charts.push(new Chart(pc, {
        type: 'doughnut',
        data: {
          labels: PRODUCTS.map(function (p) { return p.short; }),
          datasets: [{ data: byProd, backgroundColor: PRODUCTS.map(function (p) { return p.color; }), borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: function (c) {
                  var total = c.dataset.data.reduce(function (a, b) { return a + b; }, 0) || 1;
                  return c.label + ': ' + money(c.parsed) + ' (' + pct(c.parsed / total * 100) + ')';
                }
              }
            }
          }
        }
      }));
    }

    /* 3) Donut รูปแบบการชำระเงิน */
    var yc = document.getElementById('srPayChart');
    if (yc) {
      var byPay = PAYMENTS.map(function (p) {
        return k.list.filter(function (d) { return d.payment === p.code && d.status !== 5; })
          .reduce(function (a, d) { return a + num(d.amount); }, 0);
      });
      charts.push(new Chart(yc, {
        type: 'doughnut',
        data: {
          labels: PAYMENTS.map(function (p) { return p.name; }),
          datasets: [{ data: byPay, backgroundColor: PAYMENTS.map(function (p) { return p.color; }), borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: function (c) {
                  var total = c.dataset.data.reduce(function (a, b) { return a + b; }, 0) || 1;
                  return c.label + ': ' + money(c.parsed) + ' (' + pct(c.parsed / total * 100) + ')';
                }
              }
            }
          }
        }
      }));
    }
  }

  /* ---------- Modal หมายเหตุ ---------- */
  function openDealModal(no) {
    var d = null;
    for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === no) { d = DEALS[i]; break; }
    if (!d) return;
    var s = st(d.status), p = product(d.product), pay = payment(d.payment);
    var body = ''
      + '<div class="sr-md-grid">'
      + '  <div><small>สถานะงาน</small><strong><span class="sr-badge ' + s.cls + '">' + d.status + ' · ' + esc(s.label) + '</span></strong></div>'
      + '  <div><small>มูลค่างานประมาณ</small><strong>' + money(d.amount) + '</strong></div>'
      + '  <div><small>Cash In คาดรับ</small><strong>' + (cashInOf(d) ? money(cashInOf(d)) : '—') + '</strong></div>'
      + '  <div><small>Sale ผู้รับผิดชอบ</small><strong>' + esc(sale(d.saleId).name) + '</strong></div>'
      + '  <div><small>สินค้า</small><strong>' + esc(p.name) + '</strong></div>'
      + '  <div><small>รูปแบบการซื้อ</small><strong>' + esc(pay.name) + '</strong></div>'
      + '  <div><small>วันที่สร้างใบเสนอราคา</small><strong>' + shortDate(d.quoteDate) + '</strong></div>'
      + '  <div><small>เดือนที่คาดว่าจะปิด</small><strong>' + monthLabel(d.year, d.month) + '</strong></div>'
      + '  <div><small>เลขที่ SO / Inv.</small><strong>' + esc(d.so) + '</strong></div>'
      + '</div>'
      + '<div class="sr-md-note"><b>หมายเหตุ</b><p>' + esc(d.note) + '</p></div>';
    if (typeof global.setModal === 'function') {
      global.setModal(d.customer, d.job + ' · ' + d.no, body, [{ label: 'ปิด', primary: true }]);
    }
  }

  /* ---------- CSV ---------- */
  function exportCsv() {
    var q = String(state.q || '').trim().toLowerCase();
    var rows = sortRows(filteredDeals()).filter(function (d) {
      return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so).toLowerCase().indexOf(q) >= 0;
    });
    var head = ['No.', 'สถานะ', 'ชื่อลูกค้า', 'ชื่องาน', 'เลขที่ SO/Inv.', 'วันที่เสนอราคา', 'เดือนที่คาดว่าจะปิด',
      'Sale', 'สินค้า', 'มูลค่างานประมาณ', 'รูปแบบการซื้อ', 'Cash In', 'หมายเหตุ'];
    var lines = [head];
    rows.forEach(function (d) {
      lines.push([d.no, d.status + ' · ' + st(d.status).label, d.customer, d.job, d.so, d.quoteDate,
        monthLabel(d.year, d.month), sale(d.saleId).name, product(d.product).name, Math.round(d.amount),
        payment(d.payment).name, Math.round(cashInOf(d)), d.note]);
    });
    var csv = lines.map(function (r) {
      return r.map(function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sales-report-' + state.year + '-' + String(state.month || 'all').padStart(2, '0') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    if (typeof global.toast === 'function') global.toast('Export CSV เรียบร้อย (' + rows.length + ' ดีล)');
  }

  /* ---------- จัดการทีม / เป้าหมาย ---------- */
  function addTeamModal() {
    if (typeof global.setModal !== 'function') return;
    global.setModal('เพิ่มทีม (BU)', 'ตั้งชื่อทีมให้ตรงกับโครงสร้างองค์กร เช่น BU-CENTRAL',
      '<label style="font-size:11px;color:#475467">ชื่อทีม</label>'
      + '<input id="srNewTeam" placeholder="BU-CENTRAL" style="width:100%;margin-top:6px;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">'
      + '<div style="font-size:10.5px;color:#98A2B3;margin-top:8px">ทีมใหม่เริ่มด้วยเป้าหมาย 0 ทุกเดือน — แก้ไขได้ในตารางเป้าหมาย</div>',
      [{ label: 'ยกเลิก' }, { label: 'เพิ่มทีม', action: 'sr-add-team', primary: true }]);
  }

  function doAddTeam() {
    var inp = document.getElementById('srNewTeam');
    var name = inp ? String(inp.value || '').trim().toUpperCase() : '';
    if (!name) { if (global.toast) global.toast('กรอกชื่อทีมก่อน'); return; }
    var dup = TEAMS.some(function (t) { return t.code === name || String(t.name).toUpperCase() === name; });
    if (dup) { if (global.toast) global.toast('มีทีมนี้อยู่แล้ว'); return; }
    TEAMS.push({ code: name, name: name });
    saveTeams();
    targetsOfTeam(name, state.year);
    saveTargets();
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('เพิ่มทีม ' + name + ' แล้ว');
  }

  function deleteTeam(code) {
    var members = SALES.filter(function (r) { return r.team === code; }).length;
    if (members) { if (global.toast) global.toast('ลบไม่ได้: ยังมีพนักงานขาย ' + members + ' คนในทีมนี้'); return; }
    if (!global.confirm('ลบทีม ' + code + ' ?')) return;
    TEAMS = TEAMS.filter(function (t) { return t.code !== code; });
    saveTeams();
    if (state.team === code) state.team = '';
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('ลบทีมแล้ว');
  }

  function resetTargets() {
    if (!global.confirm('คืนค่าเป้าหมายเริ่มต้นของปี ' + (state.year + 543) + ' ?')) return;
    TARGETS[state.year] = {};
    saveTargets();
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('คืนค่าเป้าหมายเริ่มต้นแล้ว');
  }

  /* ============================ 5) EVENTS ============================ */
  function repaintDeals() {
    var body = document.getElementById('srDealBody');
    if (!body) return;
    var list = filteredDeals();
    body.innerHTML = dealRowsHtml(list);
    var q = String(state.q || '').trim().toLowerCase();
    var shown = sortRows(list).filter(function (d) {
      return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so).toLowerCase().indexOf(q) >= 0;
    }).length;
    var c = document.getElementById('srDealCount');
    if (c) c.textContent = 'แสดง ' + shown + ' จาก ' + list.length + ' ดีล';
  }

  document.addEventListener('change', function (e) {
    var tin = e.target.closest && e.target.closest('[data-sr-target]');
    if (tin) {
      var parts = tin.getAttribute('data-sr-target').split('|');
      setTarget(parts[0], state.year, Number(parts[1]), tin.value);
      if (typeof global.render === 'function') global.render();
      if (typeof global.toast === 'function') global.toast('บันทึกเป้าหมาย ' + parts[0] + ' เดือน ' + (Number(parts[1]) + 1) + ' แล้ว');
      return;
    }
    var sel = e.target.closest && e.target.closest('[data-sr-filter]');
    if (!sel) return;
    var key = sel.getAttribute('data-sr-filter');
    state[key] = (key === 'year' || key === 'month') ? Number(sel.value || 0) : sel.value;
    if (typeof global.render === 'function') global.render();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id !== 'srSearch') return;
    state.q = e.target.value;
    repaintDeals();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var sortTh = t.closest('[data-sr-sort]');
    if (sortTh) {
      var key = sortTh.getAttribute('data-sr-sort');
      if (state.sortKey === key) state.sortDir = -state.sortDir;
      else { state.sortKey = key; state.sortDir = 1; }
      repaintDeals();
      return;
    }

    if (t.closest('[data-sr-reset]')) {
      state.month = 11; state.team = ''; state.sale = ''; state.product = ''; state.payment = ''; state.q = '';
      if (typeof global.render === 'function') global.render();
      return;
    }

    if (t.closest('[data-sr-addteam]')) { addTeamModal(); return; }
    if (t.closest('[data-sr-toggletargets]')) { ui.targets = !ui.targets; if (typeof global.render === 'function') global.render(); return; }
    if (t.closest('[data-sr-resettargets]')) { resetTargets(); return; }
    var delBtn = t.closest('[data-sr-delteam]');
    if (delBtn) { deleteTeam(delBtn.getAttribute('data-sr-delteam')); return; }
    var actBtn = t.closest('[data-action]');
    if (actBtn && actBtn.getAttribute('data-action') === 'sr-add-team') { doAddTeam(); return; }

    var go = t.closest('[data-sr-goto]');
    if (go) {
      var nav = document.querySelector('#navList [data-page="' + go.getAttribute('data-sr-goto') + '"]');
      if (nav) nav.click();
      return;
    }

    if (t.closest('[data-sr-export]')) { exportCsv(); return; }

    var row = t.closest('[data-sr-deal]');
    if (row) { openDealModal(row.getAttribute('data-sr-deal')); return; }
  });

  /* ============================ CSS ============================ */
  function injectCss() {
    if (document.getElementById('sr-style')) return;
    var css = ''
      + '.sr{padding-bottom:6px}'
      + '.sr-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.sr-head h1{margin:0;color:#0F2B46;font-size:21px;font-weight:600}'
      + '.sr-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      /* sticky filter bar */
      + '.sr-filters{position:sticky;top:0;z-index:25;display:grid;grid-template-columns:repeat(6,minmax(0,1fr)) auto;gap:10px;'
      + 'background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 18px rgba(15,43,70,.07);margin-bottom:15px}'
      + '.sr-fl{display:grid;gap:5px;min-width:0}'
      + '.sr-fl label{font-size:10px;color:#667085;font-weight:500}'
      + '.sr-fl select{width:100%;min-width:0;border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;'
      + 'padding:7px 8px;font-size:11px;min-height:34px;outline:none;font-family:inherit}'
      + '.sr-fl select:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      + '.sr-locked{display:flex;align-items:center;gap:6px;min-height:34px;border:1px solid #E0E7FF;background:#EEF2FF;'
      + 'color:#3730A3;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:500}'
      + '.sr-locked i{font-size:9px;color:#4F46E5}'
      + '.sr-fbtn{display:flex;align-items:flex-end;gap:8px}'
      + '.sr-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 11px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.sr-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.sr-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      /* scope */
      + '.sr-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#EFF6FF;border:1px solid #DBEAFE;color:#1E40AF;'
      + 'border-radius:9px;padding:9px 13px;font-size:11px;margin-bottom:14px}'
      /* KPI */
      + '.sr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}'
      + '.sr-card{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.sr-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10px;line-height:1.5;min-height:30px}'
      + '.sr-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;flex:0 0 28px}'
      + '.sr-card-val{font-size:19px;font-weight:600;margin:8px 0 8px;letter-spacing:-.2px}'
      + '.sr-bar{height:6px;background:#EEF2F7;border-radius:99px;overflow:hidden}'
      + '.sr-bar span{display:block;height:100%;border-radius:99px;transition:width .4s ease}'
      + '.sr-card-sub{font-size:9.5px;color:#667085;margin-top:8px;line-height:1.5}'
      + '.sr-card-sub b{color:#344054;font-weight:600}'
      /* charts */
      + '.sr-charts{display:grid;gap:15px;margin-bottom:15px}'
      + '.sr-chart-wide{min-width:0}'
      + '.sr-donuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}'
      + '.sr-chartbox{position:relative;height:290px}'
      + '.sr-chartbox.sm{height:220px}'
      + '.sr-cash{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;'
      + 'background:#ECFDF3;border:1px solid #D1FAE5;border-radius:9px;font-size:11px;color:#15803D}'
      + '.sr-cash b{font-size:14px}'
      /* panels */
      + '.sr-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:15px;box-shadow:0 2px 8px rgba(15,43,70,.05);'
      + 'min-width:0;overflow:hidden;margin-bottom:15px}'
      + '.sr-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;flex-wrap:wrap}'
      + '.sr-ph h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.sr-s2{color:#98A2B3;font-size:10px;margin-top:3px;line-height:1.55}'
      + '.sr-targets-sum{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#F8FAFC;border:1px solid #EEF2F7;border-radius:9px;padding:9px 12px}'
      + '.sr-sum-item{font-size:11.5px;color:#475467}'
      + '.sr-sum-item b{color:#0F2B46;margin-right:5px}'
      + '.sr-sum-sep{color:#C2CBD8}'
      + '.sr-tag{background:#EEF2FF;color:#3730A3;border-radius:99px;padding:4px 10px;font-size:10px;white-space:nowrap}'
      /* table */
      + '.sr-tablewrap{overflow:auto;width:100%;-webkit-overflow-scrolling:touch}'
      + '.sr-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:10.5px}'
      + '.sr-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:10px;padding:9px 10px;border-bottom:1px solid #E9EEF5;text-align:left}'
      + '.sr-table td{padding:10px 9px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:middle;font-size:11.5px}'
      + '.sr-table tbody tr:last-child td{border-bottom:0}'
      + '.sr-table tfoot td{background:#F8FAFC;border-top:1px solid #E9EEF5;font-size:10.5px}'
      + '.sr-num{text-align:right;font-variant-numeric:tabular-nums}'
      + '.sr-grp{text-align:center!important;background:#EEF2FF!important;color:#3730A3!important;font-weight:600!important}'
      + '.sr-grp-alt{background:#F5F3FF!important;color:#5B21B6!important}'
      + '.sr-sep{border-left:1px solid #E9EEF5}'
      + '.sr-nm{color:#0F2B46;font-weight:500;font-size:11px}'
      + '.sr-strong{font-weight:600;color:#0F2B46}'
      + '.sr-neg{color:#DC2626}'
      + '.sr-dim{color:#C2CBD8}'
      + '.sr-td-sale{min-width:150px}'
      + '.sr-td-team{min-width:150px}'
      + '.sr-teamhead td{background:#F5F8FF;color:#1E3A8A;font-size:10.5px;padding:8px 9px;border-top:1px solid #E4EBF7;border-bottom:1px solid #E4EBF7}'
      + '.sr-teamhead i{font-size:9px;margin-right:4px}'
      + '.sr-th-meta{margin-left:12px;color:#475569}'
      + '.sr-th-meta b{color:#0F2B46}'
      + '.sr-tinp{width:104px;border:1px solid #DCE3EB;border-radius:7px;padding:5px 6px;font-size:10.5px;text-align:right;'
      + 'font-family:inherit;color:#344054;outline:none;background:#fff}'
      + '.sr-tinp:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      + '.sr-hl{background:#FFFBEB!important}'
      + '.sr-tools{display:flex;gap:8px;flex-wrap:wrap}'
      + '.sr-xbtn{border:1px solid #FFE4E6;background:#FFF1F2;color:#B91C1C;border-radius:7px;padding:5px 8px;cursor:pointer;font-size:10px}'
      + '.sr-xbtn:hover{background:#FFE4E6}'
      + '.sr-filters.sr-f3{grid-template-columns:repeat(3,minmax(0,1fr)) auto}'
      + '.sr-dash-teams{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:15px}'
      + '.sr-trow{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.sr-trow-h{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#667085;margin-bottom:8px}'
      + '.sr-trow-h b{color:#0F2B46;font-size:12px}'
      + '.sr-trow-n{font-size:15px;font-weight:600;color:#0F2B46;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis}'
      + '.sr-trow-n span{color:#98A2B3;font-weight:400;font-size:10.5px}'
      + '.sr-trow-n em{float:right;font-style:normal;font-size:12px;color:#2563EB}'
      + '.sr-trow-f{font-size:9.5px;color:#667085;margin-top:8px}'
      + '.sr-dash-charts{display:grid;grid-template-columns:1.5fr 1fr;gap:15px;margin-bottom:15px}'
      + '.sr-dash-charts .sr-panel{margin-bottom:0}'
      + '.sr-empty{text-align:center!important;color:#98A2B3;padding:22px!important}'
      /* badges */
      + '.sr-badge{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:3px 9px;font-size:9.5px;font-weight:500;white-space:nowrap}'
      + '.sr-badge.s0{background:#F1F5F9;color:#475569}'
      + '.sr-badge.s1{background:#F3E8FF;color:#6D28D9}'
      + '.sr-badge.s2{background:#FEF3C7;color:#B45309}'
      + '.sr-badge.s3{background:#E0F2FE;color:#0369A1}'
      + '.sr-badge.s4{background:#DBEAFE;color:#1D4ED8}'
      + '.sr-badge.s5{background:#FEE2E2;color:#B91C1C}'
      + '.sr-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}'
      /* deals table */
      + '.sr-deals th.sr-sortable{cursor:pointer;user-select:none}'
      + '.sr-deals th.sr-sortable:hover{background:#EEF2F7;color:#344054}'
      + '.sr-arrow{font-size:8px;color:#2563EB}'
      + '.sr-note-cell{max-width:230px;overflow:hidden;text-overflow:ellipsis;color:#667085}'
      + '.sr-row{cursor:pointer}'
      + '.sr-row:hover td{background:#F8FBFF}'
      + '.sr-search{position:relative;min-width:220px}'
      + '.sr-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#98A2B3;font-size:10px}'
      + '.sr-search input{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px 8px 26px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054}'
      + '.sr-search input:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      + '.sr-foot{color:#98A2B3;font-size:10px;margin-top:10px}'
      /* modal */
      + '.sr-md-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'
      + '.sr-md-grid>div{background:#F8FAFC;border-radius:9px;padding:10px}'
      + '.sr-md-grid small{display:block;color:#98A2B3;font-size:9px;margin-bottom:4px}'
      + '.sr-md-grid strong{color:#0F2B46;font-size:11.5px;font-weight:500}'
      + '.sr-md-note{margin-top:14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:9px;padding:12px 14px}'
      + '.sr-md-note b{color:#92400E;font-size:11px}'
      + '.sr-md-note p{margin:6px 0 0;color:#78350F;font-size:11.5px;line-height:1.75;white-space:pre-wrap}'
      /* responsive */
      + '@media(max-width:1280px){.sr-kpis{gap:10px}}'
      + '@media(max-width:1024px){.sr-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.sr-fbtn{grid-column:1/-1}'
      + '.sr-donuts{grid-template-columns:1fr}'
      + '.sr-dash-charts{grid-template-columns:1fr}}'
      + '@media(max-width:760px){.sr-filters,.sr-filters.sr-f3{position:static;grid-template-columns:1fr 1fr;padding:11px}'
      + '.sr-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'
      + '.sr-card-val{font-size:16px}.sr-chartbox{height:250px}'
      + '.sr-md-grid{grid-template-columns:1fr 1fr}.sr-head h1{font-size:18px}}'
      + '@media(max-width:480px){.sr-filters{grid-template-columns:1fr}.sr-card{padding:11px}'
      + '.sr-card-val{font-size:15px}.sr-card-top{font-size:9px;min-height:26px}'
      + '.sr-md-grid{grid-template-columns:1fr}}';
    var el = document.createElement('style');
    el.id = 'sr-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ============================ PUBLIC API ============================ */
  global.SalesReport = {
    render: function () {
      injectCss();
      /* กัน invalid month หลังเปลี่ยนปี */
      if (!state.month) state.month = 0;
      var lt = viewerTeam();
      if (lt) state.team = lt;      // Head Team เห็นเฉพาะทีมของตัวเอง
      return render();
    },
    viewerTeam: viewerTeam,
    drawCharts: drawCharts,
    renderDashboard: function () {
      injectCss();
      if (!state.month) state.month = 0;
      var lt = viewerTeam();
      if (lt) state.team = lt;
      return renderDashboard();
    },
    drawDashboardCharts: drawDashboardCharts,
    state: state,
    /* จุดต่อข้อมูลจริง: เรียกด้วยอาร์เรย์รูปแบบเดียวกับ DEALS */
    setDeals: function (list) {
      if (Object.prototype.toString.call(list) !== '[object Array]') return;
      DEALS.length = 0;
      Array.prototype.push.apply(DEALS, list);
    },
    getDeals: function () { return DEALS; },
    calc: { summarize: summarize, kpis: kpis, filtered: filteredDeals, cashIn: cashInOf }
  };
})(window);
