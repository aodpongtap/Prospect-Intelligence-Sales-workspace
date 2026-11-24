/* ============================================================
   Customer Intelligence — ลูกค้า 360° (อ่านง่าย ใช้งานได้จริง)
   ใช้ข้อมูลชุดเดียวกับหน้า Reports (SalesReport)
   - สรุปสุขภาพลูกค้า / ยอดขาย / ดีลที่เปิดอยู่
   - คลิกลูกค้า → ดูดีลทั้งหมด + คำแนะนำถัดไป
   ============================================================ */
(function (global) {
  'use strict';

  var LS_NOTE = 'pi_ci_notes_v1';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n || 0); }
  function money(n) { return '฿' + Math.round(num(n)).toLocaleString('th-TH'); }
  function TH_MONTHS() {
    return ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  }
  function monthTH(y, m) { return String(m).padStart(2, '0') + '.' + TH_MONTHS()[m - 1] + ' ' + (y + 543); }
  /** yyyymm -> "พ.ย. 69" */
  function monthShort(ym) {
    if (!ym) return '—';
    var y = Math.floor(ym / 100), m = ym % 100;
    return TH_MONTHS()[m - 1].slice(0, 3) + '. ' + String(y + 543).slice(-2);
  }

  var STATUS = {
    0: { label: 'กำลังคุย', cls: 's0' },
    1: { label: 'Pipeline', cls: 's1' },
    2: { label: 'รอ PO', cls: 's2' },
    3: { label: 'รอส่งของ', cls: 's3' },
    4: { label: 'ปิดงานแล้ว', cls: 's4' },
    5: { label: 'ยกเลิก', cls: 's5' }
  };

  var HEALTH = {
    repeat:  { label: 'ซื้อซ้ำ', cls: 'h-repeat', icon: 'fa-solid fa-arrows-rotate' },
    active:  { label: 'ปิดงานแล้ว', cls: 'h-active', icon: 'fa-solid fa-circle-check' },
    pipeline:{ label: 'กำลังเจรจา', cls: 'h-pipe', icon: 'fa-solid fa-comments' },
    risk:    { label: 'ต้องดูแล', cls: 'h-risk', icon: 'fa-solid fa-triangle-exclamation' }
  };

  function src() {
    if (!global.SalesReport || !global.SalesReport.data) return null;
    return global.SalesReport.data();
  }
  function saleOf(sales, id) {
    for (var i = 0; i < sales.length; i++) if (sales[i].id === id) return sales[i];
    return { id: id, name: id, team: '' };
  }

  /* ---------- สร้างข้อมูลลูกค้า ---------- */
  function buildCustomers() {
    var d = src();
    if (!d) return [];
    var deals = (global.SalesReport && global.SalesReport.scopedDeals) ? global.SalesReport.scopedDeals() : d.deals;
    var map = {}, list = [];
    deals.forEach(function (dl) {
      var s = saleOf(d.sales, dl.saleId);
      if (d.viewerTeam && s.team !== d.viewerTeam) return;
      var k = dl.customer;
      if (!map[k]) {
        map[k] = { name: k, team: s.team, sales: {}, deals: [], won: 0, wonCount: 0, open: 0, openCount: 0, talking: 0, cancelled: 0, latest: 0 };
        list.push(map[k]);
      }
      var c = map[k];
      c.sales[s.name] = 1;
      c.deals.push(dl);
      var mk = dl.year * 100 + dl.month;
      if (mk > c.latest) c.latest = mk;
      if (dl.status === 4) { c.won += num(dl.amount); c.wonCount++; }
      else if (dl.status === 5) { c.cancelled += num(dl.amount); }
      else if (dl.status === 0) { c.talking += num(dl.amount); }
      else { c.open += num(dl.amount); c.openCount++; }
    });
    list.forEach(function (c) {
      c.salesArr = Object.keys(c.sales);
      if (c.wonCount >= 2) c.health = 'repeat';
      else if (c.wonCount === 1) c.health = 'active';
      else if (c.openCount > 0 || c.talking > 0) c.health = 'pipeline';
      else c.health = 'risk';
      c.dealCount = c.deals.length;
    });
    return list;
  }

  function recommend(c) {
    if (c.health === 'repeat') return { icon: 'fa-solid fa-arrow-trend-up', title: 'เสนอ Upsell / บริการต่อเนื่อง', detail: 'ปิดงานแล้ว ' + c.wonCount + ' ดีล — เสนอแพ็กเกจ Maintenance หรือสินค้าเสริมในเครือเดียวกัน' };
    if (c.health === 'active') return { icon: 'fa-solid fa-headset', title: 'ติดตามหลังการขาย', detail: 'ปิดงานแล้ว 1 ดีล — โทรถามความพึงพอใจหลังติดตั้ง แล้วเสนอสินค้าเสริม' };
    if (c.health === 'pipeline') return { icon: 'fa-solid fa-handshake', title: 'ติดตามข้อเสนอให้ปิดการขาย', detail: 'มีดีลเปิดอยู่ ' + c.openCount + ' ดีล มูลค่า ' + money(c.open + c.talking) + ' — นัดสรุปเงื่อนไข/ปิดการขาย' };
    return { icon: 'fa-solid fa-phone-volume', title: 'ติดต่อกลับเพื่อฟื้นลูกค้า', detail: 'ยังไม่มีดีลที่ปิดได้ — สอบถามความต้องการใหม่หรือเสนอราคารอบพิเศษ' };
  }

  /* ---------- state ---------- */
  var state = { q: '', health: '', sale: '', sortKey: 'won', sortDir: -1 };

  function filtered(list) {
    var q = String(state.q || '').trim().toLowerCase();
    return list.filter(function (c) {
      if (state.health && c.health !== state.health) return false;
      if (state.sale && c.salesArr.indexOf(state.sale) < 0) return false;
      if (q && c.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortList(list) {
    return list.slice().sort(function (a, b) {
      var k = state.sortKey, va, vb;
      va = k === 'name' ? a.name : k === 'latest' ? a.latest : k === 'open' ? a.open : k === 'deals' ? a.dealCount : a.won;
      vb = k === 'name' ? b.name : k === 'latest' ? b.latest : k === 'open' ? b.open : k === 'deals' ? b.dealCount : b.won;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.sortDir;
      return String(va).localeCompare(String(vb), 'th') * state.sortDir;
    });
  }

  /* ---------- render ---------- */
  function kpiCard(label, value, sub, color, icon, bar) {
    return '<article class="ci-kpi">'
      + '<div class="ci-kpi-top"><span>' + esc(label) + '</span>'
      + '<span class="ci-ico" style="background:' + color + '18;color:' + color + '"><i class="' + icon + '"></i></span></div>'
      + '<div class="ci-kpi-val" style="color:' + color + '">' + value + '</div>'
      + (bar === undefined ? '' : '<div class="ci-bar"><span style="width:' + Math.max(0, Math.min(100, bar)) + '%;background:' + color + '"></span></div>')
      + '<div class="ci-kpi-sub">' + sub + '</div></article>';
  }

  function render() {
    injectCss();
    var all = buildCustomers();
    var sc = null;
    try { sc = (global.SalesReport && global.SalesReport.scope) ? global.SalesReport.scope() : null; } catch (e) {}
    if (sc && sc.type === 'pending') {
      return '<div class="ci"><div class="ci-head"><div><h1>Customer Intelligence</h1>'
        + '<div class="ci-sub">กำลังโหลดข้อมูลตามสิทธิ์ของคุณ…</div></div></div>'
        + '<div style="display:flex;gap:10px;align-items:center;background:#F8FAFC;border:1px solid #E9EEF5;border-radius:12px;padding:22px;color:#667085;font-size:12px">'
        + '<i class="fa-solid fa-circle-notch fa-spin" style="color:#2563EB"></i>'
        + 'กำลังตรวจสอบสิทธิ์และโหลดข้อมูลลูกค้าที่เกี่ยวข้อง…</div></div>';
    }
    var notice = (sc && sc.type === 'none')
      ? '<div class="ci-panel" style="display:flex;gap:10px;align-items:flex-start;background:#FFF7ED;border:1px solid #FFEDD5;border-radius:12px;padding:12px 14px;margin-bottom:12px">'
        + '<i class="fa-solid fa-circle-info" style="color:#C2410C;margin-top:2px"></i>'
        + '<div><b style="color:#9A3412;font-size:12px">บัญชีนี้ยังไม่ถูกผูกกับข้อมูล AE</b>'
        + '<div style="color:#B45309;font-size:11px">กรุณาแจ้ง Admin ให้ผูกชื่อของคุณกับรายชื่อ AE หรือทีม BU เพื่อให้เห็นข้อมูลลูกค้าที่เกี่ยวข้อง</div></div></div>'
      : '';
    if (!all.length) {
      return '<div class="ci"><div class="ci-head"><div><h1>Customer Intelligence</h1>'
        + '<div class="ci-sub">ยังไม่มีข้อมูลลูกค้า — เพิ่มดีลในหน้า Reports ก่อน</div></div></div>' + notice + '</div>';
    }
    var list = sortList(filtered(all));

    var totalWon = all.reduce(function (a, c) { return a + c.won; }, 0);
    var repeat = all.filter(function (c) { return c.health === 'repeat'; }).length;
    var active = all.filter(function (c) { return c.health === 'active'; }).length;
    var pipe = all.filter(function (c) { return c.health === 'pipeline'; }).length;
    var risk = all.filter(function (c) { return c.health === 'risk'; }).length;
    var openValue = all.reduce(function (a, c) { return a + c.open + c.talking; }, 0);

    var sales = [];
    all.forEach(function (c) { c.salesArr.forEach(function (s) { if (sales.indexOf(s) < 0) sales.push(s); }); });
    function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }

    var head = '<div class="ci-head"><div><h1>Customer Intelligence</h1>'
      + '<div class="ci-sub">ดูว่าลูกค้าแต่ละรายอยู่สถานะไหน และควรทำอะไรต่อ — ใช้ข้อมูลดีลชุดเดียวกับหน้า Reports</div></div></div>';
    head = notice + head;

    var kpis = '<div class="ci-kpis">'
      + kpiCard('ลูกค้าทั้งหมด', all.length + ' ราย', 'ซื้อซ้ำ ' + repeat + ' · ปิดงานแล้ว ' + active + ' · กำลังเจรจา ' + pipe, '#0F2B46', 'fa-solid fa-users', (repeat + active) / all.length * 100)
      + kpiCard('ยอดขายที่ปิดได้', money(totalWon), 'รวมทุกดีลสถานะ "ปิดงานแล้ว"', '#16A34A', 'fa-solid fa-sack-dollar')
      + kpiCard('ดีลที่ยังเปิดอยู่', money(openValue), pipe + ' รายกำลังเจรจา', '#2563EB', 'fa-solid fa-hourglass-half')
      + kpiCard('ต้องดูแล', risk + ' ราย', 'ยังไม่มีดีลที่ปิดได้ — ควรติดต่อกลับ', '#DC2626', 'fa-solid fa-triangle-exclamation', risk / all.length * 100)
      + '</div>';

    var filters = '<div class="ci-filters">'
      + '<div class="ci-fl"><label>ค้นหาลูกค้า</label><div class="ci-search"><i class="fa-solid fa-magnifying-glass"></i>'
      + '<input id="ciSearch" placeholder="ชื่อลูกค้า" value="' + esc(state.q) + '"></div></div>'
      + '<div class="ci-fl"><label>สถานะลูกค้า</label><select data-ci-filter="health">'
      + opt('', 'ทั้งหมด', state.health)
      + opt('repeat', 'ซื้อซ้ำ (' + repeat + ')', state.health)
      + opt('active', 'ปิดงานแล้ว (' + active + ')', state.health)
      + opt('pipeline', 'กำลังเจรจา (' + pipe + ')', state.health)
      + opt('risk', 'ต้องดูแล (' + risk + ')', state.health) + '</select></div>'
      + '<div class="ci-fl"><label>AE</label><select data-ci-filter="sale">'
      + opt('', 'ทุกคน', state.sale) + sales.map(function (s) { return opt(s, s, state.sale); }).join('') + '</select></div>'
      + '<div class="ci-fbtn"><button class="ci-btn" data-ci-reset><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button></div>'
      + '</div>';

    var rows = list.map(function (c) {
      var h = HEALTH[c.health], rec = recommend(c);
      return '<tr class="ci-row" data-ci-cust="' + esc(c.name) + '">'
        + '<td><div class="ci-nm">' + esc(c.name) + '</div><div class="ci-s2">' + esc(c.team || '-') + '</div></td>'
        + '<td>' + esc(c.salesArr.join(', ')) + '</td>'
        + '<td class="ci-num">' + c.dealCount + '</td>'
        + '<td class="ci-num ci-strong">' + (c.won ? money(c.won) : '<span class="ci-dim">—</span>') + '</td>'
        + '<td class="ci-num">' + (c.open + c.talking ? money(c.open + c.talking) : '<span class="ci-dim">—</span>') + '</td>'
        + '<td class="ci-num">' + monthShort(c.latest) + '</td>'
        + '<td><span class="ci-badge ' + h.cls + '"><i class="' + h.icon + '"></i> ' + esc(h.label) + '</span></td>'
        + '<td class="ci-rec-cell">' + esc(rec.title) + '</td>'
        + '<td class="ci-acts"><button class="ci-btn sm" data-ci-cust="' + esc(c.name) + '"><i class="fa-solid fa-eye"></i> ดู</button></td>'
        + '</tr>';
    }).join('');

    var table = '<section class="ci-panel">'
      + '<div class="ci-ph"><div><h3>รายชื่อลูกค้า (' + list.length + ')</h3>'
      + '<div class="ci-s2">คลิกแถวเพื่อดูดีลทั้งหมดของลูกค้ารายนั้น</div></div></div>'
      + '<div class="ci-tablewrap"><table class="ci-table"><thead><tr>'
      + th('name', 'ลูกค้า') + '<th>AE</th>'
      + th('deals', 'จำนวนดีล', 'ci-num') + th('won', 'ยอดปิดงาน', 'ci-num') + th('open', 'ดีลที่เปิดอยู่', 'ci-num')
      + th('latest', 'เดือนล่าสุด', 'ci-num') + '<th>สถานะ</th><th>ควรทำต่อ</th><th></th>'
      + '</tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="ci-empty">ไม่พบลูกค้าตามเงื่อนไข</td></tr>') + '</tbody></table></div>'
      + '</section>';

    var charts = '<div class="ci-charts">'
      + '<section class="ci-panel"><div class="ci-ph"><div><h3>ลูกค้าตามสถานะ</h3>'
      + '<div class="ci-s2">เห็นภาพรวมว่ามีลูกค้ากี่รายในแต่ละช่วง</div></div></div>'
      + '<div class="ci-chartbox"><canvas id="ciHealthChart"></canvas></div></section>'
      + '<section class="ci-panel"><div class="ci-ph"><div><h3>ยอดปิดงาน Top 5</h3>'
      + '<div class="ci-s2">ลูกค้าที่สร้างรายได้สูงสุด</div></div></div>'
      + '<div class="ci-chartbox"><canvas id="ciTopChart"></canvas></div></section>'
      + '</div>';

    return '<div class="ci">' + head + kpis + filters + charts + table + '</div>';
  }

  function th(key, label, extra) {
    var active = state.sortKey === key;
    var arrow = active ? (state.sortDir > 0 ? '▲' : '▼') : '';
    return '<th class="ci-sortable ' + (extra || '') + '" data-ci-sort="' + key + '">' + esc(label) + ' <span class="ci-arrow">' + arrow + '</span></th>';
  }

  /* ---------- modal ---------- */
  function openCustomer(name) {
    var all = buildCustomers();
    var c = null;
    all.forEach(function (x) { if (x.name === name) c = x; });
    if (!c) return;
    var h = HEALTH[c.health], rec = recommend(c);
    var deals = c.deals.slice().sort(function (a, b) { return (b.year * 100 + b.month) - (a.year * 100 + a.month); });
    var dealRows = deals.map(function (d) {
      var s = STATUS[d.status];
      return '<tr>'
        + '<td><span class="ci-badge ' + s.cls + '">' + d.status + ' · ' + esc(s.label) + '</span></td>'
        + '<td><div class="ci-nm">' + esc(d.job || d.name) + '</div><div class="ci-s2">' + esc(d.no) + '</div></td>'
        + '<td class="ci-num ci-strong">' + money(d.amount) + '</td>'
        + '<td class="ci-num">' + monthTH(d.year, d.month) + '</td>'
        + '<td>' + esc(saleOf((src() || {}).sales || [], d.saleId).name) + '</td>'
        + '</tr>';
    }).join('');

    var body = '<div class="ci-dgrid">'
      + '<div><small>สถานะลูกค้า</small><strong><span class="ci-badge ' + h.cls + '"><i class="' + h.icon + '"></i> ' + esc(h.label) + '</span></strong></div>'
      + '<div><small>ยอดปิดงานรวม</small><strong>' + money(c.won) + ' (' + c.wonCount + ' ดีล)</strong></div>'
      + '<div><small>ดีลที่เปิดอยู่</small><strong>' + money(c.open + c.talking) + ' (' + (c.openCount + (c.talking ? 1 : 0)) + ' ดีล)</strong></div>'
      + '<div><small>ทีม</small><strong>' + esc(c.team || '-') + '</strong></div>'
      + '<div><small>AE</small><strong>' + esc(c.salesArr.join(', ')) + '</strong></div>'
      + '<div><small>ดีลล่าสุด</small><strong>' + monthTH(Math.floor(c.latest / 100), c.latest % 100) + '</strong></div>'
      + '</div>'
      + '<div class="ci-recommend"><i class="' + rec.icon + '"></i><div><b>' + esc(rec.title) + '</b><p>' + esc(rec.detail) + '</p></div></div>'
      + '<h3 class="ci-sect">ดีลทั้งหมด (' + deals.length + ')</h3>'
      + '<div class="ci-tablewrap"><table class="ci-table"><thead><tr>'
      + '<th>สถานะ</th><th>งาน / เลขที่</th><th class="ci-num">มูลค่า</th><th class="ci-num">เดือนที่ปิด</th><th>Sale</th>'
      + '</tr></thead><tbody>' + dealRows + '</tbody></table></div>';

    if (typeof global.setModal === 'function') {
      global.setModal(c.name, 'Customer 360° · ' + (c.team || ''), body, [{ label: 'ปิด', primary: true }], true);
    }
  }

  /* ---------- charts ---------- */
  var charts = [];
  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }

  function drawCharts() {
    destroyCharts();
    if (!global.Chart) return;
    Chart.defaults.font.family = 'Prompt, sans-serif';
    Chart.defaults.font.size = 10;
    Chart.defaults.color = '#64748B';
    var all = buildCustomers();

    var hc = document.getElementById('ciHealthChart');
    if (hc) {
      var keys = ['repeat', 'active', 'pipeline', 'risk'];
      charts.push(new Chart(hc, {
        type: 'doughnut',
        data: {
          labels: keys.map(function (k) { return HEALTH[k].label; }),
          datasets: [{
            data: keys.map(function (k) { return all.filter(function (c) { return c.health === k; }).length; }),
            backgroundColor: ['#7C3AED', '#16A34A', '#2563EB', '#DC2626'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          layout: { padding: 18 },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } } }
        }
      }));
    }

    var tc = document.getElementById('ciTopChart');
    if (tc) {
      var top = all.slice().sort(function (a, b) { return b.won - a.won; }).filter(function (c) { return c.won > 0; }).slice(0, 5);
      if (!top.length) {
        /* ไม่มีข้อมูล → แสดงข้อความ แทนกราฟที่แกนไม่มีความหมาย */
        var box = tc.parentNode;
        if (box) box.innerHTML = '<div class="ci-empty"><i class="fa-regular fa-chart-bar"></i><div>ยังไม่มียอดปิดงาน — เมื่อมีดีลที่ปิดแล้ว กราฟ Top 5 จะแสดงที่นี่</div></div>';
      } else {
        charts.push(new Chart(tc, {
        type: 'bar',
        data: {
          labels: top.map(function (c) { return c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name; }),
          datasets: [{ label: 'ยอดปิดงาน', data: top.map(function (c) { return c.won; }), backgroundColor: '#2563EB', borderRadius: 5, maxBarThickness: 34 }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (x) { return money(x.parsed.x); } } }
          },
          scales: {
            x: { beginAtZero: true, ticks: { callback: function (v) { return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : (v / 1000) + 'K'; } }, grid: { color: '#EFF3F8' } },
            y: { grid: { display: false } }
          }
        }
        }));
      }
    }
  }

  /* ---------- events ---------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'ciSearch') return;
    state.q = e.target.value;
    global.render();
    var inp = document.getElementById('ciSearch');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });

  document.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('[data-ci-filter]');
    if (!sel) return;
    state[sel.getAttribute('data-ci-filter')] = sel.value;
    global.render();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-ci-reset]')) { state = { q: '', health: '', sale: '', sortKey: 'won', sortDir: -1 }; global.render(); return; }
    var s = t.closest('[data-ci-sort]');
    if (s) {
      var k = s.getAttribute('data-ci-sort');
      if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = -1; }
      global.render();
      return;
    }
    var c = t.closest('[data-ci-cust]');
    if (c) { openCustomer(c.getAttribute('data-ci-cust')); return; }
  });

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('ci-style')) return;
    var css = ''
      + '.ci{padding-bottom:6px}'
      + '.ci-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.ci-head h1{margin:0;color:#0F2B46;font-size:21px;font-weight:600}'
      + '.ci-sub{color:#667085;font-size:11.5px;margin-top:4px;line-height:1.5}'
      + '.ci-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px}'
      + '.ci-kpi{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.ci-kpi-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10.5px;min-height:26px}'
      + '.ci-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;flex:0 0 28px}'
      + '.ci-kpi-val{font-size:20px;font-weight:600;margin:8px 0 8px;color:#0F2B46}'
      + '.ci-kpi-sub{font-size:10px;color:#667085;margin-top:8px;line-height:1.5}'
      + '.ci-bar{height:6px;background:#EEF2F7;border-radius:99px;overflow:hidden}'
      + '.ci-bar span{display:block;height:100%;border-radius:99px}'
      + '.ci-filters{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1.4fr repeat(2,minmax(0,1fr)) auto;gap:10px;'
      + 'background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 18px rgba(15,43,70,.07);margin-bottom:14px}'
      + '.ci-fl{display:grid;gap:5px;min-width:0}'
      + '.ci-fl label{font-size:10px;color:#667085;font-weight:500}'
      + '.ci-fl select{width:100%;min-width:0;border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;padding:7px 8px;'
      + 'font-size:11px;min-height:34px;outline:none;font-family:inherit}'
      + '.ci-search{position:relative}'
      + '.ci-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#98A2B3;font-size:10px}'
      + '.ci-search input{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px 8px 26px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-height:34px}'
      + '.ci-fbtn{display:flex;align-items:flex-end}'
      + '.ci-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 11px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.ci-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.ci-btn.sm{height:auto;padding:5px 9px;font-size:10px}'
      + '.ci-charts{display:grid;grid-template-columns:1fr 1.25fr;gap:14px;margin-bottom:14px}'
      + '.ci-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:15px;box-shadow:0 2px 8px rgba(15,43,70,.05);margin-bottom:14px;min-width:0}'
      + '.ci-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}'
      + '.ci-ph h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.ci-s2{color:#98A2B3;font-size:9.5px;margin-top:3px;line-height:1.5}'
      + '.ci-chartbox{position:relative;height:215px}'
      + '.ci-tablewrap{overflow:auto;width:100%}'
      + '.ci-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11.5px}'
      + '.ci-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:10px;padding:9px 10px;text-align:left;border-bottom:1px solid #E9EEF5}'
      + '.ci-table td{padding:10px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:middle}'
      + '.ci-table tbody tr:last-child td{border-bottom:0}'
      + '.ci-row{cursor:pointer}'
      + '.ci-row:hover td{background:#F8FBFF}'
      + '.ci-num{text-align:right;font-variant-numeric:tabular-nums}'
      + '.ci-strong{font-weight:600;color:#0F2B46}'
      + '.ci-nm{color:#0F2B46;font-weight:500;font-size:11.5px}'
      + '.ci-dim{color:#C2CBD8}'
      + '.ci-rec-cell{color:#667085;font-size:10.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis}'
      + '.ci-acts{text-align:right}'
      + '.ci-empty{text-align:center;color:#98A2B3;padding:20px}'
      + '.ci-chartbox .ci-empty{display:grid;place-content:center;gap:8px;height:100%;padding:0;line-height:1.6;font-size:11px}'
      + '.ci-chartbox .ci-empty i{font-size:22px;color:#C7D2E0}'
      + '.ci-sortable{cursor:pointer;user-select:none}'
      + '.ci-sortable:hover{background:#EEF2F7;color:#344054}'
      + '.ci-arrow{font-size:8px;color:#2563EB}'
      + '.ci-badge{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:3px 9px;font-size:9.5px;font-weight:500;white-space:nowrap}'
      + '.ci-badge i{font-size:8px}'
      + '.h-repeat{background:#F3E8FF;color:#6D28D9}'
      + '.h-active{background:#DCFCE7;color:#15803D}'
      + '.h-pipe{background:#DBEAFE;color:#1D4ED8}'
      + '.h-risk{background:#FEE2E2;color:#B91C1C}'
      + '.s0{background:#F1F5F9;color:#475569}.s1{background:#F3E8FF;color:#6D28D9}'
      + '.s2{background:#FEF3C7;color:#B45309}.s3{background:#E0F2FE;color:#0369A1}'
      + '.s4{background:#DBEAFE;color:#1D4ED8}.s5{background:#FEE2E2;color:#B91C1C}'
      + '.ci-dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'
      + '.ci-dgrid>div{background:#F8FAFC;border-radius:9px;padding:10px}'
      + '.ci-dgrid small{display:block;color:#98A2B3;font-size:9px;margin-bottom:4px}'
      + '.ci-dgrid strong{color:#0F2B46;font-size:11.5px;font-weight:500}'
      + '.ci-recommend{display:flex;gap:11px;margin-top:13px;background:#EFF6FF;border:1px solid #DBEAFE;border-radius:10px;padding:12px 14px}'
      + '.ci-recommend i{color:#2563EB;font-size:15px;margin-top:2px}'
      + '.ci-recommend b{color:#1E40AF;font-size:12px}'
      + '.ci-recommend p{margin:5px 0 0;color:#1E3A8A;font-size:11px;line-height:1.65}'
      + '.ci-sect{margin:16px 0 9px;font-size:11px;color:#0F2B46}'
      + '@media(max-width:1024px){.ci-filters{grid-template-columns:1fr 1fr}.ci-charts{grid-template-columns:1fr}}'
      + '@media(max-width:760px){.ci-filters{position:static;grid-template-columns:1fr}.ci-kpis{grid-template-columns:1fr 1fr}'
      + '.ci-dgrid{grid-template-columns:1fr 1fr}.ci-head h1{font-size:18px}}'
      + '@media(max-width:480px){.ci-kpis{grid-template-columns:1fr}.ci-dgrid{grid-template-columns:1fr}}';
    var el = document.createElement('style');
    el.id = 'ci-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  global.CustomerIntel = { render: render, drawCharts: drawCharts, customers: buildCustomers };
})(window);
