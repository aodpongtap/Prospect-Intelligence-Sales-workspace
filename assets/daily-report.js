/* ============================================================
   Daily Report — บันทึกการเข้าพบลูกค้า / แผนงานรายวัน
   ใช้ร่วมกับ Reports (SalesReport) เพื่อคิดขอบเขตสิทธิ์ + เพิ่มดีลเข้า Pipeline

   ข้อมูลเก็บใน localStorage: pi_daily_v1
   ============================================================ */
(function (global) {
  'use strict';

  var LS = 'pi_daily_v1';

  var CHANNELS = [
    { code: 'visit',   name: 'เข้าพบ',     short: 'เข้าพบ',    color: '#2563EB', icon: 'fa-solid fa-handshake' },
    { code: 'call',    name: 'โทรศัพท์',   short: 'โทร',       color: '#0EA5E9', icon: 'fa-solid fa-phone' },
    { code: 'email',   name: 'อีเมล',      short: 'อีเมล',     color: '#7C3AED', icon: 'fa-solid fa-envelope' },
    { code: 'line',    name: 'LINE',       short: 'LINE',      color: '#16A34A', icon: 'fa-brands fa-line' },
    { code: 'meeting', name: 'ประชุม',     short: 'ประชุม',    color: '#F59E0B', icon: 'fa-solid fa-users' }
  ];
  function ch(code) {
    for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].code === code) return CHANNELS[i];
    return { code: code, name: code || '-', short: code || '-', color: '#94A3B8', icon: 'fa-solid fa-circle' };
  }

  /* ---------- utilities ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function nowTime() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function num(n) { return Number(n || 0); }
  function money(n) {
    var v = Math.round(num(n));
    return '฿' + v.toLocaleString('th-TH');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_M_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function dstrth(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    if (p.length < 3) return iso;
    return Number(p[2]) + ' ' + TH_M_SHORT[Number(p[1]) - 1] + ' ' + String(Number(p[0]) + 543).slice(-2);
  }
  function dayName(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][d.getDay()];
  }
  function monthOf(iso) { return String(iso || '').slice(0, 7); }

  /* ---------- storage ---------- */
  var ITEMS = load();
  function load() {
    var arr = [];
    try {
      var a = JSON.parse(localStorage.getItem(LS) || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]') arr = a;
    } catch (e) {}
    /* อพยพข้อมูลเก่า: สร้างรหัสอ้างอิงให้รายการที่ยังไม่มี */
    var need = arr.filter(function (x) { return !x.ref; });
    if (need.length) {
      need.sort(function (a, b) { return String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))); });
      need.forEach(function (x) { x.ref = genRef(x.date, arr); });
      try { localStorage.setItem(LS, JSON.stringify(arr)); } catch (e) {}
    }
    return arr;
  }

  /** รหัสอ้างอิง: DR-YYYYMMDD-NN (เรียงลำดับต่อวัน) */
  function genRef(dateIso, list) {
    var src = list || ITEMS;
    var p = 'DR-' + String(dateIso || isoLocal()).replace(/\D/g, '');
    var n = 0;
    src.forEach(function (x) {
      if (x.ref && x.ref.indexOf(p + '-') === 0) {
        var k = parseInt(String(x.ref).slice(p.length + 1), 10) || 0;
        if (k > n) n = k;
      }
    });
    return p + '-' + pad2(n + 1);
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(ITEMS)); } catch (e) {}
  }
  function uid() { return 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- อ้างอิงข้อมูลจาก Reports ---------- */
  function srData() { return (global.SalesReport && global.SalesReport.data) ? global.SalesReport.data() : null; }
  function salesList() { var d = srData(); return (d && d.sales) || []; }
  function saleOf(id) {
    var l = salesList();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return { id: id, name: id || '-', team: '-' };
  }
  function scope() {
    try { if (global.SalesReport && global.SalesReport.scope) return global.SalesReport.scope(); } catch (e) {}
    return { type: 'all' };
  }
  function me() { return global.__ME__ || {}; }
  function mySaleId() {
    var sc = scope();
    if (sc.type === 'sale') return sc.saleId;
    return String(me().saleId || '').toUpperCase();
  }

  /** รายการที่ผู้ใช้มีสิทธิ์เห็น */
  function visible() {
    var sc = scope();
    if (sc.type === 'all') return ITEMS.slice();
    if (sc.type === 'pending') return [];
    if (sc.type === 'team') return ITEMS.filter(function (x) { return saleOf(x.saleId).team === sc.team; });
    if (sc.type === 'sale') {
      return ITEMS.filter(function (x) { return x.saleId === sc.saleId; });
    }
    return [];
  }

  /** นับดีล/โครงการที่อ้างอิงรหัสนี้ (Tracking ต้นสายปลายเหตุ) */
  function linksOf(ref) {
    var deals = [], projects = [];
    try {
      var d = srData();
      if (d && d.deals) deals = d.deals.filter(function (x) { return String(x.drRef || '').toUpperCase() === ref; });
    } catch (e) {}
    try {
      if (global.ProjectTracking && global.ProjectTracking.list) {
        projects = global.ProjectTracking.list().filter(function (p) { return String(p.drRef || '').toUpperCase() === ref; });
      }
    } catch (e) {}
    return { deals: deals, projects: projects };
  }

  function byRef(ref) {
    var r = String(ref || '').trim().toUpperCase();
    if (!r) return null;
    for (var i = 0; i < ITEMS.length; i++) if (String(ITEMS[i].ref || '').toUpperCase() === r) return ITEMS[i];
    return null;
  }

  /** ตัวเลือกสำหรับ dropdown/datalist ในฟอร์มอื่น (ดีล / โครงการ) */
  function options() {
    return visible().slice().sort(function (a, b) {
      return String(b.date + (b.time || '')).localeCompare(String(a.date + (a.time || '')));
    }).map(function (x) {
      return { ref: x.ref, date: x.date, customer: x.customer, channel: x.channel, summary: x.summary || '', value: num(x.value), saleId: x.saleId };
    });
  }
  var state = {
    month: isoLocal().slice(0, 7),
    channel: '',
    sale: '',
    q: '',
    day: ''
  };
  var editing = '';

  /* ---------- คำนวณ ---------- */
  function inMonth(x, ym) { return monthOf(x.date) === ym; }

  function summarize(list) {
    var customers = {}, chCount = {};
    var value = 0, visits = 0, followups = 0;
    list.forEach(function (x) {
      var c = String(x.customer || '').trim().toLowerCase();
      if (c) customers[c] = 1;
      chCount[x.channel] = (chCount[x.channel] || 0) + 1;
      value += num(x.value);
      if (x.channel === 'visit' || x.channel === 'meeting') visits++;
      if (x.nextDate) followups++;
    });
    return {
      count: list.length,
      customers: Object.keys(customers).length,
      value: value,
      visits: visits,
      followups: followups,
      chCount: chCount
    };
  }

  /** ค่าเฉลี่ยลูกค้าต่อวันบันทึก */
  function avgPerDay(list) {
    var days = {}, cust = {};
    list.forEach(function (x) {
      days[x.date] = 1;
      var c = String(x.customer || '').trim().toLowerCase();
      if (c) cust[c] = 1;
    });
    var d = Object.keys(days).length;
    var c = Object.keys(cust).length;
    return { days: d, customers: c, avgCust: d ? c / d : 0, avgAct: d ? list.length / d : 0 };
  }

  /** follow-up ที่ครบกำหนดวันนี้ หรือเลยกำหนด (ยังไม่ปิด) */
  function followups(list) {
    var t = isoLocal();
    var out = [];
    list.forEach(function (x) {
      if (!x.nextDate) return;
      if (x.done) return;
      if (x.nextDate <= t) out.push(x);
    });
    out.sort(function (a, b) { return String(a.nextDate + (a.nextTime || '')).localeCompare(String(b.nextDate + (b.nextTime || ''))); });
    return out;
  }

  /* ---------- UI helpers ---------- */
  function kpi(label, value, sub, color, icon) {
    return '<article class="dr-kpi">'
      + '<div class="dr-kpi-top"><span>' + esc(label) + '</span>'
      + '  <i class="' + esc(icon) + '" style="color:' + color + ';background:' + color + '14"></i></div>'
      + '<div class="dr-kpi-val" style="color:' + color + '">' + value + '</div>'
      + '<div class="dr-kpi-sub">' + sub + '</div></article>';
  }

  function filtersBar() {
    var sc = scope();
    var saleOpts = '<option value="">ทุกคน</option>' + salesList().map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (state.sale === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var chOpts = '<option value="">ทุกช่องทาง</option>' + CHANNELS.map(function (c) {
      return '<option value="' + c.code + '"' + (state.channel === c.code ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var showSale = (sc.type === 'all' || sc.type === 'team' || sc.type === 'pending');
    return '<div class="dr-filters">'
      + '<label class="dr-fl"><span>เดือน</span><input type="month" data-dr-filter="month" value="' + esc(state.month) + '"></label>'
      + '<label class="dr-fl"><span>ช่องทาง</span><select data-dr-filter="channel">' + chOpts + '</select></label>'
      + (showSale ? '<label class="dr-fl"><span>พนักงานขาย</span><select data-dr-filter="sale">' + saleOpts + '</select></label>' : '')
      + '<label class="dr-fl dr-fl-q"><span>ค้นหา</span><input type="search" data-dr-filter="q" placeholder="ลูกค้า / สรุป / นัดครั้งต่อไป" value="' + esc(state.q) + '"></label>'
      + '<button class="dr-btn" data-dr-today><i class="fa-solid fa-calendar-day"></i> วันนี้</button>'
      + '</div>';
  }

  /* ---------- render ---------- */
  function render() {
    injectCss();
    var sc = scope();
    var head = '<div class="dr-head">'
      + '<div><h1>Daily Report</h1>'
      + '  <div class="dr-sub">บันทึกการเข้าพบลูกค้า / แผนงานรายวัน · ใช้ร่วมกับเป้าหมายการขาย</div></div>'
      + '<div class="dr-tools">'
      + '  <button class="dr-btn primary" data-dr-new><i class="fa-solid fa-plus"></i> บันทึกกิจกรรม</button>'
      + '  <button class="dr-btn" data-dr-export><i class="fa-solid fa-file-csv"></i> Export CSV</button>'
      + '</div></div>';

    if (sc.type === 'none' || sc.type === 'nosales') {
      var accName = String(me().name || '').trim() || '(ยังไม่ตั้งชื่อบัญชี)';
      var accTeam = String(me().team || '').toUpperCase();
      var detail;
      if (sc.type === 'nosales') {
        detail = 'ยังไม่มีรายชื่อเซลส์ในระบบ — Admin กรุณาเพิ่มที่ Reports → “รายชื่อเซลส์ (Sale)” ก่อน';
      } else if (sc.teamSales === 0) {
        detail = 'ทีม ' + accTeam + ' ยังไม่มีรายชื่อเซลส์ — ให้เพิ่มที่ Reports → รายชื่อเซลส์ แล้วตั้งชื่อให้ตรงกับ “' + accName + '”';
      } else if (sc.teamSales > 1) {
        detail = 'ทีม ' + accTeam + ' มีรายชื่อเซลส์ ' + sc.teamSales + ' คน — ตั้งชื่อบัญชี (“' + accName + '”) ให้ตรงกับชื่อเซลส์คนใดคนหนึ่ง';
      } else {
        detail = 'ตั้งชื่อบัญชี (“' + accName + '”) ให้ตรงกับชื่อใน Reports → รายชื่อเซลส์ หรือกำหนดทีม (BU) ให้บัญชีนี้';
      }
      return '<div class="dr">' + head
        + '<div class="dr-note"><i class="fa-solid fa-circle-info"></i><div><b>บัญชีนี้ยังไม่ถูกผูกกับข้อมูลเซลส์</b>'
        + '<div class="dr-s2">' + esc(detail) + '</div></div></div></div>';
    }
    if (sc.type === 'pending') {
      return '<div class="dr">' + head + '<div class="dr-note"><i class="fa-solid fa-circle-notch fa-spin"></i>'
        + '<div><b>กำลังตรวจสอบสิทธิ์การเข้าถึงข้อมูล…</b></div></div></div>';
    }

    var all = visible();
    var list = all.filter(function (x) {
      if (state.month && monthOf(x.date) !== state.month) return false;
      if (state.channel && x.channel !== state.channel) return false;
      if (state.sale && x.saleId !== state.sale) return false;
      if (state.q) {
        var t = ((x.ref || '') + ' ' + x.customer + ' ' + (x.summary || '') + ' ' + (x.nextNote || '')).toLowerCase();
        if (t.indexOf(String(state.q).toLowerCase()) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      return String(b.date + (b.time || '')).localeCompare(String(a.date + (a.time || '')));
    });

    var t = isoLocal();
    var todayList = all.filter(function (x) { return x.date === t; });
    var yest = new Date(); yest.setDate(yest.getDate() - 1);
    var yList = all.filter(function (x) { return x.date === isoLocal(yest); });
    var sumToday = summarize(todayList);
    var sumList = summarize(list);
    var avg = avgPerDay(list);
    var fu = followups(all);
    var overdue = fu.filter(function (x) { return x.nextDate < t; }).length;

    var delta = todayList.length - yList.length;
    var deltaTxt = (delta === 0 ? 'เท่าเมื่อวาน' : (delta > 0 ? '▲ +' + delta + ' จากเมื่อวาน' : '▼ ' + delta + ' จากเมื่อวาน'));

    var kpis = ''
      + kpi('กิจกรรมวันนี้', sumToday.count + ' ครั้ง', deltaTxt + ' · ลูกค้า ' + sumToday.customers + ' ราย', '#2563EB', 'fa-solid fa-clipboard-check')
      + kpi('เข้าพบ / ประชุมวันนี้', sumToday.visits + ' ราย', 'นับเฉพาะช่องทางเข้าพบและประชุม', '#0EA5E9', 'fa-solid fa-handshake')
      + kpi('มูลค่าโครงการวันนี้', money(sumToday.value), 'ใช้เป็นข้อมูลตั้ง Pipeline / Target', '#16A34A', 'fa-solid fa-sack-dollar')
      + kpi('Follow-up ถึงกำหนด', fu.length + ' รายการ', overdue ? '<span class="dr-warn">เลยกำหนด ' + overdue + ' รายการ</span>' : 'ไม่มีรายการเลยกำหนด', overdue ? '#DC2626' : '#7C3AED', 'fa-solid fa-bell');

    var totalBar = '<div class="dr-total">'
      + '<div><small>ลูกค้าที่ติดต่อทั้งหมด (ช่วงที่เลือก)</small><b>' + sumList.customers + ' ราย</b></div>'
      + '<div><small>กิจกรรมรวม</small><b>' + sumList.count + ' ครั้ง</b></div>'
      + '<div><small>เฉลี่ย/วัน (ที่มีการบันทึก)</small><b>' + (Math.round(avg.avgCust * 10) / 10) + ' ราย/วัน</b></div>'
      + '<div><small>วันที่มีการบันทึก</small><b>' + avg.days + ' วัน</b></div>'
      + '<div><small>มูลค่าโครงการรวม</small><b>' + money(sumList.value) + '</b></div>'
      + '</div>';

    /* ตารางรายการ */
    var rows = list.map(function (x) {
      var c = ch(x.channel);
      var late = x.nextDate && x.nextDate < t && !x.done;
      var lk = linksOf(x.ref || '');
      var links = (lk.deals.length || lk.projects.length)
        ? '<div class="dr-links">'
          + (lk.deals.length ? '<span class="dr-lk"><i class="fa-solid fa-file-invoice-dollar"></i> ดีล ' + lk.deals.length + '</span>' : '')
          + (lk.projects.length ? '<span class="dr-lk proj"><i class="fa-solid fa-diagram-project"></i> โครงการ ' + lk.projects.length + '</span>' : '')
          + '</div>'
        : '';
      return '<tr data-dr-row="' + esc(x.id) + '">'
        + '<td class="dr-num"><b>' + dstrth(x.date) + '</b><div class="dr-s2">' + esc(dayName(x.date)) + ' ' + esc(x.time || '') + '</div></td>'
        + '<td><div class="dr-cust">' + esc(x.customer) + '</div>'
        + (x.ref ? '<button class="dr-ref" data-dr-copy="' + esc(x.ref) + '" title="คลิกเพื่อคัดลอกรหัสอ้างอิง">' + esc(x.ref) + '</button>' : '')
        + links
        + (x.value ? '<div class="dr-s2">มูลค่า ' + money(x.value) + '</div>' : '') + '</td>'
        + '<td><span class="dr-chip" style="color:' + c.color + ';background:' + c.color + '14">'
        + '<i class="' + c.icon + '"></i> ' + esc(c.name) + '</span></td>'
        + '<td class="dr-sum">' + (x.summary ? esc(x.summary) : '<span class="dr-dim">—</span>') + '</td>'
        + '<td>' + (x.nextDate
          ? '<span class="' + (late ? 'dr-fu late' : 'dr-fu') + '"><i class="fa-regular fa-clock"></i> ' + dstrth(x.nextDate) + ' ' + esc(x.nextTime || '') + '</span>'
            + (x.nextNote ? '<div class="dr-s2">' + esc(x.nextNote) + '</div>' : '')
          : '<span class="dr-dim">—</span>') + '</td>'
        + '<td>' + esc(saleOf(x.saleId).name) + '</td>'
        + '<td class="dr-act"><button class="dr-ibtn" data-dr-edit="' + esc(x.id) + '" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>'
        + '<button class="dr-ibtn danger" data-dr-del="' + esc(x.id) + '" title="ลบ"><i class="fa-solid fa-trash"></i></button></td>'
        + '</tr>';
    }).join('');

    var table = '<section class="dr-panel">'
      + '<div class="dr-ph"><div><h3>รายการบันทึก (' + list.length + ')</h3>'
      + '  <div class="dr-s2">เรียงจากใหม่ → เก่า · คลิกปุ่มดินสอเพื่อแก้ไข</div></div></div>'
      + '<div class="dr-tablewrap"><table class="dr-table"><thead><tr>'
      + '<th style="width:96px">วันที่ / เวลา</th><th style="width:170px">ลูกค้า</th><th style="width:104px">ช่องทาง</th>'
      + '<th>สรุป / ผลการ</th><th style="width:150px">นัดครั้งต่อไป</th><th style="width:110px">ผู้รับผิดชอบ</th><th style="width:64px"></th>'
      + '</tr></thead><tbody>'
      + (rows || '<tr><td colspan="7" class="dr-empty">ยังไม่มีบันทึกในเดือนนี้ — กด “บันทึกกิจกรรม” เพื่อเริ่ม</td></tr>')
      + '</tbody></table></div></section>';

    /* สรุปตามเซลส์ (หัวหน้า/admin) */
    var perSale = '';
    if (sc.type === 'all' || sc.type === 'team') {
      var group = {};
      list.forEach(function (x) {
        var k = x.saleId || '-';
        if (!group[k]) group[k] = [];
        group[k].push(x);
      });
      var gRows = Object.keys(group).map(function (k) {
        var g = summarize(group[k]);
        return '<tr><td><b>' + esc(saleOf(k).name) + '</b><div class="dr-s2">' + esc(saleOf(k).team) + '</div></td>'
          + '<td class="dr-num">' + g.count + '</td>'
          + '<td class="dr-num">' + g.customers + '</td>'
          + '<td class="dr-num">' + g.visits + '</td>'
          + '<td class="dr-num">' + money(g.value) + '</td></tr>';
      }).join('');
      if (gRows) {
        perSale = '<section class="dr-panel">'
          + '<div class="dr-ph"><div><h3>สรุปรายพนักงานขาย</h3>'
          + '<div class="dr-s2">' + esc(state.month) + ' · จำนวนกิจกรรม / ลูกค้า / เข้าพบ / มูลค่าโครงการ</div></div></div>'
          + '<div class="dr-tablewrap"><table class="dr-table"><thead><tr>'
          + '<th>พนักงานขาย</th><th class="dr-num">กิจกรรม</th><th class="dr-num">ลูกค้า</th>'
          + '<th class="dr-num">เข้าพบ/ประชุม</th><th class="dr-num">มูลค่าโครงการ</th>'
          + '</tr></thead><tbody>' + gRows + '</tbody></table></div></section>';
      }
    }

    var charts = '<div class="dr-charts">'
      + '<section class="dr-panel"><div class="dr-ph"><div><h3>เทรนด์รายเดือน (ปี ' + (Number(String(state.month).slice(0, 4)) + 543) + ')</h3>'
      + '  <div class="dr-s2">จำนวนกิจกรรมและลูกค้าที่ติดต่อในแต่ละเดือน</div></div></div>'
      + '  <div class="dr-chartbox"><canvas id="drTrend"></canvas></div></section>'
      + '<section class="dr-panel"><div class="dr-ph"><h3>ช่องทางที่ใช้</h3></div>'
      + '  <div class="dr-chartbox"><canvas id="drChannel"></canvas></div></section>'
      + '</div>';

    setTimeout(draw, 30);
    return '<div class="dr">' + head + filtersBar() + '<div class="dr-kpis">' + kpis + '</div>'
      + '<div class="dr-day">' + totalBar + '</div>'
      + charts + perSale + table + '</div>';
  }

  /* ---------- charts ---------- */
  var charts = [];
  function destroyCharts() {
    charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    charts = [];
  }
  function draw() {
    destroyCharts();
    if (!global.Chart) return;
    global.Chart.defaults.font.family = 'Prompt, sans-serif';
    global.Chart.defaults.font.size = 10;
    global.Chart.defaults.color = '#64748B';

    var y = Number(String(state.month).slice(0, 4)) || new Date().getFullYear();
    var all = visible();
    var counts = [], custs = [];
    for (var m = 1; m <= 12; m++) {
      var ym = y + '-' + pad2(m);
      var lm = all.filter(function (x) { return monthOf(x.date) === ym; });
      var s = summarize(lm);
      counts.push(s.count);
      custs.push(s.customers);
    }
    var el1 = document.getElementById('drTrend');
    if (el1) {
      charts.push(new global.Chart(el1, {
        type: 'bar',
        data: {
          labels: TH_M_SHORT,
          datasets: [
            { label: 'กิจกรรม', data: counts, backgroundColor: '#2563EB', borderRadius: 4, maxBarThickness: 26 },
            { label: 'ลูกค้า', data: custs, backgroundColor: '#93C5FD', borderRadius: 4, maxBarThickness: 26 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EFF3F8' } } }
        }
      }));
    }

    var el2 = document.getElementById('drChannel');
    if (el2) {
      var list = all.filter(function (x) { return monthOf(x.date) === state.month; });
      var vals = CHANNELS.map(function (c) { return list.filter(function (x) { return x.channel === c.code; }).length; });
      if (!vals.reduce(function (a, b) { return a + b; }, 0)) { vals = [1]; }
      charts.push(new global.Chart(el2, {
        type: 'doughnut',
        data: {
          labels: CHANNELS.map(function (c) { return c.name; }),
          datasets: [{ data: vals, backgroundColor: CHANNELS.map(function (c) { return c.color; }), borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '58%',
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } } }
        }
      }));
    }
  }

  /* ---------- form ---------- */
  function openForm(id) {
    if (typeof global.setModal !== 'function') return;
    editing = id || '';
    var cur = {};
    if (editing) {
      for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === editing) cur = ITEMS[i];
    }
    var chOpts = CHANNELS.map(function (c) {
      return '<option value="' + c.code + '"' + ((cur.channel || 'visit') === c.code ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var mine = mySaleId();
    var saleSel = '';
    if (mine) {
      saleSel = '<input type="hidden" name="saleId" value="' + esc(mine) + '">'
        + '<div class="dr-fixed">' + esc(saleOf(mine).name) + ' <span class="dr-s2">(' + esc(saleOf(mine).team) + ')</span></div>';
    } else {
      saleSel = '<select name="saleId">' + salesList().map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (cur.saleId === s.id ? ' selected' : '') + '>' + esc(s.team) + ' · ' + esc(s.name) + '</option>';
      }).join('') + '</select>';
    }
    if (!mine && !salesList().length) {
      if (global.toast) global.toast('ยังไม่มีรายชื่อเซลส์ — เพิ่มที่ Reports → รายชื่อเซลส์ ก่อน');
      return;
    }

    var body = '<form id="drForm"><div class="dr-form">'
      + '<label class="dr-f"><span>วันที่ *</span><input type="date" name="date" required value="' + esc(cur.date || isoLocal()) + '"></label>'
      + '<label class="dr-f"><span>เวลา</span><input type="time" name="time" value="' + esc(cur.time || nowTime()) + '"></label>'
      + '<label class="dr-f full"><span>ชื่อลูกค้า *</span><input type="text" name="customer" required placeholder="เช่น บริษัท สยามคลีน เซอร์วิส จำกัด" value="' + esc(cur.customer || '') + '"></label>'
      + '<label class="dr-f"><span>รูปแบบการติดต่อ *</span><select name="channel">' + chOpts + '</select></label>'
      + '<label class="dr-f"><span>มูลค่าโครงการ (บาท)</span><input type="number" name="value" min="0" step="1000" placeholder="0" value="' + (cur.value ? num(cur.value) : '') + '"></label>'
      + '<label class="dr-f full"><span>สรุป / ผลการดำเนินการ</span><textarea name="summary" rows="3" placeholder="สรุปสิ่งที่คุย ผลลัพธ์ หรือขั้นตอนถัดไป">' + esc(cur.summary || '') + '</textarea></label>'
      + '<label class="dr-f"><span>นัดครั้งต่อไป — วันที่</span><input type="date" name="nextDate" value="' + esc(cur.nextDate || '') + '"></label>'
      + '<label class="dr-f"><span>นัดครั้งต่อไป — เวลา</span><input type="time" name="nextTime" value="' + esc(cur.nextTime || '') + '"></label>'
      + '<label class="dr-f full"><span>เรื่องที่นัด / สิ่งที่ต้องทำต่อ</span><input type="text" name="nextNote" placeholder="เช่น ส่งใบเสนอราคา, นัดเข้าพบผู้บริหาร" value="' + esc(cur.nextNote || '') + '"></label>'
      + '<label class="dr-f full"><span>ผู้รับผิดชอบ (Sale)</span>' + saleSel + '</label>'
      + (editing ? '' : '<label class="dr-f full dr-check"><input type="checkbox" name="toPipeline" value="1"> <span>เพิ่มมูลค่าโครงการนี้เข้า Pipeline ใน Reports (สถานะ Pipeline) เพื่อใช้คิด Target</span></label>')
      + '</div></form>';

    global.setModal(editing ? 'แก้ไขบันทึกกิจกรรม' : 'บันทึกการเข้าพบลูกค้า',
      editing ? 'แก้ไขข้อมูลแล้วกดบันทึก' : 'กรอกข้อมูลการเข้าพบ/แผนงานรายวัน',
      body,
      [{ label: 'ยกเลิก' }, { label: editing ? 'บันทึกการแก้ไข' : 'บันทึก', icon: 'fa-solid fa-check', action: 'dr-save', primary: true }],
      true);
  }

  function saveForm() {
    var f = document.getElementById('drForm');
    if (!f || !f.reportValidity()) return;
    var o = {
      date: f.date.value,
      time: f.time.value,
      customer: String(f.customer.value || '').trim(),
      channel: f.channel.value,
      value: num(f.value.value),
      summary: String(f.summary.value || '').trim(),
      nextDate: f.nextDate.value,
      nextTime: f.nextTime.value,
      nextNote: String(f.nextNote.value || '').trim(),
      saleId: String((f.saleId && f.saleId.value) || mySaleId() || ''),
      by: String(me().email || '')
    };
    if (!o.customer) { if (global.toast) global.toast('กรอกชื่อลูกค้าก่อน'); return; }

    if (editing) {
      for (var i = 0; i < ITEMS.length; i++) {
        if (ITEMS[i].id === editing) {
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ITEMS[i][k] = o[k];
          ITEMS[i].updatedAt = new Date().toISOString();
        }
      }
      if (global.PILog) global.PILog.add('daily.edit', o.customer, dstrth(o.date) + ' · ' + ch(o.channel).name);
    } else {
      var rec = o;
      rec.id = uid();
      rec.ref = genRef(o.date);
      rec.createdAt = new Date().toISOString();
      ITEMS.push(rec);
      if (global.PILog) global.PILog.add('daily.add', o.customer, rec.ref + ' · ' + dstrth(o.date) + ' ' + o.time + ' · ' + ch(o.channel).name + (o.value ? ' · ' + money(o.value) : ''));
      /* เพิ่มเข้า Pipeline ของ Reports */
      if (f.toPipeline && f.toPipeline.checked && o.value > 0 && global.SalesReport && global.SalesReport.addDeal) {
        try {
          var ym = String(o.date).split('-');
          global.SalesReport.addDeal({
            job: 'พบลูกค้า: ' + o.customer,
            customer: o.customer,
            saleId: o.saleId,
            amount: o.value,
            status: 1,
            prob: 40,
            product: 'P1',
            payment: 'cash',
            year: Number(ym[0]),
            month: Number(ym[1]),
            quoteDate: o.date,
            note: 'สร้างจาก Daily Report · ' + (o.summary || '')
          });
        } catch (e) {}
      }
    }
    save();
    editing = '';
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('บันทึกกิจกรรมแล้ว');
  }

  function delRecord(id) {
    var rec = null;
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) rec = ITEMS[i];
    if (!rec) return;
    if (!global.confirm('ลบบันทึกของ "' + rec.customer + '" (' + dstrth(rec.date) + ') ?')) return;
    ITEMS = ITEMS.filter(function (x) { return x.id !== id; });
    save();
    if (global.PILog) global.PILog.add('daily.del', rec.customer, dstrth(rec.date));
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('ลบบันทึกแล้ว');
  }

  function exportCsv() {
    var list = visible().filter(function (x) {
      if (state.month && monthOf(x.date) !== state.month) return false;
      if (state.channel && x.channel !== state.channel) return false;
      if (state.sale && x.saleId !== state.sale) return false;
      return true;
    }).sort(function (a, b) { return String(b.date + (b.time || '')).localeCompare(String(a.date + (a.time || ''))); });
    var head = ['รหัสอ้างอิง', 'วันที่', 'เวลา', 'ลูกค้า', 'ช่องทาง', 'สรุป/ผลการ', 'นัดครั้งต่อไป', 'เวลานัด', 'เรื่องที่นัด', 'มูลค่าโครงการ', 'ผู้รับผิดชอบ', 'ทีม'];
    var rows = [head].concat(list.map(function (x) {
      return [x.ref || '', x.date, x.time || '', x.customer, ch(x.channel).name, x.summary || '', x.nextDate || '', x.nextTime || '', x.nextNote || '',
        num(x.value), saleOf(x.saleId).name, saleOf(x.saleId).team];
    }));
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'daily-report-' + (state.month || 'all') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    if (global.PILog) global.PILog.add('export', 'Daily Report (.csv)', list.length + ' รายการ');
    if (global.toast) global.toast('Export CSV แล้ว (' + list.length + ' รายการ)');
  }

  /* ---------- events ---------- */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var f = t.closest('[data-dr-filter]');
    if (!f) return;
    state[f.getAttribute('data-dr-filter')] = f.value;
    if (typeof global.render === 'function') global.render();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var f = t.closest('[data-dr-filter="q"]');
    if (!f) return;
    state.q = f.value;
    var box = document.querySelector('.dr-tablewrap');
    if (!box) { if (typeof global.render === 'function') global.render(); return; }
    clearTimeout(window.__drT);
    window.__drT = setTimeout(function () {
      if (typeof global.render === 'function') global.render();
      var inp = document.querySelector('[data-dr-filter="q"]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 350);
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-dr-new]')) { openForm(''); return; }
    var ed = t.closest('[data-dr-edit]');
    if (ed) { openForm(ed.getAttribute('data-dr-edit')); return; }
    var dl = t.closest('[data-dr-del]');
    if (dl) { delRecord(dl.getAttribute('data-dr-del')); return; }
    if (t.closest('[data-dr-export]')) { exportCsv(); return; }
    var cp = t.closest('[data-dr-copy]');
    if (cp) {
      var code = cp.getAttribute('data-dr-copy');
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
      } catch (e) {}
      if (global.toast) global.toast('คัดลอกรหัสอ้างอิง ' + code + ' แล้ว');
      return;
    }
    if (t.closest('[data-dr-today]')) {
      state.month = isoLocal().slice(0, 7);
      state.channel = ''; state.sale = ''; state.q = '';
      if (typeof global.render === 'function') global.render();
      return;
    }
    var act = t.closest('[data-action]');
    if (act && act.getAttribute('data-action') === 'dr-save') { saveForm(); return; }
  });

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('drCss')) return;
    var css = ''
      + '.dr{display:flex;flex-direction:column;gap:14px}'
      + '.dr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}'
      + '.dr-head h1{margin:0;font-size:19px;font-weight:600;color:#0F2B46}'
      + '.dr-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      + '.dr-tools{display:flex;gap:8px;flex-wrap:wrap}'
      + '.dr-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:9px;padding:8px 12px;font:inherit;font-size:11.5px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}'
      + '.dr-btn:hover{border-color:#C7D7EE;background:#F8FBFF}'
      + '.dr-btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}'
      + '.dr-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(15,43,70,.05)}'
      + '.dr-fl{display:flex;flex-direction:column;gap:4px;font-size:9.5px;color:#667085;min-width:0}'
      + '.dr-fl input,.dr-fl select{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:7px 9px;font:inherit;font-size:11px;color:#0F2B46;background:#fff;outline:none;min-height:32px}'
      + '.dr-filters .dr-btn{align-self:end;justify-content:center;min-height:32px}'
      + '.dr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}'
      + '.dr-kpi{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:13px;box-shadow:0 2px 8px rgba(15,43,70,.05)}'
      + '.dr-kpi-top{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#667085;gap:8px}'
      + '.dr-kpi-top i{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:11px}'
      + '.dr-kpi-val{font-size:19px;font-weight:600;margin:8px 0 5px;font-variant-numeric:tabular-nums}'
      + '.dr-kpi-sub{font-size:9.5px;color:#98A2B3;line-height:1.5}'
      + '.dr-warn{color:#DC2626;font-weight:600}'
      + '.dr-total{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;background:#0F2B46;border-radius:12px;padding:13px 15px;color:#fff}'
      + '.dr-total small{display:block;font-size:9.5px;color:#9CB0C5;margin-bottom:3px}'
      + '.dr-total b{font-size:14px;font-variant-numeric:tabular-nums}'
      + '.dr-charts{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}'
      + '.dr-chartbox{height:210px;position:relative}'
      + '.dr-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05)}'
      + '.dr-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}'
      + '.dr-ph h3{margin:0;font-size:12.5px;font-weight:600;color:#0F2B46}'
      + '.dr-s2{font-size:9.5px;color:#98A2B3;margin-top:2px;line-height:1.45}'
      + '.dr-tablewrap{overflow:auto;width:100%}'
      + '.dr-table{width:100%;border-collapse:collapse;font-size:11px}'
      + '.dr-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:9.5px;padding:9px 10px;text-align:left;border-bottom:1px solid #E9EEF5;white-space:nowrap}'
      + '.dr-table td{padding:9px 10px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:top}'
      + '.dr-table tbody tr:hover td{background:#F8FBFF}'
      + '.dr-table tbody tr:last-child td{border-bottom:0}'
      + '.dr-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '.dr-cust{color:#0F2B46;font-weight:600}'
      + '.dr-ref{display:inline-block;margin-top:3px;border:1px dashed #CBD5E1;background:#F8FAFC;color:#475467;border-radius:6px;padding:1px 6px;font-size:9px;font-family:ui-monospace,Menlo,Consolas,monospace;cursor:copy}'
      + '.dr-ref:hover{border-color:#93C5FD;color:#1D4ED8;background:#EFF6FF}'
      + '.dr-links{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}'
      + '.dr-lk{display:inline-flex;align-items:center;gap:4px;background:#F0FDF4;color:#15803D;border:1px solid #DCFCE7;border-radius:99px;padding:1px 7px;font-size:8.5px}'
      + '.dr-lk.proj{background:#EEF2FF;color:#3730A3;border-color:#E0E7FF}'
      + '.dr-sum{max-width:340px;line-height:1.55;color:#475467}'
      + '.dr-chip{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:3px 9px;font-size:9.5px;white-space:nowrap}'
      + '.dr-fu{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#2563EB;background:#EFF6FF;border-radius:7px;padding:2px 7px;white-space:nowrap}'
      + '.dr-fu.late{color:#B91C1C;background:#FEF2F2}'
      + '.dr-dim{color:#C2CBD8}'
      + '.dr-act{white-space:nowrap;text-align:right}'
      + '.dr-ibtn{border:1px solid #E5EAF0;background:#fff;color:#475467;border-radius:7px;width:26px;height:26px;display:inline-grid;place-items:center;cursor:pointer;font-size:10px;margin-left:3px}'
      + '.dr-ibtn:hover{border-color:#C7D7EE;color:#2563EB}'
      + '.dr-ibtn.danger:hover{border-color:#FECDD3;color:#DC2626;background:#FFF1F2}'
      + '.dr-empty{text-align:center;color:#98A2B3;padding:22px}'
      + '.dr-note{display:flex;gap:10px;align-items:flex-start;background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:13px;color:#92400E;font-size:11.5px}'
      + '.dr-note b{display:block;margin-bottom:3px}'
      + '.dr-form{display:grid;grid-template-columns:1fr 1fr;gap:11px}'
      + '.dr-f{display:flex;flex-direction:column;gap:5px;font-size:10px;color:#475467;min-width:0}'
      + '.dr-f.full{grid-column:1 / -1}'
      + '.dr-f input,.dr-f select,.dr-f textarea{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px;font:inherit;font-size:12px;color:#0F2B46;background:#fff;outline:none}'
      + '.dr-f textarea{resize:vertical;line-height:1.6}'
      + '.dr-fixed{padding:8px 10px;border:1px solid #E9EEF5;background:#F8FAFC;border-radius:8px;font-size:12px;color:#0F2B46}'
      + '.dr-check{flex-direction:row;align-items:center;gap:8px;background:#F8FAFC;border:1px solid #E9EEF5;border-radius:9px;padding:9px 11px}'
      + '.dr-check input{width:auto}'
      + '.dr-check span{font-size:10.5px;color:#475467;line-height:1.5}'
      + '@media(max-width:900px){.dr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.dr-charts{grid-template-columns:1fr}}'
      + '@media(max-width:600px){.dr-filters{grid-template-columns:1fr}.dr-form{grid-template-columns:1fr}.dr-sum{max-width:none}}';
    var st = document.createElement('style');
    st.id = 'drCss';
    st.textContent = css;
    document.head.appendChild(st);
  }

  global.DailyReport = {
    render: render,
    draw: draw,
    items: function () { return ITEMS; },
    list: visible,
    options: options,
    byRef: byRef,
    channels: CHANNELS
  };
})(window);
