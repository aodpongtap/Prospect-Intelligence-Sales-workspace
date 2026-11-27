/* ===========================================================================
   app.js — Sale Order BI · ใช้สูตรจริงจาก Report Sale Order (Excel + DAX)
   =========================================================================== */
(function () {
  'use strict';

  const C = {
    blue: '#118DFF', navy: '#12239E', orange: '#E66C37', purple: '#6B007B',
    pink: '#E044A7', violet: '#744EC2', gold: '#D9B300', red: '#D64550',
    teal: '#197278', green: '#1AAB40', cyan: '#15C6F4', sky: '#4092FF',
    bar: '#1FBF5B', fg: '#252423', fg2: '#605E5C', grid: '#EDEBE9'
  };
  const PALETTE = [C.blue, C.navy, C.orange, C.purple, C.pink, C.violet, C.gold, C.red, C.teal, C.green];

  /* อ่านทุกคอลัมน์ (0..89) เพื่อให้ index ตรงกับ schema.js */
  const COLS = Array.from({ length: 90 }, (_, i) => i);
  const DATE_COLS = [2, 32, 47, 54];

  const S = { raw: null, data: null, meta: null, page: 'summary', period: null, q: '', pageIdx: 0, xf: {}, filter: { team: new Set(), channel: new Set(), group: new Set() }, momMth: null, momMth2: null, momN: 1, keepScroll: false };

  /* หน้าจริงของรายงาน Power BI (ตามลำดับในตัวนำทางหน้า) — เพิ่ม Summary เป็นหน้าแรก */
  const PBI_PAGES = [
    'Summary',
    'Daily Admin', 'End of Mth', '2.SO Order Status', '1.Unit / Revenue', 'SML', 'P3.Consult', 'Pack สด/ผ่อน',
    '2.Pending', '2.1.Pending-Detail', 'Map', 'Performance/TAT', '3.Cancel',
    '3.1.Cancel-Detail', 'P1.Sale/Admin', 'P2.Checker', 'P4.Sale Scape',
    'P5.Transport', 'P6.Technician', 'Aging (21 Day)', 'Report ติดตั้ง', 'ยกเลิก / มัดจำ', 'วัน'
  ];
  /* หน้าที่มีเพิ่มในเว็บ (ไม่มีใน PBI) — เปิดจากเมนู "⋯ เพิ่มเติม" เท่านั้น */
  const EXTRA_PAGES = ['1.Unit / Revenue New', 'Product end2end-Detail', 'All Job/Close', 'Report สัญญา'];
  /* ชื่อที่แสดงในเมนู/หัวหน้า (อ่านง่ายกว่าชื่อคีย์เดิม) */
  const EXTRA_LABEL = {
    '1.Unit / Revenue New': 'ยอดขาย / Unit รายเดือน',
    'Product end2end-Detail': 'สินค้า end-to-end',
    'All Job/Close': 'ตารางรายละเอียดทุกใบงาน',
    'Report สัญญา': 'รายงานสัญญา ตามทีม / สถานะ Admin'
  };
  const EXTRA_TITLE_OF = p => EXTRA_LABEL[p] || p;
  /* ชื่อที่แสดงของหน้า PBI (คีย์เดิมคงไว้เพื่อไม่ให้กระทบ snapshot/ลิงก์) */
  const PAGE_LABEL = { 'P3.Consult': 'Monitor Consult' };
  const pageLabel = p => PAGE_LABEL[p] || p;
  const IMPLEMENTED = {
    'Summary': 'summary',
    'Daily Admin': 'overview', 'Status (New)': 'status',
    'Performance/TAT': 'tat', 'All Job/Close': 'data'
  };

  /* ---------- สเปกของหน้าที่เหลือ (ทุกหน้าใช้สูตรชุดเดียวกัน) ---------- */
  const SPECS = {
    '2.SO Order Status': { dim: 'jobStage', dim2: 'admGroup', metric: 'count', title: 'สถานะงานใบสั่งซื้อ' },
    '1.Unit / Revenue': { dim: 'team', dim2: 'group', metric: 'units', title: 'จำนวนเครื่อง / ยอดขาย ตามทีม' },
    'SML': { dim: 'gbkk', dim2: 'group', metric: 'revenue', title: 'GRP SML / GBKK' },
    'Pack สด/ผ่อน': { dim: 'pkg', dim2: 'monthLabel', metric: 'count', title: 'การชำระ เงินสด / ผ่อน' },
    '2.Pending': { dim: 'team', dim2: 'jobStage', metric: 'count', filter: d => d.status3 === '2.Pending', title: 'งานสถานะ 2.Pending' },
    '2.1.Pending-Detail': { dim: 'salesperson', dim2: 'team', metric: 'count', filter: d => d.status3 === '2.Pending', title: 'รายละเอียดงาน Pending' },
    'Report สัญญา': { dim: 'team', dim2: 'admGroup', metric: 'revenue', title: 'รายงานสัญญา' },
    'Map': { dim: 'province', dim2: 'team', metric: 'units', title: 'แผนที่ยอดขายตามจังหวัด' },
    '3.Cancel': { dim: 'team', dim2: 'jobStage', metric: 'count', filter: d => d.status3 === '3.Cancel', title: 'งานที่ถูกยกเลิก' },
    '3.1.Cancel-Detail': { dim: 'salesperson', dim2: 'team', metric: 'count', filter: d => d.status3 === '3.Cancel', title: 'รายละเอียดงานที่ยกเลิก' },
    'P1.Sale/Admin': { dim: 'admGroup', dim2: 'team', metric: 'count', title: 'P1 · Sale / Admin' },
    'P2.Checker': { dim: 'team', dim2: 'admGroup', metric: 'count', title: 'P2 · Checker (CT/Credit)' },
    'P3.Consult': { dim: 'team', dim2: 'pkg', metric: 'count', title: 'P3 · Consult' },
    'P4.Sale Scape': { dim: 'team', dim2: 'group', metric: 'count', title: 'P4 · Sale Scape' },
    'P5.Transport': { dim: 'province', dim2: 'team', metric: 'count', title: 'P5 · Transport (ขนส่ง)' },
    'P6.Technician': { dim: 'team', dim2: 'prodCat', metric: 'count', title: 'P6 · Technician' },
    'Aging (21 Day)': { dim: 'team', dim2: 'status3', metric: 'count', filter: d => d.slaClose != null && d.slaClose > 21, title: 'งานค้างเกิน 21 วัน' },
    '1.Unit / Revenue New': { dim: 'monthLabel', dim2: 'team', metric: 'revenue', title: 'ยอดขายรายเดือน' },
    'Product end2end-Detail': { dim: 'group', dim2: 'prodCat', metric: 'units', title: 'สินค้า end-to-end' },
    '1.Revenue': { dim: 'team', dim2: 'group', metric: 'revenue', title: 'Revenue ตามทีม / กลุ่มสินค้า' },
    'Status (Back log)': { dim: 'status3', dim2: 'team', metric: 'count', title: 'Backlog ตามสถานะ' },
    'Report ติดตั้ง': { dim: 'team', dim2: 'province', metric: 'units', title: 'รายงานการติดตั้ง' },
    'ยกเลิก / มัดจำ': { dim: 'team', dim2: 'pkg', metric: 'revenue', filter: d => d.status3 === '3.Cancel', title: 'ยกเลิก / มัดจำ' },
    'วัน': { dim: 'dayLabel', dim2: 'team', metric: 'count', title: 'ยอดตามวันในเดือน' }
  };

  /* ---------- format ---------- */
  const nf = new Intl.NumberFormat('th-TH');
  const num = v => (v == null || isNaN(v) ? '0' : nf.format(Math.round(v)));
  function baht(v) {
    if (v == null || isNaN(v)) return '฿0';
    const a = Math.abs(v);
    if (a >= 1e9) return '฿' + (v / 1e9).toFixed(2) + ' พันล.';
    if (a >= 1e6) return '฿' + (v / 1e6).toFixed(1) + ' ลบ.';
    return '฿' + nf.format(Math.round(v));
  }
  function shortBaht(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'พันล.';
    if (a >= 1e6) return (v / 1e6).toFixed(0) + 'ลบ.';
    if (a >= 1e3) return (v / 1e3).toFixed(0) + 'พัน';
    return String(Math.round(v));
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  const ymd = d => (d instanceof Date && !isNaN(d)) ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';

  /* ---------- cache: จำชุดข้อมูลล่าสุดไว้ใน IndexedDB ---------- */
  const DB_NAME = 'sale-order-bi', STORE = 'dataset', SCHEMA_VER = 10;
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  const ser = d => { const o = {}; for (const k in d) { const v = d[k]; o[k] = v instanceof Date ? { __d: v.toISOString() } : v; } return o; };
  const des = o => { const d = {}; for (const k in o) { const v = o[k]; d[k] = (v && typeof v === 'object' && v.__d) ? new Date(v.__d) : v; } return d; };
  function cacheSave() {
    return idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ver: SCHEMA_VER, meta: S.meta, data: S.data.map(ser) }, 'last');
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    })).catch(e => console.warn('cache save failed', e));
  }
  function cacheLoad() {
    return idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get('last');
      rq.onsuccess = () => { db.close(); res(rq.result); };
      rq.onerror = () => { db.close(); rej(rq.error); };
    })).then(rec => (rec && rec.data && rec.ver === SCHEMA_VER ? { meta: rec.meta, data: rec.data.map(des) } : null))
      .catch(() => null);
  }

  /* ---------- บันทึกมุมมอง (Save) — เปิดใหม่แสดงหน้า/ตัวกรองเดิมทันที ---------- */
  const VIEW_KEY = 'bi.savedView';
  function readView() {
    try { return JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch (e) { return null; }
  }
  function knownPages() {
    const s = new Set(['overview', 'status', 'tat', 'data', 'soon']);
    PBI_PAGES.forEach(p => s.add(pageKey(p)));
    EXTRA_PAGES.forEach(p => s.add(pageKey(p)));
    return s;
  }
  function applyView() {
    const v = readView();
    if (!v || typeof v !== 'object') return false;
    if (v.page && knownPages().has(v.page)) S.page = v.page;
    const ps = periods();
    if (v.period && (!ps.length || ps.indexOf(v.period) >= 0)) S.period = v.period;
    ['team', 'channel', 'group'].forEach(f => {
      S.filter[f] = new Set(Array.isArray(v[f]) ? v[f].filter(x => x != null && x !== '') : []);
    });
    S.xf = (v.xf && typeof v.xf === 'object' && !Array.isArray(v.xf)) ? v.xf : {};
    if (typeof v.q === 'string') S.q = v.q;
    if (typeof v.momMth === 'string') S.momMth = v.momMth;
    if (typeof v.momMth2 === 'string') S.momMth2 = v.momMth2;
    if (v.momN === 1 || v.momN === 3) S.momN = v.momN;
    S.pageIdx = 0;
    return true;
  }
  function saveView() {
    const v = {
      page: S.page, period: S.period,
      team: [...S.filter.team], channel: [...S.filter.channel], group: [...S.filter.group],
      xf: S.xf, q: S.q, momMth: S.momMth, momMth2: S.momMth2, momN: S.momN, at: new Date().toISOString()
    };
    let ok = true;
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch (e) { ok = false; }
    const b = $('btnSaveView');
    if (b && ok) {
      b.classList.add('saved', 'has-save');
      b.title = 'บันทึกไว้เมื่อ ' + new Date(v.at).toLocaleString('th-TH');
      setTimeout(() => b.classList.remove('saved'), 1400);
    }
    viewToast(ok
      ? 'บันทึกมุมมองแล้ว · เปิดเว็บครั้งหน้าจะแสดงหน้านี้พร้อมตัวกรองเดิมทันที'
      : 'บันทึกไม่สำเร็จ (เบราว์เซอร์บล็อกที่เก็บข้อมูล)');
    return ok;
  }
  function clearView() {
    try { localStorage.removeItem(VIEW_KEY); } catch (e) {}
    const b = $('btnSaveView');
    if (b) { b.classList.remove('has-save', 'saved'); b.title = 'บันทึกมุมมองปัจจุบัน (หน้า + ช่วงเดือน + ตัวกรอง)'; }
    viewToast('ล้างมุมมองที่บันทึกไว้แล้ว · กลับไปค่าเริ่มต้น');
  }
  function viewToast(msg) {
    const t = $('viewToast');
    if (!t) return;
    const s = t.querySelector('.status');
    if (s) s.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(viewToast._t);
    viewToast._t = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  /* ---------- ขอบเขตข้อมูล: กลุ่ม "หยอดเหรียญ" ทั้งหมด + ตู้กดสินค้า Vending ---------- */
  const KEEP_GROUP_RE = /หยอดเหรียญ|vending/i;
  function isKeepGroup(g) {
    return KEEP_GROUP_RE.test(String(g == null ? '' : g));
  }

  /* ---------- data ---------- */
  function periods() {
    if (!S.data) return [];
    const set = new Set();
    S.data.forEach(d => { if (d.mth) set.add(String(d.mth).slice(0, 4) + '-' + String(d.mth).slice(4).padStart(2, '0')); });
    return [...set].sort();
  }
  /* ตรวจเงื่อนไข cross-filter (ยกเว้นฟิลด์ของ visual ตัวเอง) */
  function matchXf(d, except) {
    if (!S.xf) return true;
    for (const f in S.xf) {
      if (f === except) continue;
      const set = S.xf[f];
      if (!set || !set.size) continue;
      if (f === 'day') {
        if (!d.dateSO || !set.has(String(d.dateSO.getDate()))) return false;
      } else if (f === 'monthLabel') {
        if (!set.has(String(d.mth))) return false;
      } else if (!set.has(String(d[f] == null ? '' : d[f]))) return false;
    }
    return true;
  }

  function rows(except) {
    if (!S.data) return [];
    const fT = S.filter.team, fC = S.filter.channel, fG = S.filter.group;
    return S.data.filter(d => {
      if (!isKeepGroup(d.group)) return false;
      if (S.period) {
        const p = S.period.replace('-', '');
        if (String(d.mth) !== p) return false;
      }
      if (fT.size && !fT.has(String(d.team == null ? '' : d.team))) return false;
      if (fC.size && !fC.has(String(d.channel == null ? '' : d.channel))) return false;
      if (fG.size && !fG.has(String(d.group == null ? '' : d.group))) return false;
      return matchXf(d, except);
    });
  }

  /* เรียงค่าตัวกรองแบบธรรมชาติ: เอาตัวเลขนำหน้ามาก่อน (1. S1, 2. S2-CRD, … 9. Online/E-Com)
     แล้วค่อยเรียงตามชื่อ · ค่าที่ไม่มีเลขนำหน้าไปต่อท้าย */
  function valKey(v) {
    const m = String(v).match(/^\s*(\d+)\s*[.)]?\s*(.*)$/);
    return m ? { g: 0, n: Number(m[1]), s: m[2] } : { g: 1, n: 0, s: String(v) };
  }
  function cmpVal(a, b) {
    const ka = valKey(a), kb = valKey(b);
    if (ka.g !== kb.g) return ka.g - kb.g;
    if (ka.n !== kb.n) return ka.n - kb.n;
    return ka.s.localeCompare(kb.s, 'th');
  }

  function distinctVals(field) {
    const m = new Map();
    (S.data || []).forEach(d => {
      if (field === 'group' && !isKeepGroup(d.group)) return;
      const v = d[field];
      if (v == null || v === '') return;
      const k = String(v);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.keys()].sort(cmpVal);
  }

  function renderFilterBar() {
    const bar = $('filterBar');
    if (!bar) return;
    if (!S.data) { bar.innerHTML = ''; return; }
    const mk = (field, label) => {
      const sel = S.filter[field];
      const vals = distinctVals(field).slice(0, 80);
      let h = '<details class="fdrop"><summary>' + esc(label) +
        (sel.size ? ' <span class="cnt">' + sel.size + '</span>' : '') + ' ▾</summary><div class="flist">';
      if (sel.size) h += '<button class="fclear" data-clear="' + field + '">✕ ล้างตัวกรอง</button>';
      vals.forEach(v => {
        h += '<label><input type="checkbox" data-f="' + field + '" value="' + esc(v) + '"' +
          (sel.has(v) ? ' checked' : '') + '> ' + esc(v) + '</label>';
      });
      return h + '</div></details>';
    };
    let h = '<label class="fsel"><span>เดือน</span><select id="periodSel" class="pbi-select">' +
      periods().slice().reverse().map(p => '<option value="' + p + '"' + (p === S.period ? ' selected' : '') + '>' +
        p.replace('-', ' · ') + '</option>').join('') + '</select></label>';
    h += mk('team', 'ทีมขาย') + mk('channel', 'ช่องทาง') + mk('group', 'กลุ่มสินค้า');
    if (S.filter.team.size || S.filter.channel.size || S.filter.group.size) h += '<button class="btn" id="fReset">ล้างทั้งหมด</button>';
    bar.innerHTML = h;
  }

  /* ============ UI helpers — HTML/CSS ล้วน (คมชัด ไม่ยืด ไม่ตัดข้อความ) ============ */
  function empty(msg) { return '<div class="empty">' + esc(msg || 'ไม่มีข้อมูลในเดือนนี้') + '</div>'; }

  function shortNum(v) {
    const a = Math.abs(v || 0);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'พันล.';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'ล.';
    if (a >= 1e4) return Math.round(v / 1e3) + 'พ.';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'พ.';
    return String(Math.round(v || 0));
  }

  /* การ์ดมาตรฐาน: span = จำนวนคอลัมน์ (1-12) */
  function card(span, title, body, o) {
    o = o || {};
    const center = typeof body === 'string' && (body.indexOf('donut-wrap') >= 0 || body.indexOf('class="gauge"') >= 0 ||
      body.indexOf('sum-comp') >= 0 || body.indexOf('<div class="hbars') === 0 || body.indexOf('<div class="stk"') === 0);
    return '<section class="card s' + span + (o.cls ? ' ' + o.cls : '') + (center ? ' center-b' : '') + '">' +
      (title ? '<div class="card-h"><h3>' + esc(title) + '</h3>' +
        (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') + '</div>' : '') +
      '<div class="card-b' + (o.pad ? ' pad' : '') + '">' + body + '</div></section>';
  }

  /* การ์ดคู่มือ “นิยาม & วิธีอ่านหน้านี้” — พับเก็บไว้ กดที่แถบเพื่อเปิดอ่าน */
  function defCard(body) {
    return '<section class="card s12 def-card">' +
      '<details class="fold def-fold">' +
        '<summary>นิยาม &amp; วิธีอ่านหน้านี้</summary>' +
        '<div class="def-body">' + body + '</div>' +
      '</details></section>';
  }

  function kpiCard(span, label, value, color, sub) {
    return '<section class="card s' + span + ' kpi2" style="--k:' + color + '">' +
      '<div class="k-lab">' + esc(label) + '</div>' +
      '<div class="k-val">' + value + '</div>' +
      (sub ? '<div class="k-sub">' + esc(sub) + '</div>' : '') + '</section>';
  }

  /* ชื่อฟิลด์ที่กรองได้ -> ชื่อไทย */
  const XF_NAME = {
    day: 'วันที่', team: 'Grp ทีมขาย', admGroup: 'สถานะ Admin', status3: 'สถานะใบงาน3',
    group: 'กลุ่มสินค้า', province: 'จังหวัด', gbkk: 'โซน', pkg: 'การชำระ',
    salesperson: 'พนักงาน', prodCat: 'ประเภทสินค้า', jobStage: 'ขั้นตอนงาน',
    channel: 'ช่องทาง', monthLabel: 'เดือน', area: 'พื้นที่'
  };
  function xfHas(f, v) {
    const s = S.xf && S.xf[f];
    return !!(s && s.has(String(v)));
  }
  function xfToggle(f, v) {
    if (!S.xf) S.xf = {};
    const k = String(v);
    if (!S.xf[f]) S.xf[f] = new Set();
    if (S.xf[f].has(k)) S.xf[f].delete(k); else S.xf[f].add(k);
    if (!S.xf[f].size) delete S.xf[f];
  }
  function xfActive() { return !!(S.xf && Object.keys(S.xf).length); }
  function xfChips() {
    if (!xfActive()) return '';
    const keys = Object.keys(S.xf);
    let h = keys.map(f =>
      '<span class="xf-chip">' + esc(XF_NAME[f] || f) + ' = ' + esc([...S.xf[f]].join(', ')) +
      ' <button data-xfc="' + esc(f) + '" title="ล้างตัวกรองนี้">✕</button></span>').join('');
    h += '<button class="xf-clearall" id="xfClearAll">ล้างทั้งหมด</button>';
    return h;
  }
  function xfAttr(field, value) {
    return field ? ' data-xf="' + esc(field + '|' + value) + '"' : '';
  }

  /* ป้าย '(ว่าง)' ให้อ่านรู้เรื่องเป็น 'ไม่ระบุ' (ใช้เฉพาะตอนแสดงผล ไม่กระทบตัวกรอง) */
  const BLANK_LAB = /^\(?\s*(ว่าง|ไม่ระบุ|-)\s*\)?$/;
  function dispLab(v) {
    const t = String(v == null ? '' : v).trim();
    return BLANK_LAB.test(t) ? 'ไม่ระบุ' : t;
  }

  /* แท่งแนวนอน: label | track | value  (ไม่ทับกันเด็ดขาด) */
  function hbars(data, fmt, o) {
    o = o || {};
    if (!data || !data.length) return empty();
    /* ตัดรายการค่า 0 ออก (แท่งเปล่าไม่ได้บอกอะไร) เว้นแต่ขอเก็บ */
    if (!o.keepZero) { const nz = data.filter(d => Math.abs(Number(d.value) || 0) > 0); if (nz.length) data = nz; }
    let f = fmt || num;
    /* เงิน: ใช้หน่วยเดียวกันทั้งลิสต์ (ลบ. หรือ บาท) ไม่ให้ปนกัน */
    if (o.money || f === baht) {
      const mx = Math.max.apply(null, data.map(d => Math.abs(d.value) || 0));
      f = mx >= 1e6 ? (v => (v / 1e6).toFixed(2) + ' ลบ.') : baht;
    }
    const max = Math.max.apply(null, data.map(d => d.value)) || 1;
    const chars = Math.max.apply(null, data.map(d => String(dispLab(d.label)).length));
    const lw = o.labelW || Math.min(230, Math.max(96, Math.round(chars * 7.2) + 8));
    const totPct = o.pct === true ? (data.reduce((a, x) => a + x.value, 0) || 1)
      : (typeof o.pct === 'number' && o.pct > 0 ? o.pct : 0);
    let h = '<div class="hbars' + (totPct ? ' pct' : '') + '" style="--lw:' + lw + 'px">';
    data.forEach((d, i) => {
      const p = Math.max(1.2, Math.min(100, d.value / max * 100));
      const col = d.color || (o.palette ? PALETTE[i % PALETTE.length] : 'linear-gradient(90deg,#7EA6FF,#118DFF)');
      const sel = xfHas(o.field, d.label);
      const lab = dispLab(o.keepNum ? String(d.label) : stripNum(d.label));
      h += '<div class="hbar' + (sel ? ' sel' : '') + '"' + xfAttr(o.field, d.label) +
        ' title="' + esc(lab) + ' · ' + f(d.value) + (totPct ? ' (' + (d.value / totPct * 100).toFixed(1) + '%)' : '') + '">' +
        '<span class="hb-lab">' + esc(lab) + '</span>' +
        '<span class="hb-track"><i class="hb-fill" style="width:' + p.toFixed(1) + '%;background:' + col + '"></i></span>' +
        '<span class="hb-val">' + f(d.value) + (totPct ? ' <em>' + (d.value / totPct * 100).toFixed(0) + '%</em>' : '') + '</span></div>';
    });
    return h + '</div>';
  }

  /* แท่งตั้ง (รายวัน/รายเดือน) + เส้น overlay (เช่น การติดตั้ง) */
  function colsChart(data, o) {
    o = o || {};
    if (!data || !data.length) return empty();
    const max = Math.max.apply(null, data.map(d => d.value)) || 1;
    const lineArr = o.line && o.line.length === data.length ? o.line : null;
    const lineMax = lineArr ? (Math.max.apply(null, lineArr) || 1) : 1;
    const showVal = true;               /* แสดงตัวเลขบนแท่งทุกแท่ง */
    const dense = data.length > 18;
    let h = '<div class="cols-wrap"><div class="cols">';
    data.forEach((d, i) => {
      const p = Math.max(1.5, Math.min(88, d.value / max * 88));
      const inside = p >= 12;            /* แท่งสูงพอ -> ใส่เลขในแท่ง */
      const xv = d.xv != null ? String(d.xv) : String(d.label);
      const sel = xfHas(o.field, xv);
      h += '<div class="col' + (sel ? ' sel' : '') + '"' + xfAttr(o.field, xv) +
        ' title="' + esc(d.label) + ' · ' + num(d.value) +
        (lineArr ? ' · ติดตั้ง ' + num(lineArr[i]) : '') +
        (d.sub ? ' · ' + esc(d.sub) : '') + '">' +
        '<span class="col-bar-wrap"><i class="col-bar" style="height:' + p.toFixed(1) + '%">' +
          (showVal && inside ? '<b class="bar-in">' + shortNum(d.value) + '</b>' : '') +
          (showVal && !inside && !dense ? '<b class="bar-out">' + shortNum(d.value) + '</b>' : '') +
        '</i></span>' +
        '<span class="col-x">' + esc(d.label) + '</span></div>';
    });
    h += '</div>';
    if (lineArr) {
      const n = data.length;
      const pts = lineArr.map((v, i) => ((i + 0.5) / n * 100).toFixed(2) + ',' + (100 - (v / lineMax) * 100).toFixed(2)).join(' ');
      h += '<div class="cols-line"><svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
        '<polyline points="' + pts + '" fill="none" stroke="#E5484D" stroke-width="2" ' +
        'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      lineArr.forEach((v, i) => {
        const lx = ((i + 0.5) / n * 100).toFixed(2);
        const ly = (100 - (v / lineMax) * 100).toFixed(2);
        h += '<i class="pt" style="left:' + lx + '%;top:' + ly + '%"></i>';
        if (v > 0) h += '<b class="pt-v" style="left:' + lx + '%;top:' + ly + '%">' + num(v) + '</b>';
      });
      h += '</div>';
    }
    h += '</div>';
    if (lineArr) {
      h += '<div class="chart-legend"><span><i class="sw" style="background:linear-gradient(180deg,#4F9DFF,#118DFF)"></i>' +
        esc(o.barLabel || 'จำนวน SO') + '</span><span><i class="sw line"></i>' + esc(o.lineLabel || 'การติดตั้ง') + '</span></div>';
    }
    return h;
  }

  /* โดนัท + legend */
  function donut(data, o) {
    o = o || {};
    const list = (data || []).filter(d => d.value > 0);
    const tot = list.reduce((a, b) => a + b.value, 0);
    if (!tot) return empty();
    let acc = 0;
    const stops = [];
    list.forEach((d, i) => {
      const from = acc / tot * 360, to = (acc + d.value) / tot * 360;
      stops.push(PALETTE[i % PALETTE.length] + ' ' + from.toFixed(2) + 'deg ' + to.toFixed(2) + 'deg');
      acc += d.value;
    });
    const leg = list.map((d, i) =>
      '<div class="lg' + (xfHas(o.field, d.label) ? ' sel' : '') + '"' + xfAttr(o.field, d.label) + '>' +
      '<i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' +
      '<span title="' + esc(dispLab(d.label)) + '">' + esc(dispLab(d.label)) + '</span>' +
      '<b>' + num(d.value) + '</b><em>' + (d.value / tot * 100).toFixed(0) + '%</em></div>').join('');
    return '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(' + stops.join(',') + ')">' +
      '<div class="donut-c"><b>' + num(tot) + '</b><span>รวม</span></div></div>' +
      '<div class="legend">' + leg + '</div></div>';
  }

  function gauge(pct) {
    const p = Math.max(0, Math.min(100, +pct || 0));
    return '<div class="gauge"><div class="gauge-track"><i class="gauge-fill" style="width:' + p.toFixed(1) + '%"></i></div>' +
      '<div class="gauge-row"><b>' + p.toFixed(0) + '%</b><span>ผ่านการตรวจสอบ</span></div></div>';
  }


  function periodSlicer() {
    return '<select id="periodSel" class="pbi-select">' + periods().slice().reverse().map(p =>
      '<option value="' + p + '"' + (p === S.period ? ' selected' : '') + '>' + p.replace('-', ' · ') + '</option>').join('') + '</select>';
  }

  /* เรียงแบบ natural: 1., 2., 3. … 10. (ไม่ให้ 10 มาก่อน 9) และค่า (Blank)/(ว่าง) ไปท้ายสุด */
  function natCmp(a, b) {
    const isBlank = v => /^\(?\s*(blank|ว่าง|ไม่ระบุ)\s*\)?$/i.test(String(v).trim());
    const ba = isBlank(a), bb = isBlank(b);
    if (ba !== bb) return ba ? 1 : -1;
    return String(a).localeCompare(String(b), 'th', { numeric: true, sensitivity: 'base' });
  }

  /* ตัด "1. ", "2. " ออกจากชื่อ — ใช้เฉพาะลิสต์ที่เรียงตามค่ามาก→น้อย (อันดับ)
     เพราะเลขทีมจะเรียงกระโดด (1, 2, 8, 5 …) อ่านแล้วขัดตา */
  const NUM_PREFIX = /^\s*\d+\s*[.)]\s*/;
  function stripNum(v) { return String(v == null ? '' : v).replace(NUM_PREFIX, ''); }

  function matrix(rowsIn, rowFn, colFn, valFn, fmt, o) {
    o = o || {};
    const rm = new Map(), cm = new Map(), cell = new Map();
    rowsIn.forEach(r => {
      const rk = rowFn(r); if (rk == null || rk === '') return;
      const ck = colFn(r); if (ck == null || ck === '') return;
      const v = valFn(r) || 0;
      const k = rk + '\u0001' + ck;
      cell.set(k, (cell.get(k) || 0) + v);
      rm.set(rk, (rm.get(rk) || 0) + v);
      cm.set(ck, (cm.get(ck) || 0) + v);
    });
    let rks = [...rm.keys()], cks = [...cm.keys()];
    if (o.sortRows) rks.sort((a, b) => rm.get(b) - rm.get(a)); else rks.sort(natCmp);
    if (o.sortCols) cks.sort((a, b) => cm.get(b) - cm.get(a)); else cks.sort(natCmp);
    // ยอดรวมต้องคิดจากข้อมูลทั้งหมด ก่อนตัดคอลัมน์/แถวที่จะแสดง
    let grandTotal = 0;
    cell.forEach(v => { grandTotal += v; });
    const allR = rks.length, allC = cks.length;
    if (o.maxRows) rks = rks.slice(0, o.maxRows);
    if (o.maxCols) cks = cks.slice(0, o.maxCols);
    const cutR = allR - rks.length, cutC = allC - cks.length;
    const cutNote = (cutR > 0 || cutC > 0)
      ? '<div style="padding:6px 9px 2px;font-size:10.5px;color:#98A2B3;line-height:1.45">' +
        'แสดง' + (cutR > 0 ? ' ' + rks.length + ' จาก ' + allR + ' แถว' : '') +
        (cutC > 0 ? (cutR > 0 ? ' · ' : ' ') + cks.length + ' จาก ' + allC + ' คอลัมน์' : '') +
        ' · ยอด Total คิดจากข้อมูลทั้งหมด ไม่ใช่ผลรวมของแถว/คอลัมน์ที่แสดง</div>'
      : '';
    let h = '<div class="tbl"><table class="pbi"><thead><tr><th class="rowhead">' + esc(o.rowTitle || '') + '</th>';
    cks.forEach(c => {
      const selC = xfHas(o.colField, c);
      h += '<th class="num' + (selC ? ' sel' : '') + '"' + xfAttr(o.colField, c) + '>' + esc(c) + '</th>';
    });
    h += '<th class="num total">Total</th></tr></thead><tbody>';
    rks.forEach(rk => {
      const selR = xfHas(o.rowField, rk);
      const rLab = o.sortRows ? stripNum(rk) : rk;   /* เรียงตามยอด = ไม่ต้องมีเลขนำหน้า */
      h += '<tr><td class="rowhead' + (selR ? ' sel' : '') + '"' + xfAttr(o.rowField, rk) + '>' + esc(rLab) + '</td>';
      cks.forEach(ck => { const v = cell.get(rk + '\u0001' + ck); h += '<td class="num">' + (v ? fmt(v) : '') + '</td>'; });
      h += '<td class="num total">' + fmt(rm.get(rk) || 0) + '</td></tr>';
    });
    h += '<tr class="grand"><td class="rowhead">Total</td>';
    cks.forEach(ck => { const v = cm.get(ck); h += '<td class="num">' + (v ? fmt(v) : '') + '</td>'; });
    h += '<td class="num total">' + fmt(grandTotal) + '</td></tr></tbody></table></div>' + cutNote;
    return h;
  }

  /* ---------- status (1.Done / 2.Pending / 3.Cancel) ---------- */
  const ST = [
    { key: '1.Done', name: 'Done', color: C.green },
    { key: '2.Pending', name: 'Pending', color: C.gold },
    { key: '3.Cancel', name: 'Cancel', color: C.red }
  ];
  const sumRev = arr => arr.reduce((a, d) => a + (d.revenue || 0), 0);
  function splitStatus(rs) {
    const o = { '1.Done': [], '2.Pending': [], '3.Cancel': [] };
    rs.forEach(d => { if (o[d.status3]) o[d.status3].push(d); });
    return o;
  }

  /* 9 การ์ดแบบหน้าเดิมของ PBI: Total SO / Rev + Done-Pending-Cancel (จำนวน + ยอดเงิน) */
  function statusKpi(rs) {
    const sp = splitStatus(rs), n = rs.length || 1;
    /* ตาม measure ใน .pbix: Rev.Total / Total Unit กรอง สถานะใบงาน3 IN {1.Done,2.Pending,3.Cancel} */
    const valid = rs.filter(d => d.status3 === '1.Done' || d.status3 === '2.Pending' || d.status3 === '3.Cancel');
    const rev = sumRev(valid);
    const units = valid.reduce((a, d) => a + (d.units || 0), 0);
    const pc = v => (v / n * 100).toFixed(0) + '% ของทั้งหมด';
    const other = rs.length - valid.length;
    let h = '';
    h += kpiCard(4, 'Total SO', num(rs.length), C.navy,
      other > 0 ? 'ไม่รวมสถานะว่าง ' + num(other) + ' ใบ ในยอดเงิน' : 'ใบสั่งซื้อในเดือนนี้');
    h += kpiCard(4, 'Rev (ราคาสุทธิ)', baht(rev), C.purple, 'Rev.Total = SUM(revenue) เฉพาะ 3 สถานะ');
    h += kpiCard(4, 'Total Unit', num(units), C.teal, 'SUM(จำนวนเครื่องซักผ้า) เฉพาะ 3 สถานะ');
    h += kpiCard(4, 'Done', num(sp['1.Done'].length), C.green, pc(sp['1.Done'].length));
    h += kpiCard(4, 'Pending', num(sp['2.Pending'].length), C.gold, pc(sp['2.Pending'].length));
    h += kpiCard(4, 'Cancel', num(sp['3.Cancel'].length), C.red, pc(sp['3.Cancel'].length));
    h += kpiCard(4, 'Done Rev', baht(sumRev(sp['1.Done'])), C.green);
    h += kpiCard(4, 'Pending Rev', baht(sumRev(sp['2.Pending'])), C.gold);
    h += kpiCard(4, 'Cancel Rev', baht(sumRev(sp['3.Cancel'])), C.red);
    return h;
  }

  /* ตาราง Done / Pending / Cancel × ทีม พร้อม %SO */
  function statusTable(rs) {
    const m = new Map();
    rs.forEach(d => {
      const k = d.team || '(ไม่ระบุ)';
      const o = m.get(k) || { d: 0, p: 0, c: 0, x: 0 };
      if (d.status3 === '1.Done') o.d++;
      else if (d.status3 === '2.Pending') o.p++;
      else if (d.status3 === '3.Cancel') o.c++;
      else o.x++;
      m.set(k, o);
    });
    const list = [...m.entries()].sort((a, b) => (b[1].d + b[1].p + b[1].c + b[1].x) - (a[1].d + a[1].p + a[1].c + a[1].x));
    const tot = list.reduce((a, e) => ({
      d: a.d + e[1].d, p: a.p + e[1].p, c: a.c + e[1].c, x: a.x + e[1].x
    }), { d: 0, p: 0, c: 0, x: 0 });
    const hasX = tot.x > 0;
    const pc = (v, t) => (t ? Math.round(v / t * 100) + '%' : '');
    let h = '<div class="tbl"><table class="pbi st"><thead><tr>' +
      '<th class="rowhead" rowspan="2">Grp ทีมขาย</th>' +
      '<th colspan="2">1.Done</th><th colspan="2">2.Pending</th><th colspan="2">3.Cancel</th>' +
      (hasX ? '<th colspan="2">อื่น ๆ</th>' : '') + '<th colspan="2">Total</th></tr><tr>' +
      '<th class="num">SO</th><th class="num">%SO</th><th class="num">SO</th><th class="num">%SO</th>' +
      '<th class="num">SO</th><th class="num">%SO</th>' + (hasX ? '<th class="num">SO</th><th class="num">%SO</th>' : '') +
      '<th class="num">SO</th><th class="num">%SO</th></tr></thead><tbody>';
    list.forEach(e => {
      const k = e[0], o = e[1], t = o.d + o.p + o.c + o.x;
      const selR = xfHas('team', k);
      h += '<tr><td class="rowhead' + (selR ? ' sel' : '') + '"' + xfAttr('team', k) + '>' + esc(stripNum(k)) + '</td>' +
        '<td class="num c-done">' + num(o.d) + '</td><td class="num c-done">' + pc(o.d, t) + '</td>' +
        '<td class="num c-pend">' + num(o.p) + '</td><td class="num c-pend">' + pc(o.p, t) + '</td>' +
        '<td class="num c-canc">' + num(o.c) + '</td><td class="num c-canc">' + pc(o.c, t) + '</td>' +
        (hasX ? '<td class="num">' + (o.x || '') + '</td><td class="num">' + pc(o.x, t) + '</td>' : '') +
        '<td class="num total">' + num(t) + '</td><td class="num total">' + (t ? '100%' : '') + '</td></tr>';
    });
    const T = tot.d + tot.p + tot.c + tot.x;
    h += '<tr class="grand"><td class="rowhead">Total</td>' +
      '<td class="num">' + num(tot.d) + '</td><td class="num">' + pc(tot.d, T) + '</td>' +
      '<td class="num">' + num(tot.p) + '</td><td class="num">' + pc(tot.p, T) + '</td>' +
      '<td class="num">' + num(tot.c) + '</td><td class="num">' + pc(tot.c, T) + '</td>' +
      (hasX ? '<td class="num">' + num(tot.x) + '</td><td class="num">' + pc(tot.x, T) + '</td>' : '') +
      '<td class="num">' + num(T) + '</td><td class="num">' + (T ? '100%' : '') + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  /* แท่งซ้อน: แต่ละแถวมีหลายส่วน (Done/Pending/Cancel) */
  function stackedBars(rows, fmt) {
    const f = fmt || num;
    if (!rows || !rows.length) return empty();
    const totals = rows.map(r => r.segs.reduce((a, s) => a + s.v, 0));
    const max = Math.max.apply(null, totals) || 1;
    let h = '<div class="stk">';
    rows.forEach((r, i) => {
      h += '<div class="stk-row" title="' + esc(dispLab(r.label)) + ' · รวม ' + f(totals[i]) + '">' +
        '<span class="stk-lab">' + esc(dispLab(r.label)) + '</span><span class="stk-track">';
      r.segs.forEach(s => {
        if (s.v > 0) h += '<i style="width:' + (s.v / max * 100).toFixed(2) + '%;background:' + s.color + '" title="' +
          esc(s.name) + ' · ' + f(s.v) + '"></i>';
      });
      h += '</span><span class="stk-val">' + f(totals[i]) + '</span></div>';
    });
    return h + '</div>';
  }

  function statusLegend() {
    return '<div class="chart-legend">' + ST.map(s =>
      '<span><i class="sw" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
  }

  /* ---------- กราฟเส้นหลายชุด (HTML + SVG บาง ๆ ไม่ยืดตัวหนังสือ) ---------- */
  function multiLine(labels, series, o) {
    o = o || {};
    const n = labels.length;
    if (!n) return empty();
    const all = series.reduce((a, s) => a.concat(s.values), []);
    const max = Math.max.apply(null, all) || 1;
    const every = n > 16 ? Math.ceil(n / 12) : 1;
    const line = s => s.values.map((v, i) =>
      ((i + 0.5) / n * 100).toFixed(2) + ',' + (100 - (v / max) * 100).toFixed(2)).join(' ');
    let h = '<div class="ml" style="height:' + (o.height || 190) + 'px">';
    h += '<div class="ml-plot">';
    series.forEach(s => {
      h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
        '<polyline points="' + line(s) + '" fill="none" stroke="' + s.color + '" stroke-width="2"' +
        (s.dashed ? ' stroke-dasharray="5 4"' : '') +
        ' vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    });
    h += '</div><div class="ml-x">';
    labels.forEach((l, i) => { h += '<span>' + ((i % every === 0 || i === n - 1) ? esc(l) : '') + '</span>'; });
    h += '</div></div>';
    if (o.legend !== false) h += '<div class="chart-legend">' + series.map(s =>
      '<span><i class="sw" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
    return h;
  }

  /* การ์ดสรุป 3 ค่า (Revenue / Unit / SO) */
  function kpiTriple(span, title, rev, units, so, color) {
    return '<section class="card s' + span + ' kpi3" style="--k:' + color + '">' +
      '<div class="k3-title">' + esc(title) + '</div>' +
      '<div class="k3-row"><span>Revenue</span><b>' + baht(rev) + '</b></div>' +
      '<div class="k3-row"><span>Unit</span><b>' + num(units) + '</b></div>' +
      '<div class="k3-row"><span>SO</span><b>' + num(so) + '</b></div></section>';
  }

  /* ตารางสัดส่วน % (ใช้กับ Lead O2O / Status / Area) */
  function pctRows(items, opts) {
    opts = opts || {};
    /* ตัดแถวที่ไม่มีชื่อ (ว่าง / ไม่ระบุ) และแถวค่า 0 ออก เพื่อไม่ให้รก */
    const isBlank = s => {
      const v = String(s == null ? '' : s).trim();
      return v === '' || v === '-' || /^(n\/a|na|null|undefined)$/i.test(v) || /^\(?\s*(ว่าง|ไม่ระบุ)\s*\)?$/.test(v);
    };
    const keep = items.filter(r => !isBlank(r.label) && Number(r.value) > 0);
    const totAll = keep.reduce((a, b) => a + b.value, 0) || 1;
    /* ซ่อนแถวที่ปัดเป็น 0% ด้วย (เช่น 0.2%) — เหลือแต่รายการที่มองเห็นสัดส่วนจริง */
    const shown = keep.filter(r => r.value / totAll * 100 >= 0.5);
    const rows = (shown.length ? shown : keep).slice().sort((a, b) => b.value - a.value);
    const tot = keep.reduce((a, b) => a + b.value, 0) || 1;
    return hbars(rows.map(r => ({ label: r.label, value: r.value })), v => Math.round(v / tot * 100) + '%', opts);
  }

  /* ---------- pages ---------- */
  function pgHead(title, rs, extra) {
    return '<div class="pg-head"><h1>' + esc(title) + '</h1>' +
      '<span class="sub">' + esc(S.period ? S.period.replace('-', ' · ') : 'ทุกเดือน') + ' · ' + num(rs ? rs.length : 0) + ' รายการ</span>' +
      '<span class="field-scope">กลุ่มหยอดเหรียญ + Vending</span>' + xfChips() +
      '<span class="grow"></span>' + (extra || '') + '</div>';
  }

  /* ===== Summary — หน้าแรก สรุปสำหรับผู้บริหาร ===== */
  function pageSummary(rs) {
    const sum = (arr, f) => arr.reduce((a, d) => a + (d[f] || 0), 0);
    const now = new Date();
    const parts = String(S.period || '').split('-').map(Number);
    const yy = parts[0] || now.getFullYear(), mm = parts[1] || (now.getMonth() + 1);
    const dim = new Date(yy, mm, 0).getDate();
    const isCur = (yy === now.getFullYear() && mm === (now.getMonth() + 1));
    const maxDay = rs.reduce((a, d) => (d.dateSO ? Math.max(a, d.dateSO.getDate()) : a), 0);
    const elapsed = Math.min(dim, Math.max(1, isCur ? Math.max(now.getDate(), maxDay) : dim));
    const left = Math.max(dim - elapsed, 0);
    const pctMonth = Math.round(elapsed / dim * 100);

    const so = rs.length, rev = sum(rs, 'revenue'), units = sum(rs, 'units');
    const nD = rs.filter(d => d.status3 === '1.Done').length;
    const nP = rs.filter(d => d.status3 === '2.Pending').length;
    const nC = rs.filter(d => d.status3 === '3.Cancel').length;
    const closeRate = (nD + nP) ? nD / (nD + nP) : 0;
    const fcSo = Math.round(so / elapsed * dim);
    const fcRev = rev / elapsed * dim;

    /* เดือนก่อนหน้า เพื่อเทียบ */
    const pm = (mm === 1) ? { y: yy - 1, m: 12 } : { y: yy, m: mm - 1 };
    const prev = monthRowsOf(pm.y * 100 + pm.m);
    const pSo = prev.length, pRev = sum(prev, 'revenue'), pUnit = sum(prev, 'units');
    const pD = prev.filter(d => d.status3 === '1.Done').length;
    const pC = prev.filter(d => d.status3 === '3.Cancel').length;
    /* เทียบแบบวันต่อวัน: เดือนก่อนนับถึงวันที่เท่ากัน (elapsed) */
    const prevTD = prev.filter(d => d.dateSO instanceof Date && !isNaN(d.dateSO) && d.dateSO.getDate() <= elapsed && matchXf(d));
    const pTSo = prevTD.length, pTRev = sum(prevTD, 'revenue'), pTUnit = sum(prevTD, 'units');
    const pTD = prevTD.filter(d => d.status3 === '1.Done').length;
    const pTC = prevTD.filter(d => d.status3 === '3.Cancel').length;
    const dl = (a, b) => (b ? (a - b) / b * 100 : null);
    const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const curMthTh = TH_M[mm - 1] + ' ' + (yy + 543);
    const prevMthTh = TH_M[pm.m - 1] + ' ' + (pm.y + 543);

    /* รายวัน: เปิด SO + ติดตั้ง */
    const byDay = new Map(), instDay = new Map();
    rs.forEach(d => {
      if (d.dateSO) { const k = d.dateSO.getDate(); byDay.set(k, (byDay.get(k) || 0) + 1); }
      if (d.installDate instanceof Date && !isNaN(d.installDate)) {
        const k = d.installDate.getDate();
        instDay.set(k, (instDay.get(k) || 0) + 1);
      }
    });
    const days = [...new Set([...byDay.keys(), ...instDay.keys()])].sort((a, b) => a - b);
    const daily = days.map(k => ({ label: String(k), value: byDay.get(k) || 0 }));
    const instLine = days.map(k => instDay.get(k) || 0);

    const stD = [
      { label: '1.Done', value: nD },
      { label: '2.Pending', value: nP },
      { label: '3.Cancel', value: nC }
    ].filter(x => x.value > 0);

    /* Top ทีม / กลุ่มสินค้า / พื้นที่ */
    const tm = new Map(), gm = new Map(), am = new Map();
    rs.forEach(d => {
      const t = d.team || '(ไม่ระบุ)';
      tm.set(t, (tm.get(t) || 0) + (d.revenue || 0));
      const g = d.group || '(ไม่ระบุ)';
      gm.set(g, (gm.get(g) || 0) + (d.units || 0));
      const a = d.gbkk || '(ไม่ระบุ)';
      am.set(a, (am.get(a) || 0) + 1);
    });
    const topTeam = [...tm.entries()].map(e => ({ label: e[0], value: e[1] })).sort((a, b) => b.value - a.value).slice(0, 6);
    const byGroup = [...gm.entries()].map(e => ({ label: e[0], value: e[1] })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
    const byArea = [...am.entries()].map(e => ({ label: e[0], value: e[1] })).sort((a, b) => b.value - a.value);

    /* ความเสี่ยง: backlog ค้างทั้งหมด + เกิน 21 วัน */
    const all = allFiltered();
    const openAll = all.filter(d => d.status3 === '2.Pending' && matchXf(d));
    const old21 = openAll.filter(d => d.dateSO instanceof Date && !isNaN(d.dateSO) && (now - d.dateSO) / 86400000 > 21).length;

    /* ===== เทียบเดือนก่อน (Month over Month) — เลือกเดือนได้ + โหมด 3 เดือน ===== */
    const mthList = periods();                       /* เรียงเก่า -> ใหม่ */
    const mthLabel = k => { const y = +String(k).slice(0, 4), m = +String(k).slice(5, 7); return TH_M[m - 1] + ' ' + (y + 543); };
    const shiftMth = (k, n) => { const y = +String(k).slice(0, 4), m = +String(k).slice(5, 7); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const statOf = k => {
      const list = monthRowsOf(Number(String(k).replace('-', '')))
        .filter(d => d.dateSO instanceof Date && !isNaN(d.dateSO) && d.dateSO.getDate() <= elapsed && matchXf(d));
      const n = list.length, rv = sum(list, 'revenue');
      return {
        so: n, rev: rv, unit: sum(list, 'units'),
        done: list.filter(d => d.status3 === '1.Done').length,
        canc: list.filter(d => d.status3 === '3.Cancel').length,
        avg: n ? rv / n : 0
      };
    };
    const curKeyM = S.period || mthList[mthList.length - 1] || '';
    const others = mthList.filter(k => k !== curKeyM);          /* เรียงเก่า -> ใหม่ */
    const validM = v => !!v && others.indexOf(v) >= 0;
    const fallbackM = ex => {
      const prevM = shiftMth(curKeyM, -1);
      if (validM(prevM) && ex.indexOf(prevM) < 0) return prevM;
      const rest = others.filter(k => ex.indexOf(k) < 0);
      return rest.length ? rest[rest.length - 1] : '';
    };
    const nMode = S.momN === 3 ? 3 : 1;
    const c1 = validM(S.momMth) ? S.momMth : fallbackM([]);
    const c2 = nMode === 3 ? (validM(S.momMth2) && S.momMth2 !== c1 ? S.momMth2 : fallbackM([c1])) : '';
    const cmpKeys = (nMode === 3 ? [c1, c2] : [c1]).filter(validM);

    const curStat = { so: so, rev: rev, unit: units, done: nD, canc: nC, avg: so ? rev / so : 0 };
    const momRows = [
      { k: 'จำนวน SO (ใบ)', f: 'so', fmt: num, better: 1 },
      { k: 'Revenue สุทธิ', f: 'rev', fmt: baht, better: 1 },
      { k: 'Unit (เครื่อง)', f: 'unit', fmt: num, better: 1 },
      { k: 'ปิดจริง (1.Done)', f: 'done', fmt: num, better: 1 },
      { k: 'ยกเลิก (3.Cancel)', f: 'canc', fmt: num, better: -1 },
      { k: 'ยอดเฉลี่ยต่อใบ', f: 'avg', fmt: baht, better: 1 }
    ];
    const cmpStats = cmpKeys.map(k => ({ k: k, s: statOf(k) }));
    const base = cmpStats.length ? cmpStats[0] : null;

    const mSel = (id, label, val) => '<label>' + esc(label) + ' <select id="' + id + '" class="pbi-select">' +
      others.slice().reverse().map(k => '<option value="' + k + '"' + (k === val ? ' selected' : '') + '>' +
        esc(mthLabel(k)) + '</option>').join('') + '</select></label>';
    let momTbl = '<div class="mom-ctl">' +
      '<div class="seg" id="momMode">' +
        '<button data-mode="1" class="' + (nMode === 1 ? 'on' : '') + '">เดือน × เดือน</button>' +
        '<button data-mode="3" class="' + (nMode === 3 ? 'on' : '') + '">เทียบ 3 เดือน</button>' +
      '</div>' +
      (others.length
        ? mSel('momSel', nMode === 3 ? 'เทียบกับ' : 'เทียบกับ', c1) +
          (nMode === 3 ? mSel('momSel2', 'และ', c2) : '')
        : '<span class="mom-note">ยังมีข้อมูลเดือนเดียว</span>') +
      '<span class="mom-note">นับถึงวันที่ ' + elapsed + ' ของทุกเดือน</span>' +
      '</div>';
    momTbl += '<div class="tbl"><table class="pbi"><thead><tr>' +
      '<th class="rowhead">ตัวชี้วัด</th>' +
      '<th class="num cur">' + esc(mthLabel(curKeyM)) + '<br><small>ถึงวันที่ ' + elapsed + '</small></th>' +
      cmpStats.map(c => '<th class="num">' + esc(mthLabel(c.k)) + '<br><small>ถึงวันที่ ' + elapsed + '</small></th>').join('') +
      (base ? '<th class="num">ต่าง vs ' + esc(mthLabel(base.k)) + '</th><th class="num">%</th>' : '') +
      '</tr></thead><tbody>';
    momRows.forEach(r => {
      const a = curStat[r.f];
      const b0 = base ? base.s[r.f] : null;
      const d0 = b0 == null ? null : a - b0;
      const p0 = b0 == null ? null : dl(a, b0);
      const good = p0 == null ? '' : ((p0 * r.better) >= 0 ? 'c-done' : 'c-canc');
      momTbl += '<tr><td class="rowhead">' + esc(r.k) + '</td>' +
        '<td class="num cur">' + r.fmt(a) + '</td>' +
        cmpStats.map(c => '<td class="num">' + r.fmt(c.s[r.f]) + '</td>').join('') +
        (base ?
          '<td class="num ' + good + '">' + (d0 >= 0 ? '+' : '−') + r.fmt(Math.abs(d0)) + '</td>' +
          '<td class="num ' + good + '">' + (p0 == null ? '–' : (p0 >= 0 ? '+' : '−') + Math.abs(p0).toFixed(0) + '%') + '</td>' : '') +
        '</tr>';
    });
    momTbl += '</tbody></table></div>';

    /* ---- ยอดสะสมรายวัน เดือนนี้ vs เดือนก่อน ---- */
    const curByDay = new Map(), prevByDay = new Map();
    rs.forEach(d => { if (d.dateSO && !isNaN(d.dateSO)) { const k = d.dateSO.getDate(); curByDay.set(k, (curByDay.get(k) || 0) + 1); } });
    prev.forEach(d => { if (d.dateSO && !isNaN(d.dateSO)) { const k = d.dateSO.getDate(); prevByDay.set(k, (prevByDay.get(k) || 0) + 1); } });
    const cLabels = [], cumCur = [], cumPrev = [];
    let a1 = 0, a2 = 0;
    for (let d = 1; d <= elapsed; d++) {
      cLabels.push(String(d));
      a1 += curByDay.get(d) || 0; cumCur.push(a1);
      a2 += prevByDay.get(d) || 0; cumPrev.push(a2);
    }
    const trendChart = elapsed > 1 ? multiLine(cLabels, [
      { name: 'SO สะสม · ' + curMthTh, color: '#118DFF', values: cumCur },
      { name: 'SO สะสม · ' + prevMthTh, color: '#98A2B3', values: cumPrev, dashed: true }
    ], { height: 210 }) : empty();

    /* ---- องค์ประกอบสถานะ (ให้ผลรวม = 100% ของ SO เสมอ) ---- */
    const nBlank = Math.max(so - (nD + nP + nC), 0);
    const ctot = (nD + nP + nC + nBlank) || 1;
    const compRows = [
      { k: 'ปิดจริง (1.Done)', v: nD, c: '#059669' },
      { k: 'คงค้าง (2.Pending)', v: nP, c: '#F59E0B' },
      { k: 'ยกเลิก (3.Cancel)', v: nC, c: '#E11D48' }
    ];
    if (nBlank > 0) compRows.push({ k: 'ยังไม่ระบุสถานะ', v: nBlank, c: '#94A3B8' });

    /* รายได้แยกตามสถานะ (เฉพาะ 3 สถานะหลัก ตามสูตร Rev.Total) */
    const revBy = { '1.Done': 0, '2.Pending': 0, '3.Cancel': 0 };
    rs.forEach(d => { if (revBy[d.status3] != null) revBy[d.status3] += (d.revenue || 0); });
    const revRows = [
      { k: 'ปิดจริง', v: revBy['1.Done'], c: '#059669' },
      { k: 'คงค้าง', v: revBy['2.Pending'], c: '#F59E0B' },
      { k: 'ยกเลิก', v: revBy['3.Cancel'], c: '#E11D48' }
    ];
    const revTot = (revRows[0].v + revRows[1].v + revRows[2].v) || 1;
    const compHtml = '<div class="sum-comp">' +
      '<div class="sum-comp-grp">' +
        '<div class="sum-comp-h">สัดส่วนจำนวน (SO)</div>' +
        '<div class="sum-comp-bar">' +
          compRows.filter(x => x.v).map(x => '<i style="width:' + (x.v / ctot * 100).toFixed(1) +
            '%;background:' + x.c + '" title="' + esc(x.k) + ' ' + num(x.v) + ' ใบ"></i>').join('') +
        '</div>' +
        '<div class="sum-comp-rows">' +
          compRows.map(x => '<div class="sum-comp-row"><i style="background:' + x.c + '"></i><span>' + esc(x.k) +
            '</span><b>' + num(x.v) + '</b><em>' + (x.v / ctot * 100).toFixed(0) + '%</em></div>').join('') +
        '</div>' +
      '</div>' +
      '<div class="sum-comp-grp">' +
        '<div class="sum-comp-h">สัดส่วนรายได้ (Revenue) · รวม ' + baht(revTot) + '</div>' +
        '<div class="sum-comp-bar" style="height:16px">' +
          revRows.filter(x => x.v > 0).map(x => '<i style="width:' + (x.v / revTot * 100).toFixed(1) +
            '%;background:' + x.c + '" title="' + esc(x.k) + ' ' + baht(x.v) + '"></i>').join('') +
        '</div>' +
        '<div class="sum-comp-legend">' +
          revRows.map(x => '<span><i style="background:' + x.c + '"></i>' + esc(x.k) + ' <b>' + baht(x.v) +
            '</b> · ' + (x.v / revTot * 100).toFixed(0) + '%</span>').join('') +
        '</div>' +
      '</div>' +
      '</div>';

    /* ---- อายุงานค้าง ---- */
    const BKL = ['0–3 วัน', '4–7 วัน', '8–14 วัน', '15–21 วัน', 'เกิน 21 วัน'];
    const bkc = [0, 0, 0, 0, 0];
    openAll.forEach(d => {
      if (!(d.dateSO instanceof Date) || isNaN(d.dateSO)) return;
      const ageDays = (now - d.dateSO) / 86400000;
      if (ageDays > 21) { bkc[4]++; return; }
      const age = Math.max(0, Math.round(ageDays));
      bkc[age <= 3 ? 0 : age <= 7 ? 1 : age <= 14 ? 2 : 3]++;
    });

    /* ---- ตัวช่วย: อันดับแบบแท่ง (คลิกกรองได้ + แสดง %) ---- */
    const rankList = (items, fmt, field, total) => {
      if (!items || !items.length) return empty();
      const mx = Math.max.apply(null, items.map(x => x.value)) || 1;
      const tot = total || items.reduce((a, x) => a + x.value, 0) || 1;
      return '<div class="sum-rank">' + items.map(x =>
        '<div class="sum-rank-row' + (field && xfHas(field, x.label) ? ' sel' : '') + '"' + (field ? xfAttr(field, x.label) : '') + ' title="' + esc(x.label) + ' · ' + fmt(x.value) + ' (' + (x.value / tot * 100).toFixed(1) + '%)">' +
        '<span class="sum-rank-name">' + esc(stripNum(x.label)) + '</span>' +
        '<span class="sum-rank-val">' + fmt(x.value) + '<em>' + (x.value / tot * 100).toFixed(0) + '%</em></span>' +
        '<span class="sum-rank-track"><i style="width:' + (x.value / mx * 100).toFixed(1) + '%"></i></span></div>').join('') + '</div>';
    };

    /* ---- HERO ---- */
    const stampRaw = (S.meta && S.meta.stamp) || '';
    const stampTxt = stampRaw ? stampRaw.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$3/$2/$1 $4:$5') : '';
    const stampTag = stampTxt ? ' · ข้อมูล ณ ' + stampTxt : '';
    const dRev = dl(rev, pTRev), dSo = dl(so, pTSo), dUnit = dl(units, pTUnit), dDone = dl(nD, pTD);
    const chip = v => '<span class="sum-chip ' + (v == null || Math.abs(v) < 1 ? 'flat' : v > 0 ? 'up' : 'down') + '">' +
      (v == null ? '–' : Math.abs(v) < 1 ? '≈ เดิม' : (v > 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(0) + '%') + '</span>';

    const hero = '<section class="sum-hero">' +
      '<div class="sum-hero-main">' +
        '<div class="sum-eyebrow">รายได้สุทธิ · ' + curMthTh + stampTag + '</div>' +
        '<div class="sum-hero-num">' + baht(rev) + '</div>' +
        '<div class="sum-hero-lbl">หลังหักส่วนลด ÷ 1.07 · เฉพาะกลุ่มหยอดเหรียญ</div>' +
        '<div class="sum-hero-delta">' + chip(dRev) + '<small>เทียบ ' + prevMthTh + ' (ถึงวันที่ ' + elapsed + ') · ' + baht(pTRev) + '</small></div>' +
      '</div>' +
      '<div class="sum-hero-stats">' +
        '<div class="sum-stat"><b>' + num(so) + '</b><span>SO (ใบ)</span>' + chip(dSo) + '</div>' +
        '<div class="sum-stat"><b>' + num(units) + '</b><span>Unit (เครื่อง)</span>' + chip(dUnit) + '</div>' +
        '<div class="sum-stat"><b>' + num(nD) + '</b><span>ปิดจริง (Done)</span>' + chip(dDone) + '</div>' +
      '</div>' +
      '<div class="sum-hero-prog">' +
        '<div class="sum-hero-track"><i style="width:' + pctMonth + '%"></i><u style="left:' + pctMonth + '%"></u></div>' +
        '<small>เดือนผ่านไป ' + pctMonth + '% (' + elapsed + '/' + dim + ' วัน) · คาดปิดเดือน ' +
        num(fcSo) + ' ใบ / ' + baht(fcRev) + '</small>' +
      '</div></section>';

    /* ---- INSIGHTS ---- */
    const insights = [
      { c: (dRev == null || dRev >= 0) ? '#059669' : '#E11D48',
        t: 'รายได้ ' + (dRev == null ? '–' : Math.abs(dRev) < 1 ? 'ทรงตัว' : (dRev > 0 ? 'โต ' : 'ลด ') + Math.abs(dRev).toFixed(0) + '%'),
        s: baht(rev) + ' เทียบ ' + baht(pTRev) + ' (' + prevMthTh + ' ถึงวันที่ ' + elapsed + ')' },
      { c: '#4F46E5', t: 'คาดปิดเดือน ' + num(fcSo) + ' ใบ · ' + baht(fcRev),
        s: 'เหลือ ' + left + ' วัน · อีก +' + num(Math.max(fcSo - so, 0)) + ' ใบ (run-rate ' + (so / elapsed).toFixed(1) + ' ใบ/วัน)' },
      { c: '#F59E0B', t: 'อัตราปิดงาน ' + (closeRate * 100).toFixed(0) + '%',
        s: 'ปิดจริง ' + num(nD) + ' จาก ' + num(nD + nP) + ' ใบที่ปิดได้ · ยังค้าง ' + num(nP) + ' ใบ' },
      { c: '#E11D48', t: 'ยกเลิก ' + num(nC) + ' ใบ (' + (so ? (nC / so * 100).toFixed(0) : 0) + '% ของ SO)',
        s: 'เดือนก่อน ' + num(pTC) + ' ใบ — ' + (pTC > nC ? 'ดีขึ้น ' + (pTC - nC) + ' ใบ' : pTC < nC ? 'แย่ลง ' + (nC - pTC) + ' ใบ' : 'เท่าเดิม') },
      { c: '#0EA5E9', t: 'Backlog ค้าง ' + num(openAll.length) + ' ใบ (ทั้งระบบ)',
        s: 'ค้างเกิน 21 วัน ' + num(old21) + ' ใบ (' + (openAll.length ? (old21 / openAll.length * 100).toFixed(0) : 0) + '% ของ backlog) · ไม่จำกัดเดือน' }
    ];

    let h = pgHead('Summary', rs);
    h += '<div class="g">';
    h += hero;
    h += '<div class="sum-ins">' + insights.map(x =>
      '<div class="sum-ins-item"><span class="sum-ins-dot" style="background:' + x.c + '"></span><div>' +
      '<div class="sum-ins-t">' + esc(x.t) + '</div><div class="sum-ins-s">' + esc(x.s) + '</div></div></div>').join('') + '</div>';

    h += card(7, 'ยอด SO สะสม · เดือนนี้เทียบเดือนก่อน', trendChart, { hint: 'ถึงวันที่ ' + elapsed });
    h += card(5, 'องค์ประกอบสถานะใบงาน', compHtml, { hint: num(so) + ' ใบ · ' + baht(revTot) });

    h += card(4, 'Top 5 ทีมขาย · Revenue', rankList(topTeam.slice(0, 5), baht, 'team', rev), { hint: 'ราคาสุทธิ' });
    h += card(4, 'กลุ่มสินค้า · Unit', rankList(byGroup, num, 'group', units), { hint: 'จำนวนเครื่อง' });
    h += card(4, 'พื้นที่ · SO', rankList(byArea, num, 'gbkk', so), { hint: 'จำนวนใบ' });

    h += card(6, 'ความเสี่ยงงานค้าง (Backlog)',
      (old21 ? '<div class="sum-risk-alert">⚠ ค้างเกิน 21 วัน ' + num(old21) + ' ใบ จากทั้งหมด ' + num(openAll.length) + ' ใบ (ทั้งระบบ ไม่จำกัดเดือน)</div>' : '') +
      rankList(BKL.map((k, i) => ({ label: k, value: bkc[i] })), num), { hint: 'ทั้งระบบ · นับจากวันเปิด SO ถึงวันนี้' });
    h += card(6, 'เทียบเดือนก่อน (Month over Month)', momTbl, { hint: 'เขียว = ดีขึ้น · แดง = แย่ลง' });
    return h + '</div>';
  }

  function pageOverview(rs) {
    const rsDay = rows('day'), rsAdm = rows('admGroup'), rsTeam = rows('team'), rsGrp = rows('group');
    let rev = 0, units = 0, pass = 0, installs = 0;
    const byDay = new Map(), instByDay = new Map();
    rs.forEach(d => {
      rev += d.revenue || 0;
      units += d.units || 0;
      if (d.admGroup === '1.ผ่าน') pass++;
    });
    rsDay.forEach(d => {
      if (d.dateSO) {
        const k = d.dateSO.getDate();
        const a = byDay.get(k) || { n: 0, u: 0 };
        a.n++; a.u += d.units || 0;
        byDay.set(k, a);
      }
      if (d.installDate instanceof Date && !isNaN(d.installDate)) {
        const k2 = d.installDate.getDate();
        instByDay.set(k2, (instByDay.get(k2) || 0) + 1);
        installs++;
      }
    });
    const dayKeys = [...new Set([...byDay.keys(), ...instByDay.keys()])].sort((a, b) => a - b);
    const daily = dayKeys.map(k => ({
      label: String(k),
      value: (byDay.get(k) || { n: 0 }).n,
      sub: 'Unit ' + num((byDay.get(k) || { u: 0 }).u)
    }));
    const instLine = dayKeys.map(k => instByDay.get(k) || 0);
    const pct = rs.length ? pass / rs.length * 100 : 0;

    /* ประมาณการจำนวน SO เมื่อสิ้นเดือน (run-rate ตามวันที่ผ่านไป) */
    const fc = (function () {
      const saveXf = S.xf; S.xf = {};
      const all = rows();                 /* ไม่รวมตัวกรองคลิก (cross-filter) */
      S.xf = saveXf;
      const now = new Date();
      const parts = String(S.period || '').split('-').map(Number);
      const yy = parts[0], mm = parts[1];
      const dim = (yy && mm) ? new Date(yy, mm, 0).getDate() : 30;
      const maxDay = dayKeys.length ? Math.max.apply(null, dayKeys) : 0;
      const isCur = S.period === (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
      const elapsed = Math.min(dim, isCur ? Math.max(now.getDate(), maxDay) : dim);
      const so = all.length;
      const est = Math.round(so / Math.max(elapsed, 1) * dim);
      const left = Math.max(dim - elapsed, 0);
      const note = 'ณ วันที่ ' + elapsed + '/' + dim + ' · ' + num(so) + ' ใบ' +
        (left > 0 ? ' · เหลือ ' + left + ' วัน (≈' + Math.max(est - so, 0) + ' ใบ)' : ' · ครบเดือน');
      return { so: est, note: note };
    })();
    const adm = ['1.ผ่าน', '2.Pening', '3.ไม่ผ่าน', '(Blank)'].map(k => ({
      label: k === '(Blank)' ? '(ว่าง)' : k,
      value: rsAdm.filter(d => String(d.admGroup || '(Blank)') === k).length
    })).filter(d => d.value > 0);

    const stM = matrix(rsTeam, d => d.team || '(ไม่ระบุ)', d => d.admGroup, () => 1, num, { sortRows: 1, rowTitle: 'Grp ทีมขาย', rowField: 'team', colField: 'admGroup' });
    const revM = matrix(rsGrp, d => d.group, d => d.team, d => d.revenue, baht, { sortRows: 1, maxRows: 10, rowTitle: 'กลุ่มสินค้า', rowField: 'group', colField: 'team' });

    let h = pgHead('Daily Admin', rs);
    h += '<div class="g">';
    h += kpiCard(2, 'จำนวน SO', num(rs.length), C.navy, 'ใบสั่งซื้อในเดือนนี้');
    h += kpiCard(3, 'Revenue (ราคาสุทธิ)', baht(rev), C.orange, 'หักส่วนลด ÷1.07 แล้ว');
    h += kpiCard(2, 'Unit (จำนวนเครื่อง)', num(units), C.teal, '= จำนวน Set');
    h += kpiCard(2, 'ผ่านการตรวจสอบ', pct.toFixed(0) + '%', C.green, num(pass) + ' / ' + num(rs.length));
    h += kpiCard(3, 'ประมาณการ SO ปิดเดือน', num(fc.so), C.violet, fc.note);
    h += card(8, 'SO ต่อวัน', colsChart(daily, { line: instLine, barLabel: 'จำนวน SO', lineLabel: 'การติดตั้ง', field: 'day' }));
    h += card(4, 'สถานะตรวจสอบ (Admin)', donut(adm, { field: 'admGroup' }));
    h += card(12, 'Grp ทีมขาย × สถานะ Admin', stM, { hint: 'จำนวนงาน' });
    h += card(12, 'กลุ่มสินค้า × ทีมขาย · Revenue', revM, { hint: 'ราคาสุทธิ (บาท)' });
    h += defCard(
      '<ul class="note">' +
      '<li><b>กราฟ SO ต่อวัน</b> = แท่งน้ำเงินคือจำนวน SO ที่เปิดในวันนั้น · แดง (เส้น) คือจำนวนงานที่ติดตั้งในวันนั้น</li>' +
      '<li><b>สถานะ Admin</b> = 1.ผ่าน / 2.Pening (รอตรวจสอบ·ระหว่างแก้ไข) / 3.ไม่ผ่าน — ตามกลุ่มในโมเดล PBI</li>' +
      '<li><b>ประมาณการ SO ปิดเดือน</b> = SO ถึงวันนี้ ÷ วันที่ผ่านไป × วันในเดือน</li>' +
      '<li><b>Revenue</b> = IF(เงินสดว่าง, ราคาตั้ง, ราคาเงินสด) − ส่วนลด ÷ 1.07</li>' +
      '<li>คลิกกราฟ/ตาราง/สัญลักษณ์เพื่อกรองได้หลายค่า · ปุ่ม “ล้างทั้งหมด” เพื่อคืนค่า</li>' +
      '</ul>');
    return h + '</div>';
  }

  function pageStatus(rs) {
    const rsAdm2 = rows('admGroup'), rsSt3 = rows('status3');
    const byAdm = new Map(), bySt3 = new Map();
    rsAdm2.forEach(d => {
      byAdm.set(d.admGroup || '(ว่าง)', (byAdm.get(d.admGroup || '(ว่าง)') || 0) + 1);
    });
    rsSt3.forEach(d => {
      bySt3.set(d.status3 || '(ไม่ระบุ)', (bySt3.get(d.status3 || '(ไม่ระบุ)') || 0) + 1);
    });
    const admData = [...byAdm.entries()].sort((a, b) => b[1] - a[1]).map(e => ({ label: e[0], value: e[1] }));
    const st3Data = [...bySt3.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(e => ({ label: e[0], value: e[1] }));

    let h = pgHead('Status (New)', rs);
    h += '<div class="g">';
    h += statusKpi(rs);
    h += card(12, 'สถานะใบงาน3 × Grp ทีมขาย', statusTable(rs), { hint: 'SO / %SO' });
    h += card(6, 'สถานะ Admin', hbars(admData, num, { field: 'admGroup', pct: true }), { hint: 'จำนวนงาน · % ของทั้งหมด' });
    h += card(6, 'สถานะใบงาน3 · สัดส่วน', donut(st3Data, { field: 'status3' }));
    h += defCard(
      '<ul class="note">' +
      '<li><b>Total SO</b> = จำนวนใบสั่งซื้อในเดือนนี้ (นับทุกสถานะ รวมที่ยังไม่มีสถานะ)</li>' +
      '<li><b>Rev (ราคาสุทธิ)</b> / <b>Total Unit</b> = คิดเฉพาะงานที่มีสถานะ 1.Done / 2.Pending / 3.Cancel ตาม measure ใน PBI</li>' +
      '<li><b>%SO</b> = สัดส่วนของแต่ละสถานะต่อจำนวน SO ทั้งหมดของทีมนั้น</li>' +
      '<li>คลิกแถวตารางเพื่อกรองทีม · คลิกชิ้นโดนัทเพื่อกรองสถานะ ได้หลายค่าพร้อมกัน</li>' +
      '</ul>');
    return h + '</div>';
  }

  function pageTat(rs) {
    const rsDay = rows('day'), rsT = rows('team');
    let nA = 0, sA = 0, nC = 0, sC = 0;
    const byDay = new Map(), byTeam = new Map();
    rs.forEach(d => {
      if (d.slaAdmin != null) { sA += d.slaAdmin; nA++; }
    });
    rsDay.forEach(d => {
      if (d.slaClose != null && (d.status3 === '1.Done' || d.status3 === '3.Cancel')) {
        sC += d.slaClose; nC++;
        if (d.dateSO) {
          const k2 = d.dateSO.getDate();
          const a = byDay.get(k2) || [0, 0]; a[0] += d.slaClose; a[1]++;
          byDay.set(k2, a);
        }
      }
    });
    rsT.forEach(d => {
      if (d.slaClose != null && (d.status3 === '1.Done' || d.status3 === '3.Cancel')) {
        const tk = d.team || '(ไม่ระบุ)';
        const b = byTeam.get(tk) || [0, 0]; b[0] += d.slaClose; b[1]++; byTeam.set(tk, b);
      }
    });
    const daily = [...byDay.entries()].sort((a, b) => a[0] - b[0])
      .map(e => ({ label: String(e[0]), value: e[1][1] ? e[1][0] / e[1][1] : 0, sub: e[1][1] + ' งาน' }));
    const teamData = [...byTeam.entries()]
      .map(e => ({ label: e[0], value: e[1][1] ? +(e[1][0] / e[1][1]).toFixed(1) : 0 }))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    /* อายุงานคงค้าง (Aging) — เฉพาะงานที่ยังไม่ปิด */
    const BK = ['0–3 วัน', '4–7 วัน', '8–14 วัน', '15–21 วัน', '> 21 วัน'];
    const bk = [0, 0, 0, 0, 0];
    const today = new Date();
    rs.forEach(d => {
      if (d.status3 === '1.Done' || d.status3 === '3.Cancel') return;
      if (!(d.dateSO instanceof Date) || isNaN(d.dateSO)) return;
      const age = Math.max(0, Math.round((today - d.dateSO) / 86400000));
      bk[age <= 3 ? 0 : age <= 7 ? 1 : age <= 14 ? 2 : age <= 21 ? 3 : 4]++;
    });
    const agingData = BK.map((k, i) => ({ label: k, value: bk[i] }));

    let h = pgHead('Performance / TAT', rs);
    h += '<div class="g">';
    h += kpiCard(3, 'SLA Admin เฉลี่ย', (nA ? sA / nA : 0).toFixed(1) + ' วัน', C.blue, num(nA) + ' งาน');
    h += kpiCard(3, 'SLA ปิดงาน เฉลี่ย', (nC ? sC / nC : 0).toFixed(1) + ' วัน', C.orange, num(nC) + ' งาน');
    h += kpiCard(3, 'งานที่ปิดแล้ว', num(nC), C.green, '1.Done + 3.Cancel');
    h += kpiCard(3, 'งานคงค้าง', num(rs.length - nC), C.red, 'ยังไม่ปิดงาน');
    h += card(12, 'SLA ปิดงาน เฉลี่ยรายวัน (วัน)', colsChart(daily, { field: 'day' }), { hint: 'เฉลี่ยต่อวัน' });
    h += card(6, 'SLA เฉลี่ยตามทีม (วัน)', hbars(teamData, v => v.toFixed(1), { field: 'team' }));
    h += card(6, 'อายุงานคงค้าง (Aging) · งานที่ยังไม่ปิด', hbars(agingData, num, { pct: true }), { hint: 'นับจากวันที่เปิด SO ถึงวันนี้' });
    h += defCard(
      '<ul class="note"><li>SLA Admin = MAX(Date Admin − Date SO, 0)</li>' +
      '<li>SLA ปิดงาน = วันที่ปิดงาน − Date SO (งาน 1.Done / 3.Cancel)</li>' +
      '<li>งานที่ยังไม่ปิด = วันนี้ − Date SO</li>' +
      '<li>Date Admin อ้างตามสูตรคอลัมน์ DG</li></ul>');
    return h + '</div>';
  }

  function pageData(rs) {
    const q = S.q.trim().toLowerCase();
    let list = rs;
    if (q) list = rs.filter(d => String(d.so || '').toLowerCase().includes(q) || String(d.customer || '').toLowerCase().includes(q) || String(d.salesperson || '').toLowerCase().includes(q));
    const per = 100, pages = Math.max(1, Math.ceil(list.length / per));
    if (S.pageIdx >= pages) S.pageIdx = 0;
    const slice = list.slice(S.pageIdx * per, S.pageIdx * per + per);

    let body = '<div class="toolbar"><input id="dataSearch" class="pbi-input" placeholder="ค้นหา SO / ลูกค้า / ผู้รับผิดชอบ" value="' + esc(S.q) + '">' +
      '<button class="btn" id="dataPrev"' + (S.pageIdx === 0 ? ' disabled' : '') + '>‹ ก่อนหน้า</button>' +
      '<span class="muted">หน้า ' + (S.pageIdx + 1) + '/' + pages + ' · ' + num(list.length) + ' แถว</span>' +
      '<button class="btn" id="dataNext"' + (S.pageIdx >= pages - 1 ? ' disabled' : '') + '>ถัดไป ›</button></div>';
    body += '<div class="tbl"><table class="pbi"><thead><tr><th>SO</th><th>Date SO</th><th>ลูกค้า</th><th>จังหวัด</th><th>กลุ่มสินค้า</th><th>ทีมขาย</th><th class="num">Revenue</th><th class="num">Unit</th><th>สถานะใบงาน3</th><th>Admin</th><th class="num">SLA Admin</th></tr></thead><tbody>';
    slice.forEach(d => {
      body += '<tr><td>' + esc(d.so) + '</td><td>' + ymd(d.dateSO) + '</td><td>' + esc(d.customer) + '</td><td>' + esc(d.province) + '</td><td>' + esc(d.group) + '</td><td>' + esc(d.team) + '</td>' +
        '<td class="num">' + baht(d.revenue) + '</td><td class="num">' + num(d.units) + '</td><td>' + esc(d.status3) + '</td><td>' + esc(d.admGroup) + '</td>' +
        '<td class="num">' + (d.slaAdmin == null ? '' : d.slaAdmin) + '</td></tr>';
    });
    body += '</tbody></table></div>';

    return pgHead('ตารางรายละเอียดทุกใบงาน', rs) + '<div class="g">' +
      card(12, 'รายละเอียด (ค่าที่คำนวณตามสูตรจริง)', body, { cls: 'fill' }) + '</div>';
  }

  /* GRP SML = ขนาดยอดต่อใบ ตามเกณฑ์ในรายงานเดิม */
  function smlOf(d) {
    const v = d.revenue || 0;
    if (v < 60000) return 'SS';
    if (v <= 100000) return 'S';
    if (v <= 500000) return 'M';
    if (v <= 1000000) return 'L';
    return 'XL';
  }

  function smlCards(rs) {
    const byGrp = new Map();
    rs.forEach(d => {
      const k = smlOf(d);
      const o = byGrp.get(k) || { d: 0, p: 0, c: 0, rd: 0, rp: 0, rc: 0 };
      const rv = d.revenue || 0;
      if (d.status3 === '1.Done') { o.d++; o.rd += rv; }
      else if (d.status3 === '2.Pending') { o.p++; o.rp += rv; }
      else if (d.status3 === '3.Cancel') { o.c++; o.rc += rv; }
      byGrp.set(k, o);
    });
    const order = ['SS', 'S', 'M', 'L', 'XL'];
    const keys = [...byGrp.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const seg = (k, mode) => {
      const o = byGrp.get(k);
      return mode === 'so'
        ? [{ name: 'Done', v: o.d, color: C.green }, { name: 'Pending', v: o.p, color: C.gold }, { name: 'Cancel', v: o.c, color: C.red }]
        : [{ name: 'Done', v: o.rd, color: C.green }, { name: 'Pending', v: o.rp, color: C.gold }, { name: 'Cancel', v: o.rc, color: C.red }];
    };
    const segTotal = r => r.segs.reduce((a, s) => a + s.v, 0);
    /* เรียงจากมากไปน้อย เพื่อให้อ่านง่ายและตรงกันทั้งสองการ์ด */
    const soRows = keys.map(k => ({ label: k, segs: seg(k, 'so') })).sort((a, b) => segTotal(b) - segTotal(a));
    const revRows = keys.map(k => ({ label: k, segs: seg(k, 'rev') })).sort((a, b) => segTotal(b) - segTotal(a));
    const totalRev = sumRev(rs) || 1;
    const contRows = keys.map(k => {
      const o = byGrp.get(k);
      return { label: k, value: (o.rd + o.rp + o.rc) / totalRev * 100 };
    }).sort((a, b) => b.value - a.value);

    let h = '';
    h += card(6, 'SO ตาม GRP SML', '<div class="stk-wrap">' + stackedBars(soRows) + statusLegend() + '</div>', { hint: 'จำนวน SO' });
    h += card(6, 'Revenue ตาม GRP SML', '<div class="stk-wrap">' + stackedBars(revRows, baht) + statusLegend() + '</div>', { hint: 'ราคาสุทธิ' });
    h += card(6, 'Contribution % (Revenue)', hbars(contRows, v => v.toFixed(0) + '%'));
    h += card(6, 'เกณฑ์ GRP SML (ตามรายงานเดิม)',
      '<ul class="note"><li>SS : Revenue &lt; 60,000.-</li><li>S : Revenue &lt;= 100,000.-</li>' +
      '<li>M : Revenue &lt;= 500,000.-</li><li>L : Revenue &lt;= 1,000,000.-</li>' +
      '<li>XL : Revenue &gt; 1,000,000.-</li></ul>');
    return h;
  }

  /* หน้าที่ 2 ของรายงานเดิม: 2.SO Order Status */
  function pageOrderStatus(rs) {
    let h = pgHead('2.SO Order Status', rs);
    h += '<div class="g">';
    h += statusKpi(rs);
    h += card(12, 'สถานะใบงาน3 × Grp ทีมขาย', statusTable(rs), { hint: 'SO / %SO' });
    h += smlCards(rs);
    h += card(12, 'GRP SML × กลุ่มสินค้า · Revenue',
      matrix(rs, smlOf, d => d.group, d => d.revenue, baht, { sortRows: 1, rowTitle: 'GRP SML' }),
      { hint: 'ราคาสุทธิ (บาท)' });
    return h + '</div>';
  }

  function pageSml(rs) {
    let h = pgHead('SML · GRP SML (ขนาดยอดต่อใบ)', rs);
    h += '<div class="g">';
    h += smlCards(rs);
    h += card(12, 'GRP SML × กลุ่มสินค้า · Revenue',
      matrix(rs, smlOf, d => d.group, d => d.revenue, baht, { sortRows: 1, rowTitle: 'GRP SML' }),
      { hint: 'ราคาสุทธิ (บาท)' });
    h += card(12, 'GRP SML × Grp ทีมขาย · SO',
      matrix(rs, smlOf, d => d.team || '(ไม่ระบุ)', () => 1, num, { sortRows: 1, rowTitle: 'GRP SML' }),
      { hint: 'จำนวน SO' });
    return h + '</div>';
  }

  /* ===== 1.Unit / Revenue (ตามหน้า 3 ของรายงานเดิม) ===== */
  function pageUnitRevenue(rs) {
    const sum = (arr, f) => arr.reduce((a, d) => a + (d[f] || 0), 0);
    const done = rs.filter(d => d.status3 === '1.Done');
    const cancel = rs.filter(d => d.status3 === '3.Cancel');

    const rsDay = rows('day'), rsCh = rows('channel'), rsSt = rows('status3');
    const rsA = rows('gbkk'), rsP = rows('group'), rsT = rows('team'), rsPkg = rows('pkg');

    // ---- ต่อวัน: ปิดงาน / ยังเปิด / ยอดเงิน
    const dayKeys = [...new Set(rsDay.map(d => d.dateSO ? d.dateSO.getDate() : 0))].filter(Boolean).sort((a, b) => a - b);
    const closeArr = [], openArr = [], revArr = [];
    dayKeys.forEach(k => {
      const list = rsDay.filter(d => d.dateSO && d.dateSO.getDate() === k);
      closeArr.push(list.filter(d => d.status3 === '1.Done').length);
      openArr.push(list.filter(d => d.status3 === '2.Pending' || d.status3 === '3.Cancel').length);
      revArr.push(sum(list, 'revenue') / 1e6);
    });

    // ---- ช่องทาง (Lead O2O)
    const chMap = new Map();
    rsCh.forEach(d => { const k = d.channel || '(ว่าง)'; chMap.set(k, (chMap.get(k) || 0) + 1); });
    const lead = [...chMap.entries()].map(e => ({ label: e[0], value: e[1] }));

    // ---- สถานะ
    const stMap = new Map();
    rsSt.forEach(d => { const k = d.status3 || '(ว่าง)'; stMap.set(k, (stMap.get(k) || 0) + 1); });
    const status = ['1.Done', '2.Pending', '3.Cancel'].map(k => ({ label: k, value: stMap.get(k) || 0 })).filter(x => x.value);

    // ---- พื้นที่
    const areaMap = new Map();
    rsA.forEach(d => { const k = d.gbkk || '(ว่าง)'; areaMap.set(k, (areaMap.get(k) || 0) + 1); });
    const area = [...areaMap.entries()].map(e => ({ label: e[0], value: e[1] }));

    // ---- กลุ่มสินค้า (Unit)
    const grpMap = new Map();
    rsP.forEach(d => { const k = d.group || '(ว่าง)'; grpMap.set(k, (grpMap.get(k) || 0) + (d.units || 0)); });
    const byProduct = [...grpMap.entries()].map(e => ({ label: e[0], value: e[1] })).filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // ---- Top 5 ทีมตามยอดขาย
    const teamMap = new Map();
    rsT.forEach(d => { const k = d.team || '(ไม่ระบุ)'; teamMap.set(k, (teamMap.get(k) || 0) + (d.revenue || 0)); });
    const topTeam = [...teamMap.entries()].map(e => ({ label: e[0], value: e[1] }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    // ---- เงินสด / ผ่อน ต่อวัน
    const cashArr = [], instArr = [];
    dayKeys.forEach(k => {
      const list = rsPkg.filter(d => d.dateSO && d.dateSO.getDate() === k);
      cashArr.push(list.filter(d => d.pkg === 'เงินสด').length);
      instArr.push(list.filter(d => d.pkg !== 'เงินสด').length);
    });
    const pkgMap = new Map();
    rsPkg.forEach(d => { const k = d.pkg || '(ว่าง)'; pkgMap.set(k, (pkgMap.get(k) || 0) + 1); });
    const byPkg = [...pkgMap.entries()].map(e => ({ label: e[0], value: e[1] }));

    // ---- ลูกค้า
    const cusMap = new Map();
    rs.forEach(d => {
      const k = d.customer || '(ไม่ระบุ)';
      const o = cusMap.get(k) || { u: 0, r: 0 };
      o.u += d.units || 0; o.r += d.revenue || 0;
      cusMap.set(k, o);
    });
    const cus = [...cusMap.entries()].sort((a, b) => b[1].r - a[1].r).slice(0, 15);
    let cusTbl = '<div class="tbl"><table class="pbi"><thead><tr><th>ชื่อลูกค้า</th><th class="num">Unit</th>' +
      '<th class="num">Revenue <span style="font-size:9px;color:#0B5CAB">▼</span></th></tr></thead><tbody>';
    cus.forEach(e => {
      cusTbl += '<tr><td>' + esc(String(e[0]).slice(0, 34)) + '</td><td class="num">' + num(e[1].u) + '</td>' +
        '<td class="num"><b>' + baht(e[1].r) + '</b></td></tr>';
    });
    cusTbl += '<tr class="grand"><td>Total</td><td class="num">' + num(sum(rs, 'units')) + '</td><td class="num">' + baht(sum(rs, 'revenue')) + '</td></tr></tbody></table></div>' +
      '<div style="padding:6px 9px 2px;font-size:10.5px;color:#98A2B3;line-height:1.45">' +
      'เรียงตาม <b style="color:#475569">Revenue มาก → น้อย</b> (Unit จึงไม่เรียงตามลำดับ เพราะบางราย Unit น้อยแต่ราคาต่อเครื่องสูง) · ' +
      'แสดง ' + cus.length + ' จาก ' + cusMap.size + ' ราย · ยอด Total คิดจากลูกค้าทั้งหมด</div>';

    let h = pgHead('1.Unit / Revenue', rs);
    h += '<div class="g">';
    h += kpiTriple(4, 'Total', sum(rs, 'revenue'), sum(rs, 'units'), rs.length, C.navy);
    h += kpiTriple(4, 'Revenue (Done)', sum(done, 'revenue'), sum(done, 'units'), done.length, C.green);
    h += kpiTriple(4, 'Cancel', sum(cancel, 'revenue'), sum(cancel, 'units'), cancel.length, C.red);
    h += card(4, 'Lead O2O · %SO', pctRows(lead, { field: 'channel' }));
    h += card(4, 'Status · %', pctRows(status, { field: 'status3' }));
    h += card(4, 'Area · %', pctRows(area, { field: 'gbkk' }));
    h += card(8, 'Total Close Sales · Total Open Sales · Rev (ล้านบาท)',
      multiLine(dayKeys.map(String), [
        { name: 'Total Close Sales', values: closeArr, color: C.green },
        { name: 'Total Open Sales', values: openArr, color: C.blue },
        { name: 'Rev (ล้านบาท)', values: revArr, color: C.gold, dashed: true }
      ]), { hint: 'รายวัน' });
    h += card(4, 'Product / Unit', donut(byProduct.slice(0, 6), { field: 'group' }));
    const pkgTot = byPkg.reduce((a, b) => a + b.value, 0) || 1;
    const pkgPills = '<div class="pkg-pills">' + byPkg.slice().sort((a, b) => b.value - a.value).map((p, i) =>
      '<span class="pkg-pill"><i style="background:' + (p.label === 'เงินสด' ? C.cyan : C.navy) + '"></i>' +
      esc(stripNum(p.label)) + ' <b>' + num(p.value) + '</b><em>' + Math.round(p.value / pkgTot * 100) + '%</em></span>').join('') + '</div>';
    h += card(6, 'เงินสด / ผ่อน (รายวัน)',
      '<div class="stk-wrap">' + pkgPills +
        multiLine(dayKeys.map(String), [
          { name: 'ผ่อน', values: instArr, color: C.navy },
          { name: 'เงินสด', values: cashArr, color: C.cyan }
        ], { height: 168, legend: false }) +
      '</div>', { hint: 'จำนวน SO ต่อวัน' });
    h += card(6, 'Top 5 (Team)', hbars(topTeam, baht, { field: 'team', pct: sum(rs, 'revenue'), money: true }), { hint: 'ราคาสุทธิ · % ของทั้งหมด' });
    h += card(7, 'ลูกค้า (Top 15 ตามยอดขาย)', cusTbl, { hint: 'เรียงตาม Revenue ▼' });
    h += card(5, 'หน่วยตามทีม', hbars([...new Map(rsT.map(d => [d.team || '(ไม่ระบุ)', 0])).keys()].map(k => ({
      label: k, value: rsT.filter(d => (d.team || '(ไม่ระบุ)') === k).reduce((a, d) => a + (d.units || 0), 0)
    })).sort((a, b) => b.value - a.value).slice(0, 10), num, { field: 'team', pct: sum(rs, 'units') }), { hint: 'จำนวนเครื่อง · % ของทั้งหมด' });
    return h + '</div>';
  }

  /* ชื่อฟิลด์ -> ชื่อไทย (ใช้ในหัวข้อกราฟ/ตาราง) */
  const FIELD_TH = {
    team: 'ทีมขาย', admGroup: 'สถานะ Admin', status3: 'สถานะใบงาน3', group: 'กลุ่มสินค้า',
    pkg: 'การชำระ', province: 'จังหวัด', salesperson: 'พนักงานขาย', gbkk: 'โซน (GBKK/UPC)',
    prodCat: 'ประเภทสินค้า', jobStage: 'ขั้นตอนงาน', channel: 'ช่องทาง',
    dayLabel: 'วันที่', monthLabel: 'เดือน', area: 'พื้นที่'
  };

  /* กราฟแท่งรายวัน แยกสถานะ (Done/Pending/Cancel) + แท่งประมาณการ + แกน Y */
  function estBars(labels, data) {
    const n = labels.length;
    if (!n) return empty();
    const tot = i => (data.done[i] || 0) + (data.pend[i] || 0) + (data.canc[i] || 0) + (data.proj[i] || 0);
    let max = 1;
    for (let i = 0; i < n; i++) max = Math.max(max, tot(i));
    const step = Math.max(1, Math.ceil(max / 4));
    const top = step * 4;
    const showX = n > 20 ? 2 : 1;
    let h = '<div class="est"><div class="est-y">';
    for (let i = 4; i >= 0; i--) h += '<span style="top:' + ((4 - i) / 4 * 100) + '%">' + (step * i) + '</span>';
    h += '</div><div class="est-plot">';
    for (let i = 0; i <= 4; i++) h += '<i class="gl" style="top:' + (i / 4 * 100) + '%"></i>';
    h += '<div class="est-bars">';
    labels.forEach((lb, i) => {
      const d0 = data.done[i] || 0, p0 = data.pend[i] || 0, c0 = data.canc[i] || 0, f0 = data.proj[i] || 0;
      const t = tot(i), hh = t / top * 100;
      const pctOf = v => (t ? (v / t * 100) : 0);
      h += '<div class="eb" ' + xfAttr('day', lb) + ' title="วันที่ ' + esc(lb) + ' · รวม ' + num(t) +
        ' · Done ' + num(d0) + ' · Pending ' + num(p0) + ' · Cancel ' + num(c0) +
        (f0 ? ' · ประมาณการ ' + num(Math.round(f0)) : '') + '">';
      if (t) {
        h += '<div class="stack" style="height:' + hh.toFixed(1) + '%">';
        if (d0) h += '<i class="s-done" style="height:' + pctOf(d0).toFixed(1) + '%"></i>';
        if (p0) h += '<i class="s-pend" style="height:' + pctOf(p0).toFixed(1) + '%"></i>';
        if (c0) h += '<i class="s-canc" style="height:' + pctOf(c0).toFixed(1) + '%"></i>';
        if (f0) h += '<i class="s-proj" style="height:' + pctOf(f0).toFixed(1) + '%"></i>';
        h += '</div>';
      }
      h += '<span>' + ((i % showX === 0 || i === n - 1) ? esc(lb) : '') + '</span></div>';
    });
    h += '</div></div></div>';
    h += '<div class="chart-legend">' +
      '<span><i class="sw" style="background:#059669"></i>Done</span>' +
      '<span><i class="sw" style="background:#F59E0B"></i>Pending</span>' +
      '<span><i class="sw" style="background:#E11D48"></i>Cancel</span>' +
      '<span><i class="sw" style="background:repeating-linear-gradient(45deg,#C7CBF7 0 4px,#E7E9FC 4px 8px)"></i>ประมาณการ</span>' +
      '</div>';
    return h;
  }

  /* ===== End of Mth — ประมาณการสิ้นเดือน ===== */
  function monthRowsOf(mthKey) {
    if (!S.data) return [];
    const fT = S.filter.team, fC = S.filter.channel, fG = S.filter.group;
    return S.data.filter(d => {
      if (!isKeepGroup(d.group)) return false;
      if (String(d.mth) !== String(mthKey)) return false;
      if (fT.size && !fT.has(String(d.team == null ? '' : d.team))) return false;
      if (fC.size && !fC.has(String(d.channel == null ? '' : d.channel))) return false;
      if (fG.size && !fG.has(String(d.group == null ? '' : d.group))) return false;
      return true;
    });
  }

  function allFiltered() {
    if (!S.data) return [];
    const fT = S.filter.team, fC = S.filter.channel, fG = S.filter.group;
    return S.data.filter(d => {
      if (!isKeepGroup(d.group)) return false;
      if (fT.size && !fT.has(String(d.team == null ? '' : d.team))) return false;
      if (fC.size && !fC.has(String(d.channel == null ? '' : d.channel))) return false;
      if (fG.size && !fG.has(String(d.group == null ? '' : d.group))) return false;
      return true;
    });
  }

  function pageEstimate(rs) {
    const sum = (arr, f) => arr.reduce((a, d) => a + (d[f] || 0), 0);
    const now = new Date();
    const parts = String(S.period || '').split('-').map(Number);
    const yy = parts[0] || now.getFullYear(), mm = parts[1] || (now.getMonth() + 1);
    const dim = new Date(yy, mm, 0).getDate();          /* จำนวนวันในเดือน */
    const isCur = (yy === now.getFullYear() && mm === (now.getMonth() + 1));
    const maxDay = rs.reduce((a, d) => (d.dateSO ? Math.max(a, d.dateSO.getDate()) : a), 0);
    const elapsed = Math.min(dim, Math.max(1, isCur ? Math.max(now.getDate(), maxDay) : dim));
    const left = dim - elapsed;

    const so = rs.length, rev = sum(rs, 'revenue'), units = sum(rs, 'units');
    const rateSo = so / elapsed, rateRev = rev / elapsed, rateUnit = units / elapsed;
    const fcSo = Math.round(rateSo * dim), fcRev = rateRev * dim, fcUnit = Math.round(rateUnit * dim);

    /* เดือนก่อนหน้า เพื่อเทียบ */
    const pm = (mm === 1) ? { y: yy - 1, m: 12 } : { y: yy, m: mm - 1 };
    const prevRows = monthRowsOf(pm.y * 100 + pm.m);
    const prevSo = prevRows.length, prevRev = sum(prevRows, 'revenue'), prevUnits = sum(prevRows, 'units');
    const delta = (a, b) => (b ? ((a - b) / b * 100) : 0);

    /* ข้อมูลรายวันแยกสถานะ + ประมาณการ */
    const doneD = [], pendD = [], cancD = [], projD = [];
    for (let d = 1; d <= dim; d++) {
      const list = rs.filter(x => x.dateSO && x.dateSO.getDate() === d);
      doneD.push(d <= elapsed ? list.filter(x => x.status3 === '1.Done').length : 0);
      pendD.push(d <= elapsed ? list.filter(x => x.status3 === '2.Pending').length : 0);
      cancD.push(d <= elapsed ? list.filter(x => x.status3 === '3.Cancel').length : 0);
      projD.push(d <= elapsed ? 0 : rateSo);
    }
    const labels = [];
    for (let d = 1; d <= dim; d++) labels.push(String(d));

    /* สถานะปัจจุบัน */
    const nDone = rs.filter(x => x.status3 === '1.Done').length;
    const nPend = rs.filter(x => x.status3 === '2.Pending').length;
    const nCanc = rs.filter(x => x.status3 === '3.Cancel').length;
    const closeRate = (nDone + nPend) ? nDone / (nDone + nPend) : 0;
    const pendClosable = Math.round(nPend * Math.max(closeRate, 0.5));

    /* ตารางตามทีม (มี Done/Pending) */
    const teamMap = new Map();
    rs.forEach(d => {
      const k = d.team || '(ไม่ระบุ)';
      const o = teamMap.get(k) || { so: 0, d: 0, p: 0, c: 0 };
      o.so++;
      if (d.status3 === '1.Done') o.d++;
      else if (d.status3 === '2.Pending') o.p++;
      else if (d.status3 === '3.Cancel') o.c++;
      teamMap.set(k, o);
    });
    const prevTeam = new Map();
    prevRows.forEach(d => {
      const k = d.team || '(ไม่ระบุ)';
      prevTeam.set(k, (prevTeam.get(k) || 0) + 1);
    });
    const teamList = [...teamMap.entries()].sort((a, b) => b[1].so - a[1].so);
    const maxFc = Math.max.apply(null, teamList.map(e => Math.round(e[1].so / elapsed * dim)).concat([1]));
    let teamTbl = '<div class="tbl"><table class="pbi"><thead><tr>' +
      '<th>ทีมขาย</th><th class="num">SO</th><th class="num">Done</th><th class="num">Pending</th>' +
      '<th>ประมาณการ</th><th class="num">เดือนก่อน</th><th class="num">ต่าง</th></tr></thead><tbody>';
    teamList.forEach(e => {
      const t = e[1], fcs = Math.round(t.so / elapsed * dim), pv = prevTeam.get(e[0]) || 0;
      const dd = pv ? ((fcs - pv) / pv * 100) : null;
      teamTbl += '<tr><td>' + esc(stripNum(e[0])) + '</td><td class="num">' + num(t.so) + '</td>' +
        '<td class="num c-done">' + num(t.d) + '</td><td class="num c-pend">' + num(t.p) + '</td>' +
        '<td><div class="tbcell"><span class="tbar"><i style="width:' + (fcs / maxFc * 100).toFixed(0) + '%"></i></span>' +
        '<b>' + num(fcs) + '</b></div></td>' +
        '<td class="num">' + num(pv) + '</td><td class="num ' + (dd == null ? '' : (dd >= 0 ? 'c-done' : 'c-canc')) + '">' +
        (dd == null ? '–' : (dd >= 0 ? '▲ ' : '▼ ') + Math.abs(dd).toFixed(0) + '%') + '</td></tr>';
    });
    teamTbl += '<tr class="grand"><td>Total</td><td class="num">' + num(so) + '</td>' +
      '<td class="num">' + num(nDone) + '</td><td class="num">' + num(nPend) + '</td>' +
      '<td><div class="tbcell"><b>' + num(fcSo) + '</b></div></td>' +
      '<td class="num">' + num(prevSo) + '</td><td class="num">' +
      (prevSo ? (delta(fcSo, prevSo) >= 0 ? '▲ ' : '▼ ') + Math.abs(delta(fcSo, prevSo)).toFixed(0) + '%' : '–') +
      '</td></tr>';
    teamTbl += '</tbody></table></div>';

    /* ===== ตารางวางแผนตามสินค้า (แบบเดียวกับ Excel) ===== */
    const all = allFiltered();
    const curMth = yy * 100 + mm, prevMth = pm.y * 100 + pm.m;
    const isDone = d => d.status3 === '1.Done';
    const inCurMonth = dt => dt instanceof Date && !isNaN(dt) && dt.getFullYear() === yy && (dt.getMonth() + 1) === mm;

    const grpNames = [...new Set(rs.map(d => d.group || '(ไม่ระบุ)'))];
    const plan = grpNames.map(g => {
      const gcur = rs.filter(d => (d.group || '(ไม่ระบุ)') === g);
      const gall = all.filter(d => (d.group || '(ไม่ระบุ)') === g);
      const total = gcur.length;
      const done = gcur.filter(isDone).length;
      const pend = gcur.filter(d => d.status3 === '2.Pending').length;
      const canc = gcur.filter(d => d.status3 === '3.Cancel').length;
      const booking = pend + canc;                                  /* จอง = ยังไม่ปิดงาน */
      const carryBefore = gall.filter(d => !isDone(d) && String(d.mth) < String(curMth)).length;
      const carryPrev = gall.filter(d => !isDone(d) && String(d.mth) === String(prevMth)).length;
      const prevDoneInst = gall.filter(d => isDone(d) && String(d.mth) === String(prevMth) && inCurMonth(d.installDate)).length;
      const backlogOld = gall.filter(d => !isDone(d) && Number(d.mth) < 202601).length;
      const unit = gcur.reduce((a, d) => a + (d.units || 0), 0);
      const instNow = gcur.filter(d => inCurMonth(d.installDate)).length;
      return {
        g: g, total: total, done: done, pend: pend, canc: canc, booking: booking,
        carryBefore: carryBefore, carryPrev: carryPrev, prevDoneInst: prevDoneInst,
        backlogOld: backlogOld, unit: unit, instNow: instNow,
        expInst: Math.round(instNow / elapsed * dim)
      };
    }).sort((a, b) => b.total - a.total);

    const sumBy = k => plan.reduce((a, r) => a + r[k], 0);
    const fold = (title, inner) => '<details class="fold"><summary>' + esc(title) + '</summary>' + inner + '</details>';

    /* ตารางหลัก — เฉพาะตัวเลขที่ผู้บริหารใช้ตัดสินใจ */
    let planTbl = '<div class="tbl"><table class="pbi plan"><thead><tr>' +
      '<th>กลุ่มสินค้า</th>' +
      '<th class="num">1.Done</th><th class="num">2.Pending</th><th class="num">3.Cancel</th>' +
      '<th class="num">Total</th><th class="num">Unit</th>' +
      '<th class="num">คาดติดได้เดือนนี้</th><th class="num">%ปิดได้</th>' +
      '</tr></thead><tbody>';
    plan.forEach(r => {
      planTbl += '<tr><td>' + esc(r.g) + '</td>' +
        '<td class="num c-done">' + num(r.done) + '</td>' +
        '<td class="num c-pend">' + num(r.pend) + '</td>' +
        '<td class="num c-canc">' + num(r.canc) + '</td>' +
        '<td class="num total">' + num(r.total) + '</td>' +
        '<td class="num">' + num(r.unit) + '</td>' +
        '<td class="num">' + num(r.expInst) + '</td>' +
        '<td class="num c-done">' + (r.total ? (r.done / r.total * 100).toFixed(0) : 0) + '%</td></tr>';
    });
    planTbl += '<tr class="grand"><td>Total</td>' +
      ['done', 'pend', 'canc', 'total', 'unit', 'expInst']
        .map(k => '<td class="num">' + num(sumBy(k)) + '</td>').join('') +
      '<td class="num">' + (sumBy('total') ? (sumBy('done') / sumBy('total') * 100).toFixed(0) : 0) + '%</td></tr>';
    planTbl += '</tbody></table></div>';

    /* ตารางเชิงลึก — ซ่อนไว้ ไม่ให้รกหน้าจอ */
    let planDeep = '<div class="tbl"><table class="pbi plan"><thead><tr>' +
      '<th>กลุ่มสินค้า</th><th class="num">จอง</th><th class="num">รวม backlog</th>' +
      '<th class="num">ยกมาจากก่อน</th><th class="num">เดือนก่อนยกมา</th>' +
      '<th class="num">Done เดือนก่อน·ติดเดือนนี้</th><th class="num">Backlog &lt;1Jan26</th>' +
      '</tr></thead><tbody>';
    plan.forEach(r => {
      planDeep += '<tr><td>' + esc(r.g) + '</td>' +
        '<td class="num">' + num(r.booking) + '</td>' +
        '<td class="num">' + num(r.booking) + '</td>' +
        '<td class="num">' + num(r.carryBefore) + '</td>' +
        '<td class="num">' + num(r.carryPrev) + '</td>' +
        '<td class="num">' + num(r.prevDoneInst) + '</td>' +
        '<td class="num">' + num(r.backlogOld) + '</td></tr>';
    });
    planDeep += '<tr class="grand"><td>Total</td>' +
      ['booking', 'booking', 'carryBefore', 'carryPrev', 'prevDoneInst', 'backlogOld']
        .map(k => '<td class="num">' + num(sumBy(k)) + '</td>').join('') + '</tr>';
    planDeep += '</tbody></table></div>';

    /* ===== ประมาณการ “ปิดจริง” (Done) ณ สิ้นเดือน ===== */
    const backlogByTeam = new Map();
    all.forEach(d => {
      if (d.status3 === '2.Pending' && Number(d.mth) < curMth) {
        const k = d.team || '(ไม่ระบุ)';
        backlogByTeam.set(k, (backlogByTeam.get(k) || 0) + 1);
      }
    });
    const doneRows = teamList.map(e => {
      const t = e[1];
      const r = (t.d + t.p) ? t.d / (t.d + t.p) : 0;            /* อัตราปิดของทีม */
      const add = Math.round(t.p * r + (t.so / elapsed * left) * r); /* Pending ที่คาดปิด + SO ใหม่ที่คาดปิด */
      const bp = backlogByTeam.get(e[0]) || 0;
      return { name: e[0], so: t.so, d: t.d, p: t.p, r: r, add: add, fc: t.d + add, bp: bp, bpc: Math.round(bp * r) };
    });
    [...backlogByTeam.keys()].forEach(k => {
      if (!doneRows.some(x => x.name === k)) doneRows.push({ name: k, so: 0, d: 0, p: 0, r: 0, add: 0, fc: 0, bp: backlogByTeam.get(k), bpc: 0 });
    });
    doneRows.sort((a, b) => (b.fc + b.bpc) - (a.fc + a.bpc));
    const sumOf = k => doneRows.reduce((a, x) => a + x[k], 0);
    const totAdd = sumOf('add');
    const fcDoneExcl = sumOf('fc');                 /* ปิดจริง ไม่รวม Backlog */
    const backlogPend = sumOf('bp');
    const backlogClosable = sumOf('bpc');
    const fcDoneIncl = fcDoneExcl + backlogClosable; /* ปิดจริง รวม Backlog */
    const maxDoneFc = Math.max.apply(null, doneRows.map(x => Math.max(x.fc + x.bpc, x.fc)).concat([1]));

    let doneTbl = '<div style="margin-bottom:8px;font-size:11.5px;color:#667085;line-height:1.5">' +
      'Done ถึงวันนี้ <b>' + num(nDone) + '</b> ใบ · อัตราปิด <b>' + (closeRate * 100).toFixed(0) +
      '%</b> · อีก ' + left + ' วันคาดปิดเพิ่ม <b>+' + num(totAdd) + '</b> ใบ<br>' +
      'Backlog ค้างเดือนก่อนที่ยัง Pending <b>' + num(backlogPend) + '</b> ใบ → คาดปิดทัน <b>' + num(backlogClosable) + '</b> ใบ</div>';
    doneTbl += '<div class="tbl"><table class="pbi"><thead><tr>' +
      '<th>ทีมขาย</th><th class="num">SO</th><th class="num">Done</th><th class="num">Pending</th>' +
      '<th class="num">อัตราปิด</th><th class="num">Backlog ค้าง</th><th class="num">คาดปิดสิ้นเดือน</th>' +
      '</tr></thead><tbody>';
    doneRows.forEach(x => {
      doneTbl += '<tr><td>' + esc(stripNum(x.name)) + '</td>' +
        '<td class="num">' + num(x.so) + '</td>' +
        '<td class="num c-done">' + num(x.d) + '</td>' +
        '<td class="num c-pend">' + num(x.p) + '</td>' +
        '<td class="num">' + (x.r * 100).toFixed(0) + '%</td>' +
        '<td class="num">' + num(x.bp) + '</td>' +
        '<td><div class="tbcell"><span class="tbar"><i style="width:' + (x.fc + x.bpc) / maxDoneFc * 100 + '%;background:linear-gradient(90deg,#12B76A,#6CE9A6)"></i></span><b>' + num(x.fc + x.bpc) + '</b></div></td></tr>';
    });
    doneTbl += '<tr class="grand"><td>Total</td>' +
      '<td class="num">' + num(so) + '</td>' +
      '<td class="num">' + num(nDone) + '</td>' +
      '<td class="num">' + num(nPend) + '</td>' +
      '<td class="num">' + (closeRate * 100).toFixed(0) + '%</td>' +
      '<td class="num">' + num(backlogPend) + '</td>' +
      '<td class="num total">' + num(fcDoneIncl) + '</td></tr>';
    doneTbl += '</tbody></table></div>';

    const pctOfMonth = Math.round(elapsed / dim * 100);

    let h = pgHead('End of Mth', rs);
    h += '<div class="g">';
    h += '<div class="kpirow">';
    h += kpiCard(3, 'ประมาณการ SO สิ้นเดือน', num(fcSo), C.violet,
      'ถึงวันนี้ ' + num(so) + ' ใบ · อีก ' + left + ' วัน +' + num(Math.max(fcSo - so, 0)));
    h += kpiCard(3, 'ประมาณการ Revenue', baht(fcRev), C.orange, 'เดือนก่อน ' + baht(prevRev));
    h += kpiCard(3, 'คาดปิดจริง · ไม่รวม Backlog', num(fcDoneExcl), C.green,
      'Done ' + num(nDone) + ' + คาดปิดเพิ่ม ' + num(totAdd));
    h += kpiCard(3, 'คาดปิดจริง · รวม Backlog', num(fcDoneIncl), C.teal,
      'บวกงานค้างที่คาดปิดทัน +' + num(backlogClosable) + ' จาก ' + num(backlogPend));
    h += '</div>';
    h += card(12, 'SO รายวัน แยกสถานะ · แท่งลาย = ประมาณการวันเหลือ',
      '<div class="fc" style="margin-bottom:10px">' +
      '<div><div class="big">' + num(fcSo) + '</div><small>ประมาณการสิ้นเดือน</small></div>' +
      '<div class="track"><i style="width:' + pctOfMonth + '%"></i><u style="left:' + pctOfMonth + '%"></u></div>' +
      '<small>จริง ' + num(so) + ' ใบ · ผ่านไป ' + elapsed + '/' + dim + ' วัน (' + pctOfMonth + '%) · เฉลี่ย ' + rateSo.toFixed(1) + ' ใบ/วัน</small>' +
      '</div>' + estBars(labels, { done: doneD, pend: pendD, canc: cancD, proj: projD }), { hint: 'คลิกแท่งเพื่อกรองวัน' });
    h += card(12, 'คาดปิดจริง ณ สิ้นเดือน · แยกทีมขาย',
      doneTbl + fold('ประมาณการ SO ต่อทีม · เทียบเดือนก่อน', teamTbl),
      { hint: 'อัตราปิด = Done ÷ (Done + Pending) · คาดปิดสิ้นเดือนรวมงานค้างที่คาดว่าจะปิดทัน' });
    h += card(12, 'แผนงานตามกลุ่มสินค้า',
      planTbl + fold('ข้อมูลเชิงลึก (จอง · ยกมา · Backlog เก่า)', planDeep), { hint: 'กด “ข้อมูลเชิงลึก” เมื่อต้องการดูรายละเอียด' });
    h += card(12, 'อัตราและสมมติฐานที่ใช้คำนวณ', fold('นิยามคอลัมน์ทั้งหมด',
      '<ul class="note">' +
      '<li><b>จอง</b> = งานที่ยังไม่ปิด (2.Pending + 3.Cancel) ในเดือนนี้</li>' +
      '<li><b>รวม backlog</b> = ยอดจองคงค้างของเดือนนี้</li>' +
      '<li><b>ยกมาจากก่อน</b> = งานที่ยังไม่ปิดและเปิด SO ก่อนเดือนนี้</li>' +
      '<li><b>เดือนก่อนยกมา</b> = งานที่ยังไม่ปิดและเปิด SO ในเดือนก่อน</li>' +
      '<li><b>Done เดือนก่อน·ติดเดือนนี้</b> = ปิดงานเดือนก่อน แต่วันติดตั้งอยู่ในเดือนนี้</li>' +
      '<li><b>Backlog &lt;1Jan26</b> = งานค้างที่เปิด SO ก่อน 1 ม.ค. 2026</li>' +
      '<li><b>Total</b> = จำนวน SO ทั้งหมดของกลุ่มในเดือนนี้ · <b>Unit</b> = จำนวนเครื่อง</li>' +
      '<li><b>คาดติดได้เดือนนี้</b> = ติดตั้งแล้ว ÷ วันที่ผ่านไป × วันในเดือน</li>' +
      '<li><b>อัตราปิด</b> = 1.Done ÷ (1.Done + 2.Pending) ของเดือนนี้</li>' +
      '<li><b>คาดปิดจริง · ไม่รวม Backlog</b> = Done ถึงวันนี้ + (Pending เดือนนี้ × อัตราปิด) + (SO ที่คาดว่าจะเข้ามาอีก × อัตราปิด) — <i>นับเฉพาะงานที่เปิด SO ในเดือนนี้</i></li>' +
      '<li><b>คาดปิดจริง · รวม Backlog</b> = ค่าข้างต้น + (งานค้างเดือนก่อนที่ยัง 2.Pending × อัตราปิด)</li>' +
      '</ul>'));
    return h + '</div>';
  }

          /* ══════════════════════════════════════════════════════════════════════
     Monitor Consult — เฉพาะงาน “เครื่องซักผ้า 13/17 กก.” (ข้อมูลจาก ListBooking)
     + Cross-sell: ลูกค้าซื้อกี่กลุ่มสินค้า / คู่สินค้าที่ซื้อร่วม / ลิสต์โอกาส
     ══════════════════════════════════════════════════════════════════════ */
  /* ขอบเขต: เครื่องซักผ้า LG Stack 13/17 Kg & ซัก/อบ เดี่ยว 13/17 Kg (ไม่รวมเครื่องซักผ้าฝาบน) */
  const isFrontLoad = d => {
    const p = String(d.product || '');
    if (/ฝาบน/.test(p)) return false;
    return /13|17/.test(p);
  };
  function prodCatOf(p) {
    const s = String(p || '');
    if (/Stack|ซ้อน/i.test(s)) return 'Stack (ซัก+อบ)';
    if (/อบ/i.test(s)) return 'อบผ้า';
    if (/ซัก/i.test(s)) return 'ซักผ้า';
    if (/กาแฟ/i.test(s)) return 'กาแฟ';
    if (/น้ำ/i.test(s)) return 'ตู้น้ำ';
    if (/Snack|ขนม/i.test(s)) return 'Snack';
    return 'อื่น ๆ';
  }
  const sizeOfRev = v => v > 1000000 ? 'L' : v > 500000 ? 'M' : v > 300000 ? 'S' : v > 100000 ? 'SS' : '-';

  const ACK_KEY = 'bi.monAck';
  function loadAck() {
    try { const o = JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  }
  function ackList(mth) { const o = loadAck(); return Array.isArray(o[mth]) ? o[mth] : []; }
  function toggleAck(mth, so) {
    const o = loadAck();
    const arr = Array.isArray(o[mth]) ? o[mth].slice() : [];
    const i = arr.indexOf(so);
    if (i >= 0) arr.splice(i, 1); else arr.push(so);
    o[mth] = arr;
    try { localStorage.setItem(ACK_KEY, JSON.stringify(o)); } catch (e) {}
    return i < 0;
  }

  function consultReal(data) {
    const rows = (data || []).filter(isFrontLoad);          /* งานซักผ้า 13/17 กก. ในเดือน/ตัวกรองที่เลือก */
    const all = S.data || [];
    const now = new Date();
    const nums = a => a.filter(v => typeof v === 'number' && isFinite(v));
    const avgOf = a => { const x = nums(a); return x.length ? x.reduce((p, c) => p + c, 0) / x.length : 0; };
    const dOnly = v => (v instanceof Date && !isNaN(v)) ? v : null;
    const days = (a, b) => Math.max(0, Math.round((b - a) / 86400000));

    /* ── งานค้าง (บอร์ดตามงาน) ── */
    const pend = rows.filter(d => d.status3 === '2.Pending' && dOnly(d.dateSO))
      .map(d => ({ d: d, age: days(dOnly(d.dateSO), now) }))
      .sort((a, b) => b.age - a.age);
    const pendVal = pend.reduce((a, x) => a + (x.d.revenue || 0), 0);
    const old21 = pend.filter(x => x.age > 21).length;

    /* ── มัดจำ ── */
    const openJobs = rows.filter(d => d.status3 !== '3.Cancel');
    const depOk = d => {
      const s = String(d.depositStatus || '').trim();
      return (/เรียบร้อย/.test(s) && !/ไม่/.test(s)) || (d.paidAmount || 0) > 0;
    };
    const depWait = openJobs.filter(d => !depOk(d));
    const depWaitVal = depWait.reduce((a, d) => a + (d.revenue || 0), 0);
    const paidSum = openJobs.reduce((a, d) => a + (d.paidAmount || 0), 0);

    /* ── ส่งของ ── */
    const SHIP_DONE = /จัดส่ง|ได้รับแล้ว/;
    const SHIP_MID = /รอตรวจสอบ|รอนัดลูกค้า|นัดลูกค้าแล้ว|ลูกค้าไม่พร้อม/;
    const shipDone = openJobs.filter(d => SHIP_DONE.test(String(d.shipStatus || ''))).length;
    const shipMid = openJobs.filter(d => SHIP_MID.test(String(d.shipStatus || ''))).length;
    const shipNone = openJobs.filter(d => !String(d.shipStatus || '').trim()).length;
    const shipOpen = openJobs.length - shipDone;                       /* ยังไม่ส่ง = งานเปิดทั้งหมด − ส่งแล้ว */
    const shipOther = Math.max(0, openJobs.length - shipDone - shipMid - shipNone);

    /* ── Consult ── */
    const cOpen = rows.filter(d => dOnly(d.consultStart) && !dOnly(d.consultEnd));
    const cAll = rows.filter(d => dOnly(d.consultStart));
    const cDays = cOpen.map(d => days(dOnly(d.consultStart), now));
    const cAvg = cDays.length ? cDays.reduce((a, b) => a + b, 0) / cDays.length : 0;

    /* ── SLA ปิดงาน ── */
    const closed = rows.filter(d => (d.status3 === '1.Done' || d.status3 === '3.Cancel') && typeof d.slaClose === 'number' && d.slaClose > 0);
    const sc = closed.map(d => d.slaClose);
    const scAvg = avgOf(sc);
    const overPct = sc.length ? (sc.filter(v => v > 15).length / sc.length * 100) : 0;

    /* ── CROSS-SELL: ประวัติการซื้อทั้งหมดของลูกค้าที่เคยซื้อเครื่องซักผ้า 13/17 กก. ── */
    const hist = new Map();     /* customer -> { cats:Set, rev, so, team, sales, prov, last } */
    all.forEach(d => {
      const c = String(d.customer || '').trim();
      if (!c) return;
      const o = hist.get(c) || { cats: new Set(), rev: 0, so: 0, team: '', sales: '', prov: '', front: false, last: null };
      o.cats.add(prodCatOf(d.product));
      o.rev += d.revenue || 0;
      o.so += 1;
      if (isFrontLoad(d)) o.front = true;
      o.team = o.team || d.team;
      o.sales = o.sales || d.salesperson;
      o.prov = o.prov || d.province;
      if (d.status3 === '2.Pending') o.last = d;
      hist.set(c, o);
    });
    const frontCust = [...hist.entries()].filter(e => e[1].front);
    const csTotal = frontCust.length;
    const csMulti = frontCust.filter(e => e[1].cats.size > 1).length;
    const csPct = csTotal ? csMulti / csTotal * 100 : 0;

    /* คู่สินค้าที่ซื้อร่วม */
    const pair = {};
    frontCust.forEach(e => {
      const a = [...e[1].cats].sort();
      if (a.length < 2) return;
      for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) {
        const key = a[x] + ' + ' + a[y];
        pair[key] = (pair[key] || 0) + 1;
      }
    });
    const pairTop = Object.entries(pair).sort((a, b) => b[1] - a[1]).slice(0, 6);

    /* ลิสต์โอกาส: ลูกค้าที่ซื้อกลุ่มเดียว แต่ยอดสะสม >= 300k */
    const opp = frontCust.filter(e => e[1].cats.size === 1 && e[1].rev >= 300000)
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 12);

    /* ── บอร์ดการ์ดงาน ── */
    const LV = x => x.age > 21 ? { c: '#E11D48', b: 'background:#FFF1F3;color:#BE123C' }
      : x.age > 15 ? { c: '#F59E0B', b: 'background:#FFF8EB;color:#B45309' }
      : { c: '#0EA5E9', b: 'background:#F0F9FF;color:#0369A1' };
    const depTxt = d => depOk(d)
      ? '<b style="color:#047857">จ่ายแล้ว ' + (d.paidAmount ? baht(d.paidAmount) : '') + '</b>'
      : '<b style="color:#B45309">ยังไม่จ่าย</b>';
    const shipTxt = d => {
      const s = String(d.shipStatus || '').trim();
      if (!s) return '<b style="color:#98A2B3">ยังไม่ถึงขั้น</b>';
      const col = SHIP_DONE.test(s) ? '#047857' : SHIP_MID.test(s) ? '#B45309' : '#0F172A';
      return '<b style="color:' + col + '">' + esc(s) + '</b>';
    };
    const conTxt = d => {
      const st = String(d.consultStatus || '').trim();
      if (!st) return '<b style="color:#98A2B3">ยังไม่เปิด Consult</b>';
      const open = dOnly(d.consultStart) && !dOnly(d.consultEnd);
      return '<b style="color:' + (open ? '#B45309' : '#047857') + '">' + esc(st) +
        (dOnly(d.consultStart) ? ' · ' + days(dOnly(d.consultStart), now) + ' วัน' : '') + '</b>';
    };
    const ackSet = new Set(ackList(String(S.period || '')));
    const board = pend.length ? pend.slice(0, 15).map(x => {
      const v = LV(x);
      const acked = ackSet.has(String(x.d.so || ''));
      if (acked) v.c = '#059669';
      return '<div class="mon-fu" style="border:1px solid #E4E9F0;border-left:4px solid ' + v.c +
        ';border-radius:12px;padding:11px 13px;background:' + (acked ? '#F7FCF9' : '#fff') + ';' +
        (acked ? 'opacity:.85;' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
          '<span style="font-weight:800;font-size:13px;letter-spacing:-.2px">' +
            esc(String(x.d.so || '').slice(0, 14) + ' · ' + String(x.d.customer || '-').slice(0, 26)) + '</span>' +
          '<span style="display:inline-flex;align-items:center;height:21px;padding:0 9px;border-radius:99px;font-size:10.8px;font-weight:800;' + v.b + '">ค้าง ' + x.age + ' วัน</span>' +
          '<span style="font-size:11.5px;color:#475569">' + esc(stripNum(x.d.team || '-')) + ' · ' + esc(String(x.d.salesperson || '-').slice(0, 16)) + '</span>' +
          (acked
            ? '<span style="display:inline-flex;align-items:center;height:21px;padding:0 9px;border-radius:99px;font-size:10.8px;font-weight:800;background:#ECFDF5;color:#047857">✓ ตามแล้ว</span>'
            : '') +
          '<span style="margin-left:auto"><button class="btn mon-ack" data-so="' + esc(String(x.d.so || '')) + '" style="height:26px;padding:0 10px;border-radius:8px;border:1px solid ' +
            (acked ? '#A7F3D0;background:#ECFDF5;color:#047857' : '#E4E9F0;background:#fff;color:#475569') +
            ';font:inherit;font-size:11px;font-weight:700;cursor:pointer">' + (acked ? 'ยกเลิก' : 'ตามแล้ว') + '</button></span>' +
        '</div>' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:11.8px;color:#475569">' +
          '<span>มัดจำ ' + depTxt(x.d) + '</span>' +
          '<span>ส่งของ ' + shipTxt(x.d) + '</span>' +
          '<span>Consult ' + conTxt(x.d) + '</span>' +
          '<span>มูลค่า <b style="color:#0F172A">' + baht(x.d.revenue || 0) + '</b></span>' +
        '</div></div>';
    }).join('') : empty('ไม่มีงานค้างในเงื่อนไขนี้');

    /* ── rail ── */
    const teamCnt = new Map();
    pend.forEach(x => { const k2 = stripNum(x.d.team || '(ไม่ระบุ)'); teamCnt.set(k2, (teamCnt.get(k2) || 0) + 1); });
    const teamTop = [...teamCnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const bullets = [
      'ต้องตาม <b>' + num(pend.length) + ' งาน</b> มูลค่า <b>' + baht(pendVal) + '</b>',
      'ค้างเกิน 21 วัน <b>' + num(old21) + ' งาน</b>' + (teamTop.length ? ' · ทีมที่มากสุด <b>' + esc(teamTop[0][0]) + '</b>' : ''),
      'มัดจำยังไม่จ่าย <b>' + num(depWait.length) + ' ใบ</b> · มูลค่า <b>' + baht(depWaitVal) + '</b>',
      'ยังไม่ส่งของ <b>' + num(shipOpen) + ' ใบ</b> · ส่งแล้ว <b>' + num(shipDone) + '</b> · รอส่ง <b>' + num(shipMid) + '</b> · ยังไม่ถึงขั้น <b>' + num(shipNone) + '</b>',
      'Cross-sell: ลูกค้า <b>' + num(csTotal) + '</b> ราย ซื้อหลายกลุ่มแค่ <b>' + num(csMulti) + '</b> (' + csPct.toFixed(1) + '%)',
      'SLA ปิดงานเฉลี่ย <b>' + scAvg.toFixed(1) + ' วัน</b> (เป้า 15) · เกินกำหนด <b>' + overPct.toFixed(0) + '%</b>'
    ];
    const railSum = '<div style="display:flex;flex-direction:column;gap:9px">' + bullets.map((x, i2) =>
      '<div style="display:flex;gap:9px;font-size:11.9px;color:#475569;line-height:1.55">' +
      '<span style="flex:0 0 auto;width:20px;height:20px;border-radius:7px;background:#EEF0FF;color:#4F46E5;' +
      'font-weight:800;font-size:10.5px;display:grid;place-items:center">' + (i2 + 1) + '</span><span>' + x + '</span></div>').join('') + '</div>';

    const slas = [['พื้นที่พร้อมติดตั้ง — รวมทั้งหมด', '15 วัน'], ['พื้นที่ไม่พร้อมติดตั้ง — รวมทั้งหมด', '14–21 วัน'],
      ['Admin ตรวจสอบ', '0 วัน'], ['ตรวจสอบเครดิต', '12 ชม.'], ['แจ้งงานทีมช่าง', '1–2 วัน'],
      ['สั่งของ / จัดส่ง', '21 วัน'], ['ติดตั้งงาน', '5 วัน']];
    const railSla = '<div style="display:flex;flex-direction:column;gap:2px">' + slas.map(s =>
      '<div style="display:flex;justify-content:space-between;font-size:11.6px;color:#475569;padding:4px 0"><span>' + esc(s[0]) + '</span><b>' + s[1] + '</b></div>').join('') + '</div>';

    const maxT = teamTop.length ? teamTop[0][1] : 1;
    const railTeam = teamTop.length ? teamTop.map((x, i2) =>
      '<div style="display:flex;justify-content:space-between;font-size:11.6px;color:#475569;padding:4px 0"><span>' + esc(x[0]) + '</span><b>' + num(x[1]) + ' งาน</b></div>' +
      '<div style="height:5px;border-radius:99px;background:#EDF0F5;overflow:hidden"><i style="display:block;height:100%;border-radius:99px;width:' +
      (x[1] / maxT * 100).toFixed(0) + '%;background:' + (i2 === 0 ? 'linear-gradient(90deg,#F97066,#FDA29B)' : i2 < 3 ? 'linear-gradient(90deg,#FDB022,#FEC84B)' : 'linear-gradient(90deg,#98A2B3,#D0D5DD)') + '"></i></div>').join('')
      : '<div style="font-size:11.6px;color:#98A2B3">ไม่มีงานค้าง</div>';

    const inner =
      '<div class="mon-2col">' +
        '<div><div style="display:flex;align-items:center;gap:8px;margin:0 0 9px;flex-wrap:wrap">' +
          '<b style="font-size:13px">สิ่งที่ผมต้องตามทีม</b>' +
          '<span style="font-size:10.5px;font-weight:800;color:#fff;background:#E11D48;border-radius:99px;padding:2px 8px">' + num(pend.length) + '</span>' +
          (ackSet.size ? '<span style="font-size:10.5px;font-weight:800;color:#047857;background:#ECFDF5;border-radius:99px;padding:2px 8px">✓ ตามแล้ว ' + num(ackSet.size) + '</span>' : '') +
          '<span style="margin-left:auto;font-size:11px;color:#98A2B3">เรียงตามอายุงานมากสุด · กด “ตามแล้ว” = ติ๊กคงอยู่ถึงสิ้นเดือน</span>' +
          (ackSet.size ? '<button id="monAckClear" class="btn" style="height:24px;padding:0 9px;border-radius:7px;border:1px solid #E4E9F0;background:#fff;color:#64748B;font:inherit;font-size:10.8px;font-weight:700;cursor:pointer">↺ ล้างติ๊กเดือนนี้</button>' : '') +
          '</div>' +
          '<div id="monBoard" style="display:flex;flex-direction:column;gap:9px;max-height:600px;overflow:auto;padding-right:2px">' + board +
            (pend.length > 15 ? '<div style="font-size:11px;color:#98A2B3;text-align:center;padding:6px 0">แสดง 15 จาก ' + num(pend.length) + ' งาน (เรียงตามอายุงานมากสุด)</div>' : '') +
            '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' +
          '<div style="border:1px solid #E4E9F0;border-radius:12px;overflow:hidden">' +
            '<div style="padding:9px 12px;border-bottom:1px solid #EEF2F7;font-weight:800;font-size:12px">📌 สรุป 1 นาที (สำหรับหัวหน้า)</div>' +
            '<div style="padding:11px 12px">' + railSum + '</div></div>' +
          '<div style="border:1px solid #E4E9F0;border-radius:12px;overflow:hidden">' +
            '<div style="padding:9px 12px;border-bottom:1px solid #EEF2F7;font-weight:800;font-size:12px">⏱ SLA ที่ใช้ตัดสิน</div>' +
            '<div style="padding:9px 12px">' + railSla + '</div></div>' +
          '<div style="border:1px solid #E4E9F0;border-radius:12px;overflow:hidden">' +
            '<div style="padding:9px 12px;border-bottom:1px solid #EEF2F7;font-weight:800;font-size:12px">👥 ทีมที่ต้องตามมากสุด</div>' +
            '<div style="padding:9px 12px">' + railTeam + '</div></div>' +
        '</div>' +
      '</div>';

    /* ── การ์ด Cross-sell ── */
    const maxPair = pairTop.length ? pairTop[0][1] : 1;
    const pairHtml = pairTop.length ? pairTop.map(p =>
      '<div style="display:flex;justify-content:space-between;font-size:11.6px;color:#475569;padding:5px 0"><span>' + esc(p[0]) + '</span><b>' + num(p[1]) + ' ราย</b></div>' +
      '<div style="height:6px;border-radius:99px;background:#EDF0F5;overflow:hidden"><i style="display:block;height:100%;border-radius:99px;width:' +
      (p[1] / maxPair * 100).toFixed(0) + '%;background:linear-gradient(90deg,#7EA6FF,#118DFF)"></i></div>').join('')
      : '<div style="font-size:11.6px;color:#98A2B3">ยังไม่มีลูกค้าที่ซื้อหลายกลุ่ม</div>';

    let oppTbl = opp.length
      ? '<div class="cs-tbl"><div class="tbl"><table class="pbi"><thead><tr><th>ลูกค้า</th><th>กลุ่มที่ซื้อ</th><th>จังหวัด</th>' +
        '<th class="num">ยอดสะสม</th><th>ขนาด</th><th>ทีม · เซลล์</th></tr></thead><tbody>' +
        opp.map(e => '<tr><td>' + esc(String(e[0]).slice(0, 30)) + '</td>' +
          '<td>' + esc([...e[1].cats][0]) + '</td>' +
          '<td>' + esc(String(e[1].prov || '-').slice(0, 14)) + '</td>' +
          '<td class="num">' + baht(e[1].rev) + '</td>' +
          '<td><b>' + sizeOfRev(e[1].rev) + '</b></td>' +
          '<td>' + esc(stripNum(e[1].team || '-')) + ' · ' + esc(String(e[1].sales || '-').slice(0, 14)) + '</td></tr>').join('') +
        '</tbody></table></div></div>'
      : empty('ไม่มีลูกค้าที่เข้าเงื่อนไข');
    /* มือถือ: แสดงเป็นการ์ดแนวตั้งแทนตาราง (ไม่ต้องปัด sideways) */
    const oppCards = opp.length
      ? '<div class="cs-list">' + opp.map(e =>
          '<div class="cs-item">' +
            '<div class="cs-h"><b>' + esc(String(e[0]).slice(0, 34)) + '</b>' +
              '<span class="cs-badge">' + esc(sizeOfRev(e[1].rev)) + '</span></div>' +
            '<div class="cs-amt">' + baht(e[1].rev) + '</div>' +
            '<div class="cs-meta">' + esc([...e[1].cats][0]) + ' · ' + esc(String(e[1].prov || '-').slice(0, 16)) + '</div>' +
            '<div class="cs-meta">' + esc(stripNum(e[1].team || '-')) + ' · ' + esc(String(e[1].sales || '-').slice(0, 16)) + '</div>' +
          '</div>').join('') + '</div>'
      : '';

    const csCard = card(12, 'โอกาส Cross-sell · เฉพาะลูกค้าที่เคยซื้อเครื่องซักผ้า LG Stack 13/17 Kg & ซัก/อบ เดี่ยว 13/17 Kg',
      '<div class="mon-2col" style="grid-template-columns:minmax(0,1fr) minmax(0,1.9fr)">' +
        '<div><div style="font-size:11.5px;color:#667085;margin-bottom:6px">คู่สินค้าที่ลูกค้าซื้อร่วม</div>' + pairHtml + '</div>' +
        '<div><div style="font-size:11.5px;color:#667085;margin-bottom:6px">ลูกค้าที่ซื้อกลุ่มเดียว แต่ยอดสะสม ≥ ฿300,000 (' + num(frontCust.filter(e => e[1].cats.size === 1 && e[1].rev >= 300000).length) + ' ราย)</div>' + oppTbl + oppCards + '</div>' +
      '</div>',
      { hint: 'ซื้อหลายกลุ่ม ' + num(csMulti) + ' / ' + num(csTotal) + ' ราย (' + csPct.toFixed(1) + '%)' });

    return kpiCard(3, 'ต้องตามวันนี้', num(pend.length) + ' งาน', C.red, 'มูลค่า ' + baht(pendVal)) +
      kpiCard(3, 'มัดจำยังไม่จ่าย', num(depWait.length) + ' ใบ', depWait.length ? C.gold : C.green,
        'จ่ายแล้ว ' + baht(paidSum) + ' · ค้าง ' + baht(depWaitVal)) +
      kpiCard(3, 'ยังไม่ส่งของ', num(shipOpen) + ' ใบ', shipOpen ? C.orange : C.green,
        'ส่งแล้ว ' + num(shipDone) + ' · รอส่ง ' + num(shipMid) +
        (shipNone ? ' · ยังไม่ถึงขั้น ' + num(shipNone) : '') +
        (shipOther ? ' · อื่น ๆ ' + num(shipOther) : '')) +
      kpiCard(3, 'Cross-sell', csPct.toFixed(1) + ' %', csPct >= 20 ? C.green : C.gold,
        'ซื้อหลายกลุ่ม ' + num(csMulti) + ' จาก ' + num(csTotal) + ' ราย (สะสมทุกเดือน)') +
      card(12, '', inner, { hint: '' }) +
      csCard +
      defCard(
        '<ul class="note">' +
        '<li><b>ขอบเขตสินค้า</b> = เครื่องซักผ้า LG Stack 13/17 Kg &amp; ซัก/อบ เดี่ยว 13/17 Kg (ไม่รวมเครื่องซักผ้าฝาบน) · ที่มา ListBooking</li>' +
        '<li><b>ต้องตามวันนี้</b> = งานสถานะ 2.Pending ของกลุ่มนี้ในเดือนที่เลือก · <b>อายุงาน</b> = วันนี้ − วันที่เปิด SO · สีขอบการ์ด: แดง &gt; 21 วัน · เหลือง &gt; 15 วัน · ฟ้า = ปกติ</li>' +
        '<li><b>มัดจำยังไม่จ่าย</b> = งานที่ยังไม่ Cancel และยังไม่มีสถานะมัดจำ “เรียบร้อย” และยังไม่มียอดจ่าย · “ค้าง” = มูลค่างานเหล่านั้น</li>' +
        '<li><b>ยังไม่ส่งของ</b> = งานเปิดทั้งหมด − งานที่สถานะส่งของขึ้น “จัดส่ง / ได้รับแล้ว” · แยกเป็น รอส่ง (รอตรวจสอบ·รอนัดลูกค้า) / ยังไม่ถึงขั้น (ยังไม่มีสถานะ)</li>' +
        '<li><b>Cross-sell</b> = สัดส่วนลูกค้าที่เคยซื้อ ≥ 2 กลุ่มสินค้า จากลูกค้าที่เคยซื้อในกลุ่มนี้ · คิดสะสมทุกเดือน (ไม่ขึ้นกับเดือนที่เลือก)</li>' +
        '<li><b>SLA ปิดงาน</b> = วันที่ปิดงาน − วันที่เปิด SO (เฉพาะ 1.Done / 3.Cancel) · เป้า ≤ 15 วัน</li>' +
        '<li><b>ปุ่ม “ตามแล้ว”</b> = ติ๊กเก็บไว้ในเบราว์เซอร์นี้ แยกตามเดือน · กดซ้ำเพื่อยกเลิก · ไม่ลบงานออกจากบอร์ด</li>' +
        '</ul>');
  }

  function pageGeneric(name, rs) {
    const sp = SPECS[name] || { dim: 'team', dim2: 'status3', metric: 'count', title: name };
    const pick = rws => (sp.filter ? rws.filter(sp.filter) : rws);
    const data = pick(rs);
    const dataX = pick(rows(sp.dim));      /* คงทุกหมวดของตัวเองไว้ เพื่อคลิกหลายค่าได้ */
    const valOf = d => sp.metric === 'revenue' ? (d.revenue || 0) : sp.metric === 'units' ? (d.units || 0) : 1;
    const fmt = sp.metric === 'revenue' ? baht : num;

    const labelOf = d => {
      if (sp.dim === 'monthLabel') return d.mth ? String(d.mth).slice(4) + '/' + String(d.mth).slice(0, 4) : '(ว่าง)';
      if (sp.dim === 'dayLabel') return d.dateSO ? String(d.dateSO.getDate()) : '(ว่าง)';
      const v = d[sp.dim];
      return v == null || v === '' ? '(ว่าง)' : String(v);
    };
    const label2Of = d => {
      if (sp.dim2 === 'monthLabel') return d.mth ? String(d.mth).slice(4) + '/' + String(d.mth).slice(0, 4) : '(ว่าง)';
      const v = d[sp.dim2];
      return v == null || v === '' ? '(ว่าง)' : String(v);
    };

    const rev = data.reduce((a, d) => a + (d.revenue || 0), 0);
    const units = data.reduce((a, d) => a + (d.units || 0), 0);
    const soCount = new Set(data.map(d => String(d.so))).size;

    const g = new Map();
    dataX.forEach(d => { const k = labelOf(d); g.set(k, (g.get(k) || 0) + valOf(d)); });
    let bars = [...g.entries()].map(e => ({ label: e[0], value: e[1] }));
    const isTime = sp.dim === 'dayLabel' || sp.dim === 'monthLabel';
    if (isTime) bars.sort((a, b) => (parseFloat(a.label) || 0) - (parseFloat(b.label) || 0));
    else bars.sort((a, b) => b.value - a.value);

    const chart = isTime
      ? colsChart(bars.map(b => ({
        label: b.label,
        value: b.value,
        xv: sp.dim === 'monthLabel' ? b.label.slice(3) + b.label.slice(0, 2) : b.label
      })), { field: sp.dim })
      : hbars(bars.slice(0, 12), fmt, { field: sp.dim, pct: sp.metric === 'revenue' ? rev : sp.metric === 'units' ? units : data.length });
    const dTop = bars.slice(0, 7);
    const dRest = bars.slice(7).reduce((a, b) => a + b.value, 0);
    const dData = dRest > 0 ? dTop.concat([{ label: 'อื่น ๆ (' + (bars.length - 7) + ')', value: dRest }]) : dTop;
    const pv = matrix(data, labelOf, label2Of, valOf, fmt, { sortRows: isTime ? 0 : 1, maxRows: 12, maxCols: 8, rowTitle: FIELD_TH[sp.dim] || sp.dim, rowField: sp.dim, colField: sp.dim2 });
    const metricTxt = sp.metric === 'revenue' ? 'ราคาสุทธิ (บาท)' : sp.metric === 'units' ? 'จำนวนเครื่อง' : 'จำนวนงาน';
    const dimTh = FIELD_TH[sp.dim] || sp.dim;
    const dim2Th = FIELD_TH[sp.dim2] || sp.dim2;

    /* สถานะงาน × มิติหลัก */
    const stBy = new Map();
    data.forEach(d => {
      const k = labelOf(d);
      const o = stBy.get(k) || { d: 0, p: 0, c: 0 };
      if (d.status3 === '1.Done') o.d++;
      else if (d.status3 === '2.Pending') o.p++;
      else if (d.status3 === '3.Cancel') o.c++;
      stBy.set(k, o);
    });
    const stRows = [...stBy.entries()]
      .sort(isTime ? (a, b) => natCmp(a[0], b[0]) : (a, b) => (b[1].d + b[1].p + b[1].c) - (a[1].d + a[1].p + a[1].c))
      .slice(0, 10)
      .map(e => ({
        label: e[0], segs: [
          { name: 'Done', v: e[1].d, color: C.green },
          { name: 'Pending', v: e[1].p, color: C.gold },
          { name: 'Cancel', v: e[1].c, color: C.red }
        ]
      }));

    /* มิติเทียบ: Top 10 */
    const g2 = new Map();
    data.forEach(d => { const k = label2Of(d); g2.set(k, (g2.get(k) || 0) + valOf(d)); });
    const bars2 = [...g2.entries()].map(e => ({ label: e[0], value: e[1] }))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    const nD = data.filter(d => d.status3 === '1.Done').length;
    const nP = data.filter(d => d.status3 === '2.Pending').length;
    const nC = data.filter(d => d.status3 === '3.Cancel').length;
    const closeR = (nD + nP) ? nD / (nD + nP) : 0;
    const filterNote = { '2.Pending': 'เฉพาะงาน 2.Pending', '2.1.Pending-Detail': 'เฉพาะงาน 2.Pending',
      '3.Cancel': 'เฉพาะงาน 3.Cancel', '3.1.Cancel-Detail': 'เฉพาะงาน 3.Cancel' }[name] || 'ตามเงื่อนไขหน้านี้';

    /* ── Monitor Consult: เฉพาะงานเครื่องซักผ้า LG Stack 13/17 Kg & ซัก/อบ เดี่ยว 13/17 Kg ── */
    if (name === 'P3.Consult') {
      const scoped = data.filter(isFrontLoad);
      let hc = '<div class="pg-head"><h1>' + esc(pageLabel(name)) + '</h1>' +
        '<span class="sub">' + esc(S.period ? S.period.replace('-', ' · ') : 'ทุกเดือน') + ' · ' + num(scoped.length) + ' รายการ</span>' +
        '<span class="field-scope">เครื่องซักผ้า LG Stack 13/17 Kg &amp; ซัก/อบ เดี่ยว 13/17 Kg</span>' + xfChips() +
        '<span class="grow"></span>' +
        '<label class="fsel"><span>เดือน</span><select id="consultMth" class="pbi-select">' +
          periods().slice().reverse().map(p =>
            '<option value="' + p + '"' + (p === S.period ? ' selected' : '') + '>' + p.replace('-', ' · ') + '</option>').join('') +
        '</select></label></div>';
      return hc + '<div class="g">' + consultReal(data) + '</div>';
    }

    let h = pgHead(pageLabel(name), data);
    h += '<div class="g">';
    h += kpiCard(3, 'จำนวน SO', num(soCount), C.navy, 'ไม่นับซ้ำ');
    h += kpiCard(3, 'Revenue (ราคาสุทธิ)', baht(rev), C.orange, 'ตามสูตรในไฟล์');
    h += kpiCard(3, 'Unit (จำนวนเครื่อง)', num(units), C.teal, '= จำนวน Set');
    h += kpiCard(3, 'Done / Pending / Cancel', num(nD) + ' / ' + num(nP) + ' / ' + num(nC), C.violet,
      'อัตราปิดงาน ' + (closeR * 100).toFixed(0) + '% · รายการในหน้านี้ ' + num(data.length));
    h += card(8, sp.title + ' · ตาม ' + dimTh, chart, { hint: isTime ? 'รายแกนเวลา' : 'เรียงจากมากไปน้อย' });
    h += card(4, dimTh + ' · สัดส่วน', donut(dData, { field: sp.dim }));
    h += card(12, dimTh + ' × ' + dim2Th, pv, { hint: metricTxt });
    h += card(6, 'สถานะงาน × ' + dimTh, stRows.length ? '<div class="stk-wrap">' + stackedBars(stRows) + statusLegend() + '</div>' : empty(),
      { hint: 'จำนวน SO' });
    h += card(6, dim2Th + ' · Top 10', bars2.length ? hbars(bars2, fmt, { field: sp.dim2, pct: sp.metric === 'revenue' ? rev : sp.metric === 'units' ? units : data.length }) : empty(), { hint: metricTxt + ' · % ของทั้งหมด' });
    h += defCard(
      '<ul class="note">' +
      '<li><b>ตัววัดหลัก</b> = ' + metricTxt + ' · <b>มิติ</b> = ' + dimTh + ' × ' + dim2Th + '</li>' +
      '<li><b>Revenue</b> = IF(เงินสดว่าง, ราคาตั้ง, ราคาเงินสด) − ส่วนลด ÷ 1.07 (สูตรคอลัมน์ DW)</li>' +
      '<li><b>สถานะใบงาน3</b> = มีสัญญา → 1.Done · Check SV. Cancel → 3.Cancel · อื่น ๆ ตาม Master Stutus (D:F)</li>' +
      '<li><b>การกรองหน้านี้</b> = ' + esc(filterNote) + ' · คลิกแท่ง/แถว/ชิปได้หลายค่า และปุ่ม “ล้างทั้งหมด” เพื่อคืนค่า</li>' +
      '<li><b>ขอบเขตข้อมูล</b> = เฉพาะกลุ่มสินค้าหยอดเหรียญ ในเดือนที่เลือกด้านบน</li>' +
      '</ul>');
    return h + '</div>';
  }

  function pageSoon() {
    return pgHead('หน้านี้', []) + '<div class="g">' +
      card(12, '', '<div class="empty">หน้านี้ยังไม่ได้ทำในเวอร์ชันนี้</div>') + '</div>';
  }

  /* ---------- หน้าแรกเมื่อเครื่องนี้ยังไม่มีข้อมูล ---------- */
  function pageWelcome() {
    const vo = document.body.classList.contains('view-only');
    return pgHead('ยินดีต้อนรับ', []) + '<div class="g">' +
      card(12, '',
        '<div class="welcome">' +
        '<div class="w-ico">▤</div>' +
        '<h2>' + (vo ? 'ยังไม่มีข้อมูล' : 'เครื่อง/เบราว์เซอร์นี้ยังไม่มีข้อมูล') + '</h2>' +
        (vo
          ? '<p>ยังโหลดข้อมูลชุดล่าสุดไม่ได้ (สัญญาณหรือเน็ตอาจขาดช่วง)<br>' +
            '<span class="w-note">กดปุ่มด้านล่างเพื่อลองโหลดอีกครั้ง</span></p>' +
            '<button class="btn primary w-btn" id="welcomeReload">↻ ลองโหลดใหม่</button>'
          : '<p>ข้อมูลทั้งหมดถูกอ่านและเก็บไว้ในเบราว์เซอร์ของอุปกรณ์นั้น ๆ ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์<br>' +
            'ดังนั้นถ้าเปิดจากมือถือ/เครื่องอื่น ต้องกด Import ไฟล์ <b>*_ListBooking.xlsx</b> 1 ครั้งก่อน' +
            '<br><span class="w-note">ปุ่ม ✓ Save จำเฉพาะ “หน้าที่เปิดอยู่ + ตัวกรอง” ไม่ได้ส่งข้อมูลข้ามเครื่อง</span></p>' +
            '<button class="btn primary w-btn" id="welcomeImport">⇪ Import ListBooking</button>') +
        '</div>') + '</div>';
  }

  /* ---------- สร้างไฟล์ snapshot สำหรับฝังไปกับเว็บ (ใช้ตอน deploy) ---------- */
  window.__downloadSnapshot = function () {
    if (!S.data) return 'no data';
    const keep = S.data.filter(d => isKeepGroup(d.group));
    const payload = { ver: SCHEMA_VER, meta: S.meta, data: keep.map(ser) };
    const js = '/* snapshot ข้อมูลหยอดเหรียญสำหรับโหมดอ่านอย่างเดียว (สร้างอัตโนมัติ) */\nwindow.BI_SNAPSHOT = ' + JSON.stringify(payload) + ';\n';
    const blob = new Blob([js], { type: 'text/javascript;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data-snapshot.js';
    a.click();
    return 'rows=' + keep.length + ' bytes=' + js.length;
  };

  /* ---------- render ---------- */
  function render() {
    const rs = rows();
    const stage = document.querySelector('.pbi-stage');
    const prevY = stage ? stage.scrollTop : 0;
    renderFilterBar();
    const html = !S.data ? pageWelcome()
      : S.page === 'summary' ? pageSummary(rs)
      : S.page === 'overview' ? pageOverview(rs)
      : S.page === 'status' ? pageStatus(rs)
      : S.page === 'tat' ? pageTat(rs)
      : S.page === 'data' ? pageData(rs)
      : S.page === 'SML' ? pageSml(rs)
      : S.page === 'End of Mth' ? pageEstimate(rs)
      : S.page === '1.Unit / Revenue' ? pageUnitRevenue(rs)
      : S.page === '2.SO Order Status' ? pageOrderStatus(rs)
      : SPECS[S.page] ? pageGeneric(S.page, rs)
      : pageSoon();
    ['overview', 'status', 'tat', 'data', 'soon'].forEach(k => {
      const x = $('page-' + k);
      if (x) x.classList.remove('active');
    });
    const el = $('page-overview');
    el.innerHTML = html;
    el.classList.add('active');
    setActiveNav();
    if (S.keepScroll) { S.keepScroll = false; if (stage) stage.scrollTop = prevY; }
    else scrollTopPage();
    bind();
  }

  function bind() {
    const sel = $('periodSel');
    if (sel) sel.onchange = () => { S.period = sel.value; S.pageIdx = 0; S.keepScroll = true; render(); };
    const s = $('dataSearch');
    if (s) s.oninput = e => { const v = e.target.value; clearTimeout(s._t); s._t = setTimeout(() => { S.q = v; S.keepScroll = true; render(); }, 320); };
    const p = $('dataPrev'), n = $('dataNext');
    if (p) p.onclick = () => { S.pageIdx--; S.keepScroll = true; render(); };
    if (n) n.onclick = () => { S.pageIdx++; S.keepScroll = true; render(); };

    document.querySelectorAll('[data-xf]').forEach(el => {
      el.onclick = () => {
        const raw2 = el.getAttribute('data-xf') || '';
        const i = raw2.indexOf('|');
        if (i < 0) return;
        xfToggle(raw2.slice(0, i), raw2.slice(i + 1));   /* คลิกซ้ำ = ยกเลิก, คลิกหลายแท่ง = รวมหลายค่า */
        S.keepScroll = true;
        render();
      };
    });
    document.querySelectorAll('[data-xfc]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        delete S.xf[b.getAttribute('data-xfc')];
        S.keepScroll = true;
        render();
      };
    });
    const xa = $('xfClearAll');
    if (xa) xa.onclick = () => { S.xf = {}; S.keepScroll = true; render(); };

    document.querySelectorAll('input[data-f]').forEach(cb => {
      cb.onchange = () => {
        const f = cb.dataset.f;
        if (cb.checked) S.filter[f].add(cb.value); else S.filter[f].delete(cb.value);
        S.pageIdx = 0; S.keepScroll = true;
        render();
      };
    });
    document.querySelectorAll('[data-clear]').forEach(b => {
      b.onclick = e => { e.preventDefault(); S.filter[b.dataset.clear].clear(); S.keepScroll = true; render(); };
    });
    const rst = $('fReset');
    if (rst) rst.onclick = () => { S.filter.team.clear(); S.filter.channel.clear(); S.filter.group.clear(); S.keepScroll = true; render(); };

    /* Summary — เทียบเดือน (โหมด / เดือนที่เลือก) */
    document.querySelectorAll('#momMode button').forEach(b => {
      b.onclick = () => { S.momN = Number(b.dataset.mode) || 1; S.keepScroll = true; render(); };
    });
    const ms = $('momSel');
    if (ms) ms.onchange = () => { S.momMth = ms.value; S.keepScroll = true; render(); };
    const ms2 = $('momSel2');
    if (ms2) ms2.onchange = () => { S.momMth2 = ms2.value; S.keepScroll = true; render(); };
    /* Monitor Consult: เลือกเดือนบนหัวหน้าได้เอง */
    const cmSel = $('consultMth');
    if (cmSel) cmSel.onchange = () => { S.period = cmSel.value; S.pageIdx = 0; S.keepScroll = true; render(); };

    const wi = $('welcomeImport');
    if (wi) wi.onclick = () => { const f = $('fileInput'); if (f) f.click(); };
    const wr = $('welcomeReload');
    if (wr) wr.onclick = () => location.reload();
    /* Monitor Consult: “ตามแล้ว” = ติ๊กคงอยู่ (จำรายเดือน) กดซ้ำเพื่อยกเลิก · คงตำแหน่งเลื่อนไว้ */
    document.querySelectorAll('.mon-ack').forEach(b => {
      b.onclick = () => {
        const so = b.getAttribute('data-so');
        if (!so) return;
        const bd = $('monBoard');
        const sy = bd ? bd.scrollTop : 0;
        toggleAck(String(S.period || ''), so);
        S.keepScroll = true;
        render();
        const nb = $('monBoard');
        if (nb) nb.scrollTop = sy;
      };
    });
    /* ล้างรายการ “ตามแล้ว” ของเดือนนี้ */
    const ackClr = $('monAckClear');
    if (ackClr) ackClr.onclick = () => {
      const bd = $('monBoard');
      const sy = bd ? bd.scrollTop : 0;
      const o = loadAck();
      delete o[String(S.period || '')];
      try { localStorage.setItem(ACK_KEY, JSON.stringify(o)); } catch (e) {}
      S.keepScroll = true;
      render();
      const nb = $('monBoard');
      if (nb) nb.scrollTop = sy;
    };
  }

  const NAV_GROUPS = [
    { label: 'ภาพรวม', pages: ['Summary', 'Daily Admin', 'End of Mth', '1.Revenue', '1.Unit / Revenue', '1.Unit / Revenue New', 'Performance/TAT'] },
    { label: 'สถานะงาน', pages: ['Status (New)', 'Status (Back log)', '2.SO Order Status', '2.Pending', '2.1.Pending-Detail', '3.Cancel', '3.1.Cancel-Detail'] },
    { label: 'ขั้นตอนทำงาน', pages: ['P1.Sale/Admin', 'P2.Checker', 'P3.Consult', 'P4.Sale Scape', 'P5.Transport', 'P6.Technician', 'Report ติดตั้ง', 'Report สัญญา'] },
    { label: 'สินค้า & พื้นที่', pages: ['SML', 'Pack สด/ผ่อน', 'Map', 'Product end2end-Detail'] },
    { label: 'อื่น ๆ', pages: ['Aging (21 Day)', 'ยกเลิก / มัดจำ', 'วัน', 'All Job/Close'] }
  ];

  function pageKey(name) { return IMPLEMENTED[name] || name; }

  function buildNav() {
    /* เมนู "⋯ เพิ่มเติม" — หน้ารายงานของเว็บที่ไม่มีใน PBI */
    const list = $('moreList');
    if (list) {
      list.innerHTML = EXTRA_PAGES.map(p => {
        const k = pageKey(p);
        return '<button class="more-item' + (k === S.page ? ' active' : '') + '" data-page="' + esc(k) + '" title="' + esc(p) + '">' + esc(EXTRA_TITLE_OF(p)) + '</button>';
      }).join('');
      list.querySelectorAll('.more-item').forEach(b => {
        b.onclick = () => {
          S.page = b.dataset.page; S.pageIdx = 0;
          const d = $('morePages'); if (d) d.removeAttribute('open');
          render(); scrollTopPage();
        };
      });
    }
    const nav = $('pageNav');
    if (!nav) return;
    let n = 0;
    const head = '<div class="nav-head"><b>หน้า · ' + NAV_GROUPS.reduce((a, g) => a + g.pages.length, 0) +
      '</b><button class="nav-fold" id="navFold" title="พับ/กางเมนู">◀</button></div>';
    nav.innerHTML = head + NAV_GROUPS.map(g =>
      '<div class="nav-group"><h4>' + esc(g.label) + '</h4>' +
      g.pages.map(p => {
        n++;
        const k = pageKey(p);
        return '<button class="nav-item' + (k === S.page ? ' active' : '') + '" data-page="' + esc(k) + '" title="' + esc(p) + '">' +
          '<span class="ico">' + n + '</span><span class="lbl">' + esc(pageLabel(p)) + '</span></button>';
      }).join('') + '</div>'
    ).join('');
    nav.querySelectorAll('.nav-item').forEach(b => {
      b.onclick = () => { S.page = b.dataset.page; S.pageIdx = 0; render(); };
    });
    const fold = $('navFold');
    if (fold) fold.onclick = toggleNav;
  }

  /* ---------- ลำดับแท็บที่ผู้ใช้จัดเอง (จำไว้ใน localStorage) ---------- */
  const TAB_ORDER_KEY = 'bi.tabOrder';
  let TAB_EDIT = false;
  function loadTabOrder() {
    try { const a = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveTabOrder(arr) {
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(arr || [])); } catch (e) {}
  }
  /* คืนรายการแท็บตามลำดับที่บันทึกไว้ + หน้าที่เพิ่มใหม่ต่อท้าย */
  function orderedTabs() {
    const all = PBI_PAGES.map(n => ({ k: pageKey(n), n: n }));
    const keys = all.map(x => x.k);
    const saved = loadTabOrder().filter(k => keys.indexOf(k) >= 0 && keys.indexOf(k) === keys.lastIndexOf(k));
    const out = saved.map(k => all.find(x => x.k === k));
    all.forEach(x => { if (saved.indexOf(x.k) < 0) out.push(x); });
    return out;
  }
  function moveTab(i, dir) {
    const keys = orderedTabs().map(x => x.k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    saveTabOrder(keys);
    buildTabs();
  }

  function buildTabs() {
    const tabs = $('pageTabs');
    if (!tabs) return;
    const items = orderedTabs();
    const editOn = TAB_EDIT;
    tabs.innerHTML = items.map((it, i) =>
      '<button class="pbi-tab' + (it.k === S.page ? ' active' : '') + '" data-page="' + esc(it.k) + '">' +
      (editOn ? '<i class="tab-mv" data-mv="-1" data-i="' + i + '" title="เลื่อนไปทางซ้าย">◀</i>' : '') +
      '<span class="tab-tx">' + esc(pageLabel(it.n)) + '</span>' +
      (editOn ? '<i class="tab-mv" data-mv="1" data-i="' + i + '" title="เลื่อนไปทางขวา">▶</i>' : '') +
      '</button>').join('') +
      '<button class="pbi-tab tab-edit' + (editOn ? ' on' : '') + '" id="tabEdit" title="จัดลำดับหน้าเอง (บันทึกไว้ในเครื่องนี้)">' +
      (editOn ? '✓ เสร็จ' : '⇄ ย้ายหน้า') + '</button>' +
      (editOn ? '<button class="pbi-tab tab-edit" id="tabReset" title="คืนลำดับเริ่มต้น">↺ คืนค่าเดิม</button>' : '');

    tabs.querySelectorAll('.pbi-tab[data-page]').forEach(b => {
      b.onclick = () => {
        if (TAB_EDIT) return;                 /* โหมดย้ายหน้า: คลิกแท็บไม่เปลี่ยนหน้า */
        S.page = b.dataset.page; S.pageIdx = 0; render();
        b.scrollIntoView({ block: 'nearest', inline: 'center' });
      };
    });
    tabs.querySelectorAll('.tab-mv').forEach(el => {
      el.onclick = e => { e.stopPropagation(); moveTab(Number(el.dataset.i), Number(el.dataset.mv)); };
    });
    const ed = $('tabEdit');
    if (ed) ed.onclick = () => { TAB_EDIT = !TAB_EDIT; buildTabs(); };
    const rs = $('tabReset');
    if (rs) rs.onclick = () => { saveTabOrder([]); buildTabs(); };

    const act = tabs.querySelector('.pbi-tab.active');
    if (act && !TAB_EDIT) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function toggleNav() {
    document.body.classList.toggle('nav-off');
    try { localStorage.setItem('bi.navOff', document.body.classList.contains('nav-off') ? '1' : '0'); } catch (e) {}
    setTimeout(fit, 200);
  }

  function setActiveNav() {
    document.querySelectorAll('#pageNav .nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.page === S.page);
    });
    document.querySelectorAll('#pageTabs .pbi-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.page === S.page);
    });
    let inMore = false;
    document.querySelectorAll('#moreList .more-item').forEach(b => {
      const on = b.dataset.page === S.page;
      b.classList.toggle('active', on);
      if (on) inMore = true;
    });
    const sm = document.querySelector('#morePages > summary');
    if (sm) {
      sm.classList.toggle('active', inMore);
      sm.title = inMore ? 'กำลังดูหน้าเพิ่มเติม' : 'หน้ารายงานเพิ่มเติมของเว็บ (ไม่มีใน Power BI)';
    }
  }

  /* ---------- import ---------- */
  async function handleFile(file) {
    const st = $('importStatus'), pr = $('progress'), bar = $('progressBar');
    const toast = $('importToast'); if (toast) toast.classList.remove('hidden');
    pr.classList.add('on'); bar.style.width = '4%'; st.textContent = 'เปิดไฟล์…';
    const t0 = Date.now();
    try {
      const idx = await XlsxLite.readZipIndex(file);
      bar.style.width = '12%'; st.textContent = 'อ่านพจนานุกรมข้อความ…';
      const shared = await XlsxLite.readSharedStrings(file, idx);
      bar.style.width = '35%'; st.textContent = 'พบ ' + num(shared.length) + ' ค่าข้อความ · กำลังอ่านข้อมูล…';
      let fake = 35;
      const tick = setInterval(() => { if (fake < 90) { fake += 1.2; bar.style.width = fake + '%'; } }, 250);
      const raw = await XlsxLite.readSheetRows(file, idx, 'xl/worksheets/sheet1.xml', {
        columns: COLS, dateCols: DATE_COLS, startRow: 3, sharedStrings: shared
      });
      clearInterval(tick);
      bar.style.width = '93%'; st.textContent = 'คำนวณตามสูตร Excel (' + num(raw.length) + ' แถว)…';
      const data = BISchema.build(raw);
      S.raw = raw; S.data = fixTeams(data);
      S.meta = { file: file.name, rows: data.length, at: new Date(), stamp: (file.name.match(/(\d{14})/) || [])[1] || '' };
      const ps = periods();
      S.period = ps.length ? ps[ps.length - 1] : null;
      S.q = ''; S.pageIdx = 0; S.xf = {};
      S.filter.team.clear(); S.filter.channel.clear(); S.filter.group.clear();
      applyView();            /* ★ หลัง import กลับไปมุมมองที่บันทึกไว้ (ถ้ามี) */
      syncHeader(); render();
      cacheSave();
      bar.style.width = '100%';
      st.textContent = '✅ เสร็จแล้ว · ' + num(data.length) + ' รายการ (' + Math.round((Date.now() - t0) / 1000) + ' วินาที)';
      setTimeout(() => { const t = $('importToast'); if (t) t.classList.add('hidden'); }, 3000);
    } catch (e) {
      pr.classList.remove('on');
      st.textContent = '❌ ' + (e && e.message ? e.message : e);
      console.error(e);
    }
  }

  function syncHeader() {
    const m = S.meta;
    const stamp = m.stamp ? m.stamp.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$3/$2/$1 $4:$5') : '';
    $('datasetInfo').innerHTML = '<b>' + esc(m.file) + '</b>' +
      '<span>' + num(m.rows) + ' รายการ · ' + esc(stamp || '-') +
      (m.cached ? ' <em>· ข้อมูลที่บันทึกไว้</em>' : '') +
      (m.snapshot ? ' <em>· ชุดข้อมูลที่ฝังมากับเว็บ</em>' : '') + '</span>';
    $('btnExport').disabled = false;
  }

  function exportCsv() {
    const rs = rows();
    const cols = ['so', 'dateSO', 'customer', 'province', 'group', 'product', 'team', 'revenue', 'units', 'status3', 'admGroup', 'slaAdmin', 'slaClose'];
    const head = cols.join(',');
    const body = rs.map(d => cols.map(c => {
      let v = d[c];
      if (v instanceof Date) v = ymd(v);
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sale-order-bi-' + ymd(new Date()) + '.csv';
    a.click();
  }

  /* ---------- discriminate hook: หากฎที่ทำให้เหลือ 373 แถว ---------- */
  window.__discriminate = function (soList) {
    if (!S.data) return { error: 'no data' };
    const keep = new Set((soList || []).map(x => String(x).trim()));
    const nov = S.data.filter(d => String(d.mth) === '202611');
    const inR = nov.filter(d => keep.has(String(d.so).trim()));
    const outR = nov.filter(d => !keep.has(String(d.so).trim()));
    const tab = (arr, f) => {
      const m = {};
      arr.forEach(d => { const k = String(d[f] == null || d[f] === '' ? '(ว่าง)' : d[f]); m[k] = (m[k] || 0) + 1; });
      return m;
    };
    const fields = ['team', 'channel', 'pkg', 'admGroup', 'group', 'jobStage', 'status3'];
    const res = { inCount: inR.length, outCount: outR.length, fields: {} };
    fields.forEach(f => { res.fields[f] = { in: tab(inR, f), out: tab(outR, f) }; });
    // ลองกฎง่าย ๆ
    const tryRule = (name, fn) => {
      const kept = nov.filter(fn);
      const keptSet = new Set(kept.map(d => String(d.so).trim()));
      let overlap = 0; keep.forEach(k => { if (keptSet.has(k)) overlap++; });
      res[name] = { rows: kept.length, overlap: overlap, extra: kept.length - overlap };
    };
    tryRule('notTele', d => String(d.team || '') !== '3. S2-Tele');
    tryRule('notTele_1to24', d => String(d.team || '') !== '3. S2-Tele' && d.dateSO <= new Date('2026-11-24T23:59:59'));
    tryRule('onlyDoneCancel', d => d.status3 === '1.Done' || d.status3 === '3.Cancel');
    return res;
  };

  /* ---------- range hook: คำนวณเฉพาะช่วงวันที่ (ไว้เทียบกับ snapshot ของรายงาน) ---------- */
  window.__range = function (fromISO, toISO) {
    if (!S.data) return { error: 'no data' };
    const from = new Date(fromISO + 'T00:00:00'), to = new Date(toISO + 'T23:59:59');
    const rs = S.data.filter(d => d.dateSO && d.dateSO >= from && d.dateSO <= to);
    const dist = new Set(rs.map(d => String(d.so).trim()));
    const rev = rs.reduce((a, d) => a + d.revenue, 0);
    const units = rs.reduce((a, d) => a + d.units, 0);
    const pass = rs.filter(d => d.admGroup === '1.ผ่าน').length;
    return {
      rows: rs.length, distinctSO: dist.size,
      revenue: Math.round(rev), units: units,
      passPct: rs.length ? +(pass / rs.length * 100).toFixed(1) : 0,
      status3: rs.reduce((m, d) => { m[d.status3] = (m[d.status3] || 0) + 1; return m; }, {})
    };
  };

  /* ---------- profile hook: หาว่าแถวไหนไม่อยู่ในรายงาน Excel ---------- */
  window.__profile = function (soList) {
    if (!S.data) return { error: 'no data' };
    const keep = new Set((soList || []).map(x => String(x).trim()));
    const nov = S.data.filter(d => String(d.mth) === '202611');
    const inR = nov.filter(d => keep.has(String(d.so).trim()));
    const outR = nov.filter(d => !keep.has(String(d.so).trim()));
    const prof = (arr, keyFn) => {
      const m = {};
      arr.forEach(d => { const k = keyFn(d) || '(ว่าง)'; m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
    };
    return {
      novRows: nov.length, inReport: inR.length, notInReport: outR.length,
      inStatus3: prof(inR, d => d.status3),
      outStatus3: prof(outR, d => d.status3),
      inTeam: prof(inR, d => d.team),
      outTeam: prof(outR, d => d.team),
      inRev: inR.reduce((a, d) => a + d.revenue, 0),
      outRev: outR.reduce((a, d) => a + d.revenue, 0),
      sampleOut: outR.slice(0, 5).map(d => ({ so: d.so, d: d.dateSO, st3: d.status3, team: d.team, ch: d.channel, rev: Math.round(d.revenue) }))
    };
  };

  /* ---------- statistics hook (ตรวจความถูกต้อง) ---------- */
  window.__stats = function (mth) {
    if (!S.data) return { error: 'no data' };
    const useMth = String(mth || '202611');
    const byMonth = {};
    S.data.forEach(d => { if (isKeepGroup(d.group)) { const k = d.mth ? String(d.mth) : 'null'; byMonth[k] = (byMonth[k] || 0) + 1; } });
    const nov = S.data.filter(d => isKeepGroup(d.group) && String(d.mth) === useMth);
    const dist = new Set(nov.map(d => String(d.so).trim()));
    const rev = nov.reduce((a, d) => a + (d.revenue || 0), 0);
    const units = nov.reduce((a, d) => a + (d.units || 0), 0);
    const byStatus = {};
    nov.forEach(d => {
      const k = d.status3 == null ? '(blank)' : String(d.status3);
      const o = byStatus[k] || { n: 0, rev: 0, units: 0 };
      o.n++; o.rev += d.revenue || 0; o.units += d.units || 0;
      byStatus[k] = o;
    });
    return { total: S.data.length, novRows: nov.length, novDistinctSO: dist.size, novRevenue: rev, novUnits: units, byMonth: byMonth, byStatus: byStatus };
  };

  /* ---------- row hook (ใช้ตรวจสูตรรายใบ) ---------- */
  window.__sos = function (mth) {
    if (!S.data) return [];
    const m = String(mth || '202611');
    return S.data.filter(d => isKeepGroup(d.group) && String(d.mth) === m).map(d => String(d.so).trim());
  };
  window.__row = function (so) {
    if (!S.data) return { error: 'no data' };
    const d = S.data.find(x => String(x.so).trim() === String(so).trim());
    if (!d) return { error: 'not found', so: so };
    const f = v => (v instanceof Date && !isNaN(v)) ? v.toISOString().slice(0, 10) : v;
    const raw = (S.raw || []).find(x => String(x[1]).trim() === String(so).trim());
    const dump = raw ? raw.map((v, i) => i + '=' + (v instanceof Date ? f(v) : String(v == null ? '' : v).slice(0, 32))) : [];
    return {
      so: d.so, team: d.team, status3: d.status3, admGroup: d.admGroup, jobStage: d.jobStage,
      dateSO: f(d.dateSO), dateAdmin: f(d.adminDate), closeDate: f(d.closeDate), installDate: f(d.installDate),
      slaAdmin: d.slaAdmin, slaClose: d.slaClose, revenue: d.revenue, units: d.units, mth: d.mth,
      raw40_70: dump.slice(40, 71)
    };
  };

  /* ---------- verification hook (ใช้เทียบกับค่าจริงใน Excel) ---------- */
  window.__verify = function (expected) {
    if (!S.data) return { error: 'ยังไม่มีข้อมูล' };
    const by = new Map();
    S.data.forEach(d => by.set(String(d.so).trim(), d));
    let n = 0, okTeam = 0, okSt3 = 0, okUnit = 0, okRev = 0, okSla = 0, miss = 0;
    const bad = [];
    Object.keys(expected).forEach(so => {
      const e = expected[so], d = by.get(so.trim());
      if (!d) { miss++; return; }
      n++;
      const eTeam = String(e[1] || '').trim(), eSt3 = String(e[2] || '').trim();
      const eUnit = Number(e[3]), eRev = Number(e[4]), eSla = Number(e[5]);
      if (String(d.team || '').trim() === eTeam) okTeam++;
      else if (bad.length < 6) bad.push({ so: so, field: 'team', got: d.team, exp: eTeam });
      if (String(d.status3 || '').trim() === eSt3) okSt3++;
      else if (bad.length < 6) bad.push({ so: so, field: 'status3', got: d.status3, exp: eSt3 });
      if (Math.abs((d.units || 0) - eUnit) < 0.001) okUnit++;
      else if (bad.length < 6) bad.push({ so: so, field: 'units', got: d.units, exp: eUnit });
      if (Math.abs((d.revenue || 0) - eRev) < 0.02) okRev++;
      else if (bad.length < 6) bad.push({ so: so, field: 'revenue', got: d.revenue, exp: eRev });
      if (eSla === 0 || Math.abs((d.slaAdmin || 0) - eSla) < 0.001) okSla++;
      else if (bad.length < 6) bad.push({ so: so, field: 'slaAdmin', got: d.slaAdmin, exp: eSla });
    });
    return { compared: n, notFound: miss, team: okTeam, status3: okSt3, units: okUnit, revenue: okRev, slaAdmin: okSla, samples: bad };
  };

  /* ---------- boot ---------- */
  /* ไม่ใช้ zoom/scale แล้ว — เลย์เอาต์ไหลตามขนาดจอ ตัวหนังสือคมเสมอ */
  function fit() {
    const cv = $('canvas');
    if (cv && cv.style.zoom) cv.style.zoom = '';
  }

  function scrollTopPage() {
    const st = document.querySelector('.pbi-stage');
    if (st) st.scrollTop = 0;
  }

  function boot() {
    applyView();            /* ★ คืนหน้ามุมมองที่บันทึกไว้ก่อนวาดครั้งแรก */
    buildNav();
    buildTabs();
    applyViewOnly();
    window.addEventListener('resize', () => { applyViewOnly(); fit(); });
    try {
      const v = localStorage.getItem('bi.navOff');
      if (v === '1' || v === null) document.body.classList.add('nav-off');
      else document.body.classList.remove('nav-off');
    } catch (e) {}
    const tg = $('navToggle');
    if (tg) tg.onclick = toggleNav;
    const input = $('fileInput');
    $('btnImport').onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0]); };
    const showDrop = on => { const o = $('dropOverlay'); if (o) o.classList.toggle('hidden', !on); };
    let dragDepth = 0;
    window.addEventListener('dragenter', e => { if (!e.dataTransfer) return; dragDepth++; showDrop(true); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) showDrop(false); });
    window.addEventListener('drop', e => {
      e.preventDefault(); dragDepth = 0; showDrop(false);
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    $('btnExport').onclick = exportCsv;
    const sv = $('btnSaveView');
    if (sv) {
      sv.onclick = saveView;
      const v = readView();
      if (v) { sv.classList.add('has-save'); sv.title = 'บันทึกไว้เมื่อ ' + new Date(v.at || Date.now()).toLocaleString('th-TH'); }
    }
    const sc = $('btnSaveClear');
    if (sc) sc.onclick = clearView;
    render(); fit();

    // ถ้ามีข้อมูลที่บันทึกไว้ ให้แสดงทันทีโดยไม่ต้อง import ใหม่
    cacheLoad().then(c => {
      if (c && c.data && !S.data) {
        S.data = fixTeams(c.data); S.meta = Object.assign({}, c.meta, { cached: true });
        const ps = periods();
        S.period = ps.length ? ps[ps.length - 1] : null;
        applyView();          /* ★ คืนมุมมองที่บันทึก (หน้า/เดือน/ตัวกรอง) */
        syncHeader(); render(); fit();
        const ov = $('dropOverlay'); if (ov) ov.classList.add('hidden');
        return;
      }
      /* ไม่มีแคชในเครื่องนี้ → ลองใช้ snapshot ที่ฝังมากับเว็บ (สำหรับมือถือ/ผู้บริหาร) */
      return loadSnapshot().then(snap => {
        if (snap && !S.data) return applySnapshot(snap);
        if (!snap && !S.data) waitSnapshot(24);   /* เน็ตช้า: รอต่ออีก ~17 วินาที */
      });
    });
  }

  /* ---------- snapshot ที่ฝังมากับเว็บ (อ่านอย่างเดียว) ---------- */
  /* แก้เลขทีมที่ซ้ำ/ขาดในข้อมูลเก่า (master data เดิมให้ Employee/E-Com เป็น 9 ทั้งคู่ และ Service/Credit ไม่มีเลข) */
  const TEAM_FIX = [
    [/^9\.\s*Employee/, '10. Employee'],
    [/^9\.\s*Online\/E-Com/, '11. Online/E-Com'],
    [/^Service\/Credit/, '12. Service/Credit']
  ];
  function fixTeams(arr) {
    if (!arr || !arr.length) return arr;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i];
      if (!d || !d.team) continue;
      const t = String(d.team);
      for (let k = 0; k < TEAM_FIX.length; k++) {
        if (TEAM_FIX[k][0].test(t)) { d.team = t.replace(TEAM_FIX[k][0], TEAM_FIX[k][1]); break; }
      }
    }
    return arr;
  }

  /* กรองแถวที่เป็นข้อมูลทดสอบออกจากรายงาน (เช่น "ทดสอบ ไอที", "Test", "ตัวอย่าง")
     ใช้เฉพาะชื่อลูกค้า — ไม่กรองชื่องาน เพราะงานจริงมีขั้นตอนชื่อ "ทดสอบ/Testing" */
  const TEST_CUST_RE = /ทดสอบ|^\s*(test|testing)\s*$/i;
  function isTestCustomer(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return false;
    if (t === 'ตัวอย่าง') return true;
    return TEST_CUST_RE.test(t);
  }

  function applySnapshot(snap) {
    if (!snap || !snap.data || S.data) return;
    const clean = snap.data.filter(d => !isTestCustomer(d && d.customer));
    S.data = fixTeams(clean.map(des));
    S.meta = Object.assign({}, snap.meta, { snapshot: true, filteredTest: snap.data.length - clean.length });
    const ps = periods();
    S.period = ps.length ? ps[ps.length - 1] : null;
    applyView();
    syncHeader(); render(); fit();
  }

  /* เผื่อกรณีสคริปต์ snapshot มาถึงช้ากว่าที่ retry รอ → คอยดูแล้ววาดใหม่ให้เอง */
  function waitSnapshot(tries) {
    if (S.data) return;
    if (window.BI_SNAPSHOT) return applySnapshot(window.BI_SNAPSHOT);
    if (tries <= 0) return;
    setTimeout(() => waitSnapshot(tries - 1), 700);
  }

  /* ดึง token ?v= ของบิลด์ปัจจุบันจาก <script src="app.js?v=…">
     เพื่อให้ data-snapshot.js เปลี่ยน token ตามทุกครั้งที่ deploy (กัน cache ค้ำ) */
  function assetVer() {
    try {
      const s = [].slice.call(document.querySelectorAll('script[src]')).filter(x => /app\.js(\?|$)/.test(x.getAttribute('src') || ''))[0];
      const m = s && String(s.getAttribute('src')).match(/\?v=([\w.]+)/);
      return m ? '?v=' + m[1] : '';
    } catch (e) { return ''; }
  }

  function loadSnapshot(attempt) {
    attempt = attempt || 0;
    return new Promise(res => {
      if (window.BI_SNAPSHOT) return res(window.BI_SNAPSHOT);
      const s = document.createElement('script');
      /* ลองซ้ำสูงสุด 3 ครั้ง — กันกรณีเน็ตมือถือหลุด/GitHub Pages เพิ่ง deploy ยังไม่ propagate */
      s.src = 'data-snapshot.js' + assetVer() + (attempt ? (assetVer() ? '&' : '?') + 'r=' + attempt : '');
      s.async = true;
      s.onload = () => res(window.BI_SNAPSHOT || null);
      s.onerror = () => {
        s.remove();
        if (attempt >= 3) return res(null);
        setTimeout(() => res(loadSnapshot(attempt + 1)), 900);
      };
      document.head.appendChild(s);
    });
  }

  /* ---------- โหมดดูอย่างเดียว (มือถือ/แท็บเล็ต) ---------- */
  function applyViewOnly() {
    let on = false;
    try {
      on = window.matchMedia('(max-width: 820px)').matches ||
        (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 1180px)').matches);
    } catch (e) { on = false; }
    document.body.classList.toggle('view-only', on);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
