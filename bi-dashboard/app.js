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

  const S = { raw: null, data: null, meta: null, page: 'overview', period: null, q: '', pageIdx: 0, filter: { team: new Set(), channel: new Set() } };

  const PBI_PAGES = [
    'Daily Admin', '2.SO Order Status', '1.Unit / Revenue', 'SML', 'Pack สด/ผ่อน',
    '2.Pending', '2.1.Pending-Detail', 'Report สัญญา', 'Map', 'Performance/TAT',
    '3.Cancel', '3.1.Cancel-Detail', 'P1.Sale/Admin', 'P2.Checker', 'P3.Consult',
    'P4.Sale Scape', 'P5.Transport', 'P6.Technicial', 'Aging (21 Day)',
    '1.Unit / Revenue New', 'Product end2end-Detail', 'All Job/Close', '1.Revenue',
    'Status (Back log)', 'Status (New)', 'Report ติดตั้ง', 'ยกเลิก**มัดจำ', 'วัน'
  ];
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
  const DB_NAME = 'sale-order-bi', STORE = 'dataset';
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
      tx.objectStore(STORE).put({ meta: S.meta, data: S.data.map(ser) }, 'last');
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
    })).then(rec => (rec && rec.data ? { meta: rec.meta, data: rec.data.map(des) } : null))
      .catch(() => null);
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
    const fT = S.filter.team, fC = S.filter.channel;
    return S.data.filter(d => {
      if (S.period) {
        const p = S.period.replace('-', '');
        if (String(d.mth) !== p) return false;
      }
      if (fT.size && !fT.has(String(d.team == null ? '' : d.team))) return false;
      if (fC.size && !fC.has(String(d.channel == null ? '' : d.channel))) return false;
      return true;
    });
  }

  function distinctVals(field) {
    const m = new Map();
    (S.data || []).forEach(d => {
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
    let h = mk('team', 'ทีมขาย') + mk('channel', 'ช่องทาง');
    if (S.filter.team.size || S.filter.channel.size) h += '<button class="btn" id="fReset">ล้างทั้งหมด</button>';
    bar.innerHTML = h;
  }

  /* ---------- svg ---------- */
  function svg(w, h, inner) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + inner + '</svg>';
  }
  function t(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 9.5) + '" fill="' + (o.fill || C.fg2) +
      '" text-anchor="' + (o.anchor || 'middle') + '"' + (o.w ? ' font-weight="600"' : '') + '>' + esc(s) + '</text>';
  }

  function comboSvg(data, axis) {
    const W = 640, H = 250, L = 40, R = 14, T = 26, B = 30;
    if (!data.length) return svg(W, H, t(W / 2, H / 2, 'ไม่มีข้อมูลในงวดนี้'));
    const iw = W - L - R, ih = H - T - B;
    const maxV = Math.max(...data.map(d => Math.max(d.bar, d.line || 0)), 1);
    const step = Math.max(1, Math.ceil(maxV / 4));
    const top = step * 4, bw = iw / data.length;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - ih * i / 4;
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.grid + '"/>';
      g += t(L - 6, y + 3, String(step * i), { anchor: 'end', size: 9 });
    }
    const every = data.length > 20 ? 2 : 1;
    data.forEach((d, i) => {
      const h = ih * (d.bar / top), x = L + i * bw + bw * 0.2;
      g += '<rect x="' + x + '" y="' + (T + ih - h) + '" width="' + (bw * 0.6) + '" height="' + Math.max(h, 0) + '" fill="' + C.bar + '" rx="1"/>';
      if (d.bar > 0) g += t(L + i * bw + bw / 2, T + ih - h - 4, String(d.bar), { size: 8.5, fill: C.fg });
      if (i % every === 0 || i === data.length - 1) g += t(L + i * bw + bw / 2, H - 10, String(d.day), { size: 9 });
    });
    const pts = data.map((d, i) => (L + i * bw + bw / 2) + ',' + (T + ih - ih * ((d.line || 0) / top))).join(' ');
    g += '<polyline points="' + pts + '" fill="none" stroke="' + C.orange + '" stroke-width="2"/>';
    data.forEach((d, i) => {
      const cx = L + i * bw + bw / 2, cy = T + ih - ih * ((d.line || 0) / top);
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="2.4" fill="' + C.orange + '"/>';
      if (d.line) g += t(cx, cy - 6, String(Math.round(d.line)), { size: 8, fill: C.orange });
    });
    if (axis) g += t(W / 2, H - 0.5, axis, { size: 10, fill: C.fg, w: 1 });
    return svg(W, H, g);
  }

  function barsSvg(data, fmt, labelW) {
    const W = 430, H = 230, T = 6, B = 6, R = 56;
    if (!data.length) return svg(W, H, t(W / 2, H / 2, 'ไม่มีข้อมูล'));
    const maxChars = Math.min(26, Math.max(...data.map(d => String(d.label).length), 8));
    const L = labelW || Math.min(168, Math.max(80, Math.round(maxChars * 6.3)));
    const max = Math.max(...data.map(d => d.value), 1);
    const rh = Math.min(26, (H - T - B) / data.length), iw = W - L - R;
    let g = '';
    data.forEach((d, i) => {
      const y = T + i * rh, w = iw * (d.value / max);
      let lab = String(d.label);
      if (lab.length > 26) lab = lab.slice(0, 25) + '…';
      g += t(L - 8, y + rh * 0.68, lab, { anchor: 'end', size: 10, fill: C.fg });
      g += '<rect x="' + L + '" y="' + (y + rh * 0.18) + '" width="' + Math.max(w, 2) + '" height="' + (rh * 0.62) + '" fill="' + PALETTE[i % PALETTE.length] + '" rx="2"/>';
      g += t(L + w + 5, y + rh * 0.68, fmt ? fmt(d.value) : String(d.value), { anchor: 'start', size: 9.5, fill: C.fg });
    });
    return svg(W, H, g);
  }

  function donutSvg(data) {
    const W = 420, H = 230, cx = 112, cy = H / 2, r = 76, ri = 44;
    const total = data.reduce((a, b) => a + b.value, 0);
    if (!total) return svg(W, H, t(W / 2, H / 2, 'ไม่มีข้อมูล'));
    let ang = -Math.PI / 2, g = '';
    data.forEach((d, i) => {
      const a2 = ang + (d.value / total) * Math.PI * 2;
      const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const A = p(r, ang), B = p(r, a2), Cc = p(ri, a2), Dd = p(ri, ang);
      const big = a2 - ang > Math.PI ? 1 : 0;
      g += '<path d="M' + A + ' A' + r + ',' + r + ' 0 ' + big + ' 1 ' + B + ' L' + Cc + ' A' + ri + ',' + ri + ' 0 ' + big + ' 0 ' + Dd + 'Z" fill="' + PALETTE[i % PALETTE.length] + '"/>';
      ang = a2;
    });
    let ly = 40;
    data.slice(0, 8).forEach((d, i) => {
      g += '<rect x="212" y="' + (ly - 7) + '" width="8" height="8" rx="1" fill="' + PALETTE[i % PALETTE.length] + '"/>';
      g += t(225, ly, String(d.label).slice(0, 16), { anchor: 'start', size: 9.5, fill: C.fg });
      g += t(400, ly, Math.round(d.value / total * 100) + '%', { anchor: 'end', size: 9.5 });
      ly += 17;
    });
    return svg(W, H, g);
  }

  /* ---------- shells ---------- */
  const box = (col, row, title, body, cls) =>
    '<div class="v ' + (cls || '') + '" style="grid-column:' + col + ';grid-row:' + row + '">' +
    (title ? '<div class="v-title">' + esc(title) + '</div>' : '') + '<div class="v-body">' + body + '</div></div>';

  const KPI_BG = {
    '#12239E': '#F1F4FF', '#E66C37': '#FFF4EE', '#197278': '#EFFAFA', '#1AAB40': '#F0FBF2',
    '#118DFF': '#F1F8FF', '#D9B300': '#FFFAEB', '#D64550': '#FFF2F3', '#744EC2': '#F6F2FE'
  };
  const kpi = (col, row, label, value, color) =>
    '<div class="v kpi" style="grid-column:' + col + ';grid-row:' + row +
    ';--kpi-color:' + color + ';--kpi-bg:' + (KPI_BG[color] || '#F7FBFF') + '">' +
    '<div class="num">' + value + '</div><div class="lbl">' + esc(label) + '</div></div>';

  function gauge(pct) {
    const p = Math.max(0, Math.min(100, pct));
    return '<div class="gauge"><div class="gauge-bar"><i style="width:' + p + '%"></i></div><div class="gauge-val">' + p.toFixed(0) + '%</div></div>';
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
    let h = '<div class="tbl-wrap"><table class="pbi"><thead><tr><th class="rowhead">' + esc(o.rowTitle || '') + '</th>';
    cks.forEach(c => { h += '<th class="num">' + esc(c) + '</th>'; });
    h += '<th class="num total">Total</th></tr></thead><tbody>';
    rks.forEach(rk => {
      h += '<tr><td class="rowhead">' + esc(rk) + '</td>';
      cks.forEach(ck => { const v = cell.get(rk + '\u0001' + ck); h += '<td class="num">' + (v ? fmt(v) : '') + '</td>'; });
      h += '<td class="num total">' + fmt(rm.get(rk) || 0) + '</td></tr>';
    });
    h += '<tr class="grand"><td class="rowhead">Total</td>';
    cks.forEach(ck => { h += '<td class="num">' + fmt(cm.get(ck) || 0) + '</td>'; });
    h += '<td class="num total">' + fmt(grandTotal) + '</td></tr></tbody></table></div>';
    return h;
  }

  /* ---------- pages ---------- */
  function pageOverview(rs) {
    let rev = 0, units = 0, pass = 0;
    const byDay = new Map();
    rs.forEach(d => {
      rev += d.revenue || 0;
      units += d.units || 0;
      if (d.admGroup === '1.ผ่าน') pass++;
      if (d.dateSO) {
        const day = d.dateSO.getDate();
        const a = byDay.get(day) || { bar: 0, line: 0 };
        a.bar++; a.line += d.units || 0;
        byDay.set(day, a);
      }
    });
    const daily = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(e => ({ day: e[0], bar: e[1].bar, line: e[1].line }));
    const pct = rs.length ? pass / rs.length * 100 : 0;

    const stM = matrix(rs, d => d.team || '(ไม่ระบุ)', d => d.admGroup, () => 1, num, { sortRows: 1, maxRows: 9, rowTitle: 'Grp ทีมขาย' });
    const unitM = matrix(rs, d => d.group, d => d.team, d => d.units, num, { sortRows: 1, maxRows: 3, rowTitle: 'กลุ่มสินค้า · Unit' });
    const revM = matrix(rs, d => d.group, d => d.team, d => d.revenue, baht, { sortRows: 1, maxRows: 5, rowTitle: 'กลุ่มสินค้า · Revenue' });

    let h = '';
    h += box('1/span 3', '1', 'Year, Month', periodSlicer(), 'slicer');
    h += '<div class="v" style="grid-column:1/span 3;grid-row:2"><div class="v-body" style="justify-content:center">' + gauge(pct) + '</div></div>';
    h += box('1/span 3', '3/span 4', 'สถานะตรวจสอบ (Admin)', stM);
    h += box('1/span 3', '7/span 3', 'สถานะใบงาน3 (ตาม DAX)',
      matrix(rs, d => d.status3 || '(ไม่ระบุ)', () => 'งาน', () => 1, num, { sortRows: 1, rowTitle: 'สถานะ' }));
    h += kpi('4/span 3', '1', 'SO ใบสั่งซื้อ', num(rs.length), C.navy);
    h += kpi('7/span 3', '1', 'Total (Revenue)', baht(rev), C.orange);
    h += kpi('10/span 3', '1', 'Unit', num(units), C.teal);
    h += box('4/span 9', '2/span 3', 'SO ต่อวัน (แท่ง) · Unit (เส้น)', comboSvg(daily, ''));
    h += box('4/span 9', '5/span 2', 'กลุ่มสินค้า × ทีมขาย · Unit', unitM);
    h += box('4/span 9', '7/span 3', 'กลุ่มสินค้า × ทีมขาย · Revenue', revM);
    return h;
  }

  function pageStatus(rs) {
    const byAdm = new Map(), bySt3 = new Map();
    rs.forEach(d => {
      byAdm.set(d.admGroup || '(ว่าง)', (byAdm.get(d.admGroup || '(ว่าง)') || 0) + 1);
      bySt3.set(d.status3 || '(ไม่ระบุ)', (bySt3.get(d.status3 || '(ไม่ระบุ)') || 0) + 1);
    });
    const admData = [...byAdm.entries()].sort().map(e => ({ label: e[0], value: e[1] }));
    const st3Data = [...bySt3.entries()].sort().map(e => ({ label: e[0], value: e[1] }));

    let h = '';
    h += box('1/span 3', '1/span 2', 'Year, Month', periodSlicer(), 'slicer');
    h += kpi('4/span 2', '1/span 2', 'ผ่าน', num(byAdm.get('1.ผ่าน') || 0), C.green);
    h += kpi('6/span 2', '1/span 2', 'Pending', num(byAdm.get('2.Pening') || 0), C.gold);
    h += kpi('8/span 2', '1/span 2', 'ไม่ผ่าน', num(byAdm.get('3.ไม่ผ่าน') || 0), C.red);
    h += kpi('10/span 3', '1/span 2', 'รวมทั้งงวด', num(rs.length), C.navy);
    h += box('1/span 6', '3/span 3', 'สถานะ Admin', barsSvg(admData, num));
    h += box('7/span 6', '3/span 3', 'สถานะใบงาน3 (1.Done / 2.Pending / 3.Cancel)', barsSvg(st3Data, num));
    h += box('1/span 12', '6/span 4', 'ทีมขาย × สถานะใบงาน3',
      matrix(rs, d => d.team || '(ไม่ระบุ)', d => d.status3 || '(ไม่ระบุ)', () => 1, num, { sortRows: 1, rowTitle: 'Grp ทีมขาย' }));
    return h;
  }

  function pageTat(rs) {
    let nA = 0, sA = 0, nC = 0, sC = 0;
    const byMth = new Map(), byTeam = new Map();
    rs.forEach(d => {
      if (d.slaAdmin != null) { sA += d.slaAdmin; nA++; }
      if (d.slaClose != null && (d.status3 === '1.Done' || d.status3 === '3.Cancel')) {
        sC += d.slaClose; nC++;
        const t2 = d.team || '(ไม่ระบุ)';
        const b = byTeam.get(t2) || [0, 0]; b[0] += d.slaClose; b[1]++; byTeam.set(t2, b);
        if (d.dateSO) {
          const day = d.dateSO.getDate();
          const a = byMth.get(day) || [0, 0]; a[0] += d.slaClose; a[1]++; byMth.set(day, a);
        }
      }
    });
    const daily = [...byMth.entries()].sort((a, b) => a[0] - b[0])
      .map(e => ({ day: e[0], bar: e[1][1] ? Math.round(e[1][0] / e[1][1]) : 0, line: e[1][1] }));
    const teamData = [...byTeam.entries()].map(e => ({ label: e[0], value: e[1][1] ? e[1][0] / e[1][1] : 0 }))
      .sort((a, b) => b.value - a.value).slice(0, 8);

    let h = '';
    h += box('1/span 3', '1/span 2', 'Year, Month', periodSlicer(), 'slicer');
    h += kpi('4/span 3', '1/span 2', 'SLA Admin เฉลี่ย', (nA ? sA / nA : 0).toFixed(1) + ' วัน', C.blue);
    h += kpi('7/span 3', '1/span 2', 'SLA ปิดงาน เฉลี่ย', (nC ? sC / nC : 0).toFixed(1) + ' วัน', C.orange);
    h += kpi('10/span 3', '1/span 2', 'งานที่ปิดแล้ว', num(nC), C.green);
    h += box('1/span 12', '3/span 3', 'SLA ปิดงาน เฉลี่ยรายวัน (วัน)', comboSvg(daily));
    h += box('1/span 6', '6/span 4', 'SLA เฉลี่ยตามทีม (วัน)', barsSvg(teamData, v => v.toFixed(1)));
    h += box('7/span 6', '6/span 4', 'นิยาม (ตามสูตรในไฟล์)',
      '<div class="note">SLA Admin = MAX(Date Admin − Date SO, 0)<br>' +
      'SLA ปิดงาน = วันที่ปิดงาน − Date SO (งาน 1.Done / 3.Cancel)<br>' +
      'งานที่ยังไม่ปิด = วันนี้ − Date SO<br>' +
      'Date Admin อ้างตามสูตรคอลัมน์ DG</div>');
    return h;
  }

  function pageData(rs) {
    const q = S.q.trim().toLowerCase();
    let list = rs;
    if (q) list = rs.filter(d => String(d.so || '').toLowerCase().includes(q) || String(d.customer || '').toLowerCase().includes(q) || String(d.salesperson || '').toLowerCase().includes(q));
    const per = 100, pages = Math.max(1, Math.ceil(list.length / per));
    if (S.pageIdx >= pages) S.pageIdx = 0;
    const slice = list.slice(S.pageIdx * per, S.pageIdx * per + per);

    let h = '<div class="toolbar"><input id="dataSearch" class="pbi-input" placeholder="ค้นหา SO / ลูกค้า / ผู้รับผิดชอบ" value="' + esc(S.q) + '">' +
      '<button class="btn" id="dataPrev"' + (S.pageIdx === 0 ? ' disabled' : '') + '>‹ ก่อนหน้า</button>' +
      '<span class="muted">หน้า ' + (S.pageIdx + 1) + '/' + pages + ' · ' + num(list.length) + ' แถว</span>' +
      '<button class="btn" id="dataNext"' + (S.pageIdx >= pages - 1 ? ' disabled' : '') + '>ถัดไป ›</button></div>';
    h += '<div class="tbl-wrap"><table class="pbi"><thead><tr><th>SO</th><th>Date SO</th><th>ลูกค้า</th><th>จังหวัด</th><th>กลุ่มสินค้า</th><th>ทีมขาย</th><th class="num">Revenue</th><th class="num">Unit</th><th>สถานะใบงาน3</th><th>Admin</th><th class="num">SLA Admin</th></tr></thead><tbody>';
    slice.forEach(d => {
      h += '<tr><td>' + esc(d.so) + '</td><td>' + ymd(d.dateSO) + '</td><td>' + esc(d.customer) + '</td><td>' + esc(d.province) + '</td><td>' + esc(d.group) + '</td><td>' + esc(d.team) + '</td>' +
        '<td class="num">' + baht(d.revenue) + '</td><td class="num">' + num(d.units) + '</td><td>' + esc(d.status3) + '</td><td>' + esc(d.admGroup) + '</td>' +
        '<td class="num">' + (d.slaAdmin == null ? '' : d.slaAdmin) + '</td></tr>';
    });
    return '<div class="v" style="grid-column:1/span 12;grid-row:1/span 9"><div class="v-title">รายละเอียด (ค่าที่คำนวณตามสูตรจริง)</div><div class="v-body">' + h + '</div></div>';
  }

  function pageGeneric(name, rs) {
    const sp = SPECS[name] || { dim: 'team', dim2: 'status3', metric: 'count', title: name };
    const data = sp.filter ? rs.filter(sp.filter) : rs;
    const valOf = d => sp.metric === 'revenue' ? (d.revenue || 0) : sp.metric === 'units' ? (d.units || 0) : 1;
    const fmt = sp.metric === 'revenue' ? baht : num;

    const labelOf = d => {
      if (sp.dim === 'monthLabel') return d.mth ? String(d.mth).slice(4) + '/' + String(d.mth).slice(2, 4) : '(ว่าง)';
      if (sp.dim === 'dayLabel') return d.dateSO ? String(d.dateSO.getDate()) : '(ว่าง)';
      return d[sp.dim] == null || d[sp.dim] === '' ? '(ว่าง)' : String(d[sp.dim]);
    };
    const label2Of = d => {
      if (sp.dim2 === 'monthLabel') return d.mth ? String(d.mth).slice(4) : '(ว่าง)';
      return d[sp.dim2] == null || d[sp.dim2] === '' ? '(ว่าง)' : String(d[sp.dim2]);
    };

    const total = data.reduce((a, d) => a + valOf(d), 0);
    const units = data.reduce((a, d) => a + (d.units || 0), 0);
    const rev = data.reduce((a, d) => a + (d.revenue || 0), 0);
    const distinctSO = new Set(data.map(d => String(d.so))).size;

    const g = new Map();
    data.forEach(d => { const k = labelOf(d); g.set(k, (g.get(k) || 0) + valOf(d)); });
    let bars = [...g.entries()].map(e => ({ label: e[0], value: e[1] })).sort((a, b) => b.value - a.value);
    if (sp.dim === 'dayLabel' || sp.dim === 'monthLabel') bars = bars.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const chart = (sp.dim === 'dayLabel' || sp.dim === 'monthLabel')
      ? comboSvg(bars.map(b => ({ day: b.label, bar: Math.round(b.value), line: null })), S.period || '')
      : barsSvg(bars.slice(0, 9), fmt);

    const pv = matrix(data, labelOf, label2Of, valOf, fmt, { sortRows: 1, maxRows: 8, maxCols: 7, rowTitle: sp.dim });

    let h = '';
    h += box('1/span 3', '1/span 2', 'Year, Month', periodSlicer(), 'slicer');
    h += kpi('4/span 3', '1', 'จำนวน SO', num(distinctSO), C.navy);
    h += kpi('7/span 3', '1', 'Revenue (ราคาสุทธิ)', baht(rev), C.orange);
    h += kpi('10/span 3', '1', 'Unit (จำนวนเครื่อง)', num(units), C.teal);
    h += '<div class="v" style="grid-column:1/span 12;grid-row:3/span 2"><div class="v-title">' + esc(sp.title) +
      ' ตาม ' + esc(sp.dim) + '</div><div class="v-body">' + chart + '</div></div>';
    h += box('1/span 12', '5/span 5', esc(sp.dim) + ' × ' + esc(sp.dim2), pv);
    return h;
  }

  function pageSoon() {
    return '<div class="soon-note">หน้านี้ยังไม่ได้ทำในเวอร์ชันนี้<br><span class="muted">เลือกหน้าที่มีอยู่ในแถบด้านล่าง</span></div>';
  }

  /* ---------- render ---------- */
  function render() {
    const rs = rows();
    renderFilterBar();
    const html = S.page === 'overview' ? pageOverview(rs)
      : S.page === 'status' ? pageStatus(rs)
      : S.page === 'tat' ? pageTat(rs)
      : S.page === 'data' ? pageData(rs)
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
    fit();
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
    if (rst) rst.onclick = () => { S.filter.team.clear(); S.filter.channel.clear(); render(); };
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
      S.filter.team.clear(); S.filter.channel.clear();
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
  window.__stats = function () {
    if (!S.data) return { error: 'no data' };
    const byMonth = {};
    S.data.forEach(d => { const k = d.mth ? String(d.mth) : 'null'; byMonth[k] = (byMonth[k] || 0) + 1; });
    const nov = S.data.filter(d => String(d.mth) === '202611');
    const dist = new Set(nov.map(d => String(d.so).trim()));
    const rev = nov.reduce((a, d) => a + (d.revenue || 0), 0);
    const units = nov.reduce((a, d) => a + (d.units || 0), 0);
    return { total: S.data.length, novRows: nov.length, novDistinctSO: dist.size, novRevenue: rev, novUnits: units, byMonth: byMonth };
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
  function fit() {
    const stage = document.querySelector('.pbi-stage'), cv = $('canvas');
    if (!stage || !cv) return;
    const sc = Math.min(1, (stage.clientWidth - 24) / 1280, (stage.clientHeight - 24) / 720);
    cv.style.transform = '';
    cv.style.marginBottom = '';
    if ('zoom' in cv.style) { cv.style.zoom = sc; }
    else {
      cv.style.transform = 'scale(' + sc + ')';
      cv.style.transformOrigin = 'top center';
      cv.style.marginBottom = (-720 * (1 - sc)) + 'px';
    }
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
