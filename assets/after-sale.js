/* ============================================================
   After-Sale Service — ใช้งานได้จริง (บันทึกในเครื่อง)
   - ลูกค้า/เซลล์ ดึงจากข้อมูลชุดเดียวกับ Reports
   - Ticket CRUD + บันทึกการติดตาม (log) + SLA
   ============================================================ */
(function (global) {
  'use strict';

  var LS = 'pi_tickets_v1';

  var STATUS = [
    { key: 'เปิด', cls: 'st-open' },
    { key: 'กำลังดำเนินการ', cls: 'st-doing' },
    { key: 'รออะไหล่', cls: 'st-part' },
    { key: 'รอลูกค้ายืนยัน', cls: 'st-wait' },
    { key: 'ปิดแล้ว', cls: 'st-done' }
  ];
  var OPEN_STATUS = ['เปิด', 'กำลังดำเนินการ', 'รออะไหล่', 'รอลูกค้ายืนยัน'];
  var PRIORITY = [
    { key: 'Critical', cls: 'p-crit' },
    { key: 'High', cls: 'p-high' },
    { key: 'Medium', cls: 'p-med' },
    { key: 'Low', cls: 'p-low' }
  ];

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dayDiff(iso) {
    if (!iso) return 0;
    var t = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    var n = new Date(todayISO() + 'T00:00:00');
    return Math.round((t - n) / 86400000);
  }
  function thaiDate(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }
  function stMeta(k) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].key === k) return STATUS[i];
    return STATUS[0];
  }
  function prMeta(k) {
    for (var i = 0; i < PRIORITY.length; i++) if (PRIORITY[i].key === k) return PRIORITY[i];
    return PRIORITY[2];
  }

  /* ---------- seed ---------- */
  var SEED = [
    { id: 'T-2401', customer: 'บริษัท สยามคลีน เซอร์วิส จำกัด', product: 'ร้านสะดวกซัก', issue: 'เครื่องอบไม่ทำงาน 1 เครื่อง', priority: 'Critical', tech: 'สมชาย', open: '2026-11-17', sla: '2026-11-19', status: 'กำลังดำเนินการ', next: 'เข้าตรวจ 20/11', logs: [{ at: '2026-11-17', by: 'Call Center', text: 'รับแจ้งทางโทรศัพท์ ลูกค้าแจ้งเครื่องอบหยุดกลางรอบ' }] },
    { id: 'T-2402', customer: 'หจก. บ้านสะอาด นครปฐม', product: 'ร้านสะดวกซัก', issue: 'น้ำไม่ระบาย', priority: 'High', tech: 'วิชัย', open: '2026-11-16', sla: '2026-11-20', status: 'รออะไหล่', next: 'รอปั๊มน้ำจากคลัง', logs: [{ at: '2026-11-16', by: 'สมชาย', text: 'ตรวจพบปั๊มน้ำเสีย สั่งอะไหล่แล้ว' }] },
    { id: 'T-2403', customer: 'โรงงานไทยฟู้ดส์', product: 'ตู้กดน้ำ', issue: 'ตู้ที่ 3 น้ำไม่เย็น', priority: 'Medium', tech: 'พัชรี', open: '2026-11-18', sla: '2026-11-22', status: 'เปิด', next: 'นัดเข้าตรวจ', logs: [] },
    { id: 'T-2404', customer: 'ดีดี คอนโดมิเนียม', product: 'ร้านสะดวกซัก', issue: 'เครื่องซักผ้าเสียงดัง', priority: 'Low', tech: 'สมชาย', open: '2026-11-12', sla: '2026-11-18', status: 'กำลังดำเนินการ', next: 'เข้าแก้ไข 21/11', logs: [{ at: '2026-11-12', by: 'Call Center', text: 'ลูกค้าแจ้งเสียงดังบริเวณลูกปืน' }] },
    { id: 'T-2405', customer: 'บริษัท กรีนมาร์ท จำกัด', product: 'ตู้กดน้ำ', issue: 'ตู้แสดงผลหน้าจอดับ', priority: 'High', tech: 'วิชัย', open: '2026-11-15', sla: '2026-11-19', status: 'รอลูกค้ายืนยัน', next: 'รอลูกค้าคอนเฟิร์มเวลาปิดร้าน', logs: [{ at: '2026-11-15', by: 'วิชัย', text: 'เข้าตรวจแล้ว ต้องปิดไฟหน้างาน 30 นาที' }] },
    { id: 'T-2406', customer: 'เอสพีเอส โฮเทล', product: 'ตู้กดน้ำ + น้ำแข็ง', issue: 'น้ำแข็งเกาะถาด', priority: 'Medium', tech: 'พัชรี', open: '2026-11-10', sla: '2026-11-14', status: 'ปิดแล้ว', next: '—', logs: [{ at: '2026-11-13', by: 'พัชรี', text: 'ละลายน้ำแข็งและปรับเซนเซอร์ เรียบร้อย' }, { at: '2026-11-14', by: 'ลูกค้า', text: 'ลูกค้ายืนยันใช้งานปกติ ปิดงาน' }] },
    { id: 'T-2407', customer: 'เมกะซัก ซิตี้', product: 'ร้านสะดวกซัก', issue: 'เครื่องซักผ้าไม่หมุน', priority: 'Critical', tech: 'สมชาย', open: '2026-11-18', sla: '2026-11-19', status: 'เปิด', next: 'ด่วน — เข้าวันนี้', logs: [] },
    { id: 'T-2408', customer: 'โรงแรม บลูเวฟ', product: 'ตู้กดน้ำ + น้ำแข็ง', issue: 'ต่ออายุสัญญา Maintenance', priority: 'Low', tech: 'ทีม Service', open: '2026-11-08', sla: '2026-11-25', status: 'ปิดแล้ว', next: '—', logs: [{ at: '2026-11-09', by: 'ทีม Service', text: 'เสนอแพ็กเกจต่ออายุ ลูกค้าตอบรับ' }] }
  ];

  var TICKETS = load();
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(LS) || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]' && a.length) return a;
    } catch (e) {}
    return JSON.parse(JSON.stringify(SEED));
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(TICKETS)); } catch (e) {
      if (global.toast) global.toast('บันทึกไม่สำเร็จ (storage เต็ม)');
    }
  }
  function byId(id) {
    for (var i = 0; i < TICKETS.length; i++) if (TICKETS[i].id === id) return TICKETS[i];
    return null;
  }

  /* ---------- ข้อมูลอ้างอิงจาก Reports ---------- */
  function ref() {
    if (global.SalesReport && global.SalesReport.data) return global.SalesReport.data();
    return null;
  }
  function customers() {
    var d = ref(); if (!d) return [];
    var seen = {}, out = [];
    d.deals.forEach(function (x) { if (!seen[x.customer]) { seen[x.customer] = 1; out.push(x.customer); } });
    return out;
  }
  function techs() {
    var d = ref();
    var base = ['ทีม Service', 'สมชาย', 'วิชัย', 'พัชรี'];
    if (!d) return base;
    var out = base.slice();
    d.sales.forEach(function (s) { if (out.indexOf(s.name) < 0) out.push(s.name); });
    return out;
  }

  var state = { q: '', status: '', priority: '', tech: '' };

  function isOverdue(t) { return t.status !== 'ปิดแล้ว' && dayDiff(t.sla) < 0; }
  function filtered() {
    var q = String(state.q || '').trim().toLowerCase();
    return TICKETS.filter(function (t) {
      if (state.status && t.status !== state.status) return false;
      if (state.priority && t.priority !== state.priority) return false;
      if (state.tech && t.tech !== state.tech) return false;
      if (q && (t.customer + ' ' + t.issue + ' ' + t.id + ' ' + (t.product || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.sla).localeCompare(String(b.sla));
    });
  }

  /* ---------- render ---------- */
  function kpiCard(label, value, sub, color, icon) {
    return '<article class="as-kpi">'
      + '<div class="as-kpi-top"><span>' + esc(label) + '</span>'
      + '<span class="as-ico" style="background:' + color + '18;color:' + color + '"><i class="' + icon + '"></i></span></div>'
      + '<div class="as-kpi-val" style="color:' + color + '">' + value + '</div>'
      + '<div class="as-kpi-sub">' + sub + '</div></article>';
  }

  function render() {
    injectCss();
    var all = TICKETS;
    var openList = all.filter(function (t) { return OPEN_STATUS.indexOf(t.status) >= 0; });
    var overdue = all.filter(isOverdue);
    var doing = all.filter(function (t) { return t.status === 'กำลังดำเนินการ'; });
    var closed = all.filter(function (t) { return t.status === 'ปิดแล้ว'; });
    var list = filtered();

    function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }

    var kpis = '<div class="as-kpis">'
      + kpiCard('Ticket ที่เปิดอยู่', openList.length + ' งาน', 'ยังไม่ปิดงาน', '#2563EB', 'fa-solid fa-ticket')
      + kpiCard('เลยกำหนด SLA', overdue.length + ' งาน', overdue.length ? '<b class="as-red">ต้องเข้าแก้ไขด่วน</b>' : 'อยู่ใน SLA ทั้งหมด', '#DC2626', 'fa-solid fa-clock')
      + kpiCard('กำลังดำเนินการ', doing.length + ' งาน', 'ช่างกำลังเข้าหน้างาน', '#F59E0B', 'fa-solid fa-screwdriver-wrench')
      + kpiCard('ปิดงานแล้ว', closed.length + ' งาน', 'ปิดงานเรียบร้อย', '#16A34A', 'fa-solid fa-circle-check')
      + '</div>';

    var filters = '<div class="as-filters">'
      + '<div class="as-fl"><label>ค้นหา</label><div class="as-search"><i class="fa-solid fa-magnifying-glass"></i>'
      + '<input id="asSearch" placeholder="ลูกค้า / อาการ / เลข Ticket" value="' + esc(state.q) + '"></div></div>'
      + '<div class="as-fl"><label>สถานะ</label><select data-as-filter="status">' + opt('', 'ทั้งหมด', state.status)
      + STATUS.map(function (s) { return opt(s.key, s.key, state.status); }).join('') + '</select></div>'
      + '<div class="as-fl"><label>ความสำคัญ</label><select data-as-filter="priority">' + opt('', 'ทั้งหมด', state.priority)
      + PRIORITY.map(function (p) { return opt(p.key, p.key, state.priority); }).join('') + '</select></div>'
      + '<div class="as-fl"><label>ช่างผู้รับผิดชอบ</label><select data-as-filter="tech">' + opt('', 'ทุกคน', state.tech)
      + techs().map(function (t) { return opt(t, t, state.tech); }).join('') + '</select></div>'
      + '<div class="as-fbtn"><button class="as-btn" data-as-reset><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button></div>'
      + '</div>';

    var rows = list.map(function (t) {
      var sm = stMeta(t.status), pm = prMeta(t.priority), od = isOverdue(t);
      return '<tr class="as-row" data-as-ticket="' + esc(t.id) + '">'
        + '<td><div class="as-nm">' + esc(t.id) + '</div><div class="as-s2">' + thaiDate(t.open) + '</div></td>'
        + '<td><div class="as-nm">' + esc(t.customer) + '</div><div class="as-s2">' + esc(t.product || '') + '</div></td>'
        + '<td>' + esc(t.issue) + '</td>'
        + '<td><span class="as-badge ' + pm.cls + '">' + esc(t.priority) + '</span></td>'
        + '<td>' + esc(t.tech || '-') + '</td>'
        + '<td class="as-num ' + (od ? 'as-red' : '') + '">' + thaiDate(t.sla) + (od ? ' (' + Math.abs(dayDiff(t.sla)) + ' วัน)' : '') + '</td>'
        + '<td><span class="as-badge ' + sm.cls + '">' + esc(t.status) + '</span></td>'
        + '<td class="as-next">' + esc(t.next || '-') + '</td>'
        + '<td class="as-acts"><button class="as-btn sm" data-as-ticket="' + esc(t.id) + '"><i class="fa-solid fa-eye"></i> ดู</button></td>'
        + '</tr>';
    }).join('');

    var table = '<section class="as-panel">'
      + '<div class="as-ph"><div><h3>รายการ Ticket (' + list.length + ')</h3>'
      + '<div class="as-s2">คลิกแถวเพื่อดูรายละเอียด เพิ่มบันทึก หรือเปลี่ยนสถานะ</div></div>'
      + '<button class="as-btn dark" data-as-new><i class="fa-solid fa-plus"></i> เปิด Ticket ใหม่</button></div>'
      + '<div class="as-tablewrap"><table class="as-table"><thead><tr>'
      + '<th>Ticket</th><th>ลูกค้า</th><th>อาการ</th><th>ความสำคัญ</th><th>ช่าง</th>'
      + '<th class="as-num">กำหนด SLA</th><th>สถานะ</th><th>ขั้นตอนถัดไป</th><th></th>'
      + '</tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="as-empty">ไม่พบ Ticket ตามเงื่อนไข</td></tr>') + '</tbody></table></div>'
      + '</section>';

    return '<div class="as">'
      + '<div class="as-head"><div><h1>After-Sale Service</h1>'
      + '<div class="as-sub">ติดตามงานบริการหลังการขาย — ใช้รายชื่อลูกค้าและเซลล์ชุดเดียวกับ Reports</div></div></div>'
      + kpis + filters + table + '</div>';
  }

  /* ---------- modals ---------- */
  function openTicket(id) {
    var t = byId(id); if (!t) return;
    var sm = stMeta(t.status), pm = prMeta(t.priority), od = isOverdue(t);
    var logs = (t.logs || []).slice().reverse().map(function (l) {
      return '<div class="as-log"><div class="as-log-d">' + thaiDate(l.at) + ' · ' + esc(l.by || '') + '</div>'
        + '<div>' + esc(l.text) + '</div></div>';
    }).join('') || '<div class="as-s2">ยังไม่มีบันทึก</div>';

    var body = '<div class="as-dgrid">'
      + '<div><small>สถานะ</small><strong><span class="as-badge ' + sm.cls + '">' + esc(t.status) + '</span></strong></div>'
      + '<div><small>ความสำคัญ</small><strong><span class="as-badge ' + pm.cls + '">' + esc(t.priority) + '</span></strong></div>'
      + '<div><small>กำหนด SLA</small><strong class="' + (od ? 'as-red' : '') + '">' + thaiDate(t.sla) + (od ? ' (เลย ' + Math.abs(dayDiff(t.sla)) + ' วัน)' : '') + '</strong></div>'
      + '<div><small>ลูกค้า</small><strong>' + esc(t.customer) + '</strong></div>'
      + '<div><small>สินค้า</small><strong>' + esc(t.product || '-') + '</strong></div>'
      + '<div><small>ช่างผู้รับผิดชอบ</small><strong>' + esc(t.tech || '-') + '</strong></div>'
      + '</div>'
      + '<div class="as-issue"><b>อาการที่แจ้ง</b><p>' + esc(t.issue) + '</p></div>'
      + '<h3 class="as-sect">บันทึกการติดตาม</h3>'
      + '<div class="as-logs">' + logs + '</div>'
      + '<div class="as-addlog"><input id="asLogText" placeholder="เพิ่มบันทึก เช่น โทรหาลูกค้าแล้ว นัดเข้า 20/11">'
      + '<button class="as-btn" data-as-addlog="' + esc(t.id) + '"><i class="fa-solid fa-plus"></i> เพิ่ม</button></div>';

    if (typeof global.setModal === 'function') {
      global.setModal(t.id + ' · ' + t.customer, t.issue, body, [
        { label: 'ปิด' },
        { label: 'เปลี่ยนสถานะ', icon: 'fa-solid fa-arrows-rotate', action: 'as-status' },
        { label: 'บันทึกการแก้ไข', icon: 'fa-solid fa-pen', action: 'as-edit', primary: true }
      ], true);
      window.__AS_OPEN__ = t.id;
    }
  }

  function ticketModal(id) {
    var t = id ? byId(id) : null;
    var d = t || { customer: '', product: '', issue: '', priority: 'Medium', tech: '', open: todayISO(), sla: addDays(todayISO(), 3), status: 'เปิด', next: '', note: '' };
    var custs = customers();
    var custOpts = '<option value="">— เลือกลูกค้า —</option>' + custs.map(function (c) {
      return '<option value="' + esc(c) + '"' + (d.customer === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var techOpts = techs().map(function (x) { return '<option' + (d.tech === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    var body = '<form id="asForm"><div class="as-form">'
      + '<label class="as-fg full">ลูกค้า *<select name="customer" required>' + custOpts + '</select></label>'
      + '<label class="as-fg">สินค้า / บริการ<input name="product" value="' + esc(d.product) + '" placeholder="เช่น ร้านสะดวกซัก / ตู้กดน้ำ"></label>'
      + '<label class="as-fg">ช่างผู้รับผิดชอบ<select name="tech">' + techOpts + '</select></label>'
      + '<label class="as-fg full">อาการที่แจ้ง *<input name="issue" required value="' + esc(d.issue) + '"></label>'
      + '<label class="as-fg">ความสำคัญ<select name="priority">' + PRIORITY.map(function (p) {
        return '<option' + (d.priority === p.key ? ' selected' : '') + '>' + p.key + '</option>';
      }).join('') + '</select></label>'
      + '<label class="as-fg">สถานะ<select name="status">' + STATUS.map(function (s) {
        return '<option' + (d.status === s.key ? ' selected' : '') + '>' + s.key + '</option>';
      }).join('') + '</select></label>'
      + '<label class="as-fg">วันที่เปิด<input name="open" type="date" value="' + esc(d.open) + '"></label>'
      + '<label class="as-fg">กำหนด SLA<input name="sla" type="date" value="' + esc(d.sla) + '"></label>'
      + '<label class="as-fg full">ขั้นตอนถัดไป<input name="next" value="' + esc(d.next) + '" placeholder="เช่น นัดเข้า 20/11"></label>'
      + '</div></form>';
    global.setModal(t ? 'แก้ไข Ticket' : 'เปิด Ticket ใหม่', t ? t.id : 'แจ้งงานบริการหลังการขาย', body, [
      { label: 'ยกเลิก' },
      { label: t ? 'บันทึก' : 'สร้าง Ticket', icon: 'fa-solid fa-check', action: 'as-save', primary: true }
    ]);
    window.__AS_EDIT__ = id || '';
  }

  function saveForm() {
    var f = document.getElementById('asForm');
    if (!f || !f.reportValidity()) return;
    var id = window.__AS_EDIT__;
    var val = {
      customer: f.customer.value, product: (f.product.value || '').trim(),
      issue: (f.issue.value || '').trim(), priority: f.priority.value,
      tech: f.tech.value, open: f.open.value, sla: f.sla.value,
      status: f.status.value, next: (f.next.value || '').trim()
    };
    if (!val.customer) { global.toast('เลือกลูกค้าก่อน'); return; }
    if (id) {
      var t = byId(id);
      if (t) {
        Object.keys(val).forEach(function (k) { t[k] = val[k]; });
        t.logs = t.logs || [];
        t.logs.push({ at: todayISO(), by: 'ระบบ', text: 'แก้ไขข้อมูล Ticket' });
      }
      global.toast('บันทึก Ticket แล้ว');
      openTicket(id);
    } else {
      val.id = 'T-' + (2400 + TICKETS.length + 1);
      val.logs = [{ at: todayISO(), by: 'ระบบ', text: 'เปิด Ticket ใหม่' }];
      TICKETS.unshift(val);
      global.toast('เปิด Ticket ใหม่แล้ว');
      global.closeModal();
    }
    save();
    global.render();
  }

  function cycleStatus(id) {
    var t = byId(id); if (!t) return;
    var keys = STATUS.map(function (s) { return s.key; });
    var i = keys.indexOf(t.status);
    t.status = keys[(i + 1) % keys.length];
    if (t.status === 'ปิดแล้ว') t.next = '—';
    t.logs = t.logs || [];
    t.logs.push({ at: todayISO(), by: 'ระบบ', text: 'เปลี่ยนสถานะเป็น ' + t.status });
    save();
    openTicket(id);
    global.render();
    global.toast('เปลี่ยนสถานะเป็น ' + t.status);
  }

  function addLog(id) {
    var inp = document.getElementById('asLogText');
    var txt = inp ? String(inp.value || '').trim() : '';
    if (!txt) { global.toast('พิมพ์บันทึกก่อน'); return; }
    var t = byId(id); if (!t) return;
    t.logs = t.logs || [];
    t.logs.push({ at: todayISO(), by: (global.__ME__ && (global.__ME__.name || global.__ME__.email)) || 'ผู้ใช้', text: txt });
    save();
    openTicket(id);
    global.render();
    global.toast('เพิ่มบันทึกแล้ว');
  }

  /* ---------- events ---------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'asSearch') return;
    state.q = e.target.value;
    var tbody = document.querySelector('.as-table tbody');
    if (!tbody) return;
    var list = filtered();
    tbody.innerHTML = list.map(function (t) {
      var sm = stMeta(t.status), pm = prMeta(t.priority), od = isOverdue(t);
      return '<tr class="as-row" data-as-ticket="' + esc(t.id) + '">'
        + '<td><div class="as-nm">' + esc(t.id) + '</div><div class="as-s2">' + thaiDate(t.open) + '</div></td>'
        + '<td><div class="as-nm">' + esc(t.customer) + '</div><div class="as-s2">' + esc(t.product || '') + '</div></td>'
        + '<td>' + esc(t.issue) + '</td>'
        + '<td><span class="as-badge ' + pm.cls + '">' + esc(t.priority) + '</span></td>'
        + '<td>' + esc(t.tech || '-') + '</td>'
        + '<td class="as-num ' + (od ? 'as-red' : '') + '">' + thaiDate(t.sla) + (od ? ' (' + Math.abs(dayDiff(t.sla)) + ' วัน)' : '') + '</td>'
        + '<td><span class="as-badge ' + sm.cls + '">' + esc(t.status) + '</span></td>'
        + '<td class="as-next">' + esc(t.next || '-') + '</td>'
        + '<td class="as-acts"><button class="as-btn sm" data-as-ticket="' + esc(t.id) + '"><i class="fa-solid fa-eye"></i> ดู</button></td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="9" class="as-empty">ไม่พบ Ticket ตามเงื่อนไข</td></tr>';
  });

  document.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('[data-as-filter]');
    if (!sel) return;
    state[sel.getAttribute('data-as-filter')] = sel.value;
    global.render();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('[data-as-new]')) { ticketModal(null); return; }
    if (t.closest('[data-as-reset]')) { state = { q: '', status: '', priority: '', tech: '' }; global.render(); return; }

    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'as-save') { saveForm(); return; }
      if (a === 'as-edit') { ticketModal(window.__AS_OPEN__ || window.__AS_EDIT__); return; }
      if (a === 'as-status') { cycleStatus(window.__AS_OPEN__); return; }
    }

    var addlog = t.closest('[data-as-addlog]');
    if (addlog) { addLog(addlog.getAttribute('data-as-addlog')); return; }

    var row = t.closest('[data-as-ticket]');
    if (row) { openTicket(row.getAttribute('data-as-ticket')); return; }
  });

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('as-style')) return;
    var css = ''
      + '.as{padding-bottom:6px}'
      + '.as-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.as-head h1{margin:0;color:#0F2B46;font-size:21px;font-weight:600}'
      + '.as-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      + '.as-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}'
      + '.as-kpi{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.as-kpi-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10.5px;min-height:26px}'
      + '.as-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;flex:0 0 28px}'
      + '.as-kpi-val{font-size:20px;font-weight:600;margin:8px 0 8px;color:#0F2B46}'
      + '.as-kpi-sub{font-size:10px;color:#667085;line-height:1.5}'
      + '.as-filters{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1.4fr repeat(3,minmax(0,1fr)) auto;gap:10px;'
      + 'background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 18px rgba(15,43,70,.07);margin-bottom:14px}'
      + '.as-fl{display:grid;gap:5px;min-width:0}'
      + '.as-fl label{font-size:10px;color:#667085;font-weight:500}'
      + '.as-fl select{width:100%;min-width:0;border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;padding:7px 8px;'
      + 'font-size:11px;min-height:34px;outline:none;font-family:inherit}'
      + '.as-search{position:relative}'
      + '.as-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#98A2B3;font-size:10px}'
      + '.as-search input{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px 8px 26px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-height:34px}'
      + '.as-fbtn{display:flex;align-items:flex-end}'
      + '.as-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 11px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.as-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.as-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      + '.as-btn.sm{height:auto;padding:5px 9px;font-size:10px}'
      + '.as-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:15px;box-shadow:0 2px 8px rgba(15,43,70,.05);margin-bottom:14px;min-width:0}'
      + '.as-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;flex-wrap:wrap}'
      + '.as-ph h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.as-s2{color:#98A2B3;font-size:9.5px;margin-top:3px;line-height:1.5}'
      + '.as-tablewrap{overflow:auto;width:100%}'
      + '.as-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11.5px}'
      + '.as-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:10px;padding:9px 10px;text-align:left;border-bottom:1px solid #E9EEF5}'
      + '.as-table td{padding:10px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:middle}'
      + '.as-table tbody tr:last-child td{border-bottom:0}'
      + '.as-row{cursor:pointer}.as-row:hover td{background:#F8FBFF}'
      + '.as-num{text-align:right;font-variant-numeric:tabular-nums}'
      + '.as-nm{color:#0F2B46;font-weight:500;font-size:11.5px}'
      + '.as-next{color:#667085;font-size:10.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis}'
      + '.as-acts{text-align:right}'
      + '.as-red{color:#DC2626!important}'
      + '.as-empty{text-align:center;color:#98A2B3;padding:20px}'
      + '.as-badge{display:inline-flex;align-items:center;border-radius:99px;padding:3px 9px;font-size:9.5px;font-weight:500;white-space:nowrap}'
      + '.st-open{background:#FEE2E2;color:#B91C1C}.st-doing{background:#FEF3C7;color:#B45309}'
      + '.st-part{background:#FFEDD5;color:#9A3412}.st-wait{background:#E0F2FE;color:#0369A1}'
      + '.st-done{background:#DCFCE7;color:#15803D}'
      + '.p-crit{background:#FEE2E2;color:#B91C1C}.p-high{background:#FFEDD5;color:#9A3412}'
      + '.p-med{background:#FEF3C7;color:#B45309}.p-low{background:#F1F5F9;color:#475569}'
      + '.as-dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'
      + '.as-dgrid>div{background:#F8FAFC;border-radius:9px;padding:10px}'
      + '.as-dgrid small{display:block;color:#98A2B3;font-size:9px;margin-bottom:4px}'
      + '.as-dgrid strong{color:#0F2B46;font-size:11.5px;font-weight:500}'
      + '.as-issue{margin-top:12px;background:#FFF7ED;border:1px solid #FFEDD5;border-radius:9px;padding:11px 13px}'
      + '.as-issue b{color:#9A3412;font-size:11px}.as-issue p{margin:5px 0 0;color:#7C2D12;font-size:11.5px;line-height:1.7}'
      + '.as-sect{margin:16px 0 9px;font-size:11px;color:#0F2B46}'
      + '.as-logs{display:grid;gap:8px}'
      + '.as-log{background:#F8FAFC;border:1px solid #EEF2F7;border-radius:9px;padding:9px 11px;font-size:11px;color:#344054;line-height:1.6}'
      + '.as-log-d{font-size:9.5px;color:#98A2B3;margin-bottom:3px}'
      + '.as-addlog{display:flex;gap:8px;margin-top:10px}'
      + '.as-addlog input{flex:1;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px;font-size:11px;font-family:inherit;outline:none;min-width:0}'
      + '.as-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
      + '.as-fg{display:grid;gap:5px;font-size:10px;color:#475467;min-width:0}'
      + '.as-fg.full{grid-column:1/-1}'
      + '.as-fg input,.as-fg select{border:1px solid #DCE3EB;border-radius:8px;padding:8px 9px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-width:0;width:100%}'
      + '@media(max-width:1024px){.as-filters{grid-template-columns:1fr 1fr}.as-fbtn{grid-column:1/-1}}'
      + '@media(max-width:760px){.as-filters{position:static;grid-template-columns:1fr}.as-kpis{grid-template-columns:1fr 1fr}'
      + '.as-dgrid{grid-template-columns:1fr 1fr}.as-form{grid-template-columns:1fr}.as-head h1{font-size:18px}}'
      + '@media(max-width:480px){.as-kpis{grid-template-columns:1fr}.as-dgrid{grid-template-columns:1fr}}';
    var el = document.createElement('style');
    el.id = 'as-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  global.AfterSale = {
    render: render,
    tickets: function () { return TICKETS; },
    reset: function () { TICKETS = JSON.parse(JSON.stringify(SEED)); save(); global.render(); }
  };
})(window);
