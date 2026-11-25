/* ============================================================
   Activity Log + Backup (Admin)
   หน้าแสดงประวัติการใช้งานทั้งหมดจากแท็บ `Logs` และจัดการ backup
   ============================================================ */
(function (global) {
  'use strict';

  var st = { q: '', kind: '', by: '', limit: 300, logs: [], counts: null, err: '' };
  var loadedOnce = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function me() { return global.__ME__ || {}; }
  function canSee() { return /^(admin|bu)$/.test(String(me().level || '').toLowerCase()); }
  function isAdmin() { return String(me().level || '').toLowerCase() === 'admin'; }

  function injectCss() {
    if (document.getElementById('alCss')) return;
    var css = ''
      + '.al{font-family:Prompt,sans-serif}'
      + '.al-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}'
      + '.al-head h1{margin:0;font-size:21px;color:#0F2B46;font-weight:600}'
      + '.al-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      + '.al-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(122px,1fr));gap:10px;margin-bottom:14px}'
      + '.al-card{background:#fff;border:1px solid #E6EDF5;border-radius:12px;padding:12px 13px;box-shadow:0 2px 8px rgba(15,43,70,.05)}'
      + '.al-card span{display:block;font-size:10px;color:#667085}'
      + '.al-card b{display:block;font-size:19px;color:#0F2B46;margin-top:3px;font-weight:600;font-variant-numeric:tabular-nums}'
      + '.al-panel{background:#fff;border:1px solid #E6EDF5;border-radius:12px;box-shadow:0 2px 8px rgba(15,43,70,.05);padding:15px;margin-bottom:14px}'
      + '.al-panel h3{margin:0 0 10px;font-size:13px;color:#0F2B46;font-weight:600;display:flex;align-items:center;gap:7px}'
      + '.al-panel h3 i{color:#94A3B8;font-size:11px}'
      + '.al-fbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}'
      + '.al-fbar input,.al-fbar select{border:1px solid #DCE3EB;border-radius:8px;padding:0 10px;height:34px;font-size:11.5px;font-family:inherit;background:#fff;color:#344054}'
      + '.al-fbar input{flex:1 1 220px;max-width:320px}'
      + '.al-btn{border:1px solid #DCE3EB;background:#fff;color:#344054;border-radius:8px;padding:0 11px;height:34px;font:inherit;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}'
      + '.al-btn:hover{border-color:#B7C5D6}'
      + '.al-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      + '.al-btn.blue{background:#2563EB;border-color:#2563EB;color:#fff}'
      + '.al-btn[disabled]{opacity:.55;cursor:not-allowed}'
      + '.al-tablewrap{overflow:auto}'
      + '.al-table{width:100%;border-collapse:collapse;font-size:11px;min-width:760px}'
      + '.al-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:10px;text-align:left;padding:8px 10px;border-bottom:1px solid #E9EEF5;position:sticky;top:0}'
      + '.al-table td{padding:8px 10px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:top}'
      + '.al-table tr:hover td{background:#FAFCFF}'
      + '.al-tag{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:1px 8px;font-size:10px;white-space:nowrap;background:#F2F4F7;color:#475467}'
      + '.al-tag.add{background:#ECFDF3;color:#15803D}'
      + '.al-tag.edit{background:#EFF6FF;color:#1D4ED8}'
      + '.al-tag.del{background:#FEF2F2;color:#B91C1C}'
      + '.al-tag.auth{background:#F5F3FF;color:#6D28D9}'
      + '.al-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:#334155}'
      + '.al-empty{padding:22px;text-align:center;color:#98A2B3;font-size:12px}'
      + '.al-bk{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}'
      + '.al-bk-info{font-size:11px;color:#475467;line-height:1.7}'
      + '.al-bk-info b{color:#0F2B46}'
      + '.al-bk-ok{color:#15803D}.al-bk-warn{color:#B45309}';
    var s = document.createElement('style');
    s.id = 'alCss';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function tagOf(action) {
    var a = String(action || '');
    var cls = /add/.test(a) ? 'add' : /del/.test(a) ? 'del' : /edit|save/.test(a) ? 'edit' : /auth/.test(a) ? 'auth' : '';
    var icon = /add/.test(a) ? 'fa-plus' : /del/.test(a) ? 'fa-trash' : /edit|save/.test(a) ? 'fa-pen' : /auth/.test(a) ? 'fa-right-to-bracket' : 'fa-circle-dot';
    return '<span class="al-tag ' + cls + '"><i class="fa-solid ' + icon + '"></i> ' + esc(a || '-') + '</span>';
  }
  function fmtTs(ts) {
    if (!ts) return '—';
    var d = new Date(String(ts).length <= 10 ? ts + 'T00:00:00' : ts);
    if (isNaN(d.getTime())) return esc(ts);
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  }

  function shell() {
    var counts = st.counts || {};
    var cards = [
      ['รายการที่แสดง', counts.total || 0, 'fa-list'],
      ['ดีล', counts.deal || 0, 'fa-bullseye'],
      ['บันทึกกิจกรรม', counts.daily || 0, 'fa-clipboard-list'],
      ['โครงการ', counts.project || 0, 'fa-diagram-project'],
      ['ผู้ใช้', counts.user || 0, 'fa-user-gear'],
      ['เป้าหมาย', counts.target || 0, 'fa-bullseye']
    ].map(function (c) {
      return '<article class="al-card"><span>' + esc(c[0]) + '</span><b>' + c[1] + '</b></article>';
    }).join('');

    var kindOpts = ['', 'deal', 'daily', 'project', 'user', 'target', 'auth', 'sale'].map(function (k) {
      return '<option value="' + k + '"' + (st.kind === k ? ' selected' : '') + '>' + (k ? k : 'ทุกประเภท') + '</option>';
    }).join('');

    var users = [];
    try { users = (global.PIAuth && global.PIAuth.listUsers ? global.PIAuth.listUsers() : []) || []; } catch (e) { users = []; }
    var byOpts = '<option value="">ทุกผู้ใช้</option>' + users.map(function (u) {
      var mail = String(u.email || '').toLowerCase();
      return '<option value="' + esc(mail) + '"' + (st.by === mail ? ' selected' : '') + '>' + esc(u.name || mail) + '</option>';
    }).join('');

    return '<div class="al">'
      + '<div class="al-head"><div><h1><i class="fa-solid fa-clock-rotate-left" style="color:#2563EB;margin-right:7px"></i>Activity Log</h1>'
      + '  <div class="al-sub">ประวัติการใช้งานทั้งหมด (ดีล / บันทึกกิจกรรม / โครงการ / ผู้ใช้ / เป้าหมาย) จากแท็บ Logs บน Google Sheet — รวมทุกกิจกรรมไว้ที่เดียว (ย้ายจากแท็บ Log ในหน้า Reports แล้ว)</div></div>'
      + '  <button class="al-btn" id="alRefresh"><i class="fa-solid fa-rotate"></i> รีเฟรช</button>'
      + (isAdmin() ? '  <button class="al-btn" id="alClear" title="ล้าง Log ทั้งหมด (สำรองข้อมูลเดิมก่อน)"><i class="fa-solid fa-eraser"></i> ล้าง Log</button>' : '')
      + '</div>'
      + '<div class="al-cards">' + cards + '</div>'
      + '<section class="al-panel">'
      + '  <div class="al-fbar">'
      + '    <input id="alSearch" placeholder="ค้นหา ลูกค้า / เลขดีล / รายละเอียด / อีเมล" value="' + esc(st.q) + '">'
      + '    <select id="alKind">' + kindOpts + '</select>'
      + '    <select id="alBy">' + byOpts + '</select>'
      + '    <select id="alLimit">' + [100, 300, 500, 1000, 2000].map(function (n) {
      return '<option value="' + n + '"' + (Number(st.limit) === n ? ' selected' : '') + '>' + n + ' รายการ</option>';
    }).join('') + '</select>'
      + '    <button class="al-btn dark" id="alExport"><i class="fa-solid fa-download"></i> Export CSV</button>'
      + '  </div>'
      + '  <div id="alBody"><div class="al-empty">กำลังโหลด…</div></div>'
      + '</section>'
      + backupPanel()
      + '</div>';
  }

  function backupPanel() {
    return '<section class="al-panel" id="alBk">'
      + '  <h3><i class="fa-solid fa-cloud-arrow-up"></i> สำรองข้อมูลรายวัน (Backup)</h3>'
      + '  <div class="al-bk"><div class="al-bk-info" id="alBkInfo">กำลังอ่านสถานะ…</div>'
      + '    <div style="display:flex;gap:8px;flex-wrap:wrap">'
      + (isAdmin() ? '      <button class="al-btn blue" id="alBkNow"><i class="fa-solid fa-database"></i> สำรองเดี๋ยวนี้</button>'
        + '      <button class="al-btn" id="alBkInstall"><i class="fa-solid fa-clock"></i> เปิดสำรองอัตโนมัติ</button>'
        + '      <button class="al-btn" id="alBkCron"><i class="fa-solid fa-copy"></i> คัดลอก URL ตั้งเวลา</button>' : '')
      + '    </div></div>'
      + '</section>';
  }

  function paint() {
    var body = document.getElementById('alBody');
    if (!body) return;
    if (st.err) { body.innerHTML = '<div class="al-empty">' + esc(st.err) + '</div>'; return; }
    if (!st.logs.length) { body.innerHTML = '<div class="al-empty">ยังไม่มีรายการ (ลองล้างตัวกรอง)</div>'; return; }
    var rows = st.logs.map(function (l) {
      return '<tr><td style="white-space:nowrap">' + fmtTs(l.ts) + '</td>'
        + '<td>' + tagOf(l.action) + '</td>'
        + '<td class="al-mono">' + esc(l.ref || '-') + '</td>'
        + '<td>' + esc(l.detail || '-') + '</td>'
        + '<td class="al-mono">' + esc(l.by || '-') + '</td></tr>';
    }).join('');
    body.innerHTML = '<div class="al-tablewrap"><table class="al-table"><thead><tr>'
      + '<th style="width:130px">เวลา</th><th style="width:120px">การกระทำ</th><th style="width:220px">อ้างอิง</th>'
      + '<th>รายละเอียด</th><th style="width:190px">ผู้ใช้</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="al-sub" style="margin-top:8px">แสดง ' + st.logs.length + ' รายการล่าสุด</div>';
  }

  function load() {
    if (!(global.PIAuth && global.PIAuth.listLogs)) {
      st.err = 'ไม่พบโมดูลเชื่อมต่อ (auth-sheets.js)';
      paint();
      return;
    }
    st.err = '';
    var body = document.getElementById('alBody');
    if (body && !st.logs.length) body.innerHTML = '<div class="al-empty">กำลังโหลด…</div>';
    setTimeout(function () {
      var b2 = document.getElementById('alBody');
      if (b2 && /กำลังโหลด/.test(b2.innerText)) {
        b2.innerHTML = '<div class="al-empty">กำลังโหลดจาก Google Sheet… (ครั้งแรกอาจใช้ 3–6 วินาที)</div>';
      }
    }, 1400);
    global.PIAuth.listLogs({ q: st.q, kind: st.kind, by: st.by, limit: st.limit }).then(function (r) {
      st.logs = r.logs || [];
      st.counts = r.counts || null;
      /* อัปเดตการ์ดสรุป */
      var cards = document.querySelectorAll('.al-card b');
      if (cards && cards.length >= 6 && st.counts) {
        cards[0].textContent = st.counts.total || 0;
        cards[1].textContent = st.counts.deal || 0;
        cards[2].textContent = st.counts.daily || 0;
        cards[3].textContent = st.counts.project || 0;
        cards[4].textContent = st.counts.user || 0;
        cards[5].textContent = st.counts.target || 0;
      }
      paint();
    }).catch(function (e) {
      st.err = e.message || String(e);
      paint();
    });
  }

  function loadBackup() {
    var box = document.getElementById('alBkInfo');
    if (!box) return;
    if (!(global.PIAuth && global.PIAuth.backupInfo)) { box.textContent = '—'; return; }
    global.PIAuth.backupInfo().then(function (r) {
      var last = r.lastAt ? fmtTs(r.lastAt) : 'ยังไม่มี';
      var modeTxt = r.installed
        ? 'trigger รายวัน 02:00 (ติดตั้งแล้ว)'
        : (r.cronDaily
          ? 'ทุกวัน ~02:00 (ตัวตั้งเวลาภายนอก) + เมื่อเข้าใช้งาน'
          : (r.lazy ? 'อัตโนมัติเมื่อเข้าใช้งานครั้งแรกของวัน' : 'ยังไม่เปิด'));
      var cls = (r.installed || r.lazy) ? 'al-bk-ok' : 'al-bk-warn';
      var dest = r.lastMode === 'single'
        ? 'ไฟล์เดียวใน Google Drive: “' + esc(String(r.fileName || 'Prospect Intelligence AE workspace')) + '”'
        : (r.lastMode === 'drive'
          ? 'โฟลเดอร์ ' + esc(String(r.folderName || 'Prospect Intelligence AE workspace'))
          : (r.lastMode === 'pool'
            ? 'ไฟล์สำรองแยกใน Google Drive (' + esc(String(r.poolSize || 7)) + ' ชุดหมุนเวียน)'
            : (r.driveReady ? 'โฟลเดอร์ ' + esc(String(r.folderName || 'Prospect Intelligence AE workspace')) : 'แท็บสำรองในไฟล์เดียวกัน (' + esc(String(r.keepTabs || 3)) + ' ชุด)')));
      box.innerHTML = 'โหมดสำรองอัตโนมัติ: <b class="' + cls + '">' + esc(modeTxt) + '</b><br>'
        + 'ปลายทาง: <b>' + dest + '</b><br>'
        + 'สำรองล่าสุด: <b>' + last + '</b>' + (r.lastName ? ' · ' + esc(r.lastName) : '') + '<br>'
        + (r.lastMode === 'single'
          ? 'รูปแบบ: รวมทุกแท็บไว้ในไฟล์เดียว (เขียนทับทุกครั้ง) + แท็บ <b>_History</b> เก็บประวัติการสำรอง<br>'
          : 'เก็บย้อนหลัง <b>' + esc(String(r.retentionDays || r.keepDays || 7)) + '</b> วัน<br>')
        + (r.lastUrl ? '<div style="margin-top:6px"><a href="' + esc(r.lastUrl) + '" target="_blank" rel="noopener" '
          + 'style="color:#2563EB;font-size:10px"><i class="fa-solid fa-up-right-from-square"></i> เปิดไฟล์สำรองล่าสุด</a></div>' : '')
        + (r.cronUrl ? '<div style="margin-top:6px;font-size:9.5px;color:#98A2B3">'
          + 'ตัวตั้งเวลา: GitHub Actions ทุกวัน 19:00 UTC (02:00 ไทย) · กันการซ้ำ 20 ชม. · กด “คัดลอก URL ตั้งเวลา” ถ้าจะใช้ cron อื่น</div>' : '');
    }).catch(function (e) { box.textContent = e.message || String(e); });
  }

  function exportCsv() {
    var head = ['เวลา', 'การกระทำ', 'อ้างอิง', 'รายละเอียด', 'ผู้ใช้'];
    var lines = [head].concat(st.logs.map(function (l) {
      return [String(l.ts || '').replace('T', ' ').slice(0, 19), l.action, l.ref, l.detail, l.by];
    }));
    var csv = lines.map(function (r) {
      return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'activity-log-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function render() {
    injectCss();
    if (!canSee()) {
      return '<div class="al"><div class="al-panel"><div class="al-empty">'
        + '<i class="fa-solid fa-lock" style="margin-right:6px"></i>หน้านี้สำหรับ Admin / BU เท่านั้น</div></div></div>';
    }
    loadedOnce = false;
    setTimeout(function () { load(); loadBackup(); }, 60);
    return shell();
  }

  /* ---------- events (delegate) ---------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'alSearch') return;
    clearTimeout(window.__alT);
    window.__alT = setTimeout(function () {
      st.q = e.target.value;
      load();
    }, 320);
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'alKind') { st.kind = e.target.value; load(); }
    if (e.target.id === 'alBy') { st.by = e.target.value; load(); }
    if (e.target.id === 'alLimit') { st.limit = Number(e.target.value) || 300; load(); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#alRefresh')) { load(); loadBackup(); return; }
    if (t.closest('#alClear')) {
      if (!global.confirm('ล้าง Log ทั้งหมด? ระบบจะสำรองข้อมูลเดิมลงแท็บ Logs_archive_… ก่อนล้าง')) return;
      var bc = t.closest('#alClear');
      bc.disabled = true;
      global.PIAuth.clearLogs().then(function (r) {
        bc.disabled = false;
        if (global.toast) global.toast('ล้าง Log แล้ว ' + (r.cleared || 0) + ' รายการ' + (r.archived ? ' · สำรองไว้ที่ ' + r.archived : ''));
        st.logs = [];
        st.counts = null;
        load();
      }).catch(function (err) { bc.disabled = false; if (global.toast) global.toast('ล้างไม่สำเร็จ: ' + (err.message || err)); });
      return;
    }
    if (t.closest('#alClear')) {
      if (!global.confirm('ล้าง Log ทั้งหมด? ระบบจะสำรองข้อมูลเดิมลงแท็บ Logs_archive_… ก่อนล้าง')) return;
      var bc = t.closest('#alClear');
      bc.disabled = true;
      global.PIAuth.clearLogs().then(function (r) {
        bc.disabled = false;
        if (global.toast) global.toast('ล้าง Log แล้ว ' + (r.cleared || 0) + ' รายการ' + (r.archived ? ' · สำรองไว้ที่ ' + r.archived : ''));
        st.logs = []; st.counts = null;
        load();
      }).catch(function (err) { bc.disabled = false; if (global.toast) global.toast('ล้างไม่สำเร็จ: ' + (err.message || err)); });
      return;
    }
    if (t.closest('#alExport')) { exportCsv(); return; }
    if (t.closest('#alBkNow')) {
      var b1 = t.closest('#alBkNow');
      b1.disabled = true;
      global.PIAuth.backupNow().then(function (r) {
        b1.disabled = false;
        if (global.toast) global.toast('สำรองแล้ว: ' + r.file + (r.mode === 'pool' ? ' (ไฟล์แยกใน Drive)' : (r.mode === 'sheet' ? ' (แท็บในไฟล์)' : ' (Drive)')));
        loadBackup();
      }).catch(function (err) { b1.disabled = false; if (global.toast) global.toast('สำรองไม่สำเร็จ: ' + (err.message || err)); });
      return;
    }
    if (t.closest('#alBkInstall')) {
      var b2 = t.closest('#alBkInstall');
      b2.disabled = true;
      global.PIAuth.installBackup().then(function (r) {
        b2.disabled = false;
        if (global.toast) global.toast(r && r.installed ? 'ติดตั้ง trigger สำรองข้อมูลรายวัน 02:00 แล้ว'
          : 'เปิดโหมดสำรองอัตโนมัติแล้ว (ทุกวันเมื่อเข้าใช้งานครั้งแรก)');
        loadBackup();
      }).catch(function (err) { b2.disabled = false; if (global.toast) global.toast('ติดตั้งไม่สำเร็จ: ' + (err.message || err)); });
      return;
    }
    if (t.closest('#alBkCron')) {
      global.PIAuth.backupInfo().then(function (r) {
        var url = r.cronUrl || '';
        if (!url) { if (global.toast) global.toast('ไม่พบ URL สำหรับตั้งเวลา'); return; }
        var done = function () { if (global.toast) global.toast('คัดลอก URL ตั้งเวลา backup แล้ว'); };
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(function () { global.prompt('คัดลอก URL นี้:', url); });
        } else {
          global.prompt('คัดลอก URL นี้:', url);
        }
      }).catch(function (e) { if (global.toast) global.toast('อ่าน URL ไม่สำเร็จ: ' + (e.message || e)); });
      return;
    }
  });

  global.AuditLog = { render: render };
})(window);
