/* ============================================================
   Project Tracking — End-to-End Project Visibility (ใช้งานได้จริง)
   - CRUD โครงการ + งานย่อย (Task)
   - Kanban ลากเปลี่ยนสถานะได้ + บันทึกลง localStorage
   - คำนวณ Progress / สุขภาพโครงการอัตโนมัติ
   - Modal รายละเอียด + Timeline
   ============================================================ */
(function (global) {
  'use strict';

  var LS = 'pi_projects_v2';

  /* ---------- Stages ---------- */
  var STAGES = [
    { code: 0, key: 'handover', name: 'รับช่วงงาน', short: 'Handover', color: '#64748B' },
    { code: 1, key: 'planning', name: 'วางแผน', short: 'Planning', color: '#2563EB' },
    { code: 2, key: 'install', name: 'ติดตั้ง', short: 'Installation', color: '#0EA5E9' },
    { code: 3, key: 'testing', name: 'ทดสอบ & ส่งมอบ', short: 'Testing', color: '#F59E0B' },
    { code: 4, key: 'done', name: 'ส่งมอบแล้ว', short: 'Delivered', color: '#16A34A' }
  ];
  function stageOf(code) { return STAGES[code] || STAGES[0]; }

  var TASK_STATUS = ['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จแล้ว'];
  var TEAM_LIST = ['BU-DLAG', 'BU-SML'];

  var HEALTH = {
    'on-time': { label: 'ตามแผน', cls: 'ok' },
    'at-risk': { label: 'เสี่ยงล่าช้า', cls: 'warn' },
    'delayed': { label: 'ล่าช้า', cls: 'bad' },
    'done': { label: 'ส่งมอบแล้ว', cls: 'done' }
  };

  /* ---------- Helpers ---------- */
  function num(n) { return Number(n || 0); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function parseDate(d) { return d ? new Date(String(d).slice(0, 10) + 'T00:00:00') : null; }
  function dayDiff(d) {
    var t = parseDate(d); if (!t) return 0;
    var now = parseDate(todayISO());
    return Math.round((t - now) / 86400000);
  }
  function thaiDate(d) {
    var t = parseDate(d); if (!t || isNaN(t.getTime())) return '—';
    return t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }
  function uid(p) { return (p || 'P') + '-' + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3); }

  /* ---------- Store ---------- */
  var SEED = [
    {
      id: 'PJ-001', team: 'BU-SML', name: 'ระบบ CCTV', customer: 'บริษัท ABC จำกัด', owner: 'วรพล', sale: 'กิตติพงษ์',
      stage: 2, deadline: '2026-11-25', startDate: '2026-10-10', blocker: 'รออุปกรณ์กล้อง 2 ตัว',
      note: 'ติดตั้งกล้อง 24 จุด อาคาร 3 ชั้น ลูกค้าใช้ระบบเดิมอยู่ ต้องย้ายข้อมูลย้อนหลัง 30 วัน',
      tasks: [
        { id: 'T1', name: 'สำรวจพื้นที่ติดตั้ง', owner: 'วรพล', due: '2026-10-15', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'ติดตั้งกล้องชั้น 1-3', owner: 'ทีม Installation', due: '2026-11-20', status: 'กำลังดำเนินการ' },
        { id: 'T3', name: 'ทดสอบระบบและส่งมอบ', owner: 'ทีม Service', due: '2026-11-25', status: 'รอดำเนินการ' }
      ]
    },
    {
      id: 'PJ-002', team: 'BU-DLAG', name: 'ระบบ Network', customer: 'บริษัท XYZ จำกัด', owner: 'ณัฐชา', sale: 'พิมพ์ชนก',
      stage: 1, deadline: '2026-12-05', startDate: '2026-11-01', blocker: 'รออนุมัติแบบ',
      note: 'วางโครงข่าย 2 อาคาร ต้องประสานงานผู้รับเหมาก่อสร้างเรื่องท่อเดินสาย',
      tasks: [
        { id: 'T1', name: 'รับ Requirement จาก AE', owner: 'ณัฐชา', due: '2026-11-05', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'อนุมัติแบบ Network', owner: 'ลูกค้า / AE', due: '2026-11-28', status: 'รอดำเนินการ' },
        { id: 'T3', name: 'สั่งซื้อ Switch', owner: 'ฝ่ายจัดซื้อ', due: '2026-12-01', status: 'รอดำเนินการ' }
      ]
    },
    {
      id: 'PJ-003', team: 'BU-DLAG', name: 'ระบบ Access Control', customer: 'บริษัท DEF จำกัด', owner: 'ปกรณ์', sale: 'ธนกร',
      stage: 3, deadline: '2026-11-21', startDate: '2026-10-05', blocker: 'ไม่มี',
      note: 'ติดตั้งเครื่องสแกนนิ้ว 8 จุด + อบรมผู้ดูแลระบบ 2 ท่าน',
      tasks: [
        { id: 'T1', name: 'ติดตั้งอุปกรณ์', owner: 'ทีม Installation', due: '2026-11-10', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'ทดสอบและอบรมผู้ใช้', owner: 'ปกรณ์', due: '2026-11-20', status: 'กำลังดำเนินการ' }
      ]
    },
    {
      id: 'PJ-004', team: 'BU-SML', name: 'Cloud Migration', customer: 'Metro Logistics', owner: 'ชลธิชา', sale: 'อรทัย',
      stage: 1, deadline: '2026-11-15', startDate: '2026-10-01', blocker: 'รอข้อมูลจากฝ่ายบัญชี',
      note: 'ย้ายระบบ ERP ขึ้น Cloud ต้องหยุดระบบนอกเวลาทำการเท่านั้น',
      tasks: [
        { id: 'T1', name: 'Kick-off Project', owner: 'ชลธิชา', due: '2026-10-08', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'Migrate ฐานข้อมูล', owner: 'ทีม Cloud', due: '2026-11-12', status: 'กำลังดำเนินการ' },
        { id: 'T3', name: 'ตรวจรับระบบ', owner: 'ลูกค้า', due: '2026-11-18', status: 'รอดำเนินการ' }
      ]
    },
    {
      id: 'PJ-005', team: 'BU-SML', name: 'Data Center Expansion', customer: 'Northstar จำกัด', owner: 'วรพล', sale: 'กิตติพงษ์',
      stage: 4, deadline: '2026-11-10', startDate: '2026-09-15', blocker: 'ไม่มี',
      note: 'ขยาย Rack 6 ตู้ พร้อมระบบดับเพลิง ส่งมอบและเซ็นรับงานเรียบร้อย',
      tasks: [
        { id: 'T1', name: 'ติดตั้งและทดสอบระบบ', owner: 'ทีม Installation', due: '2026-11-05', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'ส่งมอบและเซ็นรับงาน', owner: 'วรพล', due: '2026-11-10', status: 'เสร็จแล้ว' }
      ]
    },
    {
      id: 'PJ-006', team: 'BU-DLAG', name: 'Wi-Fi 6 Campus', customer: 'มหาวิทยาลัยนวัตกรรม', owner: 'ธนกร', sale: 'ธนกร',
      stage: 0, deadline: '2026-12-20', startDate: '2026-11-18', blocker: 'รอเซ็นสัญญา',
      note: 'รอลูกค้าเซ็นสัญญาและออก PO ก่อนเริ่มติดตั้ง',
      tasks: [
        { id: 'T1', name: 'รับช่วงงานจาก AE', owner: 'ธนกร', due: '2026-11-22', status: 'รอดำเนินการ' }
      ]
    },
    {
      id: 'PJ-007', team: 'BU-SML', name: 'ตู้กดน้ำ 12 จุด', customer: 'ไทยวัฒนา ฟู้ดส์', owner: 'สมชาย', sale: 'กิตติพงษ์',
      stage: 2, deadline: '2026-11-28', startDate: '2026-11-01', blocker: 'รอระบบไฟฟ้าหน้างาน',
      note: 'ต้องเดินสายไฟเพิ่ม 3 จุด ฝ่ายอาคารจะดำเนินการให้เสร็จภายใน 22/11/2569',
      tasks: [
        { id: 'T1', name: 'ตรวจพื้นที่และจุดติดตั้ง', owner: 'สมชาย', due: '2026-11-06', status: 'เสร็จแล้ว' },
        { id: 'T2', name: 'ติดตั้งตู้ 12 จุด', owner: 'ทีม Installation', due: '2026-11-26', status: 'กำลังดำเนินการ' },
        { id: 'T3', name: 'ทดสอบแรงดันน้ำ', owner: 'ทีม Service', due: '2026-11-27', status: 'รอดำเนินการ' }
      ]
    },
    {
      id: 'PJ-008', team: 'BU-SML', name: 'ตู้กดน้ำ + น้ำแข็ง', customer: 'โรงแรม บลูเวฟ', owner: 'อรทัย', sale: 'อรทัย',
      stage: 3, deadline: '2026-12-02', startDate: '2026-11-05', blocker: 'ไม่มี',
      note: 'ติดตั้ง 4 จุด โซนล็อบบี้และห้องอาหาร ต้องเก็บงานให้เรียบร้อยก่อนเปิดโรงแรม',
      tasks: [
        { id: 'T1', name: 'ติดตั้งตู้ 4 จุด', owner: 'ทีม Installation', due: '2026-11-24', status: 'กำลังดำเนินการ' },
        { id: 'T2', name: 'ทดสอบคุณภาพน้ำ', owner: 'ทีม Service', due: '2026-11-30', status: 'รอดำเนินการ' }
      ]
    }
  ];

  var PROJECTS = load();
  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (raw !== null) {
        var a = JSON.parse(raw);
        /* เคารพค่าที่บันทึกไว้ แม้จะเป็นลิสต์ว่าง (ผู้ใช้ล้างข้อมูลเอง) */
        if (Object.prototype.toString.call(a) === '[object Array]') return a;
      }
    } catch (e) {}
    return [];   /* เริ่มต้นว่าง — ให้ผู้ใช้คีย์โครงการเอง */
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(PROJECTS)); } catch (e) {
      if (global.toast) global.toast('บันทึกไม่สำเร็จ (storage เต็ม)');
    }
  }
  function byId(id) {
    for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i];
    return null;
  }

  /* ---------- Cloud sync (Google Sheet: แท็บ Projects) ---------- */
  var __syncing = false, __syncedAt = 0, __pushT = null;
  function cloudOn() {
    return !!(global.PIAuth && global.PIAuth.listProjects && global.PIAuth.saveProject);
  }
  function toCloud(p, op, opDetail) {
    return {
      id: p.id, customer: p.customer, name: p.name, stage: Number(p.stage) || 0,
      owner: p.owner || '', ownerEmail: p.ownerEmail || '', sale: p.sale || '',
      team: p.team || '', startDate: p.startDate || '', deadline: p.deadline || '',
      blocker: p.blocker || '', note: p.note || '', drRef: p.drRef || '',
      progress: progressOf(p), tasks: p.tasks || [],
      op: op || '', opDetail: opDetail || ''
    };
  }
  function fromCloud(c) {
    return {
      id: c.id, name: c.name || '', customer: c.customer || '', owner: c.owner || '',
      ownerEmail: c.ownerEmail || '', sale: c.sale || '', team: c.team || '',
      stage: Number(c.stage) || 0, startDate: c.startDate || '', deadline: c.deadline || '',
      blocker: c.blocker || '', note: c.note || '', drRef: c.drRef || '',
      tasks: Array.isArray(c.tasks) ? c.tasks : [],
      createdAt: c.createdAt || '', updatedAt: c.updatedAt || ''
    };
  }
  function pushCloud(p, op, opDetail) {
    if (!cloudOn() || !p) return;
    if (!p.updatedAt) p.updatedAt = new Date().toISOString();
    save();
    clearTimeout(__pushT);
    __pushT = setTimeout(function () {
      global.PIAuth.saveProject(toCloud(p, op, opDetail)).catch(function (e) {
        if (global.toast) global.toast('ซิงก์คลาวด์ไม่สำเร็จ: ' + ((e && e.message) || e));
      });
    }, 400);
  }
  function syncFromCloud(force) {
    if (!cloudOn() || __syncing) return;
    if (!force && Date.now() - __syncedAt < 60000) return;
    __syncing = true;
    global.PIAuth.listProjects().then(function (r) {
      __syncing = false;
      __syncedAt = Date.now();
      var list = (r && r.projects) || [];
      if (!list.length) return;
      var changed = false, idx = {};
      PROJECTS.forEach(function (p, i) { idx[p.id] = i; });
      var order = [];
      list.forEach(function (c) {
        var local = idx[c.id] !== undefined ? PROJECTS[idx[c.id]] : null;
        if (!local) { order.push(fromCloud(c)); changed = true; }
        else if (String(c.updatedAt || '') > String(local.updatedAt || '')) {
          var merged = fromCloud(c);
          Object.keys(merged).forEach(function (k) { local[k] = merged[k]; });
          changed = true;
        }
      });
      if (order.length) { PROJECTS = order.concat(PROJECTS); changed = true; }
      /* โครงการที่มีในเครื่องแต่ยังไม่ขึ้นคลาวด์ → ดันขึ้นให้ */
      var remote = {};
      list.forEach(function (c) { remote[c.id] = 1; });
      PROJECTS.filter(function (p) { return !remote[p.id]; }).slice(0, 20).forEach(function (p) {
        global.PIAuth.saveProject(toCloud(p)).catch(function () {});
      });
      if (changed) {
        save();
        if (typeof global.render === 'function') global.render();
      }
    }).catch(function () { __syncing = false; });
  }

  /* ---------- คำนวณ ---------- */
  function progressOf(p) {
    if (!p.tasks || !p.tasks.length) return p.stage >= 4 ? 100 : 0;
    var done = p.tasks.filter(function (t) { return t.status === 'เสร็จแล้ว'; }).length;
    var pctv = Math.round(done / p.tasks.length * 100);
    return p.stage >= 4 ? 100 : pctv;
  }
  function healthOf(p) {
    if (p.stage >= 4) return 'done';
    var days = dayDiff(p.deadline);
    var pr = progressOf(p);
    var hasBlocker = p.blocker && String(p.blocker).trim() !== '' && p.blocker !== 'ไม่มี' && p.blocker !== '-';
    if (days < 0) return 'delayed';
    if (days <= 3) return 'at-risk';
    if (days <= 7 && pr < 80) return 'at-risk';
    if (days <= 14 && hasBlocker) return 'at-risk';
    return 'on-time';
  }
  var state = { q: '', stage: '', owner: '', health: '' };

  /** ทีมของผู้ใช้ปัจจุบัน (Head Team ถูกล็อกทีม) */
  function viewerTeam() {
    try {
      if (global.SalesReport && global.SalesReport.viewerTeam) return global.SalesReport.viewerTeam() || '';
    } catch (e) {}
    return '';
  }

  /** ขอบเขตข้อมูลของผู้ใช้ (all / team / sale / none) — ใช้ตัวเดียวกับ Reports */
  function scopeNow() {
    try {
      if (global.SalesReport && global.SalesReport.scope) return global.SalesReport.scope() || { type: 'none' };
    } catch (e) {}
    var vt = viewerTeam();
    return vt ? { type: 'team', team: vt } : { type: 'all' };
  }

  /** โครงการที่ผู้ใช้มีสิทธิ์เห็น */
  function visibleProjects() {
    var sc = scopeNow();
    if (sc.type === 'all') return PROJECTS.slice();
    if (sc.type === 'team') return PROJECTS.filter(function (p) { return p.team === sc.team; });
    if (sc.type === 'sale') {
      var me = global.__ME__ || {};
      var norm = function (v) { return String(v || '').replace(/[\s\u200B\u00A0]+/g, '').trim(); };
      var myName = norm(me.name);
      return PROJECTS.filter(function (p) { return norm(p.sale) === myName; });
    }
    return [];
  }

  function filtered() {
    var q = String(state.q || '').trim().toLowerCase();
    return visibleProjects().filter(function (p) {
      if (state.stage !== '' && String(p.stage) !== String(state.stage)) return false;
      if (state.owner && p.owner !== state.owner) return false;
      if (state.health && healthOf(p) !== state.health) return false;
      if (q && (p.name + ' ' + p.customer + ' ' + p.owner + ' ' + p.id).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- Views ---------- */
  function kpiCard(label, value, sub, color, icon, barPct) {
    return '<article class="pt-kpi">'
      + '<div class="pt-kpi-top"><span>' + esc(label) + '</span>'
      + '<span class="pt-ico" style="background:' + color + '18;color:' + color + '"><i class="' + icon + '"></i></span></div>'
      + '<div class="pt-kpi-val" style="color:' + color + '">' + value + '</div>'
      + (barPct === undefined ? '' : '<div class="pt-bar"><span style="width:' + Math.max(0, Math.min(100, barPct)) + '%;background:' + color + '"></span></div>')
      + '<div class="pt-kpi-sub">' + sub + '</div></article>';
  }

  function renderKpis() {
    var all = visibleProjects();
    var active = all.filter(function (p) { return p.stage < 4; }).length;
    var risk = all.filter(function (p) { var h = healthOf(p); return h === 'at-risk' || h === 'delayed'; }).length;
    var done = all.filter(function (p) { return p.stage >= 4; }).length;
    var openTasks = 0, overdueTasks = 0;
    all.forEach(function (p) {
      (p.tasks || []).forEach(function (t) {
        if (t.status !== 'เสร็จแล้ว') { openTasks++; if (dayDiff(t.due) < 0) overdueTasks++; }
      });
    });
    return '<div class="pt-kpis">'
      + kpiCard('โครงการทั้งหมด', all.length + ' โครงการ', 'ส่งมอบแล้ว ' + done + ' · กำลังทำ ' + active, '#0F2B46', 'fa-solid fa-diagram-project', done / (all.length || 1) * 100)
      + kpiCard('เสี่ยง / ล่าช้า', risk + ' โครงการ', 'ต้องติดตาม blocker และกำหนดส่งมอบ', '#DC2626', 'fa-solid fa-triangle-exclamation', risk / (all.length || 1) * 100)
      + kpiCard('งานค้าง (Task)', openTasks + ' งาน', overdueTasks ? '<b class="pt-red">เลยกำหนด ' + overdueTasks + ' งาน</b>' : 'ไม่มีงานเลยกำหนด', '#2563EB', 'fa-solid fa-list-check')
      + kpiCard('ส่งมอบแล้ว', done + ' โครงการ', 'ปิดงานเรียบร้อย ' + (done / (all.length || 1) * 100).toFixed(0) + '% ของทั้งหมด', '#16A34A', 'fa-solid fa-flag-checkered', done / (all.length || 1) * 100)
      + '</div>';
  }

  function renderFilters() {
    var owners = [];
    PROJECTS.forEach(function (p) { if (p.owner && owners.indexOf(p.owner) < 0) owners.push(p.owner); });
    function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }
    return '<div class="pt-filters">'
      + '<div class="pt-fl"><label>ค้นหา</label><div class="pt-search"><i class="fa-solid fa-magnifying-glass"></i>'
      + '<input id="ptSearch" placeholder="ชื่อโครงการ / ลูกค้า / ผู้รับผิดชอบ" value="' + esc(state.q) + '"></div></div>'
      + '<div class="pt-fl"><label>ขั้นตอน</label><select data-pt-filter="stage">'
      + opt('', 'ทุกขั้นตอน', state.stage) + STAGES.map(function (s) { return opt(s.code, s.name, state.stage); }).join('') + '</select></div>'
      + '<div class="pt-fl"><label>ผู้รับผิดชอบ</label><select data-pt-filter="owner">'
      + opt('', 'ทุกคน', state.owner) + owners.map(function (o) { return opt(o, o, state.owner); }).join('') + '</select></div>'
      + '<div class="pt-fl"><label>สุขภาพโครงการ</label><select data-pt-filter="health">'
      + opt('', 'ทั้งหมด', state.health)
      + opt('on-time', 'ตามแผน', state.health) + opt('at-risk', 'เสี่ยงล่าช้า', state.health)
      + opt('delayed', 'ล่าช้า', state.health) + opt('done', 'ส่งมอบแล้ว', state.health) + '</select></div>'
      + '<div class="pt-fbtn"><button class="pt-btn" data-pt-reset><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button></div>'
      + '</div>';
  }

  function cardHtml(p) {
    var h = healthOf(p), pr = progressOf(p);
    var openTasks = (p.tasks || []).filter(function (t) { return t.status !== 'เสร็จแล้ว'; }).length;
    var days = dayDiff(p.deadline);
    var dueTxt = p.stage >= 4 ? 'ส่งมอบแล้ว' : (days < 0 ? 'เลยกำหนด ' + Math.abs(days) + ' วัน' : (days === 0 ? 'ครบกำหนดวันนี้' : 'อีก ' + days + ' วัน'));
    return '<article class="pt-card" draggable="true" data-pt-project="' + esc(p.id) + '">'
      + '<div class="pt-card-h"><span class="pt-badge pt-' + h + '">' + esc(HEALTH[h].label) + '</span>'
      + '<span class="pt-id">' + esc(p.team || '') + (p.team ? ' · ' : '') + esc(p.id) + '</span></div>'
      + '<h4>' + esc(p.name) + '</h4>'
      + '<div class="pt-cust">' + esc(p.customer) + '</div>'
      + '<div class="pt-meta"><span><i class="fa-regular fa-user"></i> ' + esc(p.owner) + '</span>'
      + '<span class="' + (days < 0 && p.stage < 4 ? 'pt-red' : '') + '"><i class="fa-regular fa-calendar"></i> ' + thaiDate(p.deadline) + '</span></div>'
      + '<div class="pt-prog"><span style="width:' + pr + '%"></span></div>'
      + '<div class="pt-meta"><span>ความคืบหน้า ' + pr + '%</span><span>' + openTasks + ' งานค้าง</span></div>'
      + (p.blocker && p.blocker !== 'ไม่มี' ? '<div class="pt-block"><i class="fa-solid fa-circle-exclamation"></i> ' + esc(p.blocker) + '</div>' : '')
      + '<div class="pt-due ' + (days < 0 && p.stage < 4 ? 'pt-red' : '') + '">' + esc(dueTxt) + '</div>'
      + '</article>';
  }

  function renderBoard(list) {
    var cols = STAGES.map(function (s) {
      var items = list.filter(function (p) { return p.stage === s.code; });
      return '<div class="pt-col" data-pt-stage="' + s.code + '">'
        + '<div class="pt-col-h"><span class="pt-dot" style="background:' + s.color + '"></span>' + esc(s.name)
        + '<span class="pt-count">' + items.length + '</span></div>'
        + (items.length ? items.map(cardHtml).join('') : '<div class="pt-empty">ลากการ์ดมาที่นี่</div>')
        + '</div>';
    }).join('');
    return '<section class="pt-panel"><div class="pt-ph"><div><h3>Kanban — ติดตามงานตั้งแต่รับช่วงจนส่งมอบ</h3>'
      + '<div class="pt-s2">ลากการ์ดเพื่อเปลี่ยนขั้นตอน (บันทึกอัตโนมัติ) · คลิกการ์ดเพื่อดูรายละเอียดและงานย่อย</div></div>'
      + '<span class="pt-tag">' + list.length + ' โครงการ</span></div>'
      + '<div class="pt-board">' + cols + '</div></section>';
  }

  function renderTasksTable(list) {
    var rows = [];
    list.forEach(function (p) {
      (p.tasks || []).forEach(function (t) {
        if (t.status === 'เสร็จแล้ว') return;
        rows.push({ p: p, t: t, days: dayDiff(t.due) });
      });
    });
    rows.sort(function (a, b) { return a.days - b.days; });
    var body = rows.slice(0, 12).map(function (r) {
      var overdue = r.days < 0;
      return '<tr class="pt-row" data-pt-project="' + esc(r.p.id) + '">'
        + '<td><div class="pt-nm">' + esc(r.t.name) + '</div><div class="pt-s2">' + esc(r.p.name) + ' · ' + esc(r.p.customer) + '</div></td>'
        + '<td>' + esc(r.t.owner || '-') + '</td>'
        + '<td class="pt-num ' + (overdue ? 'pt-red' : '') + '">' + thaiDate(r.t.due) + (overdue ? ' (' + Math.abs(r.days) + ' วัน)' : '') + '</td>'
        + '<td><span class="pt-badge pt-' + (r.t.status === 'กำลังดำเนินการ' ? 'warn' : 'idle') + '">' + esc(r.t.status) + '</span></td>'
        + '<td>' + esc(stageOf(r.p.stage).name) + '</td>'
        + '</tr>';
    }).join('');
    return '<section class="pt-panel"><div class="pt-ph"><div><h3>งานค้างที่ต้องติดตาม (Task)</h3>'
      + '<div class="pt-s2">เรียงตามกำหนดส่ง · คลิกแถวเพื่อเปิดโครงการ</div></div></div>'
      + '<div class="pt-tablewrap"><table class="pt-table"><thead><tr>'
      + '<th>งาน</th><th>ผู้รับผิดชอบ</th><th class="pt-num">กำหนดส่ง</th><th>สถานะ</th><th>ขั้นตอนโครงการ</th>'
      + '</tr></thead><tbody>' + (body || '<tr><td colspan="5" class="pt-empty-cell">ไม่มีงานค้าง 🎉</td></tr>') + '</tbody></table></div></section>';
  }

  function render() {
    injectCss();
    syncFromCloud(false);
    var list = filtered();
    var sc = scopeNow();
    if (sc.type === 'pending') {
      return '<div class="pt"><div class="pt-head"><div><h1>Project Tracking</h1>'
        + '<div class="pt-sub">กำลังโหลดข้อมูลตามสิทธิ์ของคุณ…</div></div></div>'
        + '<section class="pt-panel" style="padding:26px;text-align:center;color:#667085;font-size:12px">'
        + '<i class="fa-solid fa-circle-notch fa-spin" style="color:#2563EB;margin-right:7px"></i>'
        + 'กำลังตรวจสอบสิทธิ์และโหลดโครงการที่เกี่ยวข้อง…</section></div>';
    }
    var lockTxt = sc.type === 'team'
      ? '<span class="pt-teamlock"><i class="fa-solid fa-lock"></i> ทีมของคุณ: ' + esc(sc.team) + '</span>'
      : (sc.type === 'sale' ? '<span class="pt-teamlock"><i class="fa-solid fa-lock"></i> เฉพาะโครงการของคุณ</span>' : '');
    var notice = sc.type === 'none'
      ? '<div class="pt-panel" style="display:flex;gap:10px;align-items:flex-start;background:#FFF7ED;border-color:#FFEDD5">'
        + '<i class="fa-solid fa-circle-info" style="color:#C2410C;margin-top:2px"></i>'
        + '<div><b style="color:#9A3412;font-size:12px">บัญชีนี้ยังไม่ถูกผูกกับข้อมูลโครงการ</b>'
        + '<div class="pt-s2" style="color:#B45309">กรุณาแจ้ง Admin ให้ผูกชื่อของคุณกับทีม BU หรือรายชื่อ AE เพื่อให้เห็นโครงการที่เกี่ยวข้อง</div></div></div>'
      : '';
    return '<div class="pt">'
      + '<div class="pt-head"><div><h1>Project Tracking</h1>'
      + '<div class="pt-sub">ติดตามโครงการตั้งแต่รับช่องงานจนถึงส่งมอบลูกค้า — ซิงก์กับ Google Sheet อัตโนมัติ</div></div>'
      + '<div class="pt-head-acts">'
      + lockTxt
      + '<button class="pt-btn dark" data-pt-new><i class="fa-solid fa-plus"></i> เพิ่มโครงการ</button></div></div>'
      + notice
      + (PROJECTS.length === 0
        ? '<section class="pt-panel" style="padding:34px 20px;text-align:center">'
          + '<div style="font-size:30px;color:#CBD5E1;margin-bottom:8px"><i class="fa-solid fa-diagram-project"></i></div>'
          + '<div style="font-size:13px;font-weight:600;color:#0F2B46;margin-bottom:4px">ยังไม่มีโครงการ</div>'
          + '<div class="pt-s2" style="margin-bottom:14px">เริ่มต้นด้วยการเพิ่มโครงการแรก (หรือสร้างดีลใน Reports แล้วค่อยบันทึกที่นี่)</div>'
          + '<button class="pt-btn dark" data-pt-new><i class="fa-solid fa-plus"></i> เพิ่มโครงการ</button></section>'
        : renderKpis() + renderFilters() + renderBoard(list) + renderTasksTable(list))
      + '</div>';
  }

  /* ---------- Modals ---------- */
  /** รายชื่อผู้ใช้ในระบบ (ใช้เลือกผู้รับผิดชอบโครงการ) */
  function userList_() {
    var out = [];
    try {
      if (global.PIAuth && global.PIAuth.listUsers) out = global.PIAuth.listUsers() || [];
    } catch (e) { out = []; }
    return Array.isArray(out) ? out : [];
  }
  /** รายชื่อ AE + ทีม (ใช้เลือก "AE ผู้ส่งงาน") */
  function saleList_() {
    var out = [];
    try {
      if (global.SalesReport && global.SalesReport.salesList) out = global.SalesReport.salesList() || [];
    } catch (e) { out = []; }
    return Array.isArray(out) ? out : [];
  }
  function meSession_() {
    try {
      if (global.PIAuth && global.PIAuth.session) return global.PIAuth.session() || null;
    } catch (e) {}
    return null;
  }

  function openProjectModal(id) {
    var p = id ? byId(id) : null;
    var isEdit = !!p;
    var me = meSession_() || {};
    var d = p || {
      name: '', customer: '', owner: String(me.name || ''), sale: String(me.name || ''),
      stage: 0, startDate: todayISO(), deadline: '', blocker: '', note: '',
      team: viewerTeam() || (String(me.team || '').toUpperCase() || TEAM_LIST[0])
    };
    var stageOpts = STAGES.map(function (s) {
      return '<option value="' + s.code + '"' + (Number(d.stage) === s.code ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var vt = viewerTeam();
    var teamOpts = TEAM_LIST.map(function (t) {
      return '<option value="' + esc(t) + '"' + (String(d.team) === t ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');

    /* ผู้รับผิดชอบโครงการ = เลือกจากบัญชีผู้ใช้ (พร้อมทีมของคนนั้น) */
    var users = userList_();
    var salesL = saleList_();
    function teamOfSale(name) {
      var hit = salesL.filter(function (s) { return String(s.name).trim() === String(name).trim(); })[0];
      return hit ? String(hit.team || '').toUpperCase() : '';
    }
    function teamOfUser(u) {
      if (!u) return '';
      var t = String(u.team || '').toUpperCase();
      if (t) return t;
      var viaSale = teamOfSale(u.name);
      if (viaSale) return viaSale;
      if (u.saleId) {
        var s2 = salesL.filter(function (x) { return String(x.id) === String(u.saleId); })[0];
        if (s2) return String(s2.team || '').toUpperCase();
      }
      return '';
    }
    var ownerOpts = '<option value="">— เลือกผู้รับผิดชอบ —</option>' + users.map(function (u) {
      var nm = String(u.name || u.email || '').trim();
      if (!nm) return '';
      var tm = teamOfUser(u);
      return '<option value="' + esc(nm) + '" data-team="' + esc(tm) + '"'
        + (String(d.owner).trim() === nm ? ' selected' : '') + '>' + esc(nm) + (tm ? ' · ' + esc(tm) : '') + '</option>';
    }).join('');
    if (d.owner && !users.some(function (u) { return String(u.name || '').trim() === String(d.owner).trim(); })) {
      ownerOpts += '<option value="' + esc(d.owner) + '" data-team="' + esc(String(d.team || '')) + '" selected>'
        + esc(d.owner) + ' (เดิม)</option>';
    }

    /* AE ผู้ส่งงาน = เลือกจากรายชื่อ AE (พาทีมมาด้วย) */
    var saleOpts = '<option value="">— ไม่ระบุ —</option>' + salesL.map(function (s) {
      return '<option value="' + esc(s.name) + '" data-team="' + esc(String(s.team || '').toUpperCase()) + '"'
        + (String(d.sale).trim() === String(s.name).trim() ? ' selected' : '') + '>'
        + esc(s.name) + ' · ' + esc(s.team || '') + '</option>';
    }).join('');
    if (d.sale && !salesL.some(function (s) { return String(s.name).trim() === String(d.sale).trim(); })) {
      saleOpts += '<option value="' + esc(d.sale) + '" data-team="' + esc(String(d.team || '')) + '" selected>'
        + esc(d.sale) + ' (เดิม)</option>';
    }

    var drOpts = '';
    if (global.DailyReport && global.DailyReport.options) {
      try {
        drOpts = global.DailyReport.options().slice(0, 80).map(function (r) {
          return '<option value="' + esc(r.ref) + '">' + esc(r.ref + ' · ' + r.date + ' · ' + r.customer) + '</option>';
        }).join('');
      } catch (e) { drOpts = ''; }
    }
    var body = '<form id="ptForm"><div class="pt-form">'
      + '<label class="pt-fg full">ชื่อโครงการ *<input name="name" required value="' + esc(d.name) + '" placeholder="เช่น ระบบ CCTV อาคาร A"></label>'
      + '<label class="pt-fg full">ลูกค้า *<input name="customer" required value="' + esc(d.customer) + '" placeholder="ชื่อบริษัท / หน่วยงาน"></label>'
      + '<label class="pt-fg full">อ้างอิง Daily Report (ไม่บังคับ)<input name="drRef" list="ptDrRefs" placeholder="เช่น DR-20261123-01" value="' + esc(d.drRef || '') + '"><datalist id="ptDrRefs">' + drOpts + '</datalist></label>'
      + '<label class="pt-fg">ผู้รับผิดชอบโครงการ *<select name="owner" required>' + ownerOpts + '</select></label>'
      + '<label class="pt-fg">AE ผู้ส่งงาน<select name="sale">' + saleOpts + '</select></label>'
      + '<label class="pt-fg">ขั้นตอน<select name="stage">' + stageOpts + '</select></label>'
      + '<label class="pt-fg">ทีม (BU)<select name="team"' + (vt ? ' disabled' : '') + '>' + teamOpts + '</select>'
      + (vt ? '' : '<div class="pt-s2" style="margin-top:3px">เลือกจากทีมของ AE / ผู้รับผิดชอบอัตโนมัติ</div>') + '</label>'
      + '<label class="pt-fg">Blocker<input name="blocker" value="' + esc(d.blocker) + '" placeholder="ถ้าไม่มีใส่ -"></label>'
      + '<label class="pt-fg">วันเริ่ม<input name="startDate" type="date" value="' + esc(d.startDate) + '"></label>'
      + '<label class="pt-fg">กำหนดส่งมอบ *<input name="deadline" type="date" required value="' + esc(d.deadline) + '"></label>'
      + '<label class="pt-fg full">หมายเหตุ<textarea name="note" rows="3" placeholder="รายละเอียดงาน / ข้อตกลงกับลูกค้า">' + esc(d.note) + '</textarea></label>'
      + '</div></form>';
    var buttons = [{ label: 'ยกเลิก' }];
    if (isEdit) buttons.push({ label: 'ลบโครงการ', icon: 'fa-solid fa-trash', action: 'pt-del' });
    buttons.push({ label: isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ', icon: 'fa-solid fa-check', action: 'pt-save', primary: true });
    global.setModal(isEdit ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่', isEdit ? d.id + ' · ' + d.customer : 'กรอกข้อมูลโครงการเพื่อเริ่มติดตามงาน', body, buttons, true);
    window.__PT_EDIT__ = id || '';
  }

  function saveProjectForm() {
    var f = document.getElementById('ptForm');
    if (!f || !f.reportValidity()) return;
    var v = {};
    ['name', 'customer', 'owner', 'sale', 'blocker', 'startDate', 'deadline', 'note', 'drRef'].forEach(function (k) {
      v[k] = (f[k] && f[k].value || '').trim();
    });
    v.drRef = String(v.drRef || '').toUpperCase();
    v.stage = Number(f.stage.value);
    v.team = viewerTeam() || (f.team ? f.team.value : '') || TEAM_LIST[0];
    var id = window.__PT_EDIT__;
    if (id) {
      var p = byId(id);
      if (p) {
        Object.keys(v).forEach(function (k) { p[k] = v[k]; });
        if (v.stage >= 4 && (p.tasks || []).some(function (t) { return t.status !== 'เสร็จแล้ว'; })) {
          p.tasks.forEach(function (t) { t.status = 'เสร็จแล้ว'; });
        }
      }
      global.toast('บันทึกการแก้ไขแล้ว');
    } else {
      v.id = 'PJ-' + String(PROJECTS.length + 1).padStart(3, '0') + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
      v.tasks = [];
      PROJECTS.unshift(v);
      global.toast('สร้างโครงการใหม่แล้ว');
    }
    save();
    global.closeModal();
    global.render();
    pushCloud(byId(v.id || id), id ? 'project.edit' : 'project.add', id ? '' : 'สร้างโครงการใหม่');
    if (global.PILog) {
      if (id) global.PILog.add('project.edit', (p ? p.name : id), 'บันทึกการแก้ไขขั้นตอน: ' + (STAGES[v.stage] ? STAGES[v.stage].name : v.stage));
      else global.PILog.add('project.add', v.name, v.customer + ' · ทีม ' + v.team);
    }
  }

  function deleteProject() {
    var id = window.__PT_EDIT__;
    var p = byId(id);
    if (!p) return;
    if (!global.confirm('ลบโครงการ ' + p.name + ' ?')) return;
    PROJECTS = PROJECTS.filter(function (x) { return x.id !== id; });
    save();
    if (cloudOn()) {
      clearTimeout(__pushT);
      global.PIAuth.deleteProject(id).catch(function (e) {
        if (global.toast) global.toast('ลบบนคลาวด์ไม่สำเร็จ: ' + ((e && e.message) || e));
      });
    }
    if (global.PILog) global.PILog.add('project.del', p.name, p.customer + ' · ' + p.id);
    global.closeModal();
    global.render();
    global.toast('ลบโครงการแล้ว');
  }

  /** บล็อก "เรื่องราว / ที่มา" — Daily Report → ดีล → โครงการ */
  function storyHtml(p) {
    var ref = String(p.drRef || '').toUpperCase();
    var dr = null, deals = [];
    try { if (ref && global.DailyReport && global.DailyReport.byRef) dr = global.DailyReport.byRef(ref); } catch (e) {}
    try {
      var d = (global.SalesReport && global.SalesReport.data) ? global.SalesReport.data() : null;
      if (d && ref) deals = (d.deals || []).filter(function (x) { return String(x.drRef || '').toUpperCase() === ref; });
    } catch (e) {}
    if (!ref) return '';

    var money = function (n) { return '฿' + Number(n || 0).toLocaleString('th-TH'); };
    var node = function (ico, color, bg, title, sub, note) {
      return '<div class="pt-story-arrow"><i class="fa-solid fa-arrow-down"></i></div>'
        + '<div class="pt-story-node">'
        + '<span class="pt-story-ico" style="background:' + bg + ';color:' + color + '"><i class="fa-solid ' + ico + '"></i></span>'
        + '<div style="min-width:0"><b>' + esc(title) + '</b>'
        + '<div class="pt-s2">' + sub + '</div>'
        + (note ? '<div class="pt-story-note">' + esc(note) + '</div>' : '')
        + '</div></div>';
    };

    var html = '<h3 class="pt-sect">เรื่องราว / ที่มา (Tracking)</h3><div class="pt-story">';
    if (dr) {
      html += node('fa-clipboard-check', '#1D4ED8', '#EFF6FF', ref,
        esc(dr.customer) + ' · ' + esc(thaiDate(dr.date)) + ' ' + esc(dr.time || '')
        + (dr.value ? ' · มูลค่า ' + money(dr.value) : ''),
        dr.summary || '');
    } else {
      html += '<div class="pt-story-node"><span class="pt-story-ico" style="background:#FEF3C7;color:#B45309"><i class="fa-solid fa-link"></i></span>'
        + '<div><b>' + esc(ref) + '</b><div class="pt-s2">ไม่พบรายละเอียด Daily Report ในเครื่องนี้ (อาจบันทึกจากอุปกรณ์อื่น)</div></div></div>';
    }
    deals.forEach(function (x) {
      html += node('fa-file-invoice-dollar', '#15803D', '#F0FDF4',
        x.no, esc(x.customer) + ' · ' + money(x.amount) + ' · ' + esc(x.job || ''), x.note || '');
    });
    html += node('fa-diagram-project', '#3730A3', '#EEF2FF', p.id || '', esc(p.name), '');
    html += '</div>';
    return html;
  }

  function openDetail(id) {
    var p = byId(id);
    if (!p) return;
    var h = healthOf(p), pr = progressOf(p), days = dayDiff(p.deadline);
    var tasks = p.tasks || [];
    var taskRows = tasks.length ? tasks.map(function (t) {
      var od = dayDiff(t.due) < 0 && t.status !== 'เสร็จแล้ว';
      return '<tr>'
        + '<td><div class="pt-nm">' + esc(t.name) + '</div></td>'
        + '<td>' + esc(t.owner || '-') + '</td>'
        + '<td class="pt-num ' + (od ? 'pt-red' : '') + '">' + thaiDate(t.due) + '</td>'
        + '<td><button class="pt-chip pt-' + (t.status === 'เสร็จแล้ว' ? 'done' : t.status === 'กำลังดำเนินการ' ? 'warn' : 'idle') + '" data-pt-tgl="' + esc(p.id) + '|' + esc(t.id) + '" title="คลิกเพื่อเปลี่ยนสถานะ">' + esc(t.status) + '</button></td>'
        + '<td class="pt-acts">'
        + '<button class="pt-ico-btn" data-pt-tedit="' + esc(p.id) + '|' + esc(t.id) + '" title="แก้ไขงาน"><i class="fa-solid fa-pen"></i></button>'
        + '<button class="pt-ico-btn del" data-pt-tdel="' + esc(p.id) + '|' + esc(t.id) + '" title="ลบงาน"><i class="fa-solid fa-trash"></i></button>'
        + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="pt-empty-cell">ยังไม่มีงานย่อย — กด “เพิ่มงาน”</td></tr>';

    var journey = STAGES.map(function (s, i) {
      var done = p.stage > i, cur = p.stage === i;
      return '<div class="pt-step ' + (done ? 'done' : '') + ' ' + (cur ? 'cur' : '') + '">'
        + '<div class="pt-step-dot"><i class="fa-solid ' + (done ? 'fa-check' : 'fa-circle') + '"></i></div>'
        + '<div>' + esc(s.name) + '</div></div>';
    }).join('');

    var body = '<div class="pt-detail">'
      + '<div class="pt-dgrid">'
      + '<div><small>ลูกค้า</small><strong>' + esc(p.customer) + '</strong></div>'
      + '<div><small>ขั้นตอนปัจจุบัน</small><strong>' + esc(stageOf(p.stage).name) + '</strong></div>'
      + '<div><small>สุขภาพโครงการ</small><strong><span class="pt-badge pt-' + h + '">' + esc(HEALTH[h].label) + '</span></strong></div>'
      + '<div><small>ผู้รับผิดชอบ</small><strong>' + esc(p.owner) + '</strong></div>'
      + '<div><small>กำหนดส่งมอบ</small><strong class="' + (days < 0 && p.stage < 4 ? 'pt-red' : '') + '">' + thaiDate(p.deadline) + (p.stage < 4 ? ' (' + (days < 0 ? 'เลย ' + Math.abs(days) + ' วัน' : 'อีก ' + days + ' วัน') + ')' : '') + '</strong></div>'
      + '<div><small>AE ผู้ส่งงาน</small><strong>' + esc(p.sale || '-') + '</strong></div>'
      + '</div>'
      + '<div class="pt-prog big"><span style="width:' + pr + '%"></span></div>'
      + '<div class="pt-s2">ความคืบหน้า ' + pr + '% จาก ' + tasks.filter(function (t) { return t.status === 'เสร็จแล้ว'; }).length + '/' + tasks.length + ' งาน</div>'
      + (p.blocker && p.blocker !== 'ไม่มี' && p.blocker !== '-' ? '<div class="pt-block" style="margin-top:10px"><i class="fa-solid fa-circle-exclamation"></i> Blocker: ' + esc(p.blocker) + '</div>' : '')
      + storyHtml(p)
      + (p.note ? '<div class="pt-note"><b>หมายเหตุ</b><p>' + esc(p.note) + '</p></div>' : '')
      + '<h3 class="pt-sect">เส้นทางโครงการ</h3><div class="pt-journey">' + journey + '</div>'
      + '<h3 class="pt-sect">งานย่อย (' + tasks.length + ')</h3>'
      + '<div class="pt-tablewrap"><table class="pt-table"><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th class="pt-num">กำหนดส่ง</th><th>สถานะ</th><th></th></tr></thead>'
      + '<tbody>' + taskRows + '</tbody></table></div>'
      + '</div>';

    global.setModal(p.name, p.id + ' · ' + p.customer, body, [
      { label: 'ปิด' },
      { label: 'เพิ่มงาน', icon: 'fa-solid fa-plus', action: 'pt-addtask' },
      { label: 'แก้ไขโครงการ', icon: 'fa-solid fa-pen', action: 'pt-edit', primary: true }
    ], true);
    window.__PT_OPEN__ = p.id;
    window.__PT_EDIT__ = p.id;
  }

  function openTaskModal(projectId, taskId) {
    var p = byId(projectId); if (!p) return;
    var t = null;
    (p.tasks || []).forEach(function (x) { if (x.id === taskId) t = x; });
    var d = t || { name: '', owner: '', due: todayISO(), status: 'รอดำเนินการ' };
    var body = '<form id="ptTaskForm"><div class="pt-form">'
      + '<label class="pt-fg full">ชื่องาน *<input name="name" required value="' + esc(d.name) + '" placeholder="เช่น ติดตั้งอุปกรณ์ชั้น 2"></label>'
      + '<label class="pt-fg">ผู้รับผิดชอบ<input name="owner" value="' + esc(d.owner) + '"></label>'
      + '<label class="pt-fg">กำหนดส่ง<input name="due" type="date" value="' + esc(d.due) + '"></label>'
      + '<label class="pt-fg full">สถานะ<select name="status">'
      + TASK_STATUS.map(function (s) { return '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
      + '</select></label></div></form>';
    global.setModal(t ? 'แก้ไขงานย่อย' : 'เพิ่มงานย่อย', p.name, body, [
      { label: 'ยกเลิก' },
      { label: t ? 'บันทึก' : 'เพิ่มงาน', icon: 'fa-solid fa-check', action: 'pt-savetask', primary: true }
    ]);
    window.__PT_TASK__ = { project: projectId, task: taskId || '' };
  }

  function saveTaskForm() {
    var f = document.getElementById('ptTaskForm');
    if (!f || !f.reportValidity()) return;
    var ctx = window.__PT_TASK__ || {};
    var p = byId(ctx.project); if (!p) return;
    p.tasks = p.tasks || [];
    var val = {
      name: (f.name.value || '').trim(), owner: (f.owner.value || '').trim(),
      due: f.due.value, status: f.status.value
    };
    if (ctx.task) {
      p.tasks.forEach(function (t) { if (t.id === ctx.task) { t.name = val.name; t.owner = val.owner; t.due = val.due; t.status = val.status; } });
    } else {
      val.id = 'T' + (p.tasks.length + 1) + '-' + Math.random().toString(36).slice(2, 5);
      p.tasks.push(val);
    }
    save();
    global.toast(ctx.task ? 'บันทึกงานแล้ว' : 'เพิ่มงานแล้ว');
    pushCloud(p, ctx.task ? 'task.edit' : 'task.add', (ctx.task ? 'แก้งาน: ' : 'เพิ่มงาน: ') + val.name);
    if (global.PILog) global.PILog.add(ctx.task ? 'task.edit' : 'task.add', val.name, p.name + ' · ' + val.status);
    openDetail(p.id);
    global.render();
  }

  function toggleTask(projectId, taskId) {
    var p = byId(projectId); if (!p) return;
    var tName = '', tStatus = '';
    (p.tasks || []).forEach(function (t) {
      if (t.id === taskId) {
        var i = TASK_STATUS.indexOf(t.status);
        t.status = TASK_STATUS[(i + 1) % TASK_STATUS.length];
        tName = t.name; tStatus = t.status;
        if (global.PILog) global.PILog.add('task.toggle', t.name, p.name + ' → ' + t.status);
      }
    });
    save();
    pushCloud(p, 'task.toggle', tName + ' → ' + tStatus);
    openDetail(projectId);
    global.render();
  }

  function deleteTask(projectId, taskId) {
    var p = byId(projectId); if (!p) return;
    var rm = (p.tasks || []).filter(function (t) { return t.id === taskId; })[0];
    p.tasks = (p.tasks || []).filter(function (t) { return t.id !== taskId; });
    save();
    pushCloud(p, 'task.del', rm ? ('ลบงาน: ' + rm.name) : '');
    if (global.PILog && rm) global.PILog.add('task.del', rm.name, p.name);
    openDetail(projectId);
    global.render();
  }

  /* ---------- Drag & drop ---------- */
  var dragId = null;

  document.addEventListener('dragstart', function (e) {
    var card = e.target.closest && e.target.closest('.pt-card');
    if (!card) return;
    dragId = card.getAttribute('data-pt-project');
    card.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
  });

  document.addEventListener('dragend', function (e) {
    var card = e.target.closest && e.target.closest('.pt-card');
    if (card) card.classList.remove('dragging');
    Array.prototype.forEach.call(document.querySelectorAll('.pt-col.drag-over'), function (c) { c.classList.remove('drag-over'); });
  });

  document.addEventListener('dragover', function (e) {
    var col = e.target.closest && e.target.closest('.pt-col');
    if (!col) return;
    e.preventDefault();
    col.classList.add('drag-over');
  });

  document.addEventListener('dragleave', function (e) {
    var col = e.target.closest && e.target.closest('.pt-col');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });

  document.addEventListener('drop', function (e) {
    var col = e.target.closest && e.target.closest('.pt-col');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drag-over');
    var id = dragId || e.dataTransfer.getData('text/plain');
    var p = byId(id);
    var target = Number(col.getAttribute('data-pt-stage'));
    if (!p || p.stage === target) return;
    p.stage = target;
    if (target >= 4) (p.tasks || []).forEach(function (t) { t.status = 'เสร็จแล้ว'; });
    save();
    pushCloud(p, 'project.stage', 'ย้ายขั้นตอน: ' + stageOf(p.stage).name);
    global.render();
    global.toast('ย้าย "' + p.name + '" ไปขั้น "' + stageOf(target).name + '" แล้ว');
  });

  /* ---------- Events ---------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'ptSearch') return;
    state.q = e.target.value;
    repaintLists();
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.name && (el.name === 'owner' || el.name === 'sale')) {
      var f = document.getElementById('ptForm');
      if (f) {
        var teamSel = f.querySelector('[name="team"]');
        var opt = el.selectedOptions && el.selectedOptions[0];
        var tm = opt ? String(opt.getAttribute('data-team') || '').toUpperCase() : '';
        if (teamSel && !teamSel.disabled && tm && TEAM_LIST.indexOf(tm) >= 0) teamSel.value = tm;
        return;
      }
    }
    var sel = e.target.closest && e.target.closest('[data-pt-filter]');
    if (!sel) return;
    state[sel.getAttribute('data-pt-filter')] = sel.value;
    global.render();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('[data-pt-new]')) { openProjectModal(null); return; }
    if (t.closest('[data-pt-reset]')) {
      state = { q: '', stage: '', owner: '', health: '' };
      global.render(); return;
    }

    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'pt-save') { saveProjectForm(); return; }
      if (a === 'pt-del') { deleteProject(); return; }
      if (a === 'pt-addtask') { openTaskModal(window.__PT_OPEN__ || window.__PT_EDIT__, ''); return; }
      if (a === 'pt-savetask') { saveTaskForm(); return; }
      if (a === 'pt-edit') { openProjectModal(window.__PT_OPEN__ || window.__PT_EDIT__); return; }
    }

    var tgl = t.closest('[data-pt-tgl]');
    if (tgl) { var a1 = tgl.getAttribute('data-pt-tgl').split('|'); toggleTask(a1[0], a1[1]); return; }

    var ted = t.closest('[data-pt-tedit]');
    if (ted) { var a2 = ted.getAttribute('data-pt-tedit').split('|'); openTaskModal(a2[0], a2[1]); return; }

    var tdel = t.closest('[data-pt-tdel]');
    if (tdel) {
      var a3 = tdel.getAttribute('data-pt-tdel').split('|');
      if (global.confirm('ลบงานนี้ออกจากโครงการ?')) deleteTask(a3[0], a3[1]);
      return;
    }

    var card = t.closest('[data-pt-project]');
    if (card) { openDetail(card.getAttribute('data-pt-project')); return; }
  });

  function repaintLists() {
    var board = document.querySelector('.pt-board');
    var panel = document.querySelector('.pt-panel');
    if (!panel) return;
    var list = filtered();
    var holder = panel.querySelector('.pt-board');
    if (holder) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderBoard(list);
      var nb = tmp.querySelector('.pt-board');
      if (nb) holder.parentNode.replaceChild(nb, holder);
      var tag = panel.querySelector('.pt-tag');
      if (tag) tag.textContent = list.length + ' โครงการ';
    }
    var panels = document.querySelectorAll('.pt-panel');
    var last = panels[panels.length - 1];
    if (last && last.querySelector('.pt-table')) {
      var tmp2 = document.createElement('div');
      tmp2.innerHTML = renderTasksTable(list);
      last.parentNode.replaceChild(tmp2.firstChild, last);
    }
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('pt-style')) return;
    var css = ''
      + '.pt{padding-bottom:6px}'
      + '.pt-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.pt-head h1{margin:0;color:#0F2B46;font-size:21px;font-weight:600}'
      + '.pt-head-acts{display:flex;align-items:center;gap:9px;flex-wrap:wrap}'
      + '.pt-teamlock{display:inline-flex;align-items:center;gap:6px;background:#EEF2FF;border:1px solid #E0E7FF;color:#3730A3;'
      + 'border-radius:99px;padding:5px 11px;font-size:10.5px;font-weight:500}'
      + '.pt-teamlock i{font-size:9px}'
      + '.pt-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      + '.pt-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 11px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.pt-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.pt-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      /* KPI */
      + '.pt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}'
      + '.pt-kpi{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.pt-kpi-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10px;min-height:26px}'
      + '.pt-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;flex:0 0 28px}'
      + '.pt-kpi-val{font-size:19px;font-weight:600;margin:7px 0 8px}'
      + '.pt-kpi-sub{font-size:9.5px;color:#667085;margin-top:7px;line-height:1.5}'
      + '.pt-bar{height:6px;background:#EEF2F7;border-radius:99px;overflow:hidden}'
      + '.pt-bar span{display:block;height:100%;border-radius:99px}'
      /* filters */
      + '.pt-filters{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1.5fr repeat(3,minmax(0,1fr)) auto;gap:10px;'
      + 'background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 18px rgba(15,43,70,.07);margin-bottom:14px}'
      + '.pt-fl{display:grid;gap:5px;min-width:0}'
      + '.pt-fl label{font-size:10px;color:#667085;font-weight:500}'
      + '.pt-fl select{width:100%;min-width:0;border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;padding:7px 8px;'
      + 'font-size:11px;min-height:34px;outline:none;font-family:inherit}'
      + '.pt-search{position:relative}'
      + '.pt-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#98A2B3;font-size:10px}'
      + '.pt-search input{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px 8px 26px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-height:34px}'
      + '.pt-fbtn{display:flex;align-items:flex-end}'
      /* panels */
      + '.pt-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:15px;box-shadow:0 2px 8px rgba(15,43,70,.05);margin-bottom:15px;min-width:0}'
      + '.pt-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;flex-wrap:wrap}'
      + '.pt-ph h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.pt-s2{color:#98A2B3;font-size:9.5px;margin-top:3px;line-height:1.5}'
      + '.pt-tag{background:#EEF2FF;color:#3730A3;border-radius:99px;padding:4px 10px;font-size:10px;white-space:nowrap}'
      /* board */
      + '.pt-board{display:grid;grid-template-columns:repeat(5,minmax(158px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px}'
      + '.pt-col{background:#F3F6FA;border-radius:11px;padding:10px;min-height:180px}'
      + '.pt-col.drag-over{outline:2px dashed #60A5FA;background:#EFF6FF}'
      + '.pt-col-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#0F2B46;padding:2px 3px 9px}'
      + '.pt-dot{width:8px;height:8px;border-radius:50%}'
      + '.pt-count{margin-left:auto;background:#fff;color:#667085;border-radius:6px;font-size:9px;padding:1px 7px}'
      + '.pt-card{background:#fff;border:1px solid #E5EAF0;border-radius:10px;padding:11px;margin-bottom:9px;cursor:grab;'
      + 'box-shadow:0 2px 6px rgba(15,43,70,.05);transition:box-shadow .15s,transform .15s}'
      + '.pt-card:hover{box-shadow:0 8px 20px rgba(15,43,70,.12);transform:translateY(-1px);border-color:#D6E0EE}'
      + '.pt-card.dragging{opacity:.45;transform:rotate(1.5deg)}'
      + '.pt-card-h{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px}'
      + '.pt-id{font-size:8.5px;color:#C2CBD8}'
      + '.pt-card h4{margin:0 0 3px;font-size:11.5px;color:#0F2B46;line-height:1.35}'
      + '.pt-cust{font-size:9.5px;color:#667085;margin-bottom:8px}'
      + '.pt-meta{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:9px;color:#667085;margin-top:5px}'
      + '.pt-prog{height:5px;background:#EEF2F7;border-radius:99px;overflow:hidden;margin-top:8px}'
      + '.pt-prog span{display:block;height:100%;background:#2563EB;border-radius:99px}'
      + '.pt-prog.big{height:9px;margin:12px 0 5px}'
      + '.pt-block{margin-top:8px;background:#FFF7ED;border:1px solid #FFEDD5;color:#9A3412;border-radius:7px;padding:6px 8px;font-size:9px;line-height:1.45}'
      + '.pt-due{margin-top:8px;font-size:9px;color:#475569;font-weight:500}'
      + '.pt-empty{border:1px dashed #D6E0EE;border-radius:9px;padding:16px 8px;text-align:center;color:#B0BAC9;font-size:9.5px}'
      /* badges */
      + '.pt-badge{display:inline-flex;align-items:center;border-radius:99px;padding:2px 8px;font-size:8.5px;font-weight:500;white-space:nowrap}'
      + '.pt-ok{background:#DCFCE7;color:#15803D}'
      + '.pt-warn{background:#FEF3C7;color:#B45309}'
      + '.pt-bad{background:#FEE2E2;color:#B91C1C}'
      + '.pt-done{background:#E0E7FF;color:#3730A3}'
      + '.pt-idle{background:#F1F5F9;color:#475569}'
      + '.pt-red{color:#DC2626!important}'
      /* table */
      + '.pt-tablewrap{overflow:auto;width:100%}'
      + '.pt-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:10.5px}'
      + '.pt-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:9.5px;padding:8px 9px;text-align:left;border-bottom:1px solid #E9EEF5}'
      + '.pt-table td{padding:9px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:middle}'
      + '.pt-table tbody tr:last-child td{border-bottom:0}'
      + '.pt-row{cursor:pointer}'
      + '.pt-row:hover td{background:#F8FBFF}'
      + '.pt-num{text-align:right;font-variant-numeric:tabular-nums}'
      + '.pt-nm{color:#0F2B46;font-weight:500;font-size:11px}'
      + '.pt-empty-cell{text-align:center;color:#98A2B3;padding:18px}'
      + '.pt-chip{border:0;border-radius:99px;padding:3px 9px;font-size:9px;font-family:inherit;cursor:pointer}'
      + '.pt-acts{white-space:nowrap;text-align:right}'
      + '.pt-ico-btn{border:1px solid #E5EAF0;background:#fff;color:#475467;border-radius:6px;padding:3px 6px;font-size:9px;cursor:pointer;margin-left:3px}'
      + '.pt-ico-btn:hover{border-color:#B7C5D6;background:#F8FAFC}'
      + '.pt-ico-btn.del{color:#B91C1C;border-color:#FFE4E6;background:#FFF1F2}'
      /* modal content */
      + '.pt-dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'
      + '.pt-dgrid>div{background:#F8FAFC;border-radius:9px;padding:10px}'
      + '.pt-dgrid small{display:block;color:#98A2B3;font-size:9px;margin-bottom:4px}'
      + '.pt-dgrid strong{color:#0F2B46;font-size:11.5px;font-weight:500}'
      + '.pt-note{margin-top:12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:9px;padding:11px 12px}'
      + '.pt-note b{color:#92400E;font-size:11px}'
      + '.pt-note p{margin:5px 0 0;color:#78350F;font-size:11px;line-height:1.7;white-space:pre-wrap}'
      + '.pt-sect{margin:16px 0 9px;font-size:11px;color:#0F2B46}'
      + '.pt-story{display:flex;flex-direction:column;gap:7px}'
      + '.pt-story-node{display:flex;gap:9px;align-items:flex-start;background:#F8FAFC;border:1px solid #EDF0F4;border-radius:10px;padding:9px 11px}'
      + '.pt-story-ico{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:10px;flex:0 0 24px}'
      + '.pt-story-node b{font-size:10.5px;color:#0F2B46;font-family:ui-monospace,Menlo,Consolas,monospace}'
      + '.pt-story-note{font-size:10px;color:#667085;margin-top:3px;line-height:1.55}'
      + '.pt-story-arrow{color:#CBD5E1;font-size:9px;margin-left:11px}'
      + '.pt-story{display:flex;flex-direction:column;gap:7px}'
      + '.pt-story-node{display:flex;gap:9px;align-items:flex-start;background:#F8FAFC;border:1px solid #EDF0F4;border-radius:10px;padding:9px 11px}'
      + '.pt-story-ico{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:10px;flex:0 0 24px}'
      + '.pt-story-node b{font-size:10.5px;color:#0F2B46;font-family:ui-monospace,Menlo,Consolas,monospace}'
      + '.pt-story-note{font-size:10px;color:#667085;margin-top:3px;line-height:1.55}'
      + '.pt-story-arrow{color:#CBD5E1;font-size:9px;margin-left:11px}'
      + '.pt-journey{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}'
      + '.pt-step{text-align:center;font-size:9px;color:#98A2B3}'
      + '.pt-step-dot{width:26px;height:26px;border-radius:50%;background:#EEF2F6;color:#94A3B8;display:grid;place-items:center;margin:0 auto 5px;font-size:9px}'
      + '.pt-step.done{color:#1D4ED8}.pt-step.done .pt-step-dot{background:#DBEAFE;color:#1D4ED8}'
      + '.pt-step.cur{color:#0F2B46;font-weight:600}.pt-step.cur .pt-step-dot{background:#2563EB;color:#fff}'
      + '.pt-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
      + '.pt-fg{display:grid;gap:5px;font-size:10px;color:#475467;min-width:0}'
      + '.pt-fg.full{grid-column:1/-1}'
      + '.pt-fg input,.pt-fg select,.pt-fg textarea{border:1px solid #DCE3EB;border-radius:8px;padding:8px 9px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-width:0;width:100%}'
      + '.pt-fg input:focus,.pt-fg select:focus,.pt-fg textarea:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      /* responsive */
      + '@media(max-width:1024px){.pt-filters{grid-template-columns:1fr 1fr}.pt-fbtn{grid-column:1/-1}}'
      + '@media(max-width:760px){.pt-filters{position:static;grid-template-columns:1fr}.pt-board{grid-template-columns:repeat(5,230px)}'
      + '.pt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.pt-dgrid{grid-template-columns:1fr 1fr}.pt-form{grid-template-columns:1fr}'
      + '.pt-head h1{font-size:18px}}'
      + '@media(max-width:480px){.pt-kpis{grid-template-columns:1fr}.pt-dgrid{grid-template-columns:1fr}}';
    var el = document.createElement('style');
    el.id = 'pt-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- Public ---------- */
  global.ProjectTracking = {
    render: render,
    open: openDetail,
    list: function () { return PROJECTS; },
    visible: visibleProjects,
    reset: function () { PROJECTS = []; save(); global.render(); }
  };
})(window);
