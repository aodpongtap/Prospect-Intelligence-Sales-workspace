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

  const S = { raw: null, data: null, meta: null, page: 'overview', period: null, q: '', pageIdx: 0, filter: { team: new Set(), channel: new Set(), group: new Set() } };

  /* 21 หน้าจริงของรายงาน Power BI (ตามลำดับในตัวนำทางหน้า) */
  const PBI_PAGES = [
    'Daily Admin', '2.SO Order Status', '1.Unit / Revenue', 'SML', 'Pack สด/ผ่อน',
    '2.Pending', '2.1.Pending-Detail', 'Map', 'Performance/TAT', '3.Cancel',
    '3.1.Cancel-Detail', 'P1.Sale/Admin', 'P2.Checker', 'P3.Consult', 'P4.Sale Scape',
    'P5.Transport', 'P6.Technicial', 'Aging (21 Day)', 'Report ติดตั้ง', 'ยกเลิก**มัดจำ', 'วัน'
  ];
  /* หน้าที่มีเพิ่มในเว็บ (ไม่มีใน PBI) — เปิดจากเมนู ☰ เท่านั้น */
  const EXTRA_PAGES = ['1.Unit / Revenue New', 'Product end2end-Detail', 'All Job/Close', '1.Revenue', 'Status (Back log)', 'Status (New)', 'Report สัญญา'];
  const IMPLEMENTED = {
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
    'P6.Technicial': { dim: 'team', dim2: 'prodCat', metric: 'count', title: 'P6 · Technician' },
    'Aging (21 Day)': { dim: 'team', dim2: 'status3', metric: 'count', filter: d => d.slaClose != null && d.slaClose > 21, title: 'งานค้างเกิน 21 วัน' },
    '1.Unit / Revenue New': { dim: 'monthLabel', dim2: 'team', metric: 'revenue', title: 'Unit / Revenue รายเดือน' },
    'Product end2end-Detail': { dim: 'group', dim2: 'prodCat', metric: 'units', title: 'สินค้าแบบ end-to-end' },
    '1.Revenue': { dim: 'team', dim2: 'group', metric: 'revenue', title: 'Revenue ตามทีม / กลุ่มสินค้า' },
    'Status (Back log)': { dim: 'status3', dim2: 'team', metric: 'count', title: 'Backlog ตามสถานะ' },
    'Report ติดตั้ง': { dim: 'team', dim2: 'province', metric: 'units', title: 'รายงานการติดตั้ง' },
    'ยกเลิก**มัดจำ': { dim: 'team', dim2: 'pkg', metric: 'revenue', filter: d => d.status3 === '3.Cancel', title: 'ยกเลิก / มัดจำ' },
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
  const DB_NAME = 'sale-order-bi', STORE = 'dataset', SCHEMA_VER = 3;
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

  /* ---------- ขอบเขตข้อมูล: กลุ่ม "หยอดเหรียญ" (ไม่รวมเครื่องชงกาแฟ) ---------- */
  const KEEP_GROUP_RE = /หยอดเหรียญ/;
  const EXCLUDE_GROUP_RE = /ชงกาแฟ/;
  function isKeepGroup(g) {
    const s2 = String(g == null ? '' : g);
    return KEEP_GROUP_RE.test(s2) && !EXCLUDE_GROUP_RE.test(s2);
  }

  /* ---------- data ---------- */
  function periods() {
    if (!S.data) return [];
    const set = new Set();
    S.data.forEach(d => { if (d.mth) set.add(String(d.mth).slice(0, 4) + '-' + String(d.mth).slice(4).padStart(2, '0')); });
    return [...set].sort();
  }
  function rows() {
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
      return true;
    });
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
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
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
    let h = '<label class="fsel"><span>งวด</span><select id="periodSel" class="pbi-select">' +
      periods().slice().reverse().map(p => '<option value="' + p + '"' + (p === S.period ? ' selected' : '') + '>' +
        p.replace('-', ' · ') + '</option>').join('') + '</select></label>';
    h += mk('team', 'ทีมขาย') + mk('channel', 'ช่องทาง') + mk('group', 'กลุ่มสินค้า');
    if (S.filter.team.size || S.filter.channel.size || S.filter.group.size) h += '<button class="btn" id="fReset">ล้างทั้งหมด</button>';
    bar.innerHTML = h;
  }

  /* ============ UI helpers — HTML/CSS ล้วน (คมชัด ไม่ยืด ไม่ตัดข้อความ) ============ */
  function empty(msg) { return '<div class="empty">' + esc(msg || 'ไม่มีข้อมูลในงวดนี้') + '</div>'; }

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
    return '<section class="card s' + span + (o.cls ? ' ' + o.cls : '') + '">' +
      (title ? '<div class="card-h"><h3>' + esc(title) + '</h3>' +
        (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') + '</div>' : '') +
      '<div class="card-b' + (o.pad ? ' pad' : '') + '">' + body + '</div></section>';
  }

  function kpiCard(span, label, value, color, sub) {
    return '<section class="card s' + span + ' kpi2" style="--k:' + color + '">' +
      '<div class="k-lab">' + esc(label) + '</div>' +
      '<div class="k-val">' + value + '</div>' +
      (sub ? '<div class="k-sub">' + esc(sub) + '</div>' : '') + '</section>';
  }

  /* แท่งแนวนอน: label | track | value  (ไม่ทับกันเด็ดขาด) */
  function hbars(data, fmt, o) {
    o = o || {};
    if (!data || !data.length) return empty();
    const f = fmt || num;
    const max = Math.max.apply(null, data.map(d => d.value)) || 1;
    const chars = Math.max.apply(null, data.map(d => String(d.label).length));
    const lw = o.labelW || Math.min(230, Math.max(96, Math.round(chars * 7.2) + 8));
    let h = '<div class="hbars" style="--lw:' + lw + 'px">';
    data.forEach((d, i) => {
      const p = Math.max(1.2, Math.min(100, d.value / max * 100));
      const col = d.color || PALETTE[i % PALETTE.length];
      h += '<div class="hbar" title="' + esc(d.label) + ' · ' + f(d.value) + '">' +
        '<span class="hb-lab">' + esc(d.label) + '</span>' +
        '<span class="hb-track"><i class="hb-fill" style="width:' + p.toFixed(1) + '%;background:' + col + '"></i></span>' +
        '<span class="hb-val">' + f(d.value) + '</span></div>';
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
    const showVal = data.length <= 16;
    let h = '<div class="cols-wrap"><div class="cols">';
    data.forEach((d, i) => {
      const p = Math.max(1.5, Math.min(100, d.value / max * 100));
      h += '<div class="col" title="' + esc(d.label) + ' · ' + num(d.value) +
        (lineArr ? ' · ติดตั้ง ' + num(lineArr[i]) : '') +
        (d.sub ? ' · ' + esc(d.sub) : '') + '">' +
        '<span class="col-v">' + (showVal ? shortNum(d.value) : '') + '</span>' +
        '<span class="col-bar-wrap"><i class="col-bar" style="height:' + p.toFixed(1) + '%"></i></span>' +
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
  function donut(data) {
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
      '<div class="lg"><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' +
      '<span title="' + esc(d.label) + '">' + esc(d.label) + '</span>' +
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
    if (o.sortRows) rks.sort((a, b) => rm.get(b) - rm.get(a));
    if (o.sortCols) cks.sort((a, b) => cm.get(b) - cm.get(a));
    // ยอดรวมต้องคิดจากข้อมูลทั้งหมด ก่อนตัดคอลัมน์/แถวที่จะแสดง
    let grandTotal = 0;
    cell.forEach(v => { grandTotal += v; });
    if (o.maxRows) rks = rks.slice(0, o.maxRows);
    if (o.maxCols) cks = cks.slice(0, o.maxCols);
    let h = '<div class="tbl"><table class="pbi"><thead><tr><th class="rowhead">' + esc(o.rowTitle || '') + '</th>';
    cks.forEach(c => { h += '<th class="num">' + esc(c) + '</th>'; });
    h += '<th class="num total">Total</th></tr></thead><tbody>';
    rks.forEach(rk => {
      h += '<tr><td class="rowhead">' + esc(rk) + '</td>';
      cks.forEach(ck => { const v = cell.get(rk + '\u0001' + ck); h += '<td class="num">' + (v ? fmt(v) : '') + '</td>'; });
      h += '<td class="num total">' + fmt(rm.get(rk) || 0) + '</td></tr>';
    });
    h += '<tr class="grand"><td class="rowhead">Total</td>';
    cks.forEach(ck => { const v = cm.get(ck); h += '<td class="num">' + (v ? fmt(v) : '') + '</td>'; });
    h += '<td class="num total">' + fmt(grandTotal) + '</td></tr></tbody></table></div>';
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
    h += kpiCard(6, 'Total SO', num(rs.length), C.navy,
      other > 0 ? 'ไม่รวมสถานะว่าง ' + num(other) + ' ใบ ในยอดเงิน' : 'ใบสั่งซื้อในงวดนี้');
    h += kpiCard(6, 'Rev (ราคาสุทธิ)', baht(rev), C.purple, 'Rev.Total = SUM(revenue) เฉพาะ 3 สถานะ');
    h += kpiCard(4, 'Done', num(sp['1.Done'].length), C.green, pc(sp['1.Done'].length));
    h += kpiCard(4, 'Pending', num(sp['2.Pending'].length), C.gold, pc(sp['2.Pending'].length));
    h += kpiCard(4, 'Cancel', num(sp['3.Cancel'].length), C.red, pc(sp['3.Cancel'].length));
    h += kpiCard(4, 'Done Rev', baht(sumRev(sp['1.Done'])), C.green);
    h += kpiCard(4, 'Pending Rev', baht(sumRev(sp['2.Pending'])), C.gold);
    h += kpiCard(4, 'Cancel Rev', baht(sumRev(sp['3.Cancel'])), C.red);
    h += kpiCard(12, 'Total Unit', num(units), C.teal, 'SUM(จำนวนเครื่องซักผ้า) เฉพาะ 3 สถานะ (Total Unit ใน .pbix)');
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
      h += '<tr><td class="rowhead">' + esc(k) + '</td>' +
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
      h += '<div class="stk-row" title="' + esc(r.label) + ' · รวม ' + f(totals[i]) + '">' +
        '<span class="stk-lab">' + esc(r.label) + '</span><span class="stk-track">';
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

  /* ---------- pages ---------- */
  function pgHead(title, rs, extra) {
    return '<div class="pg-head"><h1>' + esc(title) + '</h1>' +
      '<span class="sub">' + esc(S.period ? S.period.replace('-', ' · ') : 'ทุกงวด') + ' · ' + num(rs ? rs.length : 0) + ' รายการ</span>' +
      '<span class="field-scope">เฉพาะกลุ่มหยอดเหรียญ</span>' +
      '<span class="grow"></span>' + (extra || '') + '</div>';
  }

  function pageOverview(rs) {
    let rev = 0, units = 0, pass = 0, installs = 0;
    const byDay = new Map(), instByDay = new Map();
    rs.forEach(d => {
      rev += d.revenue || 0;
      units += d.units || 0;
      if (d.admGroup === '1.ผ่าน') pass++;
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
    const adm = ['1.ผ่าน', '2.Pening', '3.ไม่ผ่าน', '(Blank)'].map(k => ({
      label: k === '(Blank)' ? '(ว่าง)' : k,
      value: rs.filter(d => String(d.admGroup || '(Blank)') === k).length
    })).filter(d => d.value > 0);

    const stM = matrix(rs, d => d.team || '(ไม่ระบุ)', d => d.admGroup, () => 1, num, { sortRows: 1, rowTitle: 'Grp ทีมขาย' });
    const revM = matrix(rs, d => d.group, d => d.team, d => d.revenue, baht, { sortRows: 1, maxRows: 10, rowTitle: 'กลุ่มสินค้า' });

    let h = pgHead('Daily Admin', rs);
    h += '<div class="g">';
    h += kpiCard(3, 'จำนวน SO', num(rs.length), C.navy, 'ใบสั่งซื้อในงวดนี้');
    h += kpiCard(3, 'Revenue (ราคาสุทธิ)', baht(rev), C.orange, 'หักส่วนลด ÷1.07 แล้ว');
    h += kpiCard(3, 'Unit (จำนวนเครื่อง)', num(units), C.teal, '= จำนวน Set');
    h += kpiCard(3, 'ผ่านการตรวจสอบ', pct.toFixed(0) + '%', C.green, num(pass) + ' / ' + num(rs.length) + ' รายการ');
    h += card(8, 'SO ต่อวัน', colsChart(daily, { line: instLine, barLabel: 'จำนวน SO', lineLabel: 'การติดตั้ง' }));
    h += card(4, 'สถานะตรวจสอบ (Admin)', donut(adm));
    h += card(12, 'Grp ทีมขาย × สถานะ Admin', stM, { hint: 'จำนวนงาน' });
    h += card(12, 'กลุ่มสินค้า × ทีมขาย · Revenue', revM, { hint: 'ราคาสุทธิ (บาท)' });
    return h + '</div>';
  }

  function pageStatus(rs) {
    const byAdm = new Map(), bySt3 = new Map();
    rs.forEach(d => {
      byAdm.set(d.admGroup || '(ว่าง)', (byAdm.get(d.admGroup || '(ว่าง)') || 0) + 1);
      bySt3.set(d.status3 || '(ไม่ระบุ)', (bySt3.get(d.status3 || '(ไม่ระบุ)') || 0) + 1);
    });
    const admData = [...byAdm.entries()].sort((a, b) => b[1] - a[1]).map(e => ({ label: e[0], value: e[1] }));
    const st3Data = [...bySt3.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(e => ({ label: e[0], value: e[1] }));

    let h = pgHead('Status (New)', rs);
    h += '<div class="g">';
    h += statusKpi(rs);
    h += card(12, 'สถานะใบงาน3 × Grp ทีมขาย', statusTable(rs), { hint: 'SO / %SO' });
    h += card(6, 'สถานะ Admin', hbars(admData), { hint: 'จำนวนงาน' });
    h += card(6, 'สถานะใบงาน3 · สัดส่วน', donut(st3Data));
    return h + '</div>';
  }

  function pageTat(rs) {
    let nA = 0, sA = 0, nC = 0, sC = 0;
    const byDay = new Map(), byTeam = new Map();
    rs.forEach(d => {
      if (d.slaAdmin != null) { sA += d.slaAdmin; nA++; }
      if (d.slaClose != null && (d.status3 === '1.Done' || d.status3 === '3.Cancel')) {
        sC += d.slaClose; nC++;
        const tk = d.team || '(ไม่ระบุ)';
        const b = byTeam.get(tk) || [0, 0]; b[0] += d.slaClose; b[1]++; byTeam.set(tk, b);
        if (d.dateSO) {
          const k2 = d.dateSO.getDate();
          const a = byDay.get(k2) || [0, 0]; a[0] += d.slaClose; a[1]++;
          byDay.set(k2, a);
        }
      }
    });
    const daily = [...byDay.entries()].sort((a, b) => a[0] - b[0])
      .map(e => ({ label: String(e[0]), value: e[1][1] ? e[1][0] / e[1][1] : 0, sub: e[1][1] + ' งาน' }));
    const teamData = [...byTeam.entries()]
      .map(e => ({ label: e[0], value: e[1][1] ? +(e[1][0] / e[1][1]).toFixed(1) : 0 }))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    let h = pgHead('Performance / TAT', rs);
    h += '<div class="g">';
    h += kpiCard(3, 'SLA Admin เฉลี่ย', (nA ? sA / nA : 0).toFixed(1) + ' วัน', C.blue, num(nA) + ' งาน');
    h += kpiCard(3, 'SLA ปิดงาน เฉลี่ย', (nC ? sC / nC : 0).toFixed(1) + ' วัน', C.orange, num(nC) + ' งาน');
    h += kpiCard(3, 'งานที่ปิดแล้ว', num(nC), C.green, '1.Done + 3.Cancel');
    h += kpiCard(3, 'งานคงค้าง', num(rs.length - nC), C.red, 'ยังไม่ปิดงาน');
    h += card(12, 'SLA ปิดงาน เฉลี่ยรายวัน (วัน)', colsChart(daily), { hint: 'เฉลี่ยต่อวัน' });
    h += card(6, 'SLA เฉลี่ยตามทีม (วัน)', hbars(teamData, v => v.toFixed(1)));
    h += card(6, 'นิยามที่ใช้คำนวณ',
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

    return pgHead('All Job / Close · รายละเอียด', rs) + '<div class="g">' +
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
    const soRows = keys.map(k => ({ label: k, segs: seg(k, 'so') }));
    const revRows = keys.map(k => ({ label: k, segs: seg(k, 'rev') }));
    const totalRev = sumRev(rs) || 1;
    const contRows = keys.map(k => {
      const o = byGrp.get(k);
      return { label: k, value: (o.rd + o.rp + o.rc) / totalRev * 100 };
    }).sort((a, b) => b.value - a.value);

    let h = '';
    h += card(6, 'SO ตาม GRP SML', stackedBars(soRows) + statusLegend(), { hint: 'จำนวน SO' });
    h += card(6, 'Revenue ตาม GRP SML', stackedBars(revRows, baht) + statusLegend(), { hint: 'ราคาสุทธิ' });
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

  function pageGeneric(name, rs) {
    const sp = SPECS[name] || { dim: 'team', dim2: 'status3', metric: 'count', title: name };
    const data = sp.filter ? rs.filter(sp.filter) : rs;
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
    data.forEach(d => { const k = labelOf(d); g.set(k, (g.get(k) || 0) + valOf(d)); });
    let bars = [...g.entries()].map(e => ({ label: e[0], value: e[1] }));
    const isTime = sp.dim === 'dayLabel' || sp.dim === 'monthLabel';
    if (isTime) bars.sort((a, b) => (parseFloat(a.label) || 0) - (parseFloat(b.label) || 0));
    else bars.sort((a, b) => b.value - a.value);

    const chart = isTime ? colsChart(bars) : hbars(bars.slice(0, 12), fmt);
    const dTop = bars.slice(0, 7);
    const dRest = bars.slice(7).reduce((a, b) => a + b.value, 0);
    const dData = dRest > 0 ? dTop.concat([{ label: 'อื่น ๆ (' + (bars.length - 7) + ')', value: dRest }]) : dTop;
    const pv = matrix(data, labelOf, label2Of, valOf, fmt, { sortRows: 1, maxRows: 12, maxCols: 8, rowTitle: sp.dim });
    const metricTxt = sp.metric === 'revenue' ? 'ราคาสุทธิ (บาท)' : sp.metric === 'units' ? 'จำนวนเครื่อง' : 'จำนวนงาน';

    let h = pgHead(name, data);
    h += '<div class="g">';
    h += kpiCard(3, 'จำนวน SO', num(soCount), C.navy, 'ไม่นับซ้ำ');
    h += kpiCard(3, 'Revenue (ราคาสุทธิ)', baht(rev), C.orange, 'ตามสูตรในไฟล์');
    h += kpiCard(3, 'Unit (จำนวนเครื่อง)', num(units), C.teal, '= จำนวน Set');
    h += kpiCard(3, 'รายการในหน้านี้', num(data.length), C.violet, sp.filter ? 'ตามเงื่อนไขหน้านี้' : 'ทั้งงวด');
    h += card(8, sp.title + ' · ตาม ' + sp.dim, chart, { hint: isTime ? 'รายแกนเวลา' : 'เรียงจากมากไปน้อย' });
    h += card(4, sp.dim + ' · สัดส่วน', donut(dData));
    h += card(12, sp.dim + ' × ' + sp.dim2, pv, { hint: metricTxt });
    return h + '</div>';
  }

  function pageSoon() {
    return pgHead('หน้านี้', []) + '<div class="g">' +
      card(12, '', '<div class="empty">หน้านี้ยังไม่ได้ทำในเวอร์ชันนี้</div>') + '</div>';
  }

  /* ---------- render ---------- */
  function render() {
    const rs = rows();
    renderFilterBar();
    const html = S.page === 'overview' ? pageOverview(rs)
      : S.page === 'status' ? pageStatus(rs)
      : S.page === 'tat' ? pageTat(rs)
      : S.page === 'data' ? pageData(rs)
      : S.page === 'SML' ? pageSml(rs)
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
    scrollTopPage();
    bind();
  }

  function bind() {
    const sel = $('periodSel');
    if (sel) sel.onchange = () => { S.period = sel.value; S.pageIdx = 0; render(); };
    const s = $('dataSearch');
    if (s) s.oninput = e => { const v = e.target.value; clearTimeout(s._t); s._t = setTimeout(() => { S.q = v; render(); }, 320); };
    const p = $('dataPrev'), n = $('dataNext');
    if (p) p.onclick = () => { S.pageIdx--; render(); };
    if (n) n.onclick = () => { S.pageIdx++; render(); };

    document.querySelectorAll('input[data-f]').forEach(cb => {
      cb.onchange = () => {
        const f = cb.dataset.f;
        if (cb.checked) S.filter[f].add(cb.value); else S.filter[f].delete(cb.value);
        S.pageIdx = 0;
        render();
      };
    });
    document.querySelectorAll('[data-clear]').forEach(b => {
      b.onclick = e => { e.preventDefault(); S.filter[b.dataset.clear].clear(); render(); };
    });
    const rst = $('fReset');
    if (rst) rst.onclick = () => { S.filter.team.clear(); S.filter.channel.clear(); S.filter.group.clear(); render(); };
  }

  const NAV_GROUPS = [
    { label: 'ภาพรวม', pages: ['Daily Admin', '1.Revenue', '1.Unit / Revenue', '1.Unit / Revenue New', 'Performance/TAT'] },
    { label: 'สถานะงาน', pages: ['Status (New)', 'Status (Back log)', '2.SO Order Status', '2.Pending', '2.1.Pending-Detail', '3.Cancel', '3.1.Cancel-Detail'] },
    { label: 'ขั้นตอนทำงาน', pages: ['P1.Sale/Admin', 'P2.Checker', 'P3.Consult', 'P4.Sale Scape', 'P5.Transport', 'P6.Technicial', 'Report ติดตั้ง', 'Report สัญญา'] },
    { label: 'สินค้า & พื้นที่', pages: ['SML', 'Pack สด/ผ่อน', 'Map', 'Product end2end-Detail'] },
    { label: 'อื่น ๆ', pages: ['Aging (21 Day)', 'ยกเลิก**มัดจำ', 'วัน', 'All Job/Close'] }
  ];

  function pageKey(name) { return IMPLEMENTED[name] || name; }

  function buildNav() {
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
          '<span class="ico">' + n + '</span><span class="lbl">' + esc(p) + '</span></button>';
      }).join('') + '</div>'
    ).join('');
    nav.querySelectorAll('.nav-item').forEach(b => {
      b.onclick = () => { S.page = b.dataset.page; S.pageIdx = 0; render(); };
    });
    const fold = $('navFold');
    if (fold) fold.onclick = toggleNav;
  }

  function buildTabs() {
    const tabs = $('pageTabs');
    if (!tabs) return;
    tabs.innerHTML = PBI_PAGES.map(name => {
      const k = pageKey(name);
      return '<button class="pbi-tab' + (k === S.page ? ' active' : '') + '" data-page="' + esc(k) + '">' + esc(name) + '</button>';
    }).join('');
    tabs.querySelectorAll('.pbi-tab').forEach(b => {
      b.onclick = () => {
        S.page = b.dataset.page; S.pageIdx = 0; render();
        b.scrollIntoView({ block: 'nearest', inline: 'center' });
      };
    });
    const act = tabs.querySelector('.pbi-tab.active');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
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
  }

  /* ---------- import ---------- */
  async function handleFile(file) {
    const st = $('importStatus'), pr = $('progress'), bar = $('progressBar');
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
      S.raw = raw; S.data = data;
      S.meta = { file: file.name, rows: data.length, at: new Date(), stamp: (file.name.match(/(\d{14})/) || [])[1] || '' };
      const ps = periods();
      S.period = ps.length ? ps[ps.length - 1] : null;
      S.q = ''; S.pageIdx = 0;
      S.filter.team.clear(); S.filter.channel.clear(); S.filter.group.clear();
      syncHeader(); render();
      cacheSave();
      bar.style.width = '100%';
      st.textContent = '✅ เสร็จแล้ว · ' + num(data.length) + ' รายการ (' + Math.round((Date.now() - t0) / 1000) + ' วินาที)';
      setTimeout(() => $('dropOverlay').classList.add('hidden'), 700);
    } catch (e) {
      pr.classList.remove('on');
      st.textContent = '❌ ' + (e && e.message ? e.message : e);
      console.error(e);
    }
  }

  function syncHeader() {
    const m = S.meta;
    const stamp = m.stamp ? m.stamp.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$3/$2/$1 $4:$5') : '';
    $('datasetInfo').innerHTML = '<b>' + esc(m.file) + '</b><br>' + num(m.rows) + ' รายการ · ไฟล์วันที่ ' + esc(stamp || '-');
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
    buildNav();
    buildTabs();
    window.addEventListener('resize', fit);
    try {
      const v = localStorage.getItem('bi.navOff');
      if (v === '1' || v === null) document.body.classList.add('nav-off');
      else document.body.classList.remove('nav-off');
    } catch (e) {}
    const tg = $('navToggle');
    if (tg) tg.onclick = toggleNav;
    $('btnImport').onclick = () => $('dropOverlay').classList.remove('hidden');
    const zone = $('dropZone'), input = $('fileInput');
    zone.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0]); };
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('hover'); };
    zone.ondragleave = () => zone.classList.remove('hover');
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('hover'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
    $('btnExport').onclick = exportCsv;
    render(); fit();

    // ถ้ามีข้อมูลที่บันทึกไว้ ให้แสดงทันทีโดยไม่ต้อง import ใหม่
    cacheLoad().then(c => {
      if (!c || S.data) return;
      S.data = c.data; S.meta = c.meta;
      const ps = periods();
      S.period = ps.length ? ps[ps.length - 1] : null;
      syncHeader(); render(); fit();
      const info = $('datasetInfo');
      if (info) info.insertAdjacentHTML('beforeend', '<br><span style="color:#0F7CD9">ข้อมูลที่บันทึกไว้ · กด Import เพื่ออัปเดต</span>');
      $('dropOverlay').classList.add('hidden');
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
