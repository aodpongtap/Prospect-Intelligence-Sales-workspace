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
  /** ลิสต์ปี (ค.ศ.) ที่แสดงในตัวกรอง/ฟอร์มดีล — สร้างจากข้อมูลจริง + ปีปัจจุบัน ±รอบ */
  function yearsList() {
    var set = {};
    var now = new Date().getFullYear();
    [now - 1, now, now + 1, now + 2].forEach(function (y) { set[y] = 1; });
    try { DEALS.forEach(function (d) { var y = Number(d.year); if (y) set[y] = 1; }); } catch (e) {}
    try { Object.keys(TARGETS || {}).forEach(function (k) { var y = Number(k); if (y) set[y] = 1; }); } catch (e2) {}
    try { if (state && state.year) set[Number(state.year)] = 1; } catch (e3) {}
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  /* สถานะงาน 0–5 พร้อมน้ำหนักที่ใช้คิด Forecast + โอกาสปิด (%) ที่ล็อกตามสถานะ */
  var STATUS = [
    { code: 0, label: 'กำลังคุย Detail', short: 'กำลังคุย', weight: 0,    prob: 25,  cls: 's0', color: '#94A3B8' },
    { code: 1, label: 'Pipeline',        short: 'Pipeline',  weight: null, prob: 50,  cls: 's1', color: '#A78BFA' },
    { code: 2, label: 'รอยืนยัน PO',     short: 'รอ PO',     weight: 0.8,  prob: 75,  cls: 's2', color: '#F59E0B' },
    { code: 3, label: 'รอส่งของ / เปิดบิลอินวอย', short: 'รอส่งของ', weight: 0.9, prob: 90, cls: 's3', color: '#38BDF8' },
    { code: 4, label: 'Actual (ปิดงานแล้ว)', short: 'Actual', weight: 1,   prob: 100, cls: 's4', color: '#2563EB' },
    { code: 5, label: 'ยกเลิก',          short: 'ยกเลิก',    weight: 0,    prob: 0,   cls: 's5', color: '#EF4444' }
  ];
  function st(code) { return STATUS[code] || STATUS[0]; }
  /** โอกาสปิด (%) ล็อกตามสถานะงาน — ผู้ใช้แก้เองไม่ได้ */
  function probOfStatus(code) { var s0 = STATUS[Number(code)]; return s0 ? s0.prob : 0; }

  var PRODUCT_DEFAULT = [
    { code: 'P1', name: 'ร้านสะดวกซัก (เครื่องซักผ้า+อบ)', short: 'ร้านสะดวกซัก', color: '#2563EB' },
    { code: 'P2', name: 'ตู้กดน้ำ',                       short: 'ตู้กดน้ำ',      color: '#0EA5E9' },
    { code: 'P3', name: 'ตู้กดน้ำ + เครื่องทำน้ำแข็ง',      short: 'ตู้กดน้ำ+น้ำแข็ง', color: '#8B5CF6' },
    { code: 'P4', name: 'เครื่องทำน้ำแข็ง',               short: 'เครื่องน้ำแข็ง', color: '#0E9384' }
  ];
  /* สินค้าที่เพิ่มภายหลัง แต่ต้องมีในเครื่องเดิมด้วย (migrate ให้อัตโนมัติ) */
  var PRODUCT_MIGRATE = ['P4'];
  var PRODUCT_COLORS = ['#2563EB', '#0EA5E9', '#8B5CF6', '#16A34A', '#F59E0B', '#DC2626', '#0E9384', '#7C3AED'];
  /* รายชื่อที่ขึ้นต้น/มีคำว่า "ทดสอบ" = ข้อมูลทดสอบที่ตกค้ำจากตอน QC — ลบทิ้งอัตโนมัติเมื่อโหลด */
  var TEST_NAME_RE = /ทดสอบ|^\s*test\b/i;
  function dropTestItems(list, getter) {
    var clean = (list || []).filter(function (x) { return !TEST_NAME_RE.test(String(getter(x) || '')); });
    return { list: clean, changed: clean.length !== (list || []).length };
  }
  var LS_PRODUCTS = 'pi_sr_products_v1';
  var PRODUCTS = loadProducts();
  function loadProducts() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_PRODUCTS) || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]' && a.length) {
        var dt = dropTestItems(a, function (p) { return (p && p.name) || ''; });
        a = dt.list;
        var list = a.map(function (p, i) {
          return { code: p.code, name: p.name, short: p.short || p.name, color: p.color || PRODUCT_COLORS[i % PRODUCT_COLORS.length] };
        });
        /* เครื่องเดิม: เติมสินค้าใหม่ที่ยังไม่มี ให้ตรงกับ PRODUCT_DEFAULT */
        var added = dt.changed;
        PRODUCT_MIGRATE.forEach(function (code) {
          if (list.some(function (p) { return p.code === code; })) return;
          var def = null;
          for (var j = 0; j < PRODUCT_DEFAULT.length; j++) if (PRODUCT_DEFAULT[j].code === code) def = PRODUCT_DEFAULT[j];
          if (def) { list.push(JSON.parse(JSON.stringify(def))); added = true; }
        });
        if (added) { try { localStorage.setItem(LS_PRODUCTS, JSON.stringify(list)); } catch (e) {} }
        return list;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(PRODUCT_DEFAULT));
  }
  function saveProducts() {
    try { localStorage.setItem(LS_PRODUCTS, JSON.stringify(PRODUCTS)); } catch (e) {}
    __listeners.forEach(function (f) { try { f(); } catch (e) {} });
  }
  /** เพิ่มสินค้าใหม่ (Admin) */
  function addProduct(name, short) {
    var nm = String(name || '').trim();
    if (!nm) throw new Error('กรอกชื่อสินค้าก่อน');
    if (PRODUCTS.some(function (p) { return String(p.name).trim().toLowerCase() === nm.toLowerCase(); })) throw new Error('มีสินค้านี้อยู่แล้ว');
    var max = 0;
    PRODUCTS.forEach(function (p) { var n = parseInt(String(p.code).replace(/\D/g, ''), 10) || 0; if (n > max) max = n; });
    var p = {
      code: 'P' + String(max + 1),
      name: nm,
      short: String(short || nm).trim(),
      color: PRODUCT_COLORS[max % PRODUCT_COLORS.length]
    };
    PRODUCTS.push(p);
    saveProducts();
    if (global.PILog) global.PILog.add('product.add', p.code + ' · ' + nm, 'เพิ่มสินค้าใหม่');
    return p;
  }
  function removeProduct(code) {
    var used = DEALS.filter(function (d) { return d.product === code; }).length;
    if (used) throw new Error('ลบไม่ได้: มีดีลใช้สินค้านี้ ' + used + ' ใบ');
    PRODUCTS = PRODUCTS.filter(function (p) { return p.code !== code; });
    saveProducts();
    if (global.PILog) global.PILog.add('product.del', code, 'ลบสินค้าออกจากระบบ');
  }
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
      if (Object.prototype.toString.call(a) === '[object Array]' && a.length) {
        var dt = dropTestItems(a, function (t) { return (t && (t.name || t.code)) || ''; });
        if (dt.changed) { try { localStorage.setItem('pi_sr_teams_v1', JSON.stringify(dt.list)); } catch (e) {} }
        if (dt.list.length) return dt.list;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(TEAM_DEFAULT));
  }
  function saveTeams() {
    try { localStorage.setItem('pi_sr_teams_v1', JSON.stringify(TEAMS)); } catch (e) {}
    __listeners.forEach(function (f) { try { f(); } catch (e) {} });
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
  /** ทีมที่ผู้ใช้ปัจจุบันถูกล็อกสิทธิ์ (Head Team / Supervisor ที่กำหนดทีมไว้) — คืน '' ถ้าเป็น Admin/BU */
  function viewerTeam() {
    var me = global.__ME__ || {};
    var lvl = String(me.level || '').toLowerCase();
    if (lvLvlAdmin(lvl)) return '';
    var t = TEAM_HEADS[String(me.email || '').toLowerCase()] || '';
    if (t) return t;
    /* ทีม (BU) ที่กำหนดไว้ที่บัญชีผู้ใช้ — ใช้กับ Head / Supervisor */
    var accTeam = String(me.team || '').toUpperCase();
    if (accTeam && (lvl === 'head' || lvl === 'sup')) return accTeam;
    return '';
  }
  /** ระดับที่เห็นข้อมูลทั้งหมด (L1 Admin + L2 BU) */
  function lvLvlAdmin(l) { return l === 'admin' || l === 'bu'; }

  /** cache ทีมที่เคยตรวจสอบแล้ว (ให้โหลดเร็วในครั้งถัดไป) */
  var LS_SCOPE_CACHE = 'pi_scope_cache_v1';
  function scopeCache() {
    try { return JSON.parse(localStorage.getItem(LS_SCOPE_CACHE) || '{}') || {}; } catch (e) { return {}; }
  }
  function setScopeCache(email, team) {
    if (!email) return;
    try {
      var o = scopeCache();
      if (team) o[email] = team; else delete o[email];
      localStorage.setItem(LS_SCOPE_CACHE, JSON.stringify(o));
    } catch (e) {}
  }

  /** หาทีมจากสายงาน (เดินขึ้นไปหาหัวหน้าที่Mapไว้) — Head/Sup ที่ไม่อยู่ในลิสต์ตรง ๆ */
  function teamViaUpline(email) {
    var cached = scopeCache()[email];
    if (cached) { ensureTeamUsers_(email); return cached; }
    var users = global.__TEAM__ || [];
    if (!users.length) ensureTeamUsers_(email);
    var byEmail = {};
    for (var i = 0; i < users.length; i++) byEmail[String(users[i].email || '').toLowerCase()] = users[i];
    var cur = String(email || '').toLowerCase(), guard = 0;
    while (cur && guard++ < 25) {
      if (TEAM_HEADS[cur]) return TEAM_HEADS[cur];
      var u = byEmail[cur];
      if (!u || !u.parent) return '';
      cur = String(u.parent).toLowerCase();
    }
    return '';
  }

  /**
   * ซิงก์ "รายชื่อ AE" จากหน้าจัดการผู้ใช้งาน (คอลัมน์รหัสเซลส์ saleId) — ให้มีแหล่งเดียว
   * คืนค่า true เมื่อรายชื่อเปลี่ยน
   */
  function syncSalesFromUsers_(users) {
    if (!users || !users.length) return false;
    var next = [];
    users.forEach(function (u) {
      var lvl = String((u && u.level) || '').toLowerCase();
      var sid = String((u && u.saleId) || '').trim().toUpperCase();
      if (!sid) return;
      if (lvl !== 'sale' && lvl !== 'agent') return;
      next.push({
        id: sid,
        name: String(u.name || u.email || sid).trim(),
        team: String(u.team || '').toUpperCase(),
        parent: '',
        auto: true,
        email: String(u.email || '').toLowerCase()
      });
    });
    if (!next.length) return false;
    next.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    var sig = function (arr) {
      return arr.map(function (s) { return [s.id, s.name, s.team].join('|'); }).sort().join(';');
    };
    if (sig(SALES) === sig(next)) return false;
    SALES = next;
    saveSales();
    return true;
  }

  /** ดึงรายชื่อผู้ใช้ครั้งเดียวต่อการโหลดหน้า เพื่อเดินสายงานได้ */
  function ensureTeamUsers_(email) {
    var users = global.__TEAM__ || [];
    if (users.length) { try { syncSalesFromUsers_(users); } catch (e) {} return; }
    if (!global.PIAuth || !global.PIAuth.refresh || global.__SCOPE_FETCHING__) return;
    global.__SCOPE_FETCHING__ = true;
    try {
      global.PIAuth.refresh().then(function (list) {
        global.__TEAM__ = list || [];
        try { syncSalesFromUsers_(list); } catch (e) {}
        global.__SCOPE_FETCHING__ = false;
        var t = teamViaUpline(email);
        setScopeCache(email, t);
        __listeners.forEach(function (f) { try { f(); } catch (e) {} });
      }).catch(function () { global.__SCOPE_FETCHING__ = false; });
    } catch (e) { global.__SCOPE_FETCHING__ = false; }
  }

  /** รหัส AE ของบัญชีต้นสาย (ใช้ผูก record ของตัวแทนเข้ากับ AE) */
  function parentSaleIdOf(me) {
    var pe = String((me && me.parent) || '').toLowerCase();
    if (!pe) return '';
    var users = global.__TEAM__ || [];
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === pe) return String(users[i].saleId || '').toUpperCase();
    }
    return '';
  }
  /** รหัส AE ทั้งหมดที่ผู้ใช้เห็น: ของตัวเอง + ตัวแทนที่ผูกไว้ */
  function mySaleIds(sc) {
    sc = sc || scopeOf();
    if (sc.type !== 'sale') return [];
    var ids = [sc.saleId];
    SALES.forEach(function (s) { if (String(s.parent || '').toUpperCase() === String(sc.saleId).toUpperCase()) ids.push(s.id); });
    return ids;
  }

  /** ขอบเขตข้อมูลของผู้ใช้ปัจจุบัน: all | team | sale | none */
  function scopeOf() {
    var me = global.__ME__ || {};
    var lvl = String(me.level || '').toLowerCase();
    if (lvLvlAdmin(lvl)) return { type: 'all' };
    var mail = String(me.email || '').toLowerCase();
    var team = TEAM_HEADS[mail];
    if (team) return { type: 'team', team: team };
    if (lvl === 'head' || lvl === 'sup') {
      team = teamViaUpline(mail);
      if (team) return { type: 'team', team: team };
      /* ยังโหลดรายชื่อไม่เสร็จ → อย่าตีความว่า “ไม่มีสิทธิ์” ทันที */
      if (!(global.__TEAM__ || []).length) return { type: 'pending' };
      setScopeCache(mail, '');
    }
    /* 1) ผูกด้วยรหัสเซลส์โดยตรง (ถ้า admin ตั้งค่าไว้) */
    var sid = String(me.saleId || me.sale || '').trim();
    if (sid) {
      for (var j = 0; j < SALES.length; j++) if (SALES[j].id === sid) return { type: 'sale', saleId: SALES[j].id };
    }
    /* 1.5) ตารางผูกบัญชี → เซลส์ ที่ Admin ตั้งไว้ในหน้า Reports */
    /* 2) ผูกด้วยชื่อ (ตัดช่องว่าง/ตัวอักษรพิเศษออกก่อนเทียบ) */
    var norm = function (v) { return String(v || '').replace(/[\s\u200B\u00A0]+/g, '').trim().toLowerCase(); };
    var nm = norm(me.name);
    if (nm) {
      for (var i = 0; i < SALES.length; i++) {
        if (norm(SALES[i].name) === nm) {
          /* sync ทีมจากบัญชีผู้ใช้ ถ้ารายชื่อเซลส์ยังไม่มีทีม */
          var mt = String(me.team || '').toUpperCase();
          if (mt && !String(SALES[i].team || '').toUpperCase()) {
            SALES[i].team = mt;
            try { localStorage.setItem(LS_SALES, JSON.stringify(SALES)); } catch (e) {}
          }
          return { type: 'sale', saleId: SALES[i].id };
        }
      }
      /* 2.1) ชื่อใกล้เคียง (มีคำนำหน้า/ต่อท้าย หรือชื่อหนึ่งอยู่ในอีกชื่อ) */
      var near = SALES.filter(function (s) {
        var sn = norm(s.name);
        return sn && nm && (sn.indexOf(nm) >= 0 || nm.indexOf(sn) >= 0);
      });
      if (near.length === 1) return { type: 'sale', saleId: near[0].id };
    }
    /* 3) ระดับเซลล์/ตัวแทน → ผูกกับบัญชีผู้ใช้: ถ้ายังไม่มีรายชื่อเซลส์ที่ตรง ให้สร้างให้อัตโนมัติ */
    if (lvl === 'sale' || lvl === 'agent') {
      var nmAcc = String(me.name || '').trim();
      if (nmAcc) {
        var maxId = 0;
        SALES.forEach(function (s) { var n = parseInt(String(s.id || '').replace(/\D/g, ''), 10) || 0; if (n > maxId) maxId = n; });
        var newId = 'S' + String(maxId + 1).padStart(2, '0');
        SALES.push({ id: newId, name: nmAcc, team: String(me.team || '').toUpperCase(), auto: true, parent: parentSaleIdOf(me) });
        try { localStorage.setItem(LS_SALES, JSON.stringify(SALES)); } catch (e) {}
        if (global.PILog) global.PILog.add('sale.add', newId + ' · ' + nmAcc, 'สร้างอัตโนมัติจากบัญชีผู้ใช้ (ระดับ ' + lvl + ')');
        return { type: 'sale', saleId: newId, auto: true };
      }
    }
    /* 4) ยังไม่มีรายชื่อเซลส์ในระบบเลย */
    if (!SALES.length) return { type: 'nosales' };
    /* 4) มีทีม (BU) ที่กำหนดไว้ → ถ้าในทีมมีเซลส์คนเดียว ผูกให้อัตโนมัติ */
    var accTeam = String(me.team || '').toUpperCase();    if (accTeam) {
      var inTeam = SALES.filter(function (s) { return String(s.team).toUpperCase() === accTeam; });
      if (inTeam.length === 1) return { type: 'sale', saleId: inTeam[0].id, autoBy: 'team' };
      return { type: 'none', team: accTeam, teamSales: inTeam.length };
    }
    return { type: 'none', teamSales: -1 };
  }
  function inScope(d) {
    var sc = scopeOf();
    if (sc.type === 'all') return true;
    if (sc.type === 'team') return sale(d.saleId).team === sc.team;
    if (sc.type === 'sale') return mySaleIds(sc).indexOf(d.saleId) >= 0;
    return false;
  }
  /** ข้อความแจ้งเตือนตามสถานะสิทธิ์ (none / pending) */
  function scopeNotice() {
    var sc = scopeOf();
    if (sc.type === 'pending') {
      return '<div class="sr-panel" style="display:flex;gap:10px;align-items:center;background:#F8FAFC;border-color:#E9EEF5">'
        + '<i class="fa-solid fa-circle-notch fa-spin" style="color:#2563EB"></i>'
        + '<div><b style="color:#0F2B46;font-size:12px">กำลังตรวจสอบสิทธิ์การเข้าถึงข้อมูล…</b>'
        + '<div class="sr-s2">ระบบกำลังโหลดรายชื่อในสายงานของคุณ กรุณารอสักครู่</div></div></div>';
    }
    if (sc.type === 'none') {
      var me0 = global.__ME__ || {};
      var accName = String(me0.name || '').trim() || '(ยังไม่ตั้งชื่อบัญชี)';
      var accTeam0 = String(me0.team || '').toUpperCase();
      var detail;
      if (sc.teamSales === 0) {
        detail = 'ทีม ' + accTeam0 + ' ยังไม่มีรายชื่อ AE — ให้เพิ่มที่ Reports → รายชื่อ AE แล้วตั้งชื่อให้ตรงกับ “' + accName + '”';
      } else if (sc.teamSales > 1) {
        detail = 'ทีม ' + accTeam0 + ' มีรายชื่อ AE ' + sc.teamSales + ' คน — ตั้งชื่อบัญชี (“' + accName + '”) ให้ตรงกับชื่อ AE คนใดคนหนึ่งเพื่อระบุตัวตน';
      } else {
        detail = 'ตั้งชื่อบัญชี (“' + accName + '”) ให้ตรงกับชื่อใน Reports → รายชื่อ AE หรือกำหนดทีม (BU) ให้บัญชีนี้';
      }
      return '<div class="sr-panel" style="display:flex;gap:10px;align-items:flex-start;background:#FFF7ED;border-color:#FFEDD5">'
        + '<i class="fa-solid fa-circle-info" style="color:#C2410C;margin-top:2px"></i>'
        + '<div><b style="color:#9A3412;font-size:12px">บัญชีนี้ยังไม่ถูกผูกกับข้อมูล AE</b>'
        + '<div class="sr-s2" style="color:#B45309">' + esc(detail) + '</div></div></div>';
    }
    if (sc.type === 'nosales') {
      return '<div class="sr-panel" style="display:flex;gap:10px;align-items:flex-start;background:#FFF7ED;border-color:#FFEDD5">'
        + '<i class="fa-solid fa-circle-info" style="color:#C2410C;margin-top:2px"></i>'
        + '<div><b style="color:#9A3412;font-size:12px">ยังไม่มีรายชื่อ AE ในระบบ</b>'
        + '<div class="sr-s2" style="color:#B45309">Admin กรุณาเพิ่มรายชื่อ AE ที่ Reports → “รายชื่อ AE” ก่อน แล้วตั้งชื่อบัญชีผู้ใช้ให้ตรงกับชื่อ AE นั้น</div></div></div>';
    }
    return '';
  }

  /* ---------- รายชื่อเซลส์ (Sale) — เพิ่ม/ลบเองได้ เก็บในเครื่องนี้ ---------- */
  var LS_SALES = 'pi_sr_sales_v1';
  var SALES = loadSales();
  function loadSales() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_SALES) || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]') {
        /* ลบรายชื่อ AE ที่เป็นข้อมูลทดสอบค้างในเครื่อง เช่น "ทดสอบ AE 1" */
        var dt = dropTestItems(a, function (s) { return (s && s.name) || ''; });
        if (dt.changed) { try { localStorage.setItem(LS_SALES, JSON.stringify(dt.list)); } catch (e) {} }
        return dt.list;
      }
    } catch (e) {}
    return [];                             /* เริ่มต้นว่าง — ผู้ใช้เพิ่มรายชื่อเอง */
  }
  function saveSales() {
    try { localStorage.setItem(LS_SALES, JSON.stringify(SALES)); } catch (e) {}
    __listeners.forEach(function (f) { try { f(); } catch (e) {} });
  }
  function nextSaleId() {
    var max = 0;
    SALES.forEach(function (s) { var n = parseInt(String(s.id || '').replace(/\D/g, ''), 10) || 0; if (n > max) max = n; });
    return 'S' + String(max + 1).padStart(2, '0');
  }
  function normSaleName(v) { return String(v || '').replace(/[\s\u200B\u00A0]+/g, '').toLowerCase(); }
  /** เพิ่มรายชื่อเซลส์ (รหัส S01, S02, … สร้างให้อัตโนมัติ) */
  function addSale(name, team) {
    var nm = String(name || '').trim();
    var tm = String(team || '').trim().toUpperCase();
    if (!nm) throw new Error('กรอกชื่อ AE ก่อน');
    if (!tm) throw new Error('เลือกทีม (BU)');
    if (SALES.some(function (s) { return normSaleName(s.name) === normSaleName(nm); })) throw new Error('มีชื่อ AE นี้อยู่แล้ว');
    var s = { id: nextSaleId(), name: nm, team: tm };
    SALES.push(s);
    saveSales();
    if (global.PILog) global.PILog.add('sale.add', s.id + ' · ' + nm, 'ทีม ' + teamByCode(tm).name);
    return s;
  }
  /** ลบรายชื่อเซลส์ (ลบไม่ได้ถ้ายังมีดีลค้างอยู่) */
  function removeSale(id) {
    var used = DEALS.filter(function (d) { return d.saleId === id; }).length;
    if (used) throw new Error('ลบไม่ได้: ยังมีดีลของ AE คนนี้ ' + used + ' ใบ');
    SALES = SALES.filter(function (s) { return s.id !== id; });
    saveSales();
    if (global.PILog) global.PILog.add('sale.del', id, 'ลบรายชื่อ AE ออกจากระบบ');
  }
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
    __listeners.forEach(function (f) { try { f(); } catch (e) {} });
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
    var before = num(arr[monthIdx]);
    arr[monthIdx] = num(value);
    saveTargets();
    try {
      if (global.PIAuth && global.PIAuth.saveTargetV2 && global.PIAuth.session && global.PIAuth.session()) {
        global.PIAuth.saveTargetV2(code, year, monthIdx + 1, num(value)).catch(function () {});
      }
    } catch (e) {}
    if (before !== num(value) && global.PILog) {
      global.PILog.add('target.save', teamByCode(code).name + ' · ' + TH_MONTHS[monthIdx] + ' ' + (year + 543),
        'เป้า ' + money(before) + ' → ' + money(value));
    }
  }
  /** ดึงเป้าหมายจากคลาวด์ (Sources of truth: แท็บ Targets) */
  function syncTargetsFromCloud() {
    try {
      if (!(global.PIAuth && global.PIAuth.listTargetsV2 && global.PIAuth.session && global.PIAuth.session())) return;
      global.PIAuth.listTargetsV2().then(function (rows) {
        if (!rows || !rows.length) return;
        var changed = false;
        rows.forEach(function (t) {
          if (!t.team || !t.year || !t.month) return;
          var y = TARGETS[t.year] || (TARGETS[t.year] = {});
          if (!y[t.team]) y[t.team] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          if (num(y[t.team][t.month - 1]) !== num(t.amount)) { y[t.team][t.month - 1] = num(t.amount); changed = true; }
        });
        if (changed) {
          try { localStorage.setItem('pi_sr_targets_v2', JSON.stringify(TARGETS)); } catch (e) {}
          __listeners.forEach(function (f) { try { f(); } catch (e) {} });
        }
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(syncTargetsFromCloud, 1500);
  /** เป้าหมายของทีม: month = 0 หมายถึงรวมทั้งปี */
  function targetOf(code, year, month) {
    var arr = targetsOfTeam(code, year);
    if (!month) return arr.reduce(function (a, b) { return a + num(b); }, 0);
    return num(arr[month - 1]);
  }

  /* ============================ 2) MOCK DATA ============================ */
  /* prob = โอกาสปิด (%) ใช้เฉพาะสถานะ 1 (Pipeline) ตามที่กำหนด 3 ระดับ 50/40/30 */
  var DEALS = [];   /* ยังไม่มีดีล — ผู้ใช้เพิ่มเองผ่านปุ่ม “+ เพิ่มดีล” */

  /* ---------- เก็บดีลลงเครื่อง (ให้ทุกหน้าใช้ชุดข้อมูลเดียวกัน) ---------- */
  var LS_DEALS = 'pi_sr_deals_v2';   /* v2 = ล้างดีลตัวอย่างเดิมในเครื่องผู้ใช้ */
  var __listeners = [];
  var __SEED_DEALS__ = [];   // ไม่มีชุดตัวอย่างแล้ว (Reset = ล้างทั้งหมด)
  (function restoreDeals() {
    try {
      localStorage.removeItem('pi_sr_deals_v1');   /* ล้างชุดดีลตัวอย่างเดิมทิ้ง */
    } catch (e) {}
    try {
      var a = JSON.parse(localStorage.getItem(LS_DEALS) || 'null');
      if (Object.prototype.toString.call(a) === '[object Array]' && a.length) {
        DEALS.length = 0;
        Array.prototype.push.apply(DEALS, a);
        /* อพยพเลขดีลเดิมที่ขึ้นต้นด้วย SO- → เลขรันล้วน (2026-0001) */
        var changed = false;
        DEALS.forEach(function (d) {
          var m = String(d.no || '').match(/^SO-(\d{4}-\d+)$/i);
          if (m) { d.no = m[1]; changed = true; }
          /* โอกาสปิด (%) ล็อกตามสถานะงาน → ปรับข้อมูลเดิมให้ตรง */
          if (num(d.prob) !== probOfStatus(d.status)) { d.prob = probOfStatus(d.status); changed = true; }
        });
        if (changed) { try { localStorage.setItem(LS_DEALS, JSON.stringify(DEALS)); } catch (e) {} }
      }
    } catch (e) {}
  })();
  function saveDeals() {
    try { localStorage.setItem(LS_DEALS, JSON.stringify(DEALS)); } catch (e) {}
    __listeners.forEach(function (f) { try { f(); } catch (e) {} });
  }
  function onChange(fn) { if (typeof fn === 'function') __listeners.push(fn); }

  /* ============================ 3.5) CLOUD SYNC ============================ */
  /* ดีลเก็บในเครื่องเป็นหลัก + ซิงก์ขึ้นแท็บ `Deals` บน Google Sheet
     - ออฟไลน์ได้: เก็บคิวใน pi_sync_queue_v1 แล้วค่อยส่งซ้ำ */
  var LS_QUEUE = 'pi_sync_queue_v1';
  function syncQueue() {
    try { var a = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); return Object.prototype.toString.call(a) === '[object Array]' ? a : []; } catch (e) { return []; }
  }
  function setQueue(q) { try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); } catch (e) {} }
  function enqueue(op) { var q = syncQueue(); q.push(op); setQueue(q); }
  function cloudReady() {
    try {
      return !!(global.PIAuth && global.PIAuth.saveDealV2 && global.PIAuth.session && global.PIAuth.session());
    } catch (e) { return false; }
  }
  /** แปลงดีลจากคลาวด์ → รูปแบบในเครื่อง */
  function fromCloud(c) {
    return {
      no: c.no, so: c.so || '', customer: c.customer || '', job: c.job || '',
      quoteDate: c.quoteDate || '', year: Number(c.year) || 0, month: Number(c.month) || 0,
      saleId: String(c.saleId || '').toUpperCase(), product: c.product || 'P1',
      amount: Number(c.amount) || 0, payment: c.payment || 'cash',
      status: Number(c.status) || 0, prob: probOfStatus(c.status),
      note: c.note || '', drRef: (c.drRef || '').toUpperCase(), docNo: c.docNo || '',
      ownerEmail: String(c.ownerEmail || '').toLowerCase(),
      createdAt: c.createdAt || '', updatedAt: c.updatedAt || ''
    };
  }
  /** ส่งคิวที่ค้างอยู่ขึ้นคลาวด์ */
  function flushQueue() {
    if (!cloudReady()) return;
    var q = syncQueue();
    if (!q.length) return;
    var op = q[0];
    var done = function () { var rest = syncQueue(); rest.shift(); setQueue(rest); flushQueue(); };
    try {
      if (op.op === 'save' && global.PIAuth.saveDealV2) {
        global.PIAuth.saveDealV2(op.deal).then(function (res) {
          /* เซิร์ฟเวอร์อาจให้เลขใหม่ — อัปเดตในเครื่องทันที กันการส่งซ้ำรอบหน้า */
          if (res && res.no && op.deal && op.deal.no && res.no !== op.deal.no) {
            for (var i = 0; i < DEALS.length; i++) {
              if (DEALS[i].no === op.deal.no) { DEALS[i].no = res.no; saveDeals(); break; }
            }
          }
          done();
        }).catch(function () {});
      }
      else if (op.op === 'del' && global.PIAuth.deleteDealV2) global.PIAuth.deleteDealV2(op.no).then(done).catch(function () {});
      else done();
    } catch (e) {}
  }
  /* ซิงก์คิวอัตโนมัติ: กลับมาออนไลน์ / เปิดหน้าใหม่ / ตรวจทุก 60 วินาที */
  try {
    global.addEventListener('online', function () { flushQueue(); });
    setTimeout(function () { flushQueue(); }, 4000);
    setInterval(function () { if (syncQueue().length) flushQueue(); }, 60000);
  } catch (e) {}

  /** บันทึกดีลขึ้นคลาวด์ (ล้มเหลว → เข้าคิว) · isNew = ดีลใหม่ → ให้เซิร์ฟเวอร์ออกเลขดีลเอง */
  function cloudSave(d, isNew) {
    if (!cloudReady() || !global.PIAuth.saveDealV2) return;
    var payload = d;
    if (isNew) {
      payload = {};
      Object.keys(d).forEach(function (k) { payload[k] = d[k]; });
      payload.isNew = true;
    }
    try {
      global.PIAuth.saveDealV2(payload).then(function (res) {
        /* เซิร์ฟเวอร์อาจให้เลขใหม่เมื่อเลขซ้ำข้ามเครื่อง */
        if (res && res.no && res.no !== d.no) {
          d.no = res.no;
          saveDeals();
          if (typeof global.toast === 'function') global.toast('ระบบออกเลขดีลให้ใหม่ ' + res.no);
        }
        flushQueue();
      }).catch(function () {
        enqueue({ op: 'save', deal: payload, ts: Date.now() });
        if (typeof global.toast === 'function') global.toast('บันทึกในเครื่องแล้ว — จะซิงก์คลาวด์เมื่อออนไลน์');
      });
    } catch (e) {}
  }
  function cloudDelete(no) {
    if (!cloudReady() || !global.PIAuth.deleteDealV2) return;
    try {
      global.PIAuth.deleteDealV2(no).then(function () { flushQueue(); }).catch(function () {
        enqueue({ op: 'del', no: no, ts: Date.now() });
      });
    } catch (e) {}
  }
  /** ดึงดีลจากคลาวด์มารวมกับข้อมูลในเครื่อง (ใหม่กว่าชนะ) */
  function syncFromCloud() {
    if (!cloudReady() || !global.PIAuth.listDealsV2) return;
    try {
      global.PIAuth.listDealsV2().then(function (res) {
        /* รองรับทั้ง 2 รูปแบบ: array ของดีล หรือ { deals, deletedNos } */
        var list = Array.isArray(res) ? res : ((res && res.deals) || []);
        var deleted = {};
        (!Array.isArray(res) && res && res.deletedNos ? res.deletedNos : []).forEach(function (no) { deleted[no] = 1; });
        var changed = false;
        /* ดีลที่ถูกลบบนคลาวด์ → ลบสำเนาในเครื่องทิ้ง (กันการฟื้นคืน) */
        if (Object.keys(deleted).length) {
          var before = DEALS.length;
          for (var q = DEALS.length - 1; q >= 0; q--) {
            if (deleted[DEALS[q].no]) { DEALS.splice(q, 1); changed = true; }
          }
          if (DEALS.length !== before) changed = true;
        }
        var cloudNos = {};
        list.forEach(function (c) {
          cloudNos[c.no] = 1;
          var loc = null;
          for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === c.no) { loc = DEALS[i]; break; }
          var remote = fromCloud(c);
          if (!loc) { DEALS.push(remote); changed = true; return; }
          var lu = Date.parse(loc.updatedAt || loc.createdAt || '') || 0;
          var cu = Date.parse(remote.updatedAt || '') || 0;
          if (cu > lu) { for (var k in remote) if (Object.prototype.hasOwnProperty.call(remote, k)) loc[k] = remote[k]; changed = true; }
        });
        /* ดีลในเครื่องที่ยังไม่เคยขึ้นคลาวด์ → ดันขึ้นครั้งแรก (ข้ามใบที่ถูกลบไปแล้ว และใบที่ยังอยู่ในคิว) */
        var queued = {};
        syncQueue().forEach(function (o) { if (o.op === 'save' && o.deal && o.deal.no) queued[o.deal.no] = 1; });
        DEALS.filter(function (d) { return !cloudNos[d.no] && !deleted[d.no] && !queued[d.no]; }).slice(0, 200).forEach(function (d) {
          cloudSave(d, true);   /* ให้เซิร์ฟเวอร์ออกเลขใหม่ — กันเลขซ้ำ/สร้างซ้ำ */
        });
        if (changed) saveDeals();
        flushQueue();
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(syncFromCloud, 1200);

  /** ผูก AE ในเครื่องให้ตรงกับบัญชีผู้ใช้บนเซิร์ฟเวอร์ (saleId / ชื่อ / ทีม / ผู้ดูแล) */
  function syncSalesFromUsers() {
    if (!(global.PIAuth && global.PIAuth.listUsers)) return;
    var users = [];
    try { users = global.PIAuth.listUsers() || []; } catch (e) { return; }
    if (!users.length) return;
    var emailToSale = {};
    users.forEach(function (u) {
      var sid = String(u.saleId || '').toUpperCase();
      if (sid) emailToSale[String(u.email || '').toLowerCase()] = sid;
    });
    var changed = false;
    users.forEach(function (u) {
      var lv = String(u.level || '').toLowerCase();
      if (lv !== 'sale' && lv !== 'agent') return;
      var sid = String(u.saleId || '').toUpperCase();
      if (!sid) return;
      var team = String(u.team || '').toUpperCase();
      var rec = null;
      for (var i = 0; i < SALES.length; i++) if (String(SALES[i].id).toUpperCase() === sid) { rec = SALES[i]; break; }
      if (!rec) {
        SALES.push({ id: sid, name: u.name || u.email || sid, team: team, parent: '' });
        rec = SALES[SALES.length - 1];
        changed = true;
      }
      if (u.name && rec.name !== u.name) { rec.name = u.name; changed = true; }
      if (team && rec.team !== team) { rec.team = team; changed = true; }
      if (lv === 'agent') {
        var pSale = emailToSale[String(u.parent || '').toLowerCase()] || '';
        if ((rec.parent || '') !== pSale) { rec.parent = pSale; changed = true; }
      }
    });
    if (changed) saveSales();
  }
  setTimeout(function () {
    try {
      if (global.PIAuth && global.PIAuth.seed) {
        global.PIAuth.seed().then(syncSalesFromUsers).catch(function () {});
      }
    } catch (e) {}
  }, 900);

  /** เลขดีลรันตามลำดับ (ปี-0001) — กันเลขซ้ำเมื่อมีลบดีล */
  function seqOf(no, yr) {
    var s = String(no || '').toUpperCase();
    var key = String(yr) + '-';
    var p = s.indexOf(key);
    if (p < 0) return 0;
    var tail = s.slice(p + key.length);
    if (!/^\d+$/.test(tail)) return 0;
    return parseInt(tail, 10) || 0;
  }
  function nextNo(yr) {
    var y = Number(yr) || new Date().getFullYear();
    var n = 0;
    DEALS.forEach(function (d) {
      var k = seqOf(d.no, y);
      if (k > n) n = k;
    });
    return y + '-' + String(n + 1).padStart(4, '0');
  }

  /** เพิ่มดีลใหม่ (ใช้ร่วมกับหน้า AE Pipeline) */
  function addDeal(o) {
    var yr = Number(o.year) || new Date().getFullYear();
    var mo = Number(o.month) || (new Date().getMonth() + 1);
    var d = {
      no: o.no || nextNo(yr),
      so: String(o.so || '').trim(),
      customer: String(o.customer || '').trim(),
      job: String(o.job || o.name || '').trim(),
      quoteDate: o.quoteDate || new Date().toISOString().slice(0, 10),
      year: yr, month: mo,
      saleId: o.saleId || '',
      product: o.product || 'P1',
      amount: Number(o.amount || 0),
      payment: o.payment || 'cash',
      status: Number(o.status),
      prob: probOfStatus(o.status),
      docNo: String(o.docNo || '').trim(),
      note: String(o.note || ''),
      drRef: String(o.drRef || '').trim().toUpperCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!d.customer || !d.job) throw new Error('กรอกชื่อลูกค้าและชื่องาน');
    if (!d.saleId || !SALES.some(function (s) { return s.id === d.saleId; })) {
      throw new Error('ยังไม่ได้เลือก AE ผู้รับผิดชอบ (หรือบัญชีนี้ไม่ถูกผูกกับ AE)');
    }
    if (isNaN(d.status)) d.status = 1;
    if (d.status === 4 && !d.docNo) throw new Error('สถานะ “ปิดงานแล้ว” ต้องระบุเลขอินวอย / เลขที่สัญญา / เลขที่ SO');
    DEALS.push(d);
    saveDeals();
    cloudSave(d, true);
    if (global.PILog) global.PILog.add('deal.add', d.no + ' · ' + d.customer, d.job + ' · ' + money(d.amount) + ' · ' + st(d.status).label);
    return d;
  }
  function removeDeal(no) {
    for (var i = 0; i < DEALS.length; i++) {
      if (DEALS[i].no === no) { DEALS.splice(i, 1); saveDeals(); cloudDelete(no); return true; }
    }
    return false;
  }

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
    return DEALS.filter(function (d) { return inScope(d) && matchFilters(d, state); });
  }

  /**
   * สรุปตัวเลขของชุดดีล (ใช้ทั้ง KPI และแถวรายคน)
   * สูตรที่ใช้ทั้งระบบ:
   *   รวม 1 = ปิดงานแล้ว + รอส่งของ
   *   รวม 2 = ปิดงานแล้ว + รอส่งของ + รอยืนยัน PO
   *   Forecast ปิดเดือน = (ปิดแล้ว + รอส่งของ) 100% + รอยืนยัน PO 50% + Pipeline 25%
   */
  function summarize(list) {
    var s = { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, weighted1: 0, weighted2: 0, cashIn: 0, count: 0 };
    list.forEach(function (d) {
      var a = num(d.amount);
      if (d.status === 5) { s.s5 += a; return; }
      if (d.status === 4) s.s4 += a;
      else if (d.status === 3) s.s3 += a;
      else if (d.status === 2) s.s2 += a;
      else if (d.status === 1) s.s1 += a;
      else s.s0 += a;
      s.count++;
      s.cashIn += cashInOf(d);
    });
    s.sum43 = s.s4 + s.s3;                    /* ปิดงานแล้ว + รอส่งของ */
    s.sum432 = s.s4 + s.s3 + s.s2;            /* + รอยืนยัน PO */
    s.weighted2 = s.s2 * 0.5;                 /* รอยืนยัน PO ถ่วง 50% */
    s.weighted1 = s.s1 * 0.25;                /* Pipeline ถ่วง 25% */
    s.secured = s.sum43;                      /* ยอดที่มั่นใจ (ปิดแล้ว + รอส่งของ) */
    s.forecast = s.sum43 + s.weighted2 + s.weighted1;
    s.totalSale = s.s4 + s.s3 + s.s2 + s.s1;
    return s;
  }

  function kpis() {
    var sc = scopeOf();
    var list = filteredDeals();
    var sum = summarize(list);
    var scopeTeams = [];
    if (sc.type === 'all') scopeTeams = state.team ? TEAMS.filter(function (t) { return t.code === state.team; }) : TEAMS;
    else if (sc.type === 'team') scopeTeams = TEAMS.filter(function (t) { return t.code === sc.team; });
    else if (sc.type === 'sale') scopeTeams = TEAMS.filter(function (t) { return t.code === sale(sc.saleId).team; });
    var monthTargets = scopeTeams.map(function (t) {
      return { code: t.code, name: t.name, amount: targetOf(t.code, state.year, state.month) };
    });
    var target = monthTargets.reduce(function (a, x) { return a + x.amount; }, 0);
    var headCount = SALES.filter(function (r) {
      if (state.sale) return r.id === state.sale;
      return scopeTeams.some(function (t) { return t.code === r.team; });
    }).length || 1;
    var perHead = target / headCount;
    if (sc.type === 'sale') {
      /* AE: เห็นตัวเอง + ตัวแทนที่ผูกไว้ → เป้า = เป้า/คน × จำนวนคนในความดูแล */
      var mineN = mySaleIds(sc).length || 1;
      target = perHead * mineN;
      headCount = mineN;
    }
    else if (state.sale) { target = perHead; headCount = 1; }
    return {
      sum: sum, list: list, target: target, headCount: headCount, perHead: perHead,
      teams: scopeTeams, monthTargets: monthTargets,
      ach4: target ? sum.s4 / target * 100 : 0,
      ach43: target ? sum.sum43 / target * 100 : 0,
      ach432: target ? sum.sum432 / target * 100 : 0,
      forecastPct: target ? sum.forecast / target * 100 : 0
    };
  }

  /* ============================ 4) VIEW ============================ */
  var state = { year: 2026, month: 11, team: '', sale: '', product: '', payment: '', q: '', sortKey: 'no', sortDir: 1, perfTeam: '', dashPerf: 'team', dashTrend: '', view: 'report', summaryView: 'cards' };
  var ui = { targets: false };
  var __editNo = '';    // เลขดีลที่กำลังแก้ไข
  var __openNo = '';    // เลขดีลที่เปิดดูอยู่
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
    var yearOpts = yearsList().map(function (y) { return opt(y, String(y + 543) + ' (' + y + ')', state.year); }).join('');
    var monthOpts = '<option value=""' + (state.month ? '' : ' selected') + '>ทุกเดือน</option>' +
      TH_MONTHS.map(function (m, i) { return opt(i + 1, String(i + 1).padStart(2, '0') + '.' + m, state.month); }).join('');
    var saleOpts = '<option value="">ทุกคน</option>' + SALES.map(function (s) {
      return opt(s.id, teamByCode(s.team).name + ' · ' + s.name, state.sale);
    }).join('');
    var teamOpts = '<option value="">ทุกทีม</option>' + TEAMS.map(function (t) { return opt(t.code, t.name, state.team); }).join('');
    var lockedTeam = viewerTeam();
    var scF = scopeOf();
    var mineSale = scF.type === 'sale' ? sale(scF.saleId) : null;

    /* แถบขอบเขตข้อมูล (ไม่ใช่ช่องกรอก) — แสดงเฉพาะเมื่อสิทธิ์ถูกล็อก */
    var scopeBar = '';
    if (mineSale) {
      scopeBar = '<div class="sr-scopepill" title="คุณเห็นเฉพาะข้อมูลของตัวเอง">'
        + '<i class="fa-solid fa-lock"></i><span>ขอบเขตข้อมูล</span>'
        + '<b>' + esc(teamByCode(mineSale.team).name) + '</b>'
        + '<span class="sr-scopepill-sep">·</span>'
        + '<b>' + esc(mineSale.id + ' · ' + mineSale.name) + '</b>'
        + '<span class="sr-scopepill-tag">เฉพาะของฉัน</span></div>';
    } else if (lockedTeam) {
      scopeBar = '<div class="sr-scopepill" title="คุณเห็นเฉพาะทีมที่ดูแล">'
        + '<i class="fa-solid fa-lock"></i><span>ขอบเขตข้อมูล</span>'
        + '<b>' + esc(teamByCode(lockedTeam).name) + '</b>'
        + '<span class="sr-scopepill-tag">ทีมที่คุณดูแล</span></div>';
    }

    var aeSelect = '<div class="sr-fl"><label>AE</label><select data-sr-filter="sale">'
      + (scF.type === 'team'
        ? ('<option value="">ทุกคนในทีม</option>' + SALES.filter(function (s) { return s.team === scF.team; }).map(function (s) {
            return opt(s.id, s.name, state.sale);
          }).join(''))
        : saleOpts)
      + '</select></div>';
    var prodOpts = '<option value="">ทุกสินค้า</option>' + PRODUCTS.map(function (p) { return opt(p.code, p.name, state.product); }).join('');
    var payOpts = '<option value="">ทุกรูปแบบ</option>' + PAYMENTS.map(function (p) { return opt(p.code, p.name, state.payment); }).join('');

    var flds = [];
    flds.push('<div class="sr-fl"><label>ปี</label><select data-sr-filter="year">' + yearOpts + '</select></div>');
    flds.push('<div class="sr-fl"><label>เดือนที่คาดว่าจะปิด</label><select data-sr-filter="month">' + monthOpts + '</select></div>');
    if (!mineSale) {
      if (!lockedTeam) flds.push('<div class="sr-fl"><label>ทีม (BU)</label><select data-sr-filter="team">' + teamOpts + '</select></div>');
      flds.push(aeSelect);
    }
    flds.push('<div class="sr-fl"><label>สินค้า</label><select data-sr-filter="product">' + prodOpts + '</select></div>');
    flds.push('<div class="sr-fl"><label>รูปแบบการซื้อ</label><select data-sr-filter="payment">' + payOpts + '</select></div>');

    return ''
      + '<div class="sr-filters' + (flds.length === 4 ? ' sr-f4' : '') + '" id="srFilters">'
      + flds.join('')
      + '  <div class="sr-fbtn">'
      + '    <button class="sr-btn" data-sr-reset title="ล้างตัวกรอง"><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button>'
      + '    <button class="sr-btn dark" data-sr-export title="ส่งออก CSV"><i class="fa-solid fa-download"></i> Export CSV</button>'
      + '  </div>'
      + '</div>'
      + scopeBar;
  }

  function renderKpis(k) {
    var s = k.sum;
    var scope = state.month ? monthLabel(state.year, state.month) : ('ปี ' + (state.year + 543));
    var scK = scopeOf();
    var tgtLabel = scK.type === 'sale' ? 'เป้าหมายของฉัน' : 'เป้าหมายทีม';
    var cards = [
      cardKpi(tgtLabel,
        money(k.target),
        'จำนวนคน <b>' + k.headCount + '</b> คน · เฉลี่ย/คน <b>' + money(k.perHead) + '</b>'
          + (scK.type === 'sale' ? '' : '<br><span class="sr-link" data-sr-toggletargets><i class="fa-solid fa-pen-to-square"></i> ใส่ Target รายเดือน</span>'),
        undefined, '#0F2B46', 'fa-solid fa-bullseye'),
      cardKpi('Actual ปิดงานแล้ว',
        pct(k.ach4),
        money(s.s4) + ' จากเป้า ' + money(k.target),
        k.ach4, '#2563EB', 'fa-solid fa-circle-check'),
      cardKpi('ปิดงานแล้ว + รอส่งของ',
        pct(k.ach43),
        money(s.sum43) + ' (ปิด ' + money(s.s4) + ' + รอส่ง ' + money(s.s3) + ')',
        k.ach43, '#0EA5E9', 'fa-solid fa-truck-fast'),
      cardKpi('ปิดแล้ว + รอส่ง + รอ PO',
        pct(k.ach432),
        money(s.sum432) + ' (+PO ' + money(s.s2) + ')',
        k.ach432, '#7C3AED', 'fa-solid fa-layer-group'),
      cardKpi('ประมาณการยอดขายปิดเดือน',
        money(s.forecast),
        'ปิด+รอส่ง <b>' + money(s.secured) + '</b> + PO 50% <b>' + money(s.weighted2) + '</b> + Pipeline 25% <b>' + money(s.weighted1) + '</b>',
        k.forecastPct, '#16A34A', 'fa-solid fa-chart-line')
    ];
    return '<div class="sr-scope"><i class="fa-regular fa-calendar"></i> ขอบเขตข้อมูล: <b>' + esc(scope) + '</b>' +
      ' · ' + k.list.length + ' ดีล</div>'
      + '<div class="sr-kpis">' + cards.join('') + '</div>';
  }

  function renderSummaryTable() {
    var y = state.year, m = state.month;
    var monF = function (d) { return (!state.product || d.product === state.product) && (!state.payment || d.payment === state.payment); };

    /* จัดกลุ่มตามทีม (BU) */
    var blocks = [];
    var sc0 = scopeOf();
    TEAMS.forEach(function (t) {
      if (state.team && state.team !== t.code) return;
      if (sc0.type === 'team' && t.code !== sc0.team) return;
      if (sc0.type === 'sale' && sale(sc0.saleId).team !== t.code) return;
      if (sc0.type === 'none') return;
      var members = SALES.filter(function (r) {
        if (r.team !== t.code) return false;
        if (sc0.type === 'sale') return mySaleIds(sc0).indexOf(r.id) >= 0;
        return !state.sale || r.id === state.sale;
      });
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

    var head = m ? (TH_MONTHS[m - 1] + ' ' + (y + 543)) : ('ทั้งปี ' + (y + 543));

    var totAch = tot.target ? (tot.m.s4 / tot.target * 100) : 0;
    var totFcVal = blocks.reduce(function (a, b) { return a + num(b.sum.forecast); }, 0);

    /* ---------- มุมมองที่ 1: ตารางย่อ (อ่านง่าย) ---------- */
    function tableView() {
      var hd = function (label, color, cls, sortCls) {
        return '<th class="sr-num ' + (cls || '') + '">'
          + (color ? '<span class="sr-hdot" style="background:' + color + '"></span>' : '') + label + '</th>';
      };
      var body = blocks.map(function (b) {
        var perHead = b.rows.length ? b.target / b.rows.length : 0;
        var ach4 = b.target ? (b.sum.s4 / b.target * 100) : 0;
        var fc = b.target ? (b.sum.forecast / b.target * 100) : 0;
        var band = '<tr class="sr-band"><td colspan="8">'
          + '<span class="sr-band-name"><i class="fa-solid fa-users"></i> ' + esc(b.team.name) + '</span>'
          + '<span class="sr-band-sub">' + b.rows.length + ' คน · เป้า ' + money(b.target) + ' · ปิดแล้ว ' + money(b.sum.s4) + '</span>'
          + '<span class="sr-band-pill">Actual <b>' + pct(ach4) + '</b></span>'
          + '<span class="sr-band-pill alt">Forecast <b>' + pct(fc) + '</b></span>'
          + '</td></tr>';

        var saleRows = b.rows.map(function (x) {
          var av = String(x.sale.name || '').trim().charAt(0) || '?';
          var g = perHead ? (x.s.s4 / perHead * 100) : 0;
          var col = fcColor(g);
          var otherY = num(x.other.s1) + num(x.other.s0);
          var otherTip = 'Pipeline ' + money(x.other.s1) + ' · กำลังคุย ' + money(x.other.s0)
            + (num(x.other.s5) ? ' · ยกเลิก ' + money(x.other.s5) : '');
          return '<tr>'
            + '<td class="sr-sticky"><div class="sr-sale"><span class="sr-av">' + esc(av) + '</span>'
            + '  <div style="min-width:0"><div class="sr-nm">' + esc(x.sale.name) + '</div>'
            + '  <div class="sr-s2">' + esc(x.sale.team) + ' · เป้า/คน ' + money(perHead) + '</div></div></div></td>'
            + '<td class="sr-num sr-act">'
            + (x.s.s4
              ? '  <b style="color:' + col + '">' + money(x.s.s4) + '</b>'
                + '  <div class="sr-mini"><span style="width:' + Math.max(0, Math.min(100, g)) + '%;background:' + col + '"></span></div>'
                + '  <small style="color:' + col + '">' + pct(g) + '</small>'
              : '  <span class="sr-dim">—</span>')
            + '</td>'
            + '<td class="sr-num">' + (x.s.s3 ? money(x.s.s3) : '<span class="sr-dim">—</span>') + '</td>'
            + '<td class="sr-num">' + (x.s.s2 ? money(x.s.s2) : '<span class="sr-dim">—</span>') + '</td>'
            + '<td class="sr-num">' + (x.s.s1 ? money(x.s.s1) : '<span class="sr-dim">—</span>') + '</td>'
            + '<td class="sr-num sr-total-col sr-strong">' + money(x.s.totalSale) + '</td>'
            + '<td class="sr-num sr-fc-col">' + money(x.s.forecast) + '</td>'
            + '<td class="sr-num sr-muted" title="' + esc(otherTip) + '">' + (otherY ? money(otherY) : '<span class="sr-dim">—</span>') + '</td>'
            + '</tr>';
        }).join('');
        return band + saleRows;
      }).join('');

      var totOther = num(tot.o.s1) + num(tot.o.s0);
      return '<div class="sr-tablewrap"><table class="sr-table sr-sum2"><thead><tr>'
        + '<th class="sr-sticky sr-td-sale">AE</th>'
        + '<th class="sr-num" style="min-width:96px">Actual</th>'
        + hd('รอส่งของ', '#38BDF8')
        + hd('รอ PO', '#F59E0B')
        + hd('Pipeline', '#A78BFA')
        + '<th class="sr-num sr-total-col" style="min-width:102px">รวมเดือนนี้</th>'
        + '<th class="sr-num">Forecast</th>'
        + '<th class="sr-num" title="งานเดือนอื่นในปี ' + (y + 543) + ' (Pipeline + กำลังคุย)">เดือนอื่นในปี</th>'
        + '</tr></thead><tbody>'
        + (body || '<tr><td colspan="8" class="sr-empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>')
        + '</tbody><tfoot><tr class="sr-total-row">'
        + '<td class="sr-sticky"><b>รวมทั้งหมด</b><div class="sr-s2">' + pct(totAch) + ' ของเป้า ' + money(tot.target) + '</div></td>'
        + '<td class="sr-num sr-strong">' + money(tot.m.s4) + '</td>'
        + '<td class="sr-num">' + money(tot.m.s3) + '</td>'
        + '<td class="sr-num">' + money(tot.m.s2) + '</td>'
        + '<td class="sr-num">' + money(tot.m.s1) + '</td>'
        + '<td class="sr-num sr-total-col sr-strong">' + money(tot.m.totalSale) + '</td>'
        + '<td class="sr-num sr-strong">' + money(totFcVal) + '</td>'
        + '<td class="sr-num sr-muted">' + (totOther ? money(totOther) : '<span class="sr-dim">—</span>') + '</td>'
        + '</tr></tfoot></table></div>';
    }

    /* ---------- มุมมองที่ 2: การ์ดรายเซลส์ (อ่านง่าย) ---------- */
    function fcColor(g) { return g >= 100 ? '#16A34A' : g >= 70 ? '#2563EB' : g >= 40 ? '#F59E0B' : '#DC2626'; }
    function fcChip(label, val, color) {
      var v = num(val);
      return '<div class="sr-fc-chip' + (v ? '' : ' sr-fc-chip-empty') + '" style="border-left-color:' + (v ? color : '#E2E8F0') + '">'
        + '<small>' + esc(label) + '</small>'
        + '<b>' + (v ? money(v) : '<span class="sr-dim">—</span>') + '</b></div>';
    }
    function personCard(x, perHead) {
      var g = perHead ? (x.s.s4 / perHead * 100) : 0;
      var col = fcColor(g);
      var av = String(x.sale.name || '').trim().charAt(0) || '?';
      var otherYear = num(x.other.s1) + num(x.other.s0);
      return '<article class="sr-fc-card">'
        + '  <div class="sr-fc-top">'
        + '    <span class="sr-fc-av">' + esc(av) + '</span>'
        + '    <div class="sr-fc-id">'
        + '      <div class="sr-fc-name">' + esc(x.sale.name) + '</div>'
        + '      <div class="sr-fc-meta">' + esc(x.sale.team) + ' · เป้า/คน ' + money(perHead) + '</div>'
        + '    </div>'
        + '    <div class="sr-fc-ach" style="color:' + col + '">' + pct(g) + '</div>'
        + '  </div>'
        + '  <div class="sr-fc-bar" title="Actual ' + money(x.s.s4) + ' จากเป้า ' + money(perHead) + '"><span style="width:' + Math.max(0, Math.min(100, g)) + '%;background:' + col + '"></span></div>'
        + '  <div class="sr-fc-actual"><b>' + money(x.s.s4) + '</b><span>ปิดงานแล้ว (Actual)</span></div>'
        + '  <div class="sr-fc-chips">'
        + fcChip('รอส่งของ', x.s.s3, '#0EA5E9')
        + fcChip('รอ PO', x.s.s2, '#F59E0B')
        + fcChip('Pipeline', x.s.s1, '#7C3AED')
        + fcChip('รวมเดือนนี้', x.s.totalSale, '#0F2B46')
        + '  </div>'
        + '  <div class="sr-fc-foot">'
        + '    <span class="sr-fc-fc"><i class="fa-solid fa-chart-line"></i> Forecast ' + money(x.s.forecast) + '</span>'
        + '    <span class="sr-fc-other" title="ดีลเดือนอื่นในปี ' + (y + 543) + '">' + (otherYear ? 'ปีนี้ +' + money(otherYear) : '—') + (num(x.other.s5) ? ' · ยกเลิก ' + money(x.other.s5) : '') + '</span>'
        + '  </div>'
        + '</article>';
    }
    function teamHead(b) {
      var perHead = b.rows.length ? b.target / b.rows.length : 0;
      var ach4 = b.target ? (b.sum.s4 / b.target * 100) : 0;
      var fc = b.target ? (b.sum.forecast / b.target * 100) : 0;
      var col = fcColor(ach4);
      return '<div class="sr-fc-team">'
        + '  <span class="sr-fc-team-name"><i class="fa-solid fa-users"></i> ' + esc(b.team.name) + '</span>'
        + '  <span class="sr-fc-team-sub">' + b.rows.length + ' คน · เป้า ' + money(b.target) + '</span>'
        + '  <div class="sr-fc-team-bar"><span style="width:' + Math.max(0, Math.min(100, ach4)) + '%;background:' + col + '"></span></div>'
        + '  <span class="sr-fc-team-val">' + money(b.sum.s4) + ' / ' + money(b.target) + ' · <b style="color:' + col + '">' + pct(ach4) + '</b></span>'
        + '  <span class="sr-band-pill alt">Forecast <b>' + pct(fc) + '</b></span>'
        + '</div>'
        + '<div class="sr-fc-grid">' + b.rows.map(function (x) { return personCard(x, perHead); }).join('') + '</div>';
    }
    function cardsView() {
      if (!blocks.length) return '<div class="sr-empty" style="padding:26px">ไม่พบข้อมูลตามตัวกรอง</div>';
      return '<div class="sr-fc-list">'
        + blocks.map(teamHead).join('')
        + '<div class="sr-fc-total">'
        + '  <div><small>รวมทุกทีม (Actual)</small><b>' + money(tot.m.s4) + ' / ' + money(tot.target) + '</b></div>'
        + '  <div><small>% ปิดงานรวม</small><b style="color:' + fcColor(totAch) + '">' + pct(totAch) + '</b></div>'
        + '  <div><small>Forecast รวม</small><b>' + money(totFcVal) + '</b></div>'
        + '  <div><small>รวมเดือนนี้</small><b>' + money(tot.m.totalSale) + '</b></div>'
        + '</div>'
        + '</div>';
    }

    var isTable = state.summaryView === 'table';
    return ''
      + '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>สรุปยอดขายราย AE (Forecast Summary)</h3>'
      + '    <div class="sr-s2">' + (isTable
            ? 'Actual + แท่ง % เทียบเป้า/คน · คอลัมน์ขวาสุด = งานเดือนอื่นในปี (ชี้ที่ตัวเลขเพื่อดูรายละเอียด)'
            : 'การ์ดละ 1 AE — % เทียบเป้าต่อคน · แยกสถานะงาน และ Forecast ของเดือนที่เลือก') + '</div></div>'
      + '    <div class="sr-ph-tools">'
      + '      <span class="sr-tag">' + esc(head) + '</span>'
      + '      <div class="sr-seg">'
      + '        <button class="sr-segbtn' + (isTable ? '' : ' on') + '" data-sr-sumview="cards" title="มุมมองการ์ด"><i class="fa-solid fa-table-cells-large"></i> การ์ด</button>'
      + '        <button class="sr-segbtn' + (isTable ? ' on' : '') + '" data-sr-sumview="table" title="ตารางตัวเลขละเอียด"><i class="fa-solid fa-table"></i> ตาราง</button>'
      + '      </div>'
      + '    </div></div>'
      + (isTable ? tableView() : cardsView())
      + '</section>';
  }

  var SORTABLE = {
    no: 'เลขที่', status: 'สถานะ', customer: 'ชื่อลูกค้า', quoteDate: 'วันที่เสนอราคา',
    month: 'เดือนที่คาดว่าจะปิด', saleId: 'AE', product: 'สินค้า', amount: 'มูลค่า', payment: 'รูปแบบ', cashIn: 'Cash In'
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
      return (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so + ' ' + (d.docNo || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) return '<tr><td colspan="13" class="sr-empty">ไม่พบดีลที่ตรงกับเงื่อนไข</td></tr>';
    return rows.map(function (d, i) {
      var s = st(d.status), p = product(d.product), pay = payment(d.payment), ci = cashInOf(d);
      return '<tr class="sr-row" data-sr-deal="' + esc(d.no) + '">'
        + '<td class="sr-num sr-dim">' + (i + 1) + '</td>'
        + '<td><span class="sr-badge ' + s.cls + '">' + d.status + ' · ' + esc(s.label) + '</span></td>'
        + '<td><div class="sr-nm">' + esc(d.customer) + '</div><div class="sr-s2">' + esc(d.job) + '</div>'
        + (d.drRef ? '<div class="sr-drref" title="อ้างอิง Daily Report"><i class="fa-solid fa-link"></i> ' + esc(d.drRef) + '</div>' : '') + '</td>'
        + '<td><div class="sr-nm">' + esc(d.no) + '</div>'
        + (d.so ? '<div class="sr-s2">' + esc(d.so) + '</div>' : '<div class="sr-s2 sr-dim">ยังไม่มีเลข QT</div>')
        + (d.docNo ? '<div class="sr-s2" style="color:#0E9384;font-family:ui-monospace,Menlo,Consolas,monospace"><i class="fa-solid fa-file-invoice"></i> ' + esc(d.docNo) + '</div>' : '') + '</td>'
        + '<td class="sr-num">' + shortDate(d.quoteDate) + '</td>'
        + '<td class="sr-num">' + String(d.month).padStart(2, '0') + '.' + TH_MONTHS[d.month - 1] + ' ' + String(d.year + 543).slice(-2) + '</td>'
        + '<td><div class="sr-nm">' + esc(aeNameOf(d) || '-') + '</div><div class="sr-s2">' + esc([d.saleId, teamByCode(sale(d.saleId).team).name].filter(Boolean).join(' · ')) + '</div></td>'
        + '<td><div class="sr-nm">' + esc(keyedByOf(d) || '-') + '</div><div class="sr-s2">' + esc(d.createdAt ? shortDate(String(d.createdAt).slice(0, 10)) : '') + '</div></td>'
        + '<td><span class="sr-dot" style="background:' + p.color + '"></span>' + esc(p.short) + '</td>'
        + '<td class="sr-num sr-strong">' + money(d.amount) + '</td>'
        + '<td>' + esc(pay.name) + '</td>'
        + '<td class="sr-num">' + (ci ? money(ci) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-note-cell">' + esc(String(d.note).slice(0, 46)) + (String(d.note).length > 46 ? '…' : '') + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ---------- ชื่อจริงจากชีต Users (AE ผู้รับผิดชอบ / ผู้บันทึก) ---------- */
  var USERS_BY_MAIL = {};
  function loadUsersMap(done) {
    if (!global.PIAuth || !global.PIAuth.seed) { if (done) done(); return; }
    try {
      global.PIAuth.seed().then(function (list) {
        (list || []).forEach(function (u) {
          var m = String((u && u.email) || '').toLowerCase();
          if (m) USERS_BY_MAIL[m] = u;
        });
        if (done) done();
      }).catch(function () { if (done) done(); });
    } catch (e) { if (done) done(); }
  }
  function userNameOf(email) {
    var u = USERS_BY_MAIL[String(email || '').toLowerCase()];
    return u ? String(u.name || u.email || '') : '';
  }
  /** ชื่อ AE ผู้รับผิดชอบ — ใช้ชื่อจริงของเจ้าของดีลก่อน ถ้าไม่มีค่อยใช้รายชื่อ AE */
  function aeNameOf(d) {
    var n = userNameOf(d && d.ownerEmail);
    if (n) return n;
    var s = sale(d && d.saleId);
    if (s && s.name && s.name !== s.id) return s.name;
    return String((d && d.saleId) || '');
  }

  /** ชื่อผู้บันทึก (เจ้าของดีล) — ถ้าไม่ทราบให้ใช้ชื่อ AE ผู้รับผิดชอบแทน */
  function keyedByOf(d) {
    var n = userNameOf(d && d.ownerEmail);
    if (n) return n;
    return aeNameOf(d);
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
      + '      <input id="srSearch" placeholder="ค้นหาชื่อลูกค้า / เลขดีล / เลข QT" value="' + esc(state.q) + '"></div></div>'
      + '  <div class="sr-tablewrap"><table class="sr-table sr-deals"><thead><tr>'
      + th('no', 'เลขดีล', 'sr-num') + th('status', 'สถานะงาน') + th('customer', 'ชื่องาน / ลูกค้า') + th('so', 'เลข QT / อ้างอิง')
      + th('quoteDate', 'วันที่สร้างใบเสนอราคา', 'sr-num') + th('month', 'เดือนที่คาดว่าจะปิด', 'sr-num')
      + th('saleId', 'AE ผู้รับผิดชอบ') + '<th>ผู้บันทึก</th>' + th('product', 'สินค้า') + th('amount', 'มูลค่างานประมาณ', 'sr-num')
      + th('payment', 'รูปแบบการซื้อ') + th('cashIn', 'Cash In', 'sr-num') + '<th>หมายเหตุ</th>'
      + '  </tr></thead><tbody id="srDealBody">' + dealRowsHtml(list) + '</tbody></table></div>'
      + '  <div class="sr-foot" id="srDealCount">แสดง ' + sortRows(list).filter(function (d) {
            var q = String(state.q || '').trim().toLowerCase();
            return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so + ' ' + (d.docNo || '')).toLowerCase().indexOf(q) >= 0;
          }).length + ' จาก ' + list.length + ' ดีล</div>'
      + '</section>';
  }

  /* ---------- เป้าหมายรายทีม × รายเดือน (แก้ไขได้) ---------- */
  function renderTargets() {
    var y = state.year;
    var lockedTeam = viewerTeam();
    /* ระดับเซลล์/ตัวแทน: ไม่แสดงตารางแก้ไขเป้าหมาย (เห็นเป้าของตัวเองที่ Dashboard) */
    if (scopeOf().type === 'sale') return '';
    var listTeams = lockedTeam ? TEAMS.filter(function (t) { return t.code === lockedTeam; }) : TEAMS;
    var TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    var monthTh = TH_MONTHS.map(function (mth, i) {
      return '<th class="sr-num' + (state.month === i + 1 ? ' sr-hl' : '') + '" title="' + mth + '">'
        + TH_SHORT[i] + '</th>';
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
      + '  <div class="sr-ph"><div><h3>เป้าหมายการขายรายทีม (Target) — ปี ' + (y + 543) + '</h3>'
      + '    <div class="sr-s2">กดปุ่ม “ใส่ Target” เพื่อกรอกเป้าหมายของแต่ละเดือน · เพิ่มทีมใหม่ได้ที่ปุ่ม “+ เพิ่มทีม” · ' + (state.month ? 'เดือนที่เลือก: ' + TH_MONTHS[state.month - 1] : 'รวมทั้งปี') + '</div></div>'
      + '    <div class="sr-tools">'
      + (lockedTeam ? '' : '      <button class="sr-btn" data-sr-addteam title="เพิ่มทีม (BU) ใหม่"><i class="fa-solid fa-plus"></i> เพิ่มทีม</button>')
      + (ui.targets
        ? '      <button class="sr-btn" data-sr-toggletargets><i class="fa-solid fa-chevron-up"></i> ซ่อนตาราง</button>'
        : '      <button class="sr-btn dark" data-sr-toggletargets><i class="fa-solid fa-pen-to-square"></i> ใส่ Target</button>')
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
      + '</section>'
      /* ซ่อนแผง “รายชื่อ AE” — ผูก/แก้ไขที่หน้าจัดการผู้ใช้งานเท่านั้น (ข้อมูลซิงก์จาก Users อยู่แล้ว) */
      + productsPanel();
  }

  /* ---------- รายชื่อเซลส์ (Sale) ---------- */
  function salesPanel() {
    var sc = scopeOf();
    if (sc.type === 'sale' || sc.type === 'none') return '';
    var lockedTeam = viewerTeam();
    var list = lockedTeam ? SALES.filter(function (s) { return s.team === lockedTeam; }) : SALES;
    var rows = list.map(function (s) {
      var cnt = DEALS.filter(function (d) { return d.saleId === s.id; }).length;
      return '<tr>'
        + '<td><span class="sr-sid">' + esc(s.id) + '</span></td>'
        + '<td><div class="sr-sale"><span class="sr-av">' + esc(String(s.name).trim().charAt(0) || '?') + '</span>'
        + '  <div style="min-width:0"><div class="sr-nm">' + esc(s.name) + '</div><div class="sr-s2">' + cnt + ' ดีล</div></div></div></td>'
        + '<td>' + esc(teamByCode(s.team).name) + '</td>'
        + '<td class="sr-num"></td>'
        + '</tr>';
    }).join('');
    var missing = (global.__TEAM__ || []).filter(function (u) {
      var lv = String(u.level || '').toLowerCase();
      return (lv === 'sale' || lv === 'agent') && !String(u.saleId || '').trim();
    });
    var missNote = missing.length
      ? '<div class="sr-note" style="margin:0 0 10px;color:#9A3412;background:#FFF7ED;border-color:#FED7AA">'
        + '<i class="fa-solid fa-triangle-exclamation"></i> ยังไม่ผูก <b>รหัสเซลส์ (Sxx)</b> ' + missing.length + ' คน: '
        + esc(missing.slice(0, 6).map(function (u) { return u.name || u.email; }).join(', '))
        + (missing.length > 6 ? ' …' : '') + ' — ผูกที่หน้าจัดการผู้ใช้งาน</div>'
      : '';
    return '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>รายชื่อ AE</h3>'
      + '    <div class="sr-s2">ดึงจากหน้าจัดการผู้ใช้งาน (ช่อง “รหัสเซลส์ S01, S02, …”) — แก้ไข/ผูกที่นั้นเท่านั้น</div></div>'
      + '    <div class="sr-tools"><a class="sr-btn dark" href="users.html"><i class="fa-solid fa-user-gear"></i> ไปผูกที่หน้าจัดการผู้ใช้งาน</a></div></div>'
      + missNote
      + (list.length
        ? '<div class="sr-tablewrap"><table class="sr-table sr-saletable"><thead><tr>'
          + '<th style="width:70px">รหัส</th><th>ชื่อ AE</th><th style="width:160px">ทีม (BU)</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="sr-empty-note"><i class="fa-solid fa-user-gear" style="margin-right:6px"></i> ยังไม่มี AE ที่ผูก “รหัสเซลส์” — ไปผูกที่หน้าจัดการผู้ใช้งาน</div>')
      + '</section>';
  }

  /* ---------- Dashboard (เวอร์ชันย่อของ Reports — ใช้สูตร/ข้อมูลชุดเดียวกัน) ---------- */
  /* ======= Dashboard 2.0: pipeline funnel / forecast calc / gauge / insights =======
     เพิ่มเป็นการ์ดวิเคราะห์ต่อจาก Hero เดิม โดยไม่เปลี่ยนโครง KPI/ตารางที่มีอยู่ */
  var DASH_FLOW = [4, 3, 2, 1, 0, 5];
  var LS_REFRESH = 'pi_dash_refresh_min';
  var __dashTimer = null;

  function statusAgg(list) {
    var o = {
      amt: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      cnt: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      total: 0, count: Array.isArray(list) ? list.length : 0
    };
    (list || []).forEach(function (d) {
      var c = Number(d.status);
      if (isNaN(c) || !st(c)) c = 0;
      o.amt[c] += num(d.amount);
      o.cnt[c]++;
      o.total += num(d.amount);
    });
    return o;
  }
  function secOfDeal(d) { return (Number(d.status) === 4 || Number(d.status) === 3) ? num(d.amount) : 0; }
  function fcOfDeal(d) {
    var a = num(d.amount), c = Number(d.status);
    if (c === 4 || c === 3) return a;
    if (c === 2) return a * 0.5;
    if (c === 1) return a * 0.25;
    return 0;
  }

  /** เป้ารวมของเดือน (คำนวณแบบเดียวกับ kpis(): AE ใช้เป้า/คน × จำนวนคนในความดูแล) */
  function dashTargetOfMonth(month, year) {
    var yr = Number(year) || state.year;
    var sc = scopeOf();
    var teams = TEAMS.filter(function (t) {
      if (state.team && t.code !== state.team) return false;
      if (sc.type === 'team') return t.code === sc.team;
      if (sc.type === 'sale') return sale(sc.saleId).team === t.code;
      if (sc.type === 'none') return false;
      return true;
    });
    if (!teams.length) return 0;
    var total = teams.reduce(function (a, t) { return a + targetOf(t.code, yr, month); }, 0);
    var teamSize = SALES.filter(function (r) { return r.team === teams[0].code; }).length || 1;
    if (sc.type === 'sale') return total / teamSize * (mySaleIds(sc).length || 1);
    if (state.sale) return total / teamSize;
    return total;
  }

  /** เป้ารวมทั้งปี (12 เดือน ของปีที่กำหนด) */
  function dashTargetOfYear(year) {
    var t = 0;
    for (var m = 1; m <= 12; m++) t += dashTargetOfMonth(m, year);
    return t;
  }

  function dashRefreshMin() {
    var v = null;
    try { v = global.localStorage.getItem(LS_REFRESH); } catch (e) { v = null; }
    if (v === null || v === '') return 5;
    var n = Number(v);
    return isNaN(n) ? 5 : n;
  }
  function scheduleDashRefresh() {
    if (__dashTimer) { clearTimeout(__dashTimer); __dashTimer = null; }
    var mins = dashRefreshMin();
    if (!mins) return;
    __dashTimer = setTimeout(function () {
      __dashTimer = null;
      var active = document.querySelector('.nav-item.active');
      if (!active || active.getAttribute('data-page') !== 'dashboard') return;
      var nav = document.querySelector('#navList [data-page="dashboard"]') || active;
      var y = global.pageYOffset || 0;
      try { if (global.SalesReport && SalesReport.syncFromCloud) SalesReport.syncFromCloud(); } catch (e) {}
      nav.click();
      setTimeout(function () { try { global.scrollTo(0, y); } catch (e) {} }, 60);
    }, mins * 60000);
  }

  function dashFunnelPanel(k) {
    var a = statusAgg(k.list);
    var max = DASH_FLOW.reduce(function (m, c) { return Math.max(m, a.amt[c]); }, 0) || 1;
    var rows = DASH_FLOW.map(function (c) {
      var v = a.amt[c];
      var w = a.total ? Math.max(3, v / max * 100) : 3;
      return '<div class="sr-fn-row">'
        + '<div class="sr-fn-lbl"><span class="sr-dot" style="background:' + st(c).color + '"></span>'
        + '  <span>' + esc(st(c).short) + '</span><em>' + probOfStatus(c) + '%</em></div>'
        + '<div class="sr-fn-track"><span style="width:' + w.toFixed(1) + '%;background:' + st(c).color + '"></span></div>'
        + '<div class="sr-fn-val"><b>' + (v ? money(v) : '—') + '</b><i>' + (a.total ? pct(v / a.total * 100) : '—') + '</i></div>'
        + '</div>';
    }).join('');
    return '<section class="sr-panel sr-fn">'
      + '<div class="sr-ph"><div><h3><i class="fa-solid fa-filter"></i> Sales Pipeline Status</h3>'
      + '  <div class="sr-s2">' + a.count + ' ดีล · รวม ' + money(a.total) + ' · % คือโอกาสปิดของสถานะ</div></div></div>'
      + rows
      + '</section>';
  }

  function dashForecastPanel(k) {
    var s = k.sum;
    var parts = [
      { t: 'Actual', sub: 'ปิดงานแล้ว', v: s.s4, w: 100, c: '#2563EB' },
      { t: 'Delivery', sub: 'รอส่งของ', v: s.s3, w: 100, c: '#38BDF8' },
      { t: 'PO', sub: 'รอยืนยัน', v: s.s2, w: 50, c: '#F59E0B' },
      { t: 'Pipeline', sub: 'กำลังคุย', v: s.s1, w: 25, c: '#A78BFA' }
    ];
    var chips = parts.map(function (p, i) {
      return (i ? '<span class="sr-fc-plus">+</span>' : '')
        + '<div class="sr-fc-chip" style="border-color:' + p.c + '33">'
        + '  <small style="color:' + p.c + '">' + esc(p.t) + ' · ' + p.w + '%</small>'
        + '  <b>' + money(p.v) + '</b>'
        + '  <i>→ ' + money(p.v * p.w / 100) + '</i>'
        + '</div>';
    }).join('');
    return '<section class="sr-panel sr-fc">'
      + '<div class="sr-ph"><div><h3><i class="fa-solid fa-calculator"></i> Forecast Calculation</h3>'
      + '  <div class="sr-s2">ถ่วงน้ำหนักตามโอกาสปิดของแต่ละสถานะ</div></div></div>'
      + '<div class="sr-fc-row">' + chips + '</div>'
      + '<div class="sr-fc-res"><div><small>Forecast Sales</small><b>' + money(s.forecast) + '</b></div>'
      + '<span class="sr-pill-pct">' + pct(k.forecastPct) + ' ของเป้า</span></div>'
      + '<div class="sr-s2" style="margin-top:8px">ปิดงานแล้ว + รอส่งของ นับ 100% · รอยืนยัน PO 50% · Pipeline 25%'
      + (s.s0 ? ' · กำลังคุยยังไม่นับ' : '') + '</div>'
      + '</section>';
  }

  function dashGaugePanel(k) {
    var p = Math.max(0, Math.min(100, num(k.forecastPct)));
    var color = p >= 100 ? '#16A34A' : (p >= 70 ? '#0EA5E9' : (p >= 40 ? '#F59E0B' : '#EF4444'));
    var tag = p >= 100 ? 'ถึงเป้าแล้ว' : (p >= 70 ? 'On Track' : (p >= 40 ? 'ต้องเร่งยอด' : 'ต่ำกว่าเป้า'));
    return '<section class="sr-panel sr-gp">'
      + '<div class="sr-ph"><div><h3><i class="fa-solid fa-gauge-high"></i> Performance to Target</h3></div></div>'
      + '<div class="sr-gauge" style="--p:' + p.toFixed(1) + ';--c:' + color + '">'
      + '  <div class="sr-gauge-in"><b style="color:' + color + '">' + pct(p) + '</b><small>ของเป้า</small></div>'
      + '</div>'
      + '<div class="sr-gauge-tag" style="background:' + color + '1A;color:' + color + '">' + tag + '</div>'
      + '<div class="sr-gauge-ft"><b>' + money(k.sum.forecast) + '</b><span> / ' + money(k.target) + '</span></div>'
      + '</section>';
  }

  function dashInsightsPanel(k) {
    var s = k.sum, a = statusAgg(k.list);
    var items = [];
    items.push({ i: 'fa-chart-line', c: '#16A34A', t: 'Forecast ' + pct(k.forecastPct), d: 'คาดปิด ' + money(s.forecast) });
    var pipe = a.amt[1] + a.amt[0];
    items.push({ i: 'fa-diagram-project', c: '#2563EB', t: 'Pipeline ' + money(pipe), d: (a.cnt[1] + a.cnt[0]) + ' ดีลที่ยังไม่ปิด' });
    if (a.amt[2] > 0) items.push({ i: 'fa-hourglass-half', c: '#F59E0B', t: 'รอยืนยัน PO ' + money(a.amt[2]), d: a.cnt[2] + ' ดีล · ถ่วง 50% = ' + money(a.amt[2] * 0.5) });
    var talk = k.list.filter(function (d) { return Number(d.status) === 0; });
    if (talk.length) {
      items.push({
        i: 'fa-triangle-exclamation', c: '#DC2626', t: 'ต้องติดตาม ' + talk.length + ' ดีล',
        d: 'กำลังคุย ' + money(talk.reduce(function (x, d) { return x + num(d.amount); }, 0))
      });
    }
    var gap = k.target - s.forecast;
    if (gap > 0.5) items.push({ i: 'fa-bullseye', c: '#7C3AED', t: 'ต้องเติมอีก ' + money(gap), d: pct(k.target ? gap / k.target * 100 : 0) + ' ของเป้า' });
    var shown = items.slice(0, 4);
    return '<section class="sr-panel sr-ins">'
      + '<div class="sr-ph"><div><h3><i class="fa-solid fa-lightbulb"></i> Key Insights</h3>'
      + '  <div class="sr-s2">สรุปจากข้อมูลตามตัวกรองปัจจุบัน</div></div></div>'
      + shown.map(function (it) {
        return '<div class="sr-ins-row"><span class="sr-ins-ico" style="background:' + it.c + '1A;color:' + it.c + '">'
          + '<i class="fa-solid ' + it.i + '"></i></span>'
          + '<div><b style="color:' + it.c + '">' + it.t + '</b><small>' + it.d + '</small></div></div>';
      }).join('')
      + '<button class="sr-btn" data-sr-goto="reports" style="width:100%;justify-content:center;margin-top:10px">'
      + '  <i class="fa-solid fa-arrow-right"></i> ดูรายละเอียด</button>'
      + '</section>';
  }

  function dashFilterCard(k) {
    var sc = scopeOf();
    var mine = sc.type === 'sale' ? sale(sc.saleId) : null;
    var teamName = mine ? teamByCode(mine.team).name : (state.team ? teamByCode(state.team).name : 'ทุกทีม');
    var aeName = state.sale ? sale(state.sale).name : (mine ? mine.name : 'ทุกคน');
    var prodName = state.product ? product(state.product).name : 'ทุกสินค้า';
    var payName = state.payment ? payment(state.payment).name : 'ทุกรูปแบบ';
    var rows = [
      ['ช่วงเวลา', state.month ? monthLabel(state.year, state.month) : ('ปี ' + (state.year + 543))],
      ['ทีม (BU)', teamName],
      ['AE', aeName],
      ['สินค้า', prodName],
      ['การซื้อ', payName],
      ['ดีลในขอบเขต', k.list.length + ' ดีล']
    ];
    return '<section class="sr-panel sr-fsum">'
      + '<div class="sr-ph"><div><h3><i class="fa-solid fa-sliders"></i> Filter Summary</h3></div></div>'
      + rows.map(function (r) {
        return '<div class="sr-fsum-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
      }).join('')
      + '<button class="sr-btn" data-sr-reset style="width:100%;justify-content:center;margin-top:10px">'
      + '  <i class="fa-solid fa-rotate-left"></i> Reset Filter</button>'
      + '</section>';
  }

  /* ---------- Sales Trend & Forecast: เลือกดูได้ รายวัน / รายเดือน / รายปี ---------- */
  var TREND_MODES = [
    { key: 'day', label: 'รายวัน', icon: 'fa-calendar-day' },
    { key: 'month', label: 'รายเดือน', icon: 'fa-calendar-days' },
    { key: 'year', label: 'รายปี', icon: 'fa-calendar' }
  ];
  function trendMode() {
    var m = String(state.dashTrend || '');
    if (m === 'day' || m === 'month' || m === 'year') return m;
    return state.month ? 'day' : 'month';
  }
  function trendSubtitle() {
    var m = trendMode();
    if (m === 'day') return 'รายวันของเดือนที่เลือก';
    if (m === 'year') return 'รายปี รวม 12 เดือน';
    return 'รายเดือนของปีที่เลือก';
  }
  function daysInMonth(y, m) { return new Date(Number(y) || 2026, Number(m) || 1, 0).getDate(); }
  function dayOfDeal(d) {
    var p = String(d.quoteDate || d.createdAt || '').slice(0, 10).split('-');
    var v = Number(p[2]);
    if (!v) v = Number(String(d.createdAt || '').slice(8, 10)) || 1;
    return v;
  }
  /* ดีลในขอบเขตสิทธิ์ + filter ทีม/AE/สินค้า/การซื้อ (ไม่กรองปี–เดือน) — ใช้กับการดูแนวโน้มรายปี */
  function dealsForTrend() {
    return DEALS.filter(function (d) {
      if (!inScope(d)) return false;
      if (state.team && sale(d.saleId).team !== state.team) return false;
      if (state.sale && d.saleId !== state.sale) return false;
      if (state.product && d.product !== state.product) return false;
      if (state.payment && d.payment !== state.payment) return false;
      return true;
    });
  }

  /** อนุกรมแนวโน้ม — day: รายวันของเดือน · month: 12 เดือนของปี · year: รายปี */
  function dashTrend(k) {
    var mode = trendMode();
    var labels = [], actual = [], forecast = [], target = [];

    if (mode === 'day') {
      /* รายวัน — ในเดือนที่เลือก (ถ้าเลือกทั้งปี ใช้เดือนล่าสุดที่มีข้อมูล) */
      var y = state.year;
      var mo = state.month;
      if (!mo) {
        var latest = 0;
        k.list.forEach(function (d) { var m2 = Number(d.month) || 0; if (m2 > latest) latest = m2; });
        mo = latest || (new Date().getMonth() + 1);
      }
      var nd = daysInMonth(y, mo);
      var ba = [], bf = [];
      for (var i = 1; i <= nd; i++) { ba.push(0); bf.push(0); }
      k.list.forEach(function (d) {
        if (Number(d.month) !== mo) return;
        var day = dayOfDeal(d);
        if (day < 1 || day > nd) return;
        ba[day - 1] += secOfDeal(d);
        bf[day - 1] += fcOfDeal(d);
      });
      var tgDay = dashTargetOfMonth(mo, y) / nd;
      for (var dd = 1; dd <= nd; dd++) {
        labels.push(String(dd));
        actual.push(Math.round(ba[dd - 1]));
        forecast.push(Math.round(bf[dd - 1]));
        target.push(Math.round(tgDay));
      }
      return { labels: labels, actual: actual, forecast: forecast, target: target, mode: mode, month: mo };
    }

    if (mode === 'year') {
      /* รายปี — รวมทุกปีที่มีข้อมูล (สูงสุด 6 ปีล่าสุด) */
      var list2 = dealsForTrend();
      var yset = {};
      list2.forEach(function (d) { var yy = Number(d.year) || 0; if (yy) yset[yy] = 1; });
      yset[state.year] = 1;
      var years = Object.keys(yset).map(Number).sort(function (a, b) { return a - b; });
      if (years.length > 6) years = years.slice(years.length - 6);
      var ya = {}, yf = {};
      years.forEach(function (yy2) { ya[yy2] = 0; yf[yy2] = 0; });
      list2.forEach(function (d) {
        var key = Number(d.year);
        if (!(key in ya)) return;
        ya[key] += secOfDeal(d);
        yf[key] += fcOfDeal(d);
      });
      years.forEach(function (yy3) {
        labels.push(String(yy3 + 543));
        actual.push(Math.round(ya[yy3]));
        forecast.push(Math.round(yf[yy3]));
        target.push(Math.round(dashTargetOfYear(yy3)));
      });
      return { labels: labels, actual: actual, forecast: forecast, target: target, mode: mode };
    }

    /* รายเดือน — 12 เดือนของปีที่เลือก */
    var m = [];
    for (var j = 0; j < 12; j++) m.push([0, 0]);
    k.list.forEach(function (d) {
      var mi = (Number(d.month) || 1) - 1;
      m[mi][0] += secOfDeal(d);
      m[mi][1] += fcOfDeal(d);
    });
    for (var mm = 1; mm <= 12; mm++) {
      labels.push(TH_MONTHS[mm - 1].slice(0, 3));
      actual.push(Math.round(m[mm - 1][0]));
      forecast.push(Math.round(m[mm - 1][1]));
      target.push(Math.round(dashTargetOfMonth(mm)));
    }
    return { labels: labels, actual: actual, forecast: forecast, target: target, mode: mode };
  }

  function renderDashboard() {
    injectCss();
    if (scopeOf().type === 'pending') {
      return '<div class="sr"><div class="sr-head"><div><h1>ภาพรวมยอดขาย &amp; Forecast</h1>'
        + '<div class="sr-sub">กำลังโหลดข้อมูลตามสิทธิ์ของคุณ…</div></div></div>' + scopeNotice() + '</div>';
    }
    var k = kpis();
    var s = k.sum;
    var today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var nowStr = new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    var refreshMin = dashRefreshMin();
    scheduleDashRefresh();

    var scD = scopeOf();
    var saleScope = (scD.type === 'sale');
    var dashTeams = TEAMS.filter(function (t) {
      if (state.team && t.code !== state.team) return false;
      if (scD.type === 'team') return t.code === scD.team;
      if (scD.type === 'sale') return sale(scD.saleId).team === t.code;
      if (scD.type === 'none') return false;
      return true;
    });
    var teamRows = dashTeams.map(function (t) {
      var list = k.list.filter(function (d) { return sale(d.saleId).team === t.code; });
      var ts = summarize(list);
      var teamSize = SALES.filter(function (r) { return r.team === t.code; }).length || 1;
      var mineN = mySaleIds(scD).length || 1;
      var isMine = (scD.type === 'sale');
      var tg = targetOf(t.code, state.year, state.month);
      if (isMine) tg = tg / teamSize * mineN;      /* AE → เป้า/คน × (ตัวเอง + ตัวแทน) */
      var pAch = tg ? ts.s4 / tg * 100 : 0;
      var pFc = tg ? ts.forecast / tg * 100 : 0;
      var cnt = isMine ? mineN : teamSize;
      return '<div class="sr-trow">'
        + '<div class="sr-trow-h"><b>' + esc(isMine ? (sale(scD.saleId).name + ' · ผลงานของฉัน' + (mineN > 1 ? ' + ตัวแทน ' + (mineN - 1) + ' คน' : '')) : t.name) + '</b>'
        + '  <span>' + cnt + (isMine ? (mineN > 1 ? ' คน · เป้า/คน ' + money(tg / mineN) : ' คน (เป้า/คน)') : ' คน') + '</span></div>'
        + '<div class="sr-trow-n">' + money(ts.s4) + ' <span>/ ' + money(tg) + '</span><em>' + pct(pAch) + '</em></div>'
        + '<div class="sr-bar"><span style="width:' + Math.max(0, Math.min(100, pAch)) + '%;background:#2563EB"></span></div>'
        + '<div class="sr-trow-f">Forecast ' + money(ts.forecast) + ' · ' + pct(pFc) + '</div>'
        + '</div>';
    }).join('');

    /* ---- Team Performance: สลับดูแบบรายทีม / ราย AE ---- */
    var perfMode = state.dashPerf === 'rep' ? 'rep' : 'team';
    var repRows = '';
    if (perfMode === 'rep') {
      var repOut = [];
      dashTeams.forEach(function (t) {
        var teamSize = SALES.filter(function (r) { return r.team === t.code; }).length || 1;
        var base = targetOf(t.code, state.year, state.month);
        SALES.filter(function (r) {
          if (r.team !== t.code) return false;
          if (scD.type === 'sale') return mySaleIds(scD).indexOf(r.id) >= 0;
          return !state.sale || r.id === state.sale;
        }).forEach(function (r) {
          var list = k.list.filter(function (d) { return d.saleId === r.id; });
          var rs = summarize(list);
          var tg = base / teamSize;   /* เป้ารายคน = เป้าทีม / จำนวนคนในทีม */
          var pA = tg ? rs.s4 / tg * 100 : 0;
          var pF = tg ? rs.forecast / tg * 100 : 0;
          repOut.push('<div class="sr-trow">'
            + '<div class="sr-trow-h"><b>' + esc(r.name) + '</b><span>' + esc(t.name) + '</span></div>'
            + '<div class="sr-trow-n">' + money(rs.s4) + ' <span>/ ' + money(tg) + '</span><em>' + pct(pA) + '</em></div>'
            + '<div class="sr-bar"><span style="width:' + Math.max(0, Math.min(100, pA)) + '%;background:#2563EB"></span></div>'
            + '<div class="sr-trow-f">Forecast ' + money(rs.forecast) + ' · ' + pct(pF) + ' · ' + list.length + ' ดีล</div>'
            + '</div>');
        });
      });
      repRows = repOut.join('') || '<div class="sr-trow">ยังไม่มีผลงานราย AE</div>';
    }

    /* ---- ยอดขายแยกตามรูปแบบการชำระเงิน (เงินสด / ผ่อนชำระ / เครดิต) รายทีม ---- */
    var PAY_KEYS = [
      { code: 'cash', label: 'เงินสด', sub: 'สด/บัตรเครดิต' },
      { code: 'inst', label: 'ผ่อนชำระ', sub: 'Installment' },
      { code: 'term', label: 'เครดิต', sub: 'Credit Term' }
    ];
    function payAgg(list) {
      var o = { cash: 0, inst: 0, term: 0, total: 0, count: 0 };
      list.forEach(function (d) {
        if (d.status !== 4) return;              /* นับเฉพาะงานที่ปิดแล้ว */
        var c = payment(d.payment).code;
        if (o[c] === undefined) c = 'cash';
        o[c] += num(d.amount);
        o.total += num(d.amount);
        o.count++;
      });
      return o;
    }
    var payAll = { cash: 0, inst: 0, term: 0, total: 0, count: 0 };
    /* เปอร์เซ็นต์สัดส่วนของแต่ละรูปแบบ (แสดงใต้แถบสี) */
    function payPcts(o) {
      return '<div class="sr-paypcts">' + PAY_KEYS.map(function (c) {
        var v = o.total ? (o[c.code] / o.total * 100) : 0;
        return '<span style="color:' + (v > 0 ? payment(c.code).color : '#C2CBD8') + '">'
          + (o.total ? pct(v) : '—') + '</span>';
      }).join('') + '</div>';
    }
    var payRows = dashTeams.map(function (t) {
      var o = payAgg(k.list.filter(function (d) { return sale(d.saleId).team === t.code; }));
      payAll.cash += o.cash; payAll.inst += o.inst; payAll.term += o.term;
      payAll.total += o.total; payAll.count += o.count;
      var mineNP = mySaleIds(scD).length || 1;
      return '<tr>'
        + '<td><div class="sr-pay-tm"><b>' + esc(saleScope ? (sale(scD.saleId).name + (mineNP > 1 ? ' + ตัวแทน ' + (mineNP - 1) + ' คน' : '')) : t.name) + '</b><span>' + o.count + ' ดีล</span></div></td>'
        + PAY_KEYS.map(function (c) {
          return '<td class="sr-num">' + (o[c.code] ? money(o[c.code]) : '<span class="sr-dim">—</span>') + '</td>';
        }).join('')
        + '<td class="sr-num sr-strong">' + (o.total ? money(o.total) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td><div class="sr-paybar">'
        + PAY_KEYS.map(function (c) {
          var w = o.total ? (o[c.code] / o.total * 100) : 0;
          return w > 0 ? '<span style="width:' + w.toFixed(2) + '%;background:' + payment(c.code).color + '"></span>' : '';
        }).join('')
        + '</div>' + payPcts(o) + '</td>'
        + '</tr>';
    }).join('');

    var payFoot = '<tr><td><b>รวมทั้งสิ้น</b></td>'
      + PAY_KEYS.map(function (c) {
        return '<td class="sr-num">' + (payAll[c.code] ? money(payAll[c.code]) : '<span class="sr-dim">—</span>') + '</td>';
      }).join('')
      + '<td class="sr-num">' + (payAll.total ? money(payAll.total) : '<span class="sr-dim">—</span>') + '</td>'
      + '<td><div class="sr-paybar">'
      + PAY_KEYS.map(function (c) {
        var w = payAll.total ? (payAll[c.code] / payAll.total * 100) : 0;
        return w > 0 ? '<span style="width:' + w.toFixed(2) + '%;background:' + payment(c.code).color + '"></span>' : '';
      }).join('')
      + '</div>' + payPcts(payAll) + '</td></tr>';

    var payPanel = '<section class="sr-panel sr-pay">'
      + '<div class="sr-ph"><div><h3>ยอดขายแยกตามรูปแบบการชำระเงิน (รายทีม)</h3>'
      + '  <div class="sr-s2">นับเฉพาะงานที่ปิดแล้ว (Actual) · ไม่รวมยกเลิก/รอปิด</div></div>'
      + '<div class="sr-payleg">' + PAY_KEYS.map(function (c) {
        return '<span><i style="background:' + payment(c.code).color + '"></i>' + esc(c.label) + '</span>';
      }).join('') + '</div></div>'
      + (payAll.count
        ? '<div class="sr-tablewrap"><table class="sr-table sr-paytable"><thead><tr>'
          + '<th>' + (saleScope ? 'AE / ตัวแทน' : 'ทีม (BU)') + '</th>'
          + PAY_KEYS.map(function (c) { return '<th class="sr-num">' + esc(c.label) + '</th>'; }).join('')
          + '<th class="sr-num">รวมปิดงาน</th><th>สัดส่วน (%)</th>'
          + '</tr></thead><tbody>' + payRows + '</tbody><tfoot>' + payFoot + '</tfoot></table></div>'
        : '<div class="sr-empty-note"><i class="fa-regular fa-circle-question"></i> ยังไม่มีงานที่ปิดแล้วในเดือน/ทีมนี้</div>')
      + '</section>';

    var follow = k.list.filter(function (d) { return d.status === 0 || d.status === 1; })
      .sort(function (a, b) { return num(b.amount) - num(a.amount); }).slice(0, 8);

    var followRows = follow.map(function (d, idx) {
      var stx = st(d.status);
      return '<tr class="sr-row" data-sr-deal="' + esc(d.no) + '">'
        + '<td><span class="sr-badge ' + stx.cls + '">' + esc(stx.short) + '</span></td>'
        + '<td><div class="sr-rank-wrap">'
        + (idx < 3 ? '<span class="sr-rank r' + (idx + 1) + '">' + (idx + 1) + '</span>' : '<span class="sr-rank">—</span>')
        + '<div><div class="sr-nm">' + esc(d.customer) + '</div><div class="sr-s2">' + esc(d.job) + '</div>'
        + '  <div class="sr-s2" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:2px">'
        + '    <span class="sr-drref" style="background:#F8FAFC;color:#475467"><i class="fa-solid fa-hashtag"></i> ' + esc(d.no) + '</span>'
        + (d.drRef ? '    <span class="sr-drref" title="อ้างอิงบันทึกการพบลูกค้า"><i class="fa-solid fa-link"></i> ' + esc(d.drRef) + '</span>' : '')
        + '  </div></div></div></td>'
        + '<td><div>' + esc(sale(d.saleId).name) + '</div><div class="sr-s2">' + esc(teamByCode(sale(d.saleId).team).name) + '</div></td>'
        + '<td class="sr-num sr-strong">' + money(d.amount) + '</td>'
        + '<td class="sr-num">' + String(d.month).padStart(2, '0') + '.' + TH_MONTHS[d.month - 1] + ' ' + String(d.year + 543).slice(-2) + '</td>'
        + '</tr>';
    }).join('');

    /* ---- Hero: Target (เล็ก) · Summary ปิดแล้ว+รอส่งของ · Forecast (ใหญ่ + ส่วนที่ต้องเติม) ---- */
    var clampPct = function (v) { return Math.max(0, Math.min(100, num(v))); };
    var gap = k.target - s.forecast;
    var gapHtml = gap > 0.5
      ? 'ต้องเติมอีก <b>' + money(gap) + '</b> <span style="color:#9EC1E0;font-size:10.5px">(' + pct(k.target ? gap / k.target * 100 : 0) + ' ของเป้า)</span>'
      : (gap < -0.5 ? 'ถึงเป้าแล้ว · เกินเป้า <b>' + money(-gap) + '</b>' : 'พอดีเป้าแล้ว 🎯');
    var hero =
      '<div class="sr-hero">'
      + '  <div class="sr-hero-target">'
      + '    <div class="sr-ht-label"><i class="fa-solid fa-bullseye"></i> ' + (saleScope ? 'เป้าหมายของฉัน' : 'เป้าหมายทีม')
      + (state.month ? ' · ' + esc(TH_MONTHS[state.month - 1]) : '') + '</div>'
      + '    <div class="sr-ht-val">' + money(k.target) + '</div>'
      + '    <div class="sr-ht-meta">' + k.headCount + ' คน · เฉลี่ย/คน ' + money(k.perHead) + '</div>'
      + '    <div class="sr-bar" style="margin-top:auto"><span style="width:' + clampPct(k.ach4) + '%;background:#2563EB"></span></div>'
      + '    <div class="sr-ht-meta">ปิดงานแล้ว ' + pct(k.ach4) + ' ของเป้า</div>'
      + '  </div>'
      + '  <div class="sr-hero-sum">'
      + '    <div class="sr-hs-head">ผลงานที่ปิดแล้ว + รอส่งของ <span class="sr-pill-pct">' + pct(k.ach43) + ' ของเป้า</span></div>'
      + '    <div class="sr-hs-total">' + money(s.sum43) + '</div>'
      + '    <div class="sr-hs-cols">'
      + '      <div><small>ปิดงานแล้ว (100%)</small><b>' + money(s.s4) + '</b></div>'
      + '      <div><small>รอส่งของ (90%)</small><b>' + money(s.s3) + '</b></div>'
      + '    </div>'
      + '    <div class="sr-bar"><span style="width:' + clampPct(k.ach43) + '%;background:#0EA5E9"></span></div>'
      + '    <div class="sr-hs-foot">รอยืนยัน PO ' + money(s.s2) + ' · Pipeline ' + money(s.s1) + (s.s0 ? ' · กำลังคุย ' + money(s.s0) : '') + '</div>'
      + '  </div>'
      + '  <div class="sr-hero-fc">'
      + '    <div class="sr-hf-label"><i class="fa-solid fa-chart-line"></i> ประมาณการยอดขายปิดเดือน</div>'
      + '    <div class="sr-hf-val">' + money(s.forecast) + '</div>'
      + '    <div class="sr-hf-pct">' + pct(k.forecastPct) + ' ของเป้า ' + money(k.target) + '</div>'
      + '    <div class="sr-bar"><span style="width:' + clampPct(k.forecastPct) + '%;background:#FDE68A"></span></div>'
      + '    <div class="sr-hf-gap">' + gapHtml + '</div>'
      + '    <div class="sr-hf-bd">ปิด+รอส่ง ' + money(s.secured) + ' (100%) · PO ' + money(s.weighted2) + ' (50%) · Pipeline ' + money(s.weighted1) + ' (25%)</div>'
      + '  </div>'
      + '</div>';

    function opt(v, tx, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(tx) + '</option>'; }
    var yearOpts = yearsList().map(function (y) { return opt(y, 'ปี ' + (y + 543), state.year); }).join('');
    var monthOpts = '<option value=""' + (state.month ? '' : ' selected') + '>ทุกเดือน</option>' +
      TH_MONTHS.map(function (mth, i) { return opt(i + 1, String(i + 1).padStart(2, '0') + '.' + mth, state.month); }).join('');
    var teamOpts = '<option value="">ทุกทีม</option>' + TEAMS.map(function (t) { return opt(t.code, t.name, state.team); }).join('');
    var prodOpts = '<option value="">ทุกสินค้า</option>' + PRODUCTS.map(function (p) { return opt(p.code, p.name, state.product); }).join('');
    var payOpts = '<option value="">ทุกรูปแบบ</option>' + PAYMENTS.map(function (p) { return opt(p.code, p.name, state.payment); }).join('');
    var lockedTeam = viewerTeam();
    var teamField = saleScope
      ? '<div class="sr-fl"><label>ทีม (BU)</label><div class="sr-locked"><i class="fa-solid fa-user-lock"></i> '
        + esc(teamByCode(sale(scD.saleId).team).name) + ' <span class="sr-s2">ของฉัน</span></div></div>'
      : (lockedTeam
        ? '<div class="sr-fl"><label>ทีม (BU)</label><div class="sr-locked"><i class="fa-solid fa-lock"></i> '
          + esc(teamByCode(lockedTeam).name) + ' <span class="sr-s2">ทีมที่คุณดูแล</span></div></div>'
        : '<div class="sr-fl"><label>ทีม (BU)</label><select data-sr-filter="team">' + teamOpts + '</select></div>');

    return '<div class="sr">'
      + '<div class="sr-head">'
      + '  <div><h1>ภาพรวมยอดขาย &amp; Forecast</h1>'
      + '    <div class="sr-sub">' + esc(today) + ' · ใช้สูตรและข้อมูลชุดเดียวกับหน้า Reports</div></div>'
      + '  <div class="sr-head-r">'
      + '    <div class="sr-upd"><i class="fa-regular fa-clock"></i> อัปเดตล่าสุด <b>' + esc(nowStr) + '</b></div>'
      + '    <label class="sr-ar"><i class="fa-solid fa-rotate"></i> Auto Refresh'
      + '      <select data-sr-refresh>' + [0, 1, 5, 10, 15].map(function (m) {
        return '<option value="' + m + '"' + (m === refreshMin ? ' selected' : '') + '>' + (m ? m + ' นาที' : 'ปิด') + '</option>';
      }).join('') + '</select></label>'
      + '  </div>'
      + '</div>'
      + scopeNotice().replace('margin-bottom', 'margin-bottom')
      + '<div class="sr-filters sr-f5">'
      + '  <div class="sr-fl"><label>ปี</label><select data-sr-filter="year">' + yearOpts + '</select></div>'
      + '  <div class="sr-fl"><label>เดือนที่คาดว่าจะปิด</label><select data-sr-filter="month">' + monthOpts + '</select></div>'
      + teamField
      + '  <div class="sr-fl"><label>สินค้า</label><select data-sr-filter="product">' + prodOpts + '</select></div>'
      + '  <div class="sr-fl"><label>รูปแบบการซื้อ</label><select data-sr-filter="payment">' + payOpts + '</select></div>'
      + '  <div class="sr-fbtn"><button class="sr-btn" data-sr-goto="reports"><i class="fa-solid fa-arrow-right"></i> ดูรายละเอียดทั้งหมด</button></div>'
      + '</div>'
      + '<div class="sr-scope"><i class="fa-regular fa-calendar"></i> '
      + (saleScope ? 'ข้อมูลของ <b>' + esc(sale(scD.saleId).name) + '</b> · ' : '')
      + esc(state.month ? monthLabel(state.year, state.month) : ('ปี ' + (state.year + 543)))
      + ' · ' + k.list.length + ' ดีล</div>'
      + hero
      + '<div class="sr-dash-r2">'
      + dashFunnelPanel(k)
      + dashForecastPanel(k)
      + dashGaugePanel(k)
      + dashInsightsPanel(k)
      + '</div>'
      + '<div class="sr-sec-h">'
      + '  <div><h3>ผลงานตามทีม / AE</h3><div class="sr-s2">เป้าเทียบกับ Actual และ Forecast ของแต่ละคน</div></div>'
      + '  <div class="sr-seg">'
      + '    <button data-sr-dashperf="team"' + (perfMode === 'team' ? ' class="on"' : '') + '>By Team</button>'
      + '    <button data-sr-dashperf="rep"' + (perfMode === 'rep' ? ' class="on"' : '') + '>By Sales Rep</button>'
      + '  </div>'
      + '</div>'
      + '<div class="sr-dash-teams">' + (perfMode === 'rep' ? repRows : (teamRows || '<div class="sr-trow">ยังไม่มีทีม</div>')) + '</div>'
      + payPanel
      + '<div class="sr-dash-charts">'
      + '  <section class="sr-panel">'
      + '    <div class="sr-ph"><div><h3>ยอดขายตามทีม แยกตามสถานะ</h3>'
      + '      <div class="sr-s2">ปิดงานแล้ว · รอส่งของ · รอ PO · Pipeline</div></div></div>'
      + '    <div class="sr-chartbox"><canvas id="srDashBar"></canvas></div>'
      + '  </section>'
      + '  <section class="sr-panel">'
      + '    <div class="sr-ph"><h3>สัดส่วนสถานะงาน</h3></div>'
      + '    <div class="sr-chartbox"><canvas id="srDashStatus"></canvas></div>'
      + '  </section>'
      + '  <section class="sr-panel sr-span-all">'
      + '    <div class="sr-ph"><div><h3>Sales Trend &amp; Forecast</h3>'
      + '      <div class="sr-s2">' + esc(trendSubtitle()) + ' · เทียบเป้า</div></div>'
      + '      <div class="sr-seg sr-seg-trend">'
      + TREND_MODES.map(function (tm) {
        return '<button class="sr-segbtn' + (trendMode() === tm.key ? ' on' : '') + '" data-sr-dashtrend="' + tm.key + '">'
          + '<i class="fa-solid ' + tm.icon + '"></i> ' + esc(tm.label) + '</button>';
      }).join('')
      + '      </div></div>'
      + '    <div class="sr-chartbox sm"><canvas id="srDashTrend"></canvas></div>'
      + '  </section>'
      + '</div>'
      + '<div class="sr-dash-bottom">'
      + '<section class="sr-panel" style="margin-bottom:0">'
      + '  <div class="sr-ph"><div><h3>ดีลที่ต้องติดตาม (Pipeline / กำลังคุย)</h3>'
      + '    <div class="sr-s2">เรียงตามมูลค่าสูงสุด · คลิกแถวเพื่อดูหมายเหตุ</div></div>'
      + '    <button class="sr-btn" data-sr-goto="reports"><i class="fa-solid fa-list"></i> ดูดีลทั้งหมด</button></div>'
      + '  <div class="sr-tablewrap"><table class="sr-table"><thead><tr>'
      + '    <th>สถานะ</th><th>ลูกค้า / งาน</th><th>AE</th><th class="sr-num">มูลค่า</th>'
      + '    <th class="sr-num">คาดปิด</th>'
      + '  </tr></thead><tbody>' + (followRows || '<tr><td colspan="5" class="sr-empty">ไม่มีดีลที่ต้องติดตาม</td></tr>') + '</tbody></table></div>'
      + '</section>'
      + dashFilterCard(k)
      + '</div>'
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
      /* เคารพขอบเขตสิทธิ์: AE เห็นเฉพาะ BU ของตัวเอง, Head/Sup เห็นเฉพาะทีมที่ดูแล */
      var scC = scopeOf();
      var teams = TEAMS.filter(function (t) {
        if (scC.type === 'sale') return t.code === sale(scC.saleId).team;
        if (scC.type === 'team') return t.code === scC.team;
        if (scC.type === 'none') return false;
        return !state.team || t.code === state.team;
      });
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
            { label: 'ปิดงานแล้ว', data: series.s4, backgroundColor: '#2563EB', borderRadius: 4, stack: 'a', maxBarThickness: 46 },
            { label: 'รอส่งของ', data: series.s3, backgroundColor: '#38BDF8', borderRadius: 4, stack: 'a', maxBarThickness: 46 },
            { label: 'รอ PO', data: series.s2, backgroundColor: '#F59E0B', borderRadius: 4, stack: 'a', maxBarThickness: 46 },
            { label: 'Pipeline', data: series.s1, backgroundColor: '#A78BFA', borderRadius: 4, stack: 'a', maxBarThickness: 46 }
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
              ticks: { callback: function (v) { return Number(v).toLocaleString('th-TH'); } },
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
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          layout: { padding: 18 },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: { callbacks: { label: function (c) { return c.label + ': ' + money(c.parsed); } } }
          }
        }
      }));
    }

    /* ---- Sales Trend & Forecast (รายสัปดาห์/รายเดือน) ---- */
    var trendEl = document.getElementById('srDashTrend');
    if (trendEl) {
      var td = dashTrend(k);
      charts.push(new Chart(trendEl, {
        type: 'line',
        data: {
          labels: td.labels,
          datasets: [
            {
              label: 'Actual (ปิด + รอส่ง)', data: td.actual, borderColor: '#2563EB',
              backgroundColor: 'rgba(37,99,235,.09)', fill: true, tension: .35,
              pointRadius: td.mode === 'day' ? 2 : 3, pointBackgroundColor: '#2563EB', borderWidth: 2
            },
            {
              label: 'Forecast', data: td.forecast, borderColor: '#0EA5E9',
              borderDash: [6, 4], fill: false, tension: .35, pointRadius: 2, pointBackgroundColor: '#0EA5E9', borderWidth: 2
            },
            {
              label: 'Target', data: td.target, borderColor: '#CBD5E1',
              borderDash: [3, 3], fill: false, pointRadius: 0, tension: 0, borderWidth: 1.6
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } },
            tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: { callback: function (v) { return Number(v).toLocaleString('th-TH'); } },
              grid: { color: '#EFF3F8' }
            }
          }
        }
      }));
    }
  }

  /* ---------- ผลงานรายบุคคล: ชิปเซลส์ + รายงานรายเดือน ---------- */
  function saleChips() {
    var sc = scopeOf();
    var tm = state.perfTeam || state.team || '';
    if (sc.type === 'team') tm = sc.team;
    var list = SALES.filter(function (s) {
      if (sc.type === 'sale') return mySaleIds(sc).indexOf(s.id) >= 0;
      if (sc.type === 'none') return false;
      return !tm || s.team === tm;
    });
    if (!list.length) return '<div class="sr-s2">ไม่มี AE ในทีมนี้</div>';;
    return list.map(function (s) {
      var deals = DEALS.filter(function (d) {
        return d.saleId === s.id && d.year === state.year && (!state.month || d.month === state.month);
      });
      var sum = summarize(deals);
      var teamSize = SALES.filter(function (x) { return x.team === s.team; }).length || 1;
      var tg = targetOf(s.team, state.year, state.month) / teamSize;
      var ach = tg ? sum.s4 / tg * 100 : 0;
      return '<button class="sr-salechip" data-sr-sale="' + esc(s.id) + '" title="ดูรายงานรายเดือนของ ' + esc(s.name) + '">'
        + '<span class="sr-schip-av">' + esc(String(s.name).trim().charAt(0)) + '</span>'
        + '<span class="sr-schip-txt"><b>' + esc(s.name) + '</b>'
        + '<small>' + esc(s.team) + ' · Actual ' + money(sum.s4) + ' · ' + pct(ach) + '</small></span>'
        + '<i class="fa-solid fa-chevron-right"></i></button>';
    }).join('');
  }

  function openSaleMonthly(saleId) {
    var s = sale(saleId);
    var teamSize = SALES.filter(function (x) { return x.team === s.team; }).length || 1;
    var rows = '';
    var tot = { s4: 0, s3: 0, s2: 0, s1: 0, total: 0, target: 0 };
    for (var m = 1; m <= 12; m++) {
      var list = DEALS.filter(function (d) { return d.saleId === saleId && d.year === state.year && d.month === m; });
      var sum = summarize(list);
      var tg = targetOf(s.team, state.year, m) / teamSize;
      var ach = tg ? sum.s4 / tg * 100 : 0;
      tot.s4 += sum.s4; tot.s3 += sum.s3; tot.s2 += sum.s2; tot.s1 += sum.s1;
      tot.total += sum.totalSale; tot.target += tg;
      var has = sum.totalSale || sum.s0 || sum.s5;
      rows += '<tr class="' + (state.month === m ? 'sr-hl-row' : '') + (has ? '' : ' sr-dimrow') + '">'
        + '<td><b>' + TH_MONTHS[m - 1] + '</b>' + (state.month === m ? ' <span class="sr-now">เดือนที่เลือก</span>' : '') + '</td>'
        + '<td class="sr-num">' + (sum.s4 ? money(sum.s4) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-num">' + (sum.s3 ? money(sum.s3) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-num">' + (sum.s2 ? money(sum.s2) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-num">' + (sum.s1 ? money(sum.s1) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-num sr-strong">' + (sum.totalSale ? money(sum.totalSale) : '<span class="sr-dim">—</span>') + '</td>'
        + '<td class="sr-num sr-muted">' + money(tg) + '</td>'
        + '<td class="sr-num"><div class="sr-achbar"><span style="width:' + Math.max(0, Math.min(100, ach)) + '%"></span></div>'
        + '<small>' + pct(ach) + '</small></td>'
        + '</tr>';
    }
    var totAch = tot.target ? tot.s4 / tot.target * 100 : 0;
    var body = '<div class="sr-mtable"><table class="sr-table"><thead><tr>'
      + '<th>เดือน</th><th class="sr-num">Actual</th><th class="sr-num">รอส่งของ</th><th class="sr-num">รอ PO</th>'
      + '<th class="sr-num">Pipeline</th><th class="sr-num">รวม</th><th class="sr-num">เป้า/เดือน</th><th class="sr-num">% ปิดงาน</th>'
      + '</tr></thead><tbody>' + rows + '</tbody>'
      + '<tfoot><tr class="sr-total-row"><td><b>รวมทั้งปี</b></td>'
      + '<td class="sr-num"><b>' + money(tot.s4) + '</b></td>'
      + '<td class="sr-num"><b>' + money(tot.s3) + '</b></td>'
      + '<td class="sr-num"><b>' + money(tot.s2) + '</b></td>'
      + '<td class="sr-num"><b>' + money(tot.s1) + '</b></td>'
      + '<td class="sr-num"><b>' + money(tot.total) + '</b></td>'
      + '<td class="sr-num sr-muted"><b>' + money(tot.target) + '</b></td>'
      + '<td class="sr-num"><b>' + pct(totAch) + '</b></td></tr></tfoot></table></div>';

    if (typeof global.setModal === 'function') {
      global.setModal(s.name, s.team + ' · รายงานยอดขายรายเดือน ปี ' + (state.year + 543), body,
        [{ label: 'ปิด', primary: true }], true);
    }
  }

  /* ---------- ฟอร์มเพิ่ม/แก้ไขดีล (เก็บครบทุกฟิลด์ที่ Reports ต้องใช้) ---------- */
  function openAddDeal() {
    __editNo = '';
    openDealForm(null);
  }

  /** เปิดฟอร์มดีล — null = เพิ่มใหม่, deal object = แก้ไข */
  function openDealForm(d0) {
    injectCss();
    if (!SALES.length) {
      if (global.toast) global.toast('ยังไม่มีรายชื่อ AE — เพิ่มที่หัวข้อ “รายชื่อ AE” ก่อน');
      return;
    }
    var tm = state.team || viewerTeam() || '';
    var list = SALES.filter(function (s) { return !tm || s.team === tm; });
    if (!list.length) list = SALES;
    if (d0 && !list.some(function (s) { return s.id === d0.saleId; })) list = SALES;
    var cur = d0 || {};
    var mineSale = '';
    try {
      var scf = scopeOf();
      if (scf.type === 'sale') mineSale = scf.saleId;
    } catch (e) {}
    if (!mineSale) mineSale = String((global.__ME__ || {}).saleId || '');
    var saleField = mineSale
      ? '<input type="hidden" name="saleId" value="' + esc(mineSale) + '">'
        + '<div class="sr-fixed" title="กําหนดอัตโนมัติจากบัญชีผู้ใช้"><i class="fa-solid fa-user-lock"></i> '
        + esc(sale(mineSale).name) + ' <span class="sr-s2">(' + esc(teamByCode(sale(mineSale).team).name) + ')</span></div>'
      : '<select name="saleId">' + list.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (cur.saleId === s.id ? ' selected' : '') + '>' + esc(teamByCode(s.team).name) + ' · ' + esc(s.name) + '</option>';
        }).join('') + '</select>';
    var saleOpts = '';   /* ใช้ saleField แทน (คงตัวแปรไว้กันอ้างอิงเดิมในฟังก์ชันอื่น) */
    void saleOpts;
    var curStatus = cur.status === undefined ? 1 : Number(cur.status);
    var statusOpts = STATUS.map(function (st) {
      return '<option value="' + st.code + '"' + (st.code === curStatus ? ' selected' : '') + '>' + st.code + ' · ' + esc(st.label) + '</option>';
    }).join('');
    var prodOpts = PRODUCTS.map(function (p) { return '<option value="' + p.code + '"' + (cur.product === p.code ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var payOpts = PAYMENTS.map(function (p) { return '<option value="' + p.code + '"' + (cur.payment === p.code ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var curYear = Number(cur.year || state.year);
    var yearOpts = yearsList().map(function (y) { return '<option value="' + y + '"' + (y === curYear ? ' selected' : '') + '>' + (y + 543) + '</option>'; }).join('');
    var curMonth = Number(cur.month || state.month || new Date().getMonth() + 1);
    var monthOpts = TH_MONTHS.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + ((i + 1) === curMonth ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
    /* อ้างอิง Daily Report (ต้นสายปลายเหตุ) */
    var drOpts = '';
    if (global.DailyReport && global.DailyReport.options) {
      try {
        drOpts = global.DailyReport.options().slice(0, 80).map(function (r) {
          return '<option value="' + esc(r.ref) + '">' + esc(r.ref + ' · ' + shortDate(r.date) + ' · ' + r.customer) + '</option>';
        }).join('');
      } catch (e) { drOpts = ''; }
    }

    var body = '<form id="srDealForm">'
      + '<div class="sr-dform">'
      + '  <label class="sr-df full">ชื่องาน / ดีล *<input name="job" required placeholder="เช่น ร้านสะดวกซัก 6 เครื่อง" value="' + esc(cur.job || '') + '"></label>'
      + '  <label class="sr-df full">ลูกค้า *<input name="customer" required placeholder="ชื่อบริษัท / ร้านค้า" value="' + esc(cur.customer || '') + '"></label>'
      + '  <label class="sr-df full">เลข QT / อ้างอิง (ถ้ามี)<input name="so" maxlength="48" placeholder="กรอกเองได้ เช่น QT-2026-0123" value="' + esc(cur.so || '') + '">'
      + '    <span class="sr-s2" style="font-weight:400">บันทึกตามเอกสารจริงเท่านั้น — ระบบไม่สร้างให้เอง</span></label>'
      + '  <label class="sr-df">AE ผู้รับผิดชอบ *' + saleField + '</label>'
      + '  <label class="sr-df">สถานะงาน *<select name="status">' + statusOpts + '</select></label>'
      + '  <label class="sr-df">มูลค่างาน (บาท) *<input name="amount" type="number" min="0" step="1" required placeholder="0" value="' + (cur.amount !== undefined ? Number(cur.amount) : '') + '"></label>'
      + '  <div class="sr-df"><span>โอกาสปิด (%)</span>'
      + '    <div class="sr-fixed" title="ระบบคำนวณจากสถานะงานอัตโนมัติ แก้ไขเองไม่ได้"><i class="fa-solid fa-lock"></i> <b id="srProbVal">' + probOfStatus(curStatus) + '</b>&nbsp;% <span class="sr-s2">ล็อกตามสถานะ</span></div>'
      + '    <input type="hidden" name="prob" value="' + probOfStatus(curStatus) + '"></div>'
      + '  <label class="sr-df full" id="srDocWrap"' + (curStatus === 4 ? '' : ' style="display:none"') + '>เลขอินวอย / เลขที่สัญญา / เลขที่ SO *'
      + '    <input name="docNo" maxlength="64" placeholder="เช่น INV-2026-0145 / CT-2026-009 / SO-2026-0123" value="' + esc(cur.docNo || '') + '"' + (curStatus === 4 ? ' required' : '') + '>'
      + '    <span class="sr-s2" style="font-weight:400">บังคับกรอกเมื่อสถานะเป็น “Actual (ปิดงานแล้ว)” — ใช้เป็นหลักฐานปิดงาน</span></label>'
      + '  <label class="sr-df">สินค้า<select name="product">' + prodOpts + '</select></label>'
      + '  <label class="sr-df">รูปแบบการซื้อ<select name="payment">' + payOpts + '</select></label>'
      + '  <label class="sr-df">ปีที่คาดว่าจะปิด<select name="year">' + yearOpts + '</select></label>'
      + '  <label class="sr-df">เดือนที่คาดว่าจะปิด<select name="month">' + monthOpts + '</select></label>'
      + '  <label class="sr-df full">หมายเหตุ<input name="note" placeholder="รายละเอียด/เงื่อนไข (แสดงใน Reports)" value="' + esc(cur.note || '') + '"></label>'
      + '  <label class="sr-df full">อ้างอิง Daily Report (ไม่บังคับ)<input name="drRef" list="srDrRefs" placeholder="เช่น DR-20261123-01" value="' + esc(cur.drRef || '') + '">'
      + '    <datalist id="srDrRefs">' + drOpts + '</datalist></label>'
      + '</div>'
      + '<div class="sr-s2" style="margin-top:10px">ข้อมูลนี้จะถูกใช้ใน Reports · Dashboard · Customer Intelligence ทันที</div>'
      + '</form>';

    global.setModal(d0 ? 'แก้ไขดีล' : 'เพิ่มดีลใหม่',
      d0 ? (cur.customer + ' · ' + cur.no) : ('เลขดีลถัดไป ' + nextNo(state.year) + ' · กรอกข้อมูลให้ครบเพื่อให้รายงานคำนวณถูกต้อง'),
      body, [
        { label: 'ยกเลิก' },
        { label: d0 ? 'บันทึกการแก้ไข' : 'บันทึกดีล', icon: 'fa-solid fa-check', action: 'sr-save-deal', primary: true }
      ], true);
  }

  /** อัปเดต UI ตามสถานะงาน: โอกาสปิดล็อกอัตโนมัติ + บังคับเลขอินวอย/สัญญา/SO เมื่อปิดงานแล้ว */
  function syncDealStatusUI(f) {
    if (!f) return;
    var status = Number((f.status && f.status.value) || 0);
    var pv = probOfStatus(status);
    var out = document.getElementById('srProbVal');
    if (out) out.textContent = pv;
    var hidden = f.querySelector('input[name="prob"]');
    if (hidden) hidden.value = pv;
    var wrap = document.getElementById('srDocWrap');
    var input = f.querySelector('input[name="docNo"]');
    var needDoc = status === 4;
    if (wrap) wrap.style.display = needDoc ? '' : 'none';
    if (input) {
      if (needDoc) input.setAttribute('required', 'required');
      else input.removeAttribute('required');
    }
  }
  function onDealStatusChange(el) {
    var f = el && el.form;
    if (!f || f.id !== 'srDealForm') return false;
    syncDealStatusUI(f);
    var status = Number(el.value || 0);
    if (status === 4) {
      if (typeof global.toast === 'function') global.toast('ปิดงานแล้ว → กรุณากรอกเลขอินวอย / เลขที่สัญญา / เลขที่ SO');
      var inp = f.querySelector('input[name="docNo"]');
      if (inp) { try { inp.focus(); } catch (e) {} }
    }
    return true;
  }

  function saveDealForm() {
    var f = document.getElementById('srDealForm');
    if (!f || !f.reportValidity()) return;
    try {
      var payload = {
        job: f.job.value, customer: f.customer.value,
        saleId: f.saleId.value, status: Number(f.status.value),
        amount: Number(f.amount.value || 0), prob: probOfStatus(Number(f.status.value)),
        docNo: String((f.docNo && f.docNo.value) || '').trim(),
        product: f.product.value, payment: f.payment.value,
        year: Number(f.year.value), month: Number(f.month.value),
        note: f.note.value,
        drRef: String((f.drRef && f.drRef.value) || '').trim().toUpperCase(),
        so: String((f.so && f.so.value) || '').trim()
      };
      /* ---- ตรวจความสอดคล้องของข้อมูล (กันข้อมูลลอย) ---- */
      if (!SALES.some(function (s) { return s.id === payload.saleId; })) {
        throw new Error('ไม่พบ AE ผู้รับผิดชอบนี้ในรายชื่อ AE — กรุณาเลือกใหม่');
      }
      if (payload.status === 4 && !payload.docNo) {
        throw new Error('สถานะ “ปิดงานแล้ว” ต้องระบุเลขอินวอย / เลขที่สัญญา / เลขที่ SO');
      }
      if (payload.drRef && global.DailyReport && global.DailyReport.options) {
        var refs = [];
        try {
          refs = (global.DailyReport.options() || []).map(function (r) { return String(r.ref || '').toUpperCase(); });
        } catch (e) { refs = []; }
        if (refs.length && refs.indexOf(payload.drRef) < 0) {
          throw new Error('ไม่พบรหัสอ้างอิง ' + payload.drRef + ' ใน Daily Report — ตรวจสอบหรือลบช่องนี้ออก');
        }
      }
      if (__editNo) {
        var d = null;
        for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === __editNo) { d = DEALS[i]; break; }
        if (!d) throw new Error('ไม่พบดีลที่ต้องการแก้ไข');
        for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) d[k] = payload[k];
        d.updatedAt = new Date().toISOString();
        saveDeals();
        cloudSave(d);
        if (global.PILog) global.PILog.add('deal.edit', d.no + ' · ' + d.customer, d.job + ' · ' + money(d.amount) + ' · ' + st(d.status).label);
        __editNo = '';
        if (typeof global.closeModal === 'function') global.closeModal();
        if (typeof global.render === 'function') global.render();
        if (typeof global.toast === 'function') global.toast('บันทึกการแก้ไขแล้ว');
        return;
      }
      addDeal(payload);
      if (typeof global.closeModal === 'function') global.closeModal();
      if (typeof global.render === 'function') global.render();
      if (typeof global.toast === 'function') global.toast('บันทึกดีลแล้ว — Reports อัปเดตเรียบร้อย');
    } catch (e) {
      if (typeof global.toast === 'function') global.toast('บันทึกไม่สำเร็จ: ' + (e.message || e));
    }
  }

  /** ลบดีล (มี confirm) */
  function deleteDeal(no) {
    if (!no) return;
    if (!global.confirm('ลบดีล ' + no + ' ?')) return;
    var rec = null;
    for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === no) { rec = DEALS[i]; break; }
    removeDeal(no);
    if (global.PILog && rec) global.PILog.add('deal.del', no + ' · ' + rec.customer, rec.job + ' · ' + money(rec.amount));
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.render === 'function') global.render();
    if (typeof global.toast === 'function') global.toast('ลบดีลแล้ว');
  }

  /** เปิดฟอร์มแก้ไขดีลจากเลขดีล */
  function editDeal(no) {
    var d = null;
    for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === no) { d = DEALS[i]; break; }
    if (!d) return;
    __editNo = no;
    openDealForm(d);
  }

  /** แท็บ Report / Daily Report — บันทึกกิจกรรม (Log) ย้ายไปหน้า Activity Log ของ Admin แล้ว */
  function renderTabs() {
    var isDaily = state.view === 'daily';
    var showDaily = !!(global.DailyReport && global.DailyReport.render);
    return '<div class="sr-tabsbar">'
      + '  <button class="sr-tabbtn' + (isDaily ? '' : ' on') + '" data-sr-view="report"><i class="fa-solid fa-chart-pie"></i> รายงานยอดขาย</button>'
      + (showDaily ? '  <button class="sr-tabbtn' + (isDaily ? ' on' : '') + '" data-sr-view="daily"><i class="fa-solid fa-clipboard-check"></i> Daily Report</button>' : '')
      + '</div>';
  }

  function render() {
    /* แท็บ “บันทึกการพบลูกค้า” = Daily Report (ส่วนหนึ่งของ Reports) */
    if (state.view === 'daily' && global.DailyReport && global.DailyReport.render) {
      return '<div class="sr sr-daily-tab">'
        + '<div class="sr-head"><div><h1>Reports</h1>'
        + '  <div class="sr-sub">Daily Report — บันทึกการเข้าพบลูกค้า / แผนงานรายวัน · customer visit log &amp; daily plan</div></div></div>'
        + renderTabs()
        + global.DailyReport.render()
        + '</div>';
    }

    var k = kpis();
    var notice = scopeNotice();
    if (scopeOf().type === 'pending') {
      return '<div class="sr"><div class="sr-head"><div><h1>Reports</h1>'
        + '<div class="sr-sub">กำลังโหลดข้อมูลตามสิทธิ์ของคุณ…</div></div></div>'
        + renderTabs() + notice + '</div>';
    }
    var k = kpis();
    return '<div class="sr">'
      + '<div class="sr-head">'
      + '  <div><h1>Reports</h1>'
      + '    <div class="sr-sub">สรุปยอดขาย ผลงานรายบุคคล และประมาณการปิดเดือน</div></div>'
      + '</div>'
      + renderTabs()
      + notice
      + renderFilters(k)
      + renderKpis(k)
      + renderTargets()
      + '<div class="sr-charts">'
      + '  <section class="sr-panel sr-chart-wide">'
      + '    <div class="sr-ph"><div><h3>ผลงานรายบุคคล (AE Performance)</h3>'
      + '      <div class="sr-s2">เลือกทีมด้านขวา แล้วคลิกชื่อ AE เพื่อดูรายงานยอดขายรายเดือน · เส้นประแดง = เป้าหมายต่อคน</div></div>'
      + '      <div class="sr-teamtabs">'
      + (function () {
        var psc = scopeOf();
        var mineTeam = '';
        if (psc.type === 'sale') { var ms = sale(psc.saleId); mineTeam = ms ? ms.team : ''; }
        if (psc.type === 'team') mineTeam = psc.team;
        var allow = TEAMS.filter(function (t) {
          if (psc.type === 'all') return true;
          return t.code === mineTeam;
        });
        if (state.perfTeam && !allow.some(function (t) { return t.code === state.perfTeam; })) state.perfTeam = '';
        if (!allow.length) return '';
        if (allow.length === 1) {
          state.perfTeam = allow[0].code;
          return '<button class="sr-tab on" data-sr-perfteam="' + esc(allow[0].code) + '">'
            + esc(allow[0].name) + (psc.type === 'sale' ? ' ของฉัน' : '') + '</button>';
        }
        return '<button class="sr-tab' + (state.perfTeam === '' ? ' on' : '') + '" data-sr-perfteam="">ทุกทีม</button>'
          + allow.map(function (t) {
            return '<button class="sr-tab' + (state.perfTeam === t.code ? ' on' : '') + '" data-sr-perfteam="' + esc(t.code) + '">' + esc(t.name) + '</button>';
          }).join('');
      })()
      + '      </div></div>'
      + '    <div class="sr-chartbox"><canvas id="srBarChart"></canvas></div>'
      + '    <div class="sr-salelist">' + saleChips() + '</div>'
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
        if (state.perfTeam && r.team !== state.perfTeam) return;
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
            { label: '4.Actual', data: d4, backgroundColor: '#2563EB', borderRadius: 4, stack: 'a', maxBarThickness: 44 },
            { label: '3.รอส่งของ', data: d3, backgroundColor: '#38BDF8', borderRadius: 4, stack: 'a', maxBarThickness: 44 },
            { label: '2.รอยืนยัน PO', data: d2, backgroundColor: '#F59E0B', borderRadius: 4, stack: 'a', maxBarThickness: 44 },
            { label: '1.Pipeline', data: d1, backgroundColor: '#A78BFA', borderRadius: 4, stack: 'a', maxBarThickness: 44 },
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
              ticks: { callback: function (v) { return Number(v).toLocaleString('th-TH'); } },
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
    injectCss();
    var d = null;
    for (var i = 0; i < DEALS.length; i++) if (DEALS[i].no === no) { d = DEALS[i]; break; }
    if (!d) return;
    var s = st(d.status), p = product(d.product), pay = payment(d.payment);
    var body = ''
      + '<div class="sr-md-grid">'
      + '  <div><small>สถานะงาน</small><strong><span class="sr-badge ' + s.cls + '">' + d.status + ' · ' + esc(s.label) + '</span></strong></div>'
      + '  <div><small>มูลค่างานประมาณ</small><strong>' + money(d.amount) + '</strong></div>'
      + '  <div><small>Cash In คาดรับ</small><strong>' + (cashInOf(d) ? money(cashInOf(d)) : '—') + '</strong></div>'
      + '  <div><small>AE ผู้รับผิดชอบ</small><strong>' + esc(aeNameOf(d) || '-') + '</strong></div>'
      + '  <div><small>ผู้บันทึก</small><strong>' + esc(keyedByOf(d) || '-') + '</strong></div>'
      + '  <div><small>สินค้า</small><strong>' + esc(p.name) + '</strong></div>'
      + '  <div><small>รูปแบบการซื้อ</small><strong>' + esc(pay.name) + '</strong></div>'
      + '  <div><small>วันที่สร้างใบเสนอราคา</small><strong>' + shortDate(d.quoteDate) + '</strong></div>'
      + '  <div><small>เดือนที่คาดว่าจะปิด</small><strong>' + monthLabel(d.year, d.month) + '</strong></div>'
      + '  <div><small>เลขดีล</small><strong>' + esc(d.no) + '</strong></div>'
      + '  <div><small>เลข QT / อ้างอิง</small><strong>' + (d.so ? esc(d.so) : '—') + '</strong></div>'
      + (d.docNo ? '  <div><small>เลขอินวอย / สัญญา / SO</small><strong style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#0E9384">' + esc(d.docNo) + '</strong></div>' : '')
      + (d.drRef ? '  <div><small>อ้างอิง Daily Report</small><strong style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#1D4ED8">' + esc(d.drRef) + '</strong></div>' : '')
      + '</div>'
      + '<div class="sr-md-note"><b>หมายเหตุ</b><p>' + esc(d.note) + '</p></div>'
      + '<div class="sr-md-hist"><b><i class="fa-solid fa-clock-rotate-left"></i> ประวัติการแก้ไข</b>'
      + '  <div id="srDealHist" class="sr-hist"><div class="sr-s2">กำลังโหลดประวัติจากคลาวด์…</div></div></div>';
    if (typeof global.setModal === 'function') {
      global.setModal(d.customer, d.job + ' · ' + d.no, body, [
        { label: 'ลบดีล', icon: 'fa-solid fa-trash', action: 'sr-del-deal' },
        { label: 'แก้ไขดีล', icon: 'fa-solid fa-pen', action: 'sr-edit-deal', primary: true },
        { label: 'ปิด' }
      ]);
      __openNo = no;
      loadDealHistory(no);
    }
  }

  /** โหลดประวัติของดีล (แท็บ Logs บนคลาวด์) */
  function loadDealHistory(no) {
    var box = document.getElementById('srDealHist');
    if (!box) return;
    if (!(global.PIAuth && global.PIAuth.dealLogs)) {
      box.innerHTML = '<div class="sr-s2">ไม่พบโมดูลซิงก์คลาวด์</div>';
      return;
    }
    try {
      global.PIAuth.dealLogs(no).then(function (logs) {
        if (!document.getElementById('srDealHist')) return;
        if (!logs || !logs.length) {
          box.innerHTML = '<div class="sr-s2">ยังไม่มีประวัติ (จะเริ่มบันทึกเมื่อมีการแก้ไขบนคลาวด์)</div>';
          return;
        }
        box.innerHTML = logs.map(function (l) {
          var isAdd = /add/.test(l.action), isDel = /del/.test(l.action);
          var icon = isAdd ? 'fa-plus' : (isDel ? 'fa-trash' : 'fa-pen');
          var color = isAdd ? '#16A34A' : (isDel ? '#DC2626' : '#2563EB');
          return '<div class="sr-hist-row">'
            + '<span class="sr-hist-ico" style="color:' + color + '"><i class="fa-solid ' + icon + '"></i></span>'
            + '<div style="min-width:0"><b>' + (isAdd ? 'สร้างดีล' : (isDel ? 'ลบดีล' : 'แก้ไขดีล')) + '</b>'
            + '<div class="sr-s2" style="color:#475467">' + esc(l.detail || '') + '</div>'
            + '<div class="sr-s2" style="font-size:9.5px">' + esc(String(l.ts || '').replace('T', ' ').slice(0, 16)) + (l.by ? ' · ' + esc(l.by) : '') + '</div></div></div>';
        }).join('');
      }).catch(function () {
        if (document.getElementById('srDealHist')) box.innerHTML = '<div class="sr-s2">โหลดประวัติไม่ได้ (ออฟไลน์) — จะลองใหม่เมื่อเชื่อมต่อ</div>';
      });
    } catch (e) {
      box.innerHTML = '<div class="sr-s2">โหลดประวัติไม่ได้</div>';
    }
  }

  /* ---------- CSV ---------- */
  function exportCsv() {
    var q = String(state.q || '').trim().toLowerCase();
    var rows = sortRows(filteredDeals()).filter(function (d) {
      return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so + ' ' + (d.docNo || '')).toLowerCase().indexOf(q) >= 0;
    });
    var head = ['เลขดีล', 'สถานะ', 'ชื่อลูกค้า', 'ชื่องาน', 'เลข QT/อ้างอิง', 'เลขอินวอย/สัญญา/SO', 'วันที่เสนอราคา', 'เดือนที่คาดว่าจะปิด',
      'AE', 'สินค้า', 'มูลค่างานประมาณ', 'รูปแบบการซื้อ', 'Cash In', 'อ้างอิง Daily Report', 'หมายเหตุ'];
    var lines = [head];
    rows.forEach(function (d) {
      lines.push([d.no, d.status + ' · ' + st(d.status).label, d.customer, d.job, d.so, d.docNo || '', d.quoteDate,
        monthLabel(d.year, d.month), sale(d.saleId).name, product(d.product).name, Math.round(d.amount),
        payment(d.payment).name, Math.round(cashInOf(d)), d.drRef || '', d.note]);
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

  /* ---------- รายชื่อสินค้า (Admin) ---------- */
  function productsPanel() {
    var sc = scopeOf();
    if (sc.type === 'sale' || sc.type === 'none') return '';
    var rows = PRODUCTS.map(function (p) {
      var cnt = DEALS.filter(function (d) { return d.product === p.code; }).length;
      return '<tr>'
        + '<td><span class="sr-sid">' + esc(p.code) + '</span></td>'
        + '<td><span class="sr-dot" style="background:' + esc(p.color) + '"></span><b style="color:#0F2B46">' + esc(p.name) + '</b>'
        + '<div class="sr-s2">' + cnt + ' ดีล</div></td>'
        + '<td class="sr-num"><button class="sr-xbtn" data-sr-delproduct="' + esc(p.code) + '" title="ลบสินค้านี้"><i class="fa-solid fa-trash"></i></button></td>'
        + '</tr>';
    }).join('');
    return '<section class="sr-panel">'
      + '  <div class="sr-ph"><div><h3>รายชื่อสินค้า (Product)</h3>'
      + '    <div class="sr-s2">ใช้เลือกในฟอร์มดีล · รหัส P1, P2, … สร้างให้อัตโนมัติ</div></div>'
      + '    <div class="sr-tools"><button class="sr-btn dark" data-sr-addproduct><i class="fa-solid fa-plus"></i> เพิ่มสินค้า</button></div></div>'
      + (PRODUCTS.length
        ? '<div class="sr-tablewrap"><table class="sr-table sr-saletable"><thead><tr>'
          + '<th style="width:70px">รหัส</th><th>ชื่อสินค้า</th><th style="width:56px"></th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="sr-empty-note"><i class="fa-solid fa-circle-info" style="margin-right:6px"></i> ยังไม่มีสินค้า — กด “เพิ่มสินค้า”</div>')
      + '</section>';
  }

  /* ---------- จัดการสินค้า ---------- */
  function addProductModal() {
    injectCss();
    if (typeof global.setModal !== 'function') return;
    global.setModal('เพิ่มสินค้า', 'ชื่อสินค้าที่ต้องการแสดงในฟอร์มดีลและรายงาน',
      '<label style="font-size:11px;color:#475467">ชื่อสินค้า *</label>'
      + '<input id="srNewProduct" placeholder="เช่น ตู้กดน้ำ + เครื่องทำน้ำแข็ง" style="width:100%;margin:6px 0 12px;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">'
      + '<label style="font-size:11px;color:#475467">ชื่อย่อ (โอปชันนอล)</label>'
      + '<input id="srNewProductShort" placeholder="เช่น ตู้กดน้ำ" style="width:100%;margin:6px 0 0;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">',
      [{ label: 'ยกเลิก' }, { label: 'เพิ่มสินค้า', action: 'sr-add-product', primary: true }]);
  }

  function doAddProduct() {
    var inp = document.getElementById('srNewProduct');
    var sh = document.getElementById('srNewProductShort');
    try {
      var p = addProduct(inp ? inp.value : '', sh ? sh.value : '');
      if (typeof global.closeModal === 'function') global.closeModal();
      if (typeof global.render === 'function') global.render();
      if (global.toast) global.toast('เพิ่มสินค้า ' + p.name + ' (' + p.code + ') แล้ว');
    } catch (err) { if (global.toast) global.toast(err.message || String(err)); }
  }

  function deleteProduct(code) {
    var p = product(code);
    if (!global.confirm('ลบสินค้า ' + (p.name || code) + ' (' + code + ') ?')) return;
    try {
      removeProduct(code);
      if (typeof global.render === 'function') global.render();
      if (global.toast) global.toast('ลบ ' + code + ' แล้ว');
    } catch (err) { if (global.toast) global.toast(err.message || String(err)); }
  }

  /* ---------- จัดการทีม / เป้าหมาย ---------- */
  /* ---------- จัดการรายชื่อเซลส์ ---------- */
  function addSaleModal() {
    injectCss();
    if (typeof global.setModal !== 'function') return;
    var lockedTeam = viewerTeam();
    var teamOpts = (lockedTeam ? TEAMS.filter(function (t) { return t.code === lockedTeam; }) : TEAMS)
      .map(function (t) { return '<option value="' + esc(t.code) + '">' + esc(t.name) + '</option>'; }).join('');
    global.setModal('เพิ่ม AE',
      'กรอกชื่อ-นามสกุลจริง และเลือกทีมที่สังกัด',
      '<label style="font-size:11px;color:#475467">ชื่อ AE *</label>'
      + '<input id="srNewSale" placeholder="เช่น สมชาย ใจดี" style="width:100%;margin:6px 0 12px;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">'
      + '<label style="font-size:11px;color:#475467">ทีม (BU) *</label>'
      + '<select id="srNewSaleTeam" style="width:100%;margin-top:6px;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">' + teamOpts + '</select>'
      + '<div style="font-size:10.5px;color:#98A2B3;margin-top:8px">ชื่อนี้ต้องตรงกับชื่อบัญชีผู้ใช้ (ระดับ AE) เพื่อให้ Dashboard แสดงเฉพาะดีลของตัวเอง</div>',
      [{ label: 'ยกเลิก' }, { label: 'เพิ่ม AE', action: 'sr-add-sale', primary: true }]);
  }

  function doAddSale() {
    var inp = document.getElementById('srNewSale');
    var sel = document.getElementById('srNewSaleTeam');
    try {
      var s = addSale(inp ? inp.value : '', sel ? sel.value : '');
      if (typeof global.closeModal === 'function') global.closeModal();
      if (typeof global.render === 'function') global.render();
      if (global.toast) global.toast('เพิ่ม ' + s.name + ' (' + s.id + ') แล้ว');
    } catch (err) { if (global.toast) global.toast(err.message || String(err)); }
  }

  function deleteSale(id) {
    var s = sale(id);
    if (!global.confirm('ลบรายชื่อ AE ' + (s.name || id) + ' (' + id + ') ?')) return;
    try {
      removeSale(id);
      if (typeof global.render === 'function') global.render();
      if (global.toast) global.toast('ลบ ' + id + ' แล้ว');
    } catch (err) { if (global.toast) global.toast(err.message || String(err)); }
  }

  function addTeamModal() {
    injectCss();
    if (typeof global.setModal !== 'function') return;
    global.setModal('เพิ่มทีม (BU)', 'ตั้งชื่อทีมให้ตรงกับโครงสร้างองค์กร เช่น BU-CENTRAL',
      '<label style="font-size:11px;color:#475467">ชื่อทีม</label>'
      + '<input id="srNewTeam" placeholder="BU-CENTRAL" style="width:100%;margin-top:6px;padding:9px 10px;border:1px solid #E5EAF0;border-radius:8px;font-family:inherit;font-size:12px">'
      + '<div style="font-size:10.5px;color:#98A2B3;margin-top:8px">ทีมใหม่เริ่มด้วยเป้าหมาย 0 ทุกเดือน — แก้ไขได้ในตารางเป้าหมาย</div>',
      [{ label: 'ยกเลิก' }, { label: 'เพิ่มทีม', action: 'sr-add-team', primary: true }]);
  }

  function doAddTeam() {    var inp = document.getElementById('srNewTeam');
    var name = inp ? String(inp.value || '').trim().toUpperCase() : '';
    if (!name) { if (global.toast) global.toast('กรอกชื่อทีมก่อน'); return; }
    var dup = TEAMS.some(function (t) { return t.code === name || String(t.name).toUpperCase() === name; });
    if (dup) { if (global.toast) global.toast('มีทีมนี้อยู่แล้ว'); return; }
    TEAMS.push({ code: name, name: name });
    saveTeams();
    targetsOfTeam(name, state.year);
    saveTargets();
    if (global.PILog) global.PILog.add('team.add', name, 'เพิ่มทีมใหม่เข้าสู่ระบบ');
    ui.targets = true;                      // เปิดตารางเป้าหมายให้เห็นทีมใหม่ทันที
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.render === 'function') global.render();
    if (global.toast) global.toast('เพิ่มทีม ' + name + ' แล้ว');
  }

  function deleteTeam(code) {
    var members = SALES.filter(function (r) { return r.team === code; }).length;
    if (members) { if (global.toast) global.toast('ลบไม่ได้: ยังมี AE ' + members + ' คนในทีมนี้'); return; }
    if (!global.confirm('ลบทีม ' + code + ' ?')) return;
    TEAMS = TEAMS.filter(function (t) { return t.code !== code; });
    saveTeams();
    if (global.PILog) global.PILog.add('team.del', code, 'ลบทีมออกจากระบบ');
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
      return !q || (d.customer + ' ' + d.job + ' ' + d.no + ' ' + d.so + ' ' + (d.docNo || '')).toLowerCase().indexOf(q) >= 0;
    }).length;
    var c = document.getElementById('srDealCount');
    if (c) c.textContent = 'แสดง ' + shown + ' จาก ' + list.length + ' ดีล';
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'status' && onDealStatusChange(e.target)) return;
    if (e.target && e.target.closest && e.target.closest('[data-sr-refresh]')) {
      var mins = Number(e.target.value) || 0;
      try { global.localStorage.setItem(LS_REFRESH, String(mins)); } catch (err) {}
      scheduleDashRefresh();
      if (typeof global.toast === 'function') global.toast(mins ? 'ตั้ง Auto Refresh ทุก ' + mins + ' นาที' : 'ปิด Auto Refresh แล้ว');
      return;
    }
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
    if (t.closest('[data-sr-addsale]')) { addSaleModal(); return; }
    if (t.closest('[data-sr-addproduct]')) { addProductModal(); return; }
    var dpl = t.closest('[data-sr-delproduct]');
    if (dpl) { deleteProduct(dpl.getAttribute('data-sr-delproduct')); return; }
    var dsl = t.closest('[data-sr-delsale]');
    if (dsl) { deleteSale(dsl.getAttribute('data-sr-delsale')); return; }
    var vw = t.closest('[data-sr-view]');
    if (vw) {
      var vv = vw.getAttribute('data-sr-view');
      state.view = (vv === 'daily') ? 'daily' : 'report';
      if (typeof global.render === 'function') global.render();
      return;
    }
    var sv = t.closest('[data-sr-sumview]');
    if (sv) {
      state.summaryView = sv.getAttribute('data-sr-sumview') === 'table' ? 'table' : 'cards';
      if (typeof global.render === 'function') global.render();
      return;
    }
    var ptBtn = t.closest('[data-sr-perfteam]');
    if (ptBtn) { state.perfTeam = ptBtn.getAttribute('data-sr-perfteam'); if (typeof global.render === 'function') global.render(); return; }
    var dpBtn = t.closest('[data-sr-dashperf]');
    if (dpBtn) {
      state.dashPerf = dpBtn.getAttribute('data-sr-dashperf') === 'rep' ? 'rep' : 'team';
      if (typeof global.render === 'function') global.render();
      return;
    }
    var dtBtn = t.closest('[data-sr-dashtrend]');
    if (dtBtn) {
      var dm = dtBtn.getAttribute('data-sr-dashtrend');
      state.dashTrend = (dm === 'day' || dm === 'year') ? dm : 'month';
      if (typeof global.render === 'function') global.render();
      return;
    }
    var saleBtn = t.closest('[data-sr-sale]');
    if (saleBtn) { openSaleMonthly(saleBtn.getAttribute('data-sr-sale')); return; }
    var act0 = t.closest('[data-action]');
    if (act0 && act0.getAttribute('data-action') === 'sr-save-deal') { saveDealForm(); return; }
    if (act0 && act0.getAttribute('data-action') === 'sr-del-deal') { deleteDeal(__openNo); return; }
    if (act0 && act0.getAttribute('data-action') === 'sr-edit-deal') { editDeal(__openNo); return; }
    if (t.closest('[data-sr-toggletargets]')) {
      ui.targets = !ui.targets;
      if (typeof global.render === 'function') global.render();
      if (ui.targets) setTimeout(function () {
        var box = document.querySelector('.sr-targets');
        if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 80);
      return;
    }
    if (t.closest('[data-sr-resettargets]')) { resetTargets(); return; }
    var delBtn = t.closest('[data-sr-delteam]');
    if (delBtn) { deleteTeam(delBtn.getAttribute('data-sr-delteam')); return; }
    var actBtn = t.closest('[data-action]');
    if (actBtn && actBtn.getAttribute('data-action') === 'sr-add-team') { doAddTeam(); return; }
    if (actBtn && actBtn.getAttribute('data-action') === 'sr-add-sale') { doAddSale(); return; }
    if (actBtn && actBtn.getAttribute('data-action') === 'sr-add-product') { doAddProduct(); return; }

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
      + '.sr-tabsbar{display:inline-flex;gap:4px;background:#F1F5F9;border:1px solid #E5EAF0;border-radius:11px;padding:4px;margin-bottom:14px}'
      + '.sr-tabbtn{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:#475467;'
      + 'font:inherit;font-size:11.5px;font-weight:500;padding:8px 15px;border-radius:8px;cursor:pointer;transition:.15s}'
      + '.sr-tabbtn:hover{color:#0F2B46;background:#E8EEF6}'
      + '.sr-tabbtn.on{background:#fff;color:#0F2B46;box-shadow:0 2px 6px rgba(15,43,70,.10)}'
      + '.sr-tabbtn i{font-size:11px}'
      + '@media(max-width:640px){.sr-tabsbar{display:flex;width:100%}.sr-tabbtn{flex:1;justify-content:center;padding:8px 8px;font-size:10.5px}}'
      /* สรุปยอดขายรายเซลส์ — การ์ด */
      + '.sr-ph-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.sr-seg{display:inline-flex;background:#F1F5F9;border:1px solid #E5EAF0;border-radius:9px;padding:3px}'
      + '.sr-segbtn{border:0;background:transparent;color:#667085;font:inherit;font-size:10.5px;font-weight:500;'
      + 'padding:5px 10px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.15s}'
      + '.sr-segbtn:hover{color:#0F2B46}'
      + '.sr-segbtn.on{background:#fff;color:#0F2B46;box-shadow:0 1px 4px rgba(15,43,70,.12)}'
      + '.sr-fc-list{display:flex;flex-direction:column;gap:14px}'
      + '.sr-fc-team{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#F8FAFC;border:1px solid #EEF2F7;'
      + 'border-radius:11px;padding:9px 12px}'
      + '.sr-fc-team-name{font-size:12px;font-weight:600;color:#0F2B46;display:inline-flex;align-items:center;gap:6px}'
      + '.sr-fc-team-sub{font-size:10px;color:#667085}'
      + '.sr-fc-team-bar{flex:1 1 120px;min-width:90px;height:6px;background:#E7EDF5;border-radius:99px;overflow:hidden}'
      + '.sr-fc-team-bar span{display:block;height:100%;border-radius:99px;transition:width .3s}'
      + '.sr-fc-team-val{font-size:10.5px;color:#475467;font-variant-numeric:tabular-nums}'
      + '.sr-fc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:11px;margin-top:10px}'
      + '.sr-fc-card{border:1px solid #E9EEF5;border-radius:13px;padding:13px;background:#fff;transition:box-shadow .16s,border-color .16s}'
      + '.sr-fc-card:hover{border-color:#C7D7EE;box-shadow:0 10px 22px rgba(15,43,70,.08)}'
      + '.sr-fc-top{display:flex;align-items:center;gap:9px}'
      + '.sr-fc-av{width:32px;height:32px;border-radius:50%;flex:0 0 32px;display:grid;place-items:center;'
      + 'background:#EFF6FF;color:#1D4ED8;font-weight:600;font-size:12px}'
      + '.sr-fc-id{min-width:0;flex:1}'
      + '.sr-fc-name{font-size:11.5px;font-weight:600;color:#0F2B46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.sr-fc-meta{font-size:9.5px;color:#98A2B3}'
      + '.sr-fc-ach{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}'
      + '.sr-fc-bar{height:6px;background:#EEF2F7;border-radius:99px;overflow:hidden;margin:9px 0 8px}'
      + '.sr-fc-bar span{display:block;height:100%;border-radius:99px;transition:width .3s}'
      + '.sr-fc-actual{display:flex;align-items:baseline;gap:6px}'
      + '.sr-fc-actual b{font-size:15px;color:#0F2B46;font-variant-numeric:tabular-nums}'
      + '.sr-fc-actual span{font-size:9.5px;color:#98A2B3}'
      + '.sr-fc-chips{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}'
      + '.sr-fc-chip{background:#F8FAFC;border:1px solid #EEF2F7;border-left:3px solid #CBD5E1;border-radius:8px;padding:5px 8px}'
      + '.sr-fc-chip small{display:block;font-size:9px;color:#98A2B3}'
      + '.sr-fc-chip b{font-size:10.5px;color:#0F2B46;font-variant-numeric:tabular-nums}'
      + '.sr-fc-chip-empty{background:#FCFDFE;border-style:dashed;border-left-color:#E2E8F0!important;opacity:.75}'
      + '.sr-fc-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;padding-top:8px;border-top:1px dashed #EEF2F7;font-size:9.5px;color:#667085}'
      + '.sr-fc-fc{color:#2563EB;font-weight:500}'
      + '.sr-fc-other{color:#98A2B3;text-align:right}'
      + '.sr-fc-total{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#0F2B46;border-radius:12px;padding:12px 14px;color:#fff}'
      + '.sr-fc-total small{display:block;font-size:9.5px;color:#9CB0C5;margin-bottom:3px}'
      + '.sr-fc-total b{font-size:14px;font-variant-numeric:tabular-nums}'
      + '@media(max-width:900px){.sr-fc-grid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}'
      + '.sr-fc-total{grid-template-columns:repeat(2,1fr)}}'
      + '@media(max-width:560px){.sr-fc-grid{grid-template-columns:1fr}'
      + '.sr-ph-tools{width:100%;justify-content:space-between}'
      + '.sr-fc-team-bar{flex-basis:100%}}'
      /* sticky filter bar */
      + '.sr-filters{position:sticky;top:0;z-index:25;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end;gap:10px;'
      + 'background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 18px rgba(15,43,70,.07);margin-bottom:15px}'
      + '.sr-filters.sr-f5{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}'
      + '@media(min-width:1340px){.sr-filters{grid-template-columns:repeat(6,minmax(0,1fr))}'
      + '.sr-filters.sr-f5{grid-template-columns:repeat(5,minmax(0,1fr))}}'
      + '.sr-fl{display:grid;gap:5px;min-width:0}'
      + '.sr-fl label{font-size:10px;color:#667085;font-weight:500}'
      + '.sr-fl select{width:100%;min-width:0;border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;'
      + 'padding:7px 8px;font-size:11px;min-height:34px;outline:none;font-family:inherit}'
      + '.sr-fl select:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      + '.sr-locked{display:flex;align-items:center;gap:6px;min-height:34px;border:1px solid #E0E7FF;background:#EEF2FF;'
      + 'color:#3730A3;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:500;min-width:0;overflow:hidden;line-height:1.25}'
      + '.sr-locked i{font-size:9px;color:#4F46E5;flex:0 0 auto}'
      + '.sr-lk-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto}'
      + '.sr-lk-b{flex:0 0 auto;white-space:nowrap;font-size:9.5px;font-weight:400;color:#6366F1;background:#E0E7FF;'
      + 'border-radius:999px;padding:1px 6px}'
      /* แถบขอบเขตข้อมูล (สิทธิ์ถูกล็อก) */
      + '.sr-scopepill{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin:-7px 0 15px;padding:6px 12px;'
      + 'border:1px solid #E8EEF6;background:#F7FAFF;border-radius:999px;font-size:10.5px;color:#667085;max-width:100%}'
      + '.sr-scopepill i{font-size:9px;color:#2563EB}'
      + '.sr-scopepill b{color:#0F2B46;font-weight:600;white-space:nowrap}'
      + '.sr-scopepill-sep{color:#C3CCD9}'
      + '.sr-scopepill-tag{background:#E0E7FF;color:#4338CA;border-radius:999px;padding:1px 8px;font-size:9.5px;white-space:nowrap}'
      + '@media(max-width:640px){.sr-scopepill{width:100%;justify-content:center;text-align:center}}'
      /* ตัวกรองแบบ 4 ช่อง (มุมมอง AE ที่ทีม/AE ถูกล็อก) */
      + '.sr-filters.sr-f4{grid-template-columns:repeat(2,minmax(0,1fr))}'
      + '@media(min-width:760px){.sr-filters.sr-f4{grid-template-columns:repeat(4,minmax(0,1fr))}}'
      + '.sr-fbtn{display:flex;align-items:flex-end;gap:8px;grid-column:1/-1;justify-content:flex-end}'
      + '@media(min-width:900px){.sr-filters{padding-right:252px}'
      + '.sr-fbtn{position:absolute;right:14px;bottom:12px;grid-column:auto}}'
      + '.sr-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 11px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.sr-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.sr-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      /* scope */
      + '.sr-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#EFF6FF;border:1px solid #DBEAFE;color:#1E40AF;'
      + 'border-radius:9px;padding:9px 13px;font-size:11px;margin-bottom:14px}'
      /* KPI */
      + '.sr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}'
      + '.sr-card{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.sr-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10px;line-height:1.5;min-height:34px}'
      + '.sr-card-top>span:first-child{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
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
      + '.sr-link{display:inline-flex;align-items:center;gap:4px;color:#2563EB;font-size:10px;cursor:pointer;margin-top:5px}'
      + '.sr-link:hover{text-decoration:underline}'
      /* hero: target (เล็ก) · summary · forecast (ใหญ่) */
      + '.sr-hero{display:grid;grid-template-columns:minmax(160px,.72fr) minmax(0,1.12fr) minmax(0,1.36fr);gap:12px;margin-bottom:15px;align-items:stretch}'
      + '.sr-hero>div{background:#fff;border:1px solid #E6EDF5;border-radius:14px;padding:14px 16px;box-shadow:0 6px 18px rgba(15,43,70,.05);display:flex;flex-direction:column;gap:6px;min-width:0}'
      + '.sr-ht-label,.sr-hs-head,.sr-hf-label{font-size:10.5px;color:#667085;display:flex;align-items:center;gap:6px;flex-wrap:wrap;line-height:1.4}'
      + '.sr-ht-label i,.sr-hf-label i{font-size:10px;color:#94A3B8}'
      + '.sr-ht-val{font-size:19px;font-weight:600;color:#0F2B46;letter-spacing:-.2px;line-height:1.2}'
      + '.sr-ht-meta{font-size:10px;color:#98A2B3;line-height:1.5;margin-top:auto}'
      + '.sr-hs-total{font-size:24px;font-weight:600;color:#0F2B46;letter-spacing:-.3px;line-height:1.15}'
      + '.sr-hs-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
      + '.sr-hs-cols>div{background:#F8FAFC;border:1px solid #EEF2F7;border-radius:10px;padding:7px 9px;display:grid;gap:2px;min-width:0}'
      + '.sr-hs-cols small{font-size:9.5px;color:#667085;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.sr-hs-cols b{font-size:13px;color:#0F2B46}'
      + '.sr-hs-foot{font-size:10px;color:#98A2B3;line-height:1.5;margin-top:auto}'
      + '.sr-pill-pct{display:inline-flex;align-items:center;padding:1px 8px;border-radius:20px;background:#EFF6FF;color:#1D4ED8;font-size:10px;white-space:nowrap}'
      + '.sr-hero-fc{background:linear-gradient(160deg,#0F2B46,#173D60)!important;border-color:#173D60!important;color:#fff}'
      + '.sr-hero-fc .sr-hf-label{color:#9EC1E0}'
      + '.sr-hf-val{font-size:32px;font-weight:600;letter-spacing:-.6px;line-height:1.1;color:#fff}'
      + '.sr-hf-pct{font-size:11px;color:#9EC1E0}'
      + '.sr-hf-gap{font-size:11.5px;color:#E7EEF6;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}'
      + '.sr-hf-gap b{font-size:15px;color:#FDE68A;font-weight:600}'
      + '.sr-hf-bd{font-size:9.5px;color:#9EC1E0;line-height:1.55;margin-top:auto}'
      + '.sr-hero-fc .sr-bar{background:rgba(255,255,255,.16);height:7px}'
      + '@media(max-width:980px){.sr-hero{grid-template-columns:1fr}}'
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
      + '.sr-band td{background:#F1F5FB;padding:9px 11px;border-top:1px solid #E4EBF7;border-bottom:1px solid #E4EBF7}'
      + '.sr-band-name{font-size:11.5px;font-weight:600;color:#0F2B46;margin-right:10px}'
      + '.sr-band-name i{font-size:9px;color:#64748B;margin-right:4px}'
      + '.sr-band-sub{font-size:10px;color:#667085;margin-right:12px}'
      + '.sr-band-pill{display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #E0E7FF;color:#3730A3;'
      + 'border-radius:99px;padding:2px 9px;font-size:9.5px;margin-right:6px}'
      + '.sr-band-pill.alt{background:#fff;border-color:#D1FAE5;color:#15803D}'
      + '.sr-summary tbody tr:hover td{background:#F7FAFF}'
      + '.sr-sticky{position:sticky;left:0;background:#fff;z-index:2}'
      + '.sr-summary tbody tr:hover .sr-sticky{background:#F7FAFF}'
      + '.sr-total-row td{background:#F8FAFC!important;border-top:2px solid #E2E8F0}'
      + '.sr-sale{display:flex;align-items:center;gap:8px;min-width:0}'
      + '.sr-av{width:26px;height:26px;border-radius:50%;background:#EEF2FF;color:#4338CA;display:grid;place-items:center;'
      + 'font-size:10.5px;font-weight:600;flex:0 0 26px}'
      + '.sr-goal{min-width:74px}'
      + '.sr-goal-num{font-size:11px;font-weight:600;color:#0F2B46}'
      + '.sr-mini{height:5px;width:64px;margin:4px 0 0 auto;background:#EEF2F7;border-radius:99px;overflow:hidden}'
      + '.sr-mini span{display:block;height:100%;background:#2563EB;border-radius:99px}'
      + '.sr-total-col{background:#EFF6FF}'
      /* ตารางย่อ: Actual + แท่ง % + Forecast */
      + '.sr-hdot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;vertical-align:middle;opacity:.85}'
      + '.sr-sum2 th{font-size:10px;line-height:1.4}'
      + '.sr-sum2 td{padding:9px 10px}'
      + '.sr-sum2 .sr-act b{font-size:11.5px;font-weight:600}'
      + '.sr-sum2 .sr-act .sr-mini{margin:5px 0 2px}'
      + '.sr-sum2 .sr-act small{display:block;font-size:8.5px;font-weight:500;letter-spacing:.1px;line-height:1.3}'
      + '.sr-sum2 .sr-fc-col{color:#15803D;font-weight:600}'
      + '.sr-sum2 tbody tr:hover .sr-total-col{background:#E6F0FF}'
      + '.sr-sum2 tfoot .sr-total-col{background:#E6F0FF}'
      + '.sr-muted{color:#98A2B3}'
      + '.sr-teamtabs{display:flex;gap:6px;flex-wrap:wrap}'
      + '.sr-tab{border:1px solid #E5EAF0;background:#fff;color:#475467;border-radius:99px;padding:5px 12px;font-size:10.5px;'
      + 'font-family:inherit;cursor:pointer}'
      + '.sr-tab:hover{border-color:#C7D7EE}'
      + '.sr-tab.on{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      + '.sr-salelist{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'
      + '.sr-salechip{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E9EEF5;border-radius:10px;'
      + 'padding:7px 10px;cursor:pointer;font-family:inherit;text-align:left;transition:box-shadow .15s,border-color .15s}'
      + '.sr-salechip:hover{border-color:#C7D7EE;box-shadow:0 6px 16px rgba(15,43,70,.08)}'
      + '.sr-schip-av{width:26px;height:26px;border-radius:50%;background:#EEF2FF;color:#4338CA;display:grid;place-items:center;'
      + 'font-size:10.5px;font-weight:600;flex:0 0 26px}'
      + '.sr-schip-txt{display:flex;flex-direction:column;line-height:1.35;min-width:0}'
      + '.sr-schip-txt b{font-size:10.5px;color:#0F2B46;font-weight:600}'
      + '.sr-schip-txt small{font-size:9px;color:#98A2B3}'
      + '.sr-salechip i{font-size:9px;color:#C2CBD8}'
      + '.sr-mtable{max-height:60vh;overflow:auto}'
      + '.sr-mtable .sr-table{font-size:11px}'
      + '.sr-hl-row td{background:#FFFBEB!important}'
      + '.sr-now{background:#FDE68A;color:#92400E;border-radius:99px;padding:1px 7px;font-size:8.5px;margin-left:4px}'
      + '.sr-dimrow td{color:#B0BAC9}'
      + '.sr-achbar{height:5px;width:64px;margin:0 0 3px auto;background:#EEF2F7;border-radius:99px;overflow:hidden}'
      + '.sr-achbar span{display:block;height:100%;background:#2563EB;border-radius:99px}'
      + '.sr-dform{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}'
      + '.sr-df{display:grid;gap:6px;font-size:10px;color:#475467;min-width:0;line-height:1.4}'
      + '.sr-df.full{grid-column:1/-1}'
      + '.sr-df input,.sr-df select{width:100%;border:1px solid #DCE3EB;border-radius:9px;padding:10px 11px;font-size:12px;'
      + 'font-family:inherit;outline:none;color:#344054;min-width:0;width:100%}'
      + '.sr-df input:focus,.sr-df select:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
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
      + '.sr-filters.sr-f3{grid-template-columns:repeat(3,minmax(0,1fr))}'
      + '.sr-filters.sr-f5{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}'
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
      /* แยกตามรูปแบบการชำระเงิน (รายทีม) */
      + '.sr-pay{margin-bottom:15px}'
      + '.sr-payleg{display:flex;gap:11px;flex-wrap:wrap;font-size:9.5px;color:#667085;align-items:center}'
      + '.sr-payleg i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle}'
      + '.sr-paytable td{padding:9px 10px}'      + '.sr-paytable tfoot td{background:#F8FAFC;border-top:1px solid #E9EEF5;color:#0F2B46;font-weight:600}'
      + '.sr-pay-tm b{color:#0F2B46;font-size:11px;font-weight:600}'
      + '.sr-pay-tm span{display:block;font-size:9.5px;color:#98A2B3;margin-top:1px}'
      + '.sr-paybar{display:flex;height:7px;border-radius:99px;overflow:hidden;background:#EEF2F7;min-width:88px}'
      + '.sr-paybar span{display:block;height:100%}'
      + '.sr-sid{display:inline-block;background:#EEF2FF;color:#3730A3;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:600}'
      + '.sr-autotag{display:inline-block;background:#ECFDF5;color:#15803D;border:1px solid #D1FAE5;border-radius:99px;padding:0 6px;font-size:8.5px;font-weight:500;vertical-align:middle}'
      + '.sr-saletable td{padding:9px 10px}'
      + '.sr-paypcts{display:flex;gap:7px;margin-top:4px;font-size:9px;font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '.sr-drref{display:inline-flex;align-items:center;gap:4px;margin-top:3px;background:#EFF6FF;color:#1D4ED8;border-radius:5px;padding:1px 6px;font-size:8.5px;font-family:ui-monospace,Menlo,Consolas,monospace}'
      + '.sr-fixed{display:flex;align-items:center;gap:7px;border:1px dashed #D8E2EC;background:#F8FAFC;border-radius:9px;padding:10px 11px;font-size:12px;color:#0F2B46;min-height:42px}'
      + '.sr-fixed i{color:#64748B;font-size:10px}'
      + '.sr-empty-note{padding:16px;text-align:center;color:#98A2B3;font-size:11px}'
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
      + '.sr-md-hist{margin-top:12px;border:1px solid #E6EDF5;border-radius:10px;padding:12px 14px;background:#F8FAFC}'
      + '.sr-md-hist>b{display:flex;align-items:center;gap:6px;color:#0F2B46;font-size:11px;margin-bottom:8px}'
      + '.sr-md-hist>b i{color:#94A3B8;font-size:10px}'
      + '.sr-hist{display:grid;gap:7px;max-height:190px;overflow:auto}'
      + '.sr-hist-row{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:start}'
      + '.sr-hist-ico{width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid #E6EDF5;display:grid;place-items:center;font-size:8px}'
      + '.sr-hist-row b{font-size:10.5px;color:#0F2B46}'
      /* ---- Dashboard 2.0: analytics cards ---- */
      + '.sr-head-r{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-left:auto}'
      + '.sr-upd{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #E6EDF5;border-radius:9px;'
      + 'padding:7px 11px;font-size:10px;color:#667085}'
      + '.sr-upd b{color:#0F2B46;font-weight:600}'
      + '.sr-upd i{color:#94A3B8;font-size:10px}'
      + '.sr-ar{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #E6EDF5;border-radius:9px;'
      + 'padding:5px 8px 5px 11px;font-size:10px;color:#667085}'
      + '.sr-ar i{color:#94A3B8;font-size:10px}'
      + '.sr-ar select{border:0;background:transparent;font-family:inherit;font-size:10.5px;color:#0F2B46;outline:none;cursor:pointer}'
      + '.sr-dash-r2{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,.85fr) minmax(0,1fr);gap:12px;margin-bottom:15px}'
      + '.sr-dash-r2 .sr-panel{margin-bottom:0;padding:13px}'
      + '.sr-dash-r2 .sr-ph{margin-bottom:10px}'
      + '.sr-fn-row{display:grid;grid-template-columns:88px minmax(0,1fr) 96px;align-items:center;gap:8px;margin-bottom:7px}'
      + '.sr-fn-lbl{display:flex;align-items:center;gap:5px;font-size:10px;color:#475467;min-width:0}'
      + '.sr-fn-lbl span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.sr-fn-lbl em{font-style:normal;font-size:9px;color:#98A2B3;margin-left:auto}'
      + '.sr-fn-track{height:14px;background:#F1F5F9;border-radius:7px;overflow:hidden}'
      + '.sr-fn-track span{display:block;height:100%;border-radius:7px;transition:width .4s ease}'
      + '.sr-fn-val{text-align:right;line-height:1.25}'
      + '.sr-fn-val b{display:block;font-size:10.5px;color:#0F2B46;font-weight:600;font-variant-numeric:tabular-nums}'
      + '.sr-fn-val i{font-style:normal;font-size:9px;color:#98A2B3}'
      + '.sr-fc-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:6px;align-items:stretch}'
      + '.sr-fc-chip{border:1px solid #E6EDF5;background:#F8FAFC;border-radius:9px;padding:7px 8px;display:grid;gap:1px;min-width:0;text-align:center}'
      + '.sr-fc-chip small{font-size:8.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.sr-fc-chip b{font-size:10.5px;color:#0F2B46;font-weight:600;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}'
      + '.sr-fc-chip i{font-style:normal;font-size:8.5px;color:#98A2B3}'
      + '.sr-fc-plus{display:none}'
      + '.sr-fc-res{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;'
      + 'background:#EFF6FF;border:1px solid #DBEAFE;border-radius:10px;padding:9px 11px}'
      + '.sr-fc-res small{display:block;font-size:9px;color:#1D4ED8}'
      + '.sr-fc-res b{font-size:17px;color:#0F2B46;font-weight:600;letter-spacing:-.2px}'
      + '.sr-gauge{width:122px;height:122px;border-radius:50%;margin:2px auto 0;display:grid;place-items:center;'
      + 'background:conic-gradient(var(--c) calc(var(--p) * 1%),#EDF1F7 0)}'
      + '.sr-gauge-in{width:90px;height:90px;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center;line-height:1.15}'
      + '.sr-gauge-in b{font-size:18px;font-weight:600;letter-spacing:-.3px}'
      + '.sr-gauge-in small{font-size:8.5px;color:#98A2B3}'
      + '.sr-gauge-tag{margin:10px auto 0;display:block;width:fit-content;border-radius:99px;padding:3px 11px;font-size:10px;font-weight:600}'
      + '.sr-gauge-ft{margin-top:9px;text-align:center;font-size:10px;color:#98A2B3}'
      + '.sr-gauge-ft b{color:#0F2B46;font-size:11.5px}'
      + '.sr-ins-row{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;align-items:start;margin-bottom:9px}'
      + '.sr-ins-ico{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;font-size:10px}'
      + '.sr-ins-row b{display:block;font-size:10.5px;font-weight:600;line-height:1.4}'
      + '.sr-ins-row small{display:block;font-size:9.5px;color:#667085;line-height:1.45;margin-top:1px}'
      + '.sr-sec-h{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin:0 0 10px;flex-wrap:wrap}'
      + '.sr-sec-h h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.sr-seg{display:inline-flex;background:#F1F5F9;border-radius:9px;padding:2px;gap:2px}'
      + '.sr-seg button{border:0;background:transparent;font-family:inherit;font-size:10px;color:#667085;border-radius:7px;'
      + 'padding:5px 11px;cursor:pointer}'
      + '.sr-seg button.on{background:#fff;color:#0F2B46;font-weight:600;box-shadow:0 1px 3px rgba(15,43,70,.12)}'
      + '.sr-span-all{grid-column:1/-1}'
      + '.sr-dash-bottom{display:grid;grid-template-columns:minmax(0,2.4fr) minmax(0,1fr);gap:15px;margin-bottom:15px;align-items:start}'
      + '.sr-fsum-row{display:flex;justify-content:space-between;gap:10px;font-size:10px;padding:7px 0;border-bottom:1px dashed #EEF2F7}'
      + '.sr-fsum-row:last-of-type{border-bottom:0}'
      + '.sr-fsum-row span{color:#98A2B3}'
      + '.sr-fsum-row b{color:#0F2B46;font-weight:600;text-align:right}'
      + '.sr-rank-wrap{display:grid;grid-template-columns:20px minmax(0,1fr);gap:7px;align-items:start}'
      + '.sr-rank{width:20px;height:20px;border-radius:50%;background:#F1F5F9;color:#98A2B3;display:grid;place-items:center;'
      + 'font-size:9px;font-weight:600}'
      + '.sr-rank.r1{background:#FEF3C7;color:#B45309}'
      + '.sr-rank.r2{background:#E0F2FE;color:#0369A1}'
      + '.sr-rank.r3{background:#F3E8FF;color:#6D28D9}'
      /* responsive */
      + '@media(max-width:1280px){.sr-kpis{gap:10px}}'
      + '@media(max-width:1024px){.sr-donuts{grid-template-columns:1fr}'
      + '.sr-dash-r2{grid-template-columns:1fr 1fr}'
      + '.sr-dash-bottom{grid-template-columns:1fr}'
      + '.sr-dash-charts{grid-template-columns:1fr}}'
      + '@media(max-width:760px){.sr-filters,.sr-filters.sr-f3,.sr-filters.sr-f5{position:static;grid-template-columns:1fr 1fr;padding:11px}'
      + '.sr-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'
      + '.sr-card-val{font-size:16px}.sr-chartbox{height:250px}'
      + '.sr-md-grid{grid-template-columns:1fr 1fr}.sr-head h1{font-size:18px}'
      + '.sr-dash-r2{grid-template-columns:1fr}.sr-head-r{width:100%}.sr-ar{flex:1}'
      + '.sr-fn-row{grid-template-columns:78px minmax(0,1fr) 84px}}'
      + '@media(max-width:480px){.sr-filters,.sr-filters.sr-f5{grid-template-columns:1fr 1fr;gap:7px;padding:9px}'
      + '.sr-fl label{font-size:9.5px}.sr-filters select,.sr-filters input{font-size:11px;padding:7px 8px}'
      + '.sr-fbtn{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:7px}'
      + '.sr-btn{font-size:10.5px;padding:8px 9px;justify-content:center}'
      + '.sr-card{padding:11px}'
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
    teamHeads: TEAM_HEADS,
    teams: function () { return TEAMS; },
    salesList: function () { return SALES; },
    addSale: addSale,
    removeSale: removeSale,
    data: function () {
      return { deals: DEALS, teams: TEAMS, sales: SALES, viewerTeam: viewerTeam() };
    },
    scope: scopeOf,
    mySaleIds: mySaleIds,
    scopedDeals: function () { return DEALS.filter(inScope); },
    addDeal: addDeal,
    openAddDeal: openAddDeal,
    removeDeal: removeDeal,
    saveDeals: saveDeals,
    onChange: onChange,
    statusList: STATUS,
    productsList: function () { return PRODUCTS; },
    addProduct: addProduct,
    removeProduct: removeProduct,
    openDealDetail: openDealModal,
    editDeal: editDeal,
    payments: PAYMENTS,
    resetDeals: function () {
      try { localStorage.removeItem(LS_DEALS); } catch (e) {}
      DEALS.length = 0;
      Array.prototype.push.apply(DEALS, JSON.parse(JSON.stringify(__SEED_DEALS__)));
      saveDeals();
    },
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

  /* โหลดชื่อจริงของผู้ใช้ (AE / ผู้บันทึก) แล้ววาดหน้าใหม่ให้แสดงชื่อ */
  try {
    loadUsersMap(function () {
      if (typeof global.render === 'function') { try { global.render(); } catch (e) {} }
    });
  } catch (e) {}
})(window);
