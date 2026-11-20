/* ============================================================
   Team & Permissions (UX/UI ใหม่)
   - สรุปภาพรวม + ค้นหา/กรอง + ตารางผู้ใช้
   - ลงทะเบียน ID ผ่าน modal (แสดงรหัสผ่านครั้งเดียว)
   - แผนผังเครือข่ายแบบ popup + ผูกทีม BU เดียวกับ Reports
   ============================================================ */
(function (global) {
  'use strict';

  var LADDER = [
    { code: 'admin', n: 1, label: 'Admin' },
    { code: 'bu', n: 2, label: 'BU' },
    { code: 'head', n: 3, label: 'Head Team' },
    { code: 'sup', n: 4, label: 'Supervisor' },
    { code: 'sale', n: 5, label: 'เซลล์ (Sale)' },
    { code: 'agent', n: 6, label: 'ตัวแทน / MCN' }
  ];
  function ladder(code) {
    code = String(code || '').toLowerCase();
    for (var i = 0; i < LADDER.length; i++) if (LADDER[i].code === code) return LADDER[i];
    return { code: code, n: 6, label: code || '-' };
  }

  var USERS = [], LOADED = false, LOADING = false, ERR = '';
  var state = { q: '', level: '', team: '' };

  function me() { return global.__ME__ || {}; }
  function myLevel() { return ladder(me().level); }
  function canRegister() { return myLevel().n <= 3; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function teamHeads() { return (global.SalesReport && global.SalesReport.teamHeads) || {}; }
  function teamList() {
    var t = (global.SalesReport && global.SalesReport.teams) ? global.SalesReport.teams() : [];
    return t.map(function (x) { return x.code; });
  }

  /** ทีม (BU) ของผู้ใช้ = ไล่ขึ้นหาต้นสายที่เป็น Head Sale */
  function teamOf(u) {
    var heads = teamHeads();
    var seen = {}, cur = u, guard = 0;
    while (cur && guard++ < 10) {
      var em = String(cur.email || '').toLowerCase();
      if (heads[em]) return heads[em];
      if (seen[em]) break;
      seen[em] = 1;
      var p = null;
      for (var i = 0; i < USERS.length; i++) {
        if (String(USERS[i].email || '').toLowerCase() === String(cur.parent || '').toLowerCase()) p = USERS[i];
      }
      cur = p;
    }
    return '';
  }

  function load(force) {
    if (!global.PIAuth || !global.PIAuth.refresh) return;
    if (LOADING) return;
    if (LOADED && !force) return;
    LOADING = true;
    ERR = '';
    global.PIAuth.refresh().then(function (list) {
      USERS = list || []; LOADED = true; LOADING = false;
      global.__TEAM__ = USERS;                 // แชร์ให้โมดูลอื่น (scope/สิทธิ์) ใช้ต่อโดยไม่ต้องยิง API ซ้ำ
      global.__TEAM_READY__ = true;
      if (global.render) global.render();
    }).catch(function (e) {
      USERS = []; LOADED = true; LOADING = false; ERR = (e && e.message) || 'โหลดรายชื่อไม่สำเร็จ';
      if (global.render) global.render();
    });
  }

  function filtered() {
    var q = String(state.q || '').trim().toLowerCase();
    return USERS.filter(function (u) {
      if (state.level && u.level !== state.level) return false;
      if (state.team && teamOf(u) !== state.team) return false;
      if (q && (String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------------- UI ---------------- */
  function statCard(label, value, sub, color, icon) {
    return '<article class="tp-stat">'
      + '<div class="tp-stat-top"><span>' + esc(label) + '</span>'
      + '<span class="tp-ico" style="background:' + color + '18;color:' + color + '"><i class="' + icon + '"></i></span></div>'
      + '<div class="tp-stat-val" style="color:' + color + '">' + value + '</div>'
      + '<div class="tp-stat-sub">' + sub + '</div></article>';
  }

  function render() {
    injectCss();
    load();

    var my = myLevel();
    var canReg = canRegister();
    global.__CAN_REGISTER__ = canReg;

    var byTeam = {};
    USERS.forEach(function (u) { var t = teamOf(u); byTeam[t || ''] = (byTeam[t || ''] || 0) + 1; });
    var direct = USERS.filter(function (u) { return String(u.parent || '').toLowerCase() === String(me().email || '').toLowerCase(); }).length;

    var teamLine = Object.keys(byTeam).filter(function (k) { return k; }).map(function (k) { return k + ' ' + byTeam[k]; }).join(' · ') || 'ยังไม่ผูกทีม';
    var unassigned = byTeam[''] || 0;

    var head = '<div class="tp-head">'
      + '<div><h1>ทีม &amp; สิทธิ์</h1>'
      + '<div class="tp-sub">คุณคือ <b>L' + my.n + ' ' + my.label + '</b> · '
      + (my.n === 1 ? 'เห็นทั้งเครือข่าย' : 'เห็นเฉพาะผู้ใช้ในสายงานของคุณ')
      + (canReg ? ' · ลงทะเบียน ID ได้' : ' · อ่านอย่างเดียว') + '</div></div>'
      + '<div class="tp-head-acts">'
      + '<button class="tp-btn" data-tp-tree><i class="fa-solid fa-sitemap"></i> แผนผังเครือข่าย</button>'
      + (canReg ? '<button class="tp-btn dark" data-tp-new><i class="fa-solid fa-user-plus"></i> ลงทะเบียน ID</button>' : '')
      + '</div></div>';

    var stats = '<div class="tp-stats">'
      + statCard('ผู้ใช้ในสายงาน', USERS.length + ' คน', 'รวมตัวเอง', '#0F2B46', 'fa-solid fa-users')
      + statCard('ลูกข่ายตรง', direct + ' คน', 'ที่คุณดูแลโดยตรง', '#2563EB', 'fa-solid fa-user-group')
      + statCard('แยกตามทีม (BU)', (Object.keys(byTeam).filter(function (k) { return k; }).length) + ' ทีม', teamLine, '#7C3AED', 'fa-solid fa-people-group')
      + statCard('ยังไม่ผูกทีม', unassigned + ' คน', 'กำหนด Head Sale ของทีมเพื่อผูกอัตโนมัติ', '#94A3B8', 'fa-solid fa-link-slash')
      + '</div>';

    var levelOpts = '<option value="">ทุกระดับ</option>' + LADDER.map(function (l) {
      return '<option value="' + l.code + '"' + (state.level === l.code ? ' selected' : '') + '>L' + l.n + ' · ' + l.label + '</option>';
    }).join('');
    var teamOpts = '<option value="">ทุกทีม</option>' + teamList().map(function (t) {
      return '<option value="' + esc(t) + '"' + (state.team === t ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '<option value="__none"' + (state.team === '__none' ? ' selected' : '') + '>ยังไม่ผูกทีม</option>';

    var toolbar = '<div class="tp-toolbar">'
      + '<div class="tp-search"><i class="fa-solid fa-magnifying-glass"></i>'
      + '<input id="tpSearch" placeholder="ค้นหาชื่อ / อีเมล" value="' + esc(state.q) + '"></div>'
      + '<select data-tp-filter="level">' + levelOpts + '</select>'
      + '<select data-tp-filter="team">' + teamOpts + '</select>'
      + '<button class="tp-btn" data-tp-reset><i class="fa-solid fa-rotate-left"></i> ล้าง</button>'
      + '</div>';

    var list = filtered();
    var rows = list.map(function (u) {
      var l = ladder(u.level), bu = teamOf(u), isMe = String(u.email).toLowerCase() === String(me().email || '').toLowerCase();
      var label = String(u.name || '').trim();
      var initial = label ? label.charAt(0) : String(u.email || '?').slice(0, 2).toUpperCase();
      var upName = '-';
      for (var i = 0; i < USERS.length; i++) if (String(USERS[i].email).toLowerCase() === String(u.parent || '').toLowerCase()) upName = USERS[i].name || USERS[i].email;
      if (u.parent && upName === '-') upName = u.parent;
      return '<tr>'
        + '<td><div class="tp-user"><span class="tp-av tp-l' + l.n + '">' + esc(initial) + '</span>'
        + '<div style="min-width:0"><div class="tp-nm">' + esc(u.name || u.email) + (isMe ? ' <span class="tp-me">คุณ</span>' : '') + '</div>'
        + '<div class="tp-s2">' + esc(u.email) + '</div></div></div></td>'
        + '<td><span class="tp-badge lv' + l.n + '">L' + l.n + ' · ' + esc(l.label) + '</span></td>'
        + '<td>' + (bu ? '<span class="tp-badge bu">' + esc(bu) + '</span>' : '<span class="tp-dim">—</span>') + '</td>'
        + '<td class="tp-s2">' + esc(upName) + '</td>'
        + '<td>' + (u.status === 'disabled' ? '<span class="tp-badge off">ปิด</span>' : '<span class="tp-badge on">ใช้งาน</span>') + '</td>'
        + '<td class="tp-s2">' + (u.createdAt ? esc(String(u.createdAt).slice(0, 10)) : '—') + '</td>'
        + '</tr>';
    }).join('');

    var table = '<section class="tp-panel">'
      + '<div class="tp-ph"><div><h3>ผู้ใช้ในสายงาน (' + list.length + (list.length !== USERS.length ? '/' + USERS.length : '') + ')</h3>'
      + '<div class="tp-s2">คลิก “แผนผังเครือข่าย” ด้านบนเพื่อดูโครงสร้างทั้งสายงาน</div></div></div>'
      + toolbar
      + (ERR ? '<div class="tp-err"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(ERR)
            + ' <button class="tp-btn" data-tp-action="retry" style="margin-left:8px"><i class="fa-solid fa-rotate-right"></i> ลองอีกครั้ง</button></div>' : '')
      + (LOADING ? skeletonRows() :
            (list.length
              ? '<div class="tp-tablewrap"><table class="tp-table"><thead><tr>'
                + '<th>ชื่อ / อีเมล</th><th>ระดับ</th><th>ทีม (BU)</th><th>ผู้ดูแลสาย</th><th>สถานะ</th><th>สร้างเมื่อ</th>'
                + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
              : '<div class="tp-empty"><i class="fa-solid fa-users-slash"></i>ไม่พบผู้ใช้ตามเงื่อนไข</div>'))
      + '</section>';

    return '<div class="tp">' + head + stats + table + '</div>';
  }

  /** Skeleton ระหว่างรอข้อมูลจากเซิร์ฟเวอร์ (แทนข้อความ “กำลังโหลด…” เฉย ๆ) */
  function skeletonRows() {
    var one = '<div class="tp-sk-row">'
      + '<span class="tp-sk tp-sk-av"></span>'
      + '<div style="flex:1"><span class="tp-sk tp-sk-line" style="width:52%"></span>'
      + '<span class="tp-sk tp-sk-line" style="width:34%;margin-top:6px"></span></div>'
      + '<span class="tp-sk tp-sk-pill"></span><span class="tp-sk tp-sk-pill"></span>'
      + '</div>';
    var list = '';
    for (var i = 0; i < 5; i++) list += one;
    return '<div class="tp-sk-wrap">'
      + '<div class="tp-sk-hint"><i class="fa-solid fa-cloud-arrow-down"></i> กำลังโหลดรายชื่อผู้ใช้จาก Google Sheets…</div>'
      + list + '</div>';
  }

  /* ---------------- Register modal ---------------- */
  function registerModal() {
    var my = myLevel();
    var levels = LADDER.filter(function (l) { return l.n > my.n; });
    if (!levels.length) { global.toast('ไม่มีระดับให้สร้าง'); return; }
    var levelOpts = levels.map(function (l) { return '<option value="' + l.code + '">L' + l.n + ' · ' + l.label + '</option>'; }).join('');
    var body = '<form id="tpForm">'
      + '<div class="tp-hint"><i class="fa-solid fa-circle-info"></i> สร้างได้เฉพาะระดับที่ต่ำกว่าคุณ (L' + (my.n + 1) + ' ลงไป) · ระบบจะสร้างรหัสผ่านให้และแสดงเพียงครั้งเดียว</div>'
      + '<div class="tp-form">'
      + '<label class="tp-fg full">อีเมล *<input name="email" type="email" required placeholder="name@company.com"></label>'
      + '<label class="tp-fg full">ชื่อ-นามสกุล<input name="name" placeholder="ชื่อ-นามสกุล"></label>'
      + '<label class="tp-fg">ระดับสิทธิ์ *<select name="level" id="tpLevel">' + levelOpts + '</select></label>'
      + '<label class="tp-fg">ผู้ดูแลต้นสาย (Upline) *<select name="parent" id="tpParent"></select></label>'
      + '</div></form>';
    global.setModal('ลงทะเบียน ID ใหม่', 'เพิ่มผู้ใช้เข้าสายงานของคุณ', body, [
      { label: 'ยกเลิก' },
      { label: 'บันทึก + สร้างรหัสผ่าน', icon: 'fa-solid fa-check', action: 'tp-save', primary: true }
    ]);
    setTimeout(fillUplines, 30);
  }

  function fillUplines() {
    var lvSel = document.getElementById('tpLevel');
    var box = document.getElementById('tpParent');
    if (!lvSel || !box) return;
    var n = ladder(lvSel.value).n;
    var opts = [];
    var meEmail = String(me().email || '').toLowerCase();
    USERS.forEach(function (u) {
      if (ladder(u.level).n >= n) return;
      var isMe = String(u.email).toLowerCase() === meEmail;
      opts.push('<option value="' + esc(u.email) + '"' + (isMe ? ' selected' : '') + '>'
        + esc(u.name || u.email) + ' · L' + ladder(u.level).n + (isMe ? ' (คุณ)' : '') + '</option>');
    });
    if (!opts.length && meEmail) {
      opts.push('<option value="' + esc(me().email) + '" selected>' + esc(me().name || me().email) + ' · L' + myLevel().n + ' (คุณ)</option>');
    }
    box.innerHTML = opts.join('') || '<option value="">— ไม่มีผู้ใช้ระดับบน —</option>';
  }

  function saveRegister() {
    var f = document.getElementById('tpForm');
    if (!f || !f.reportValidity()) return;
    var email = (f.email.value || '').trim();
    var name = (f.name.value || '').trim();
    var level = f.level.value;
    var parent = f.parent.value;
    if (!email || email.indexOf('@') < 0) { global.toast('กรอกอีเมลให้ถูกต้อง'); return; }
    if (!parent) { global.toast('เลือกผู้ดูแลต้นสาย'); return; }
    var btn = document.querySelector('#modalFoot [data-action="tp-save"]');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }
    global.PIAuth.addUser(email, name, level, parent).then(function (r) {
      global.setModal('สร้าง ID สำเร็จ', 'กรุณาส่งรหัสผ่านนี้ให้ผู้ใช้ — ระบบจะแสดงเพียงครั้งเดียว',
        '<div class="tp-pwbox"><div class="tp-s2">' + esc(r.email) + '</div><code>' + esc(r.password) + '</code></div>',
        [{ label: 'คัดลอกรหัสผ่าน', icon: 'fa-regular fa-copy', action: 'tp-copy' }, { label: 'ปิด', primary: true }]);
      window.__TP_PW__ = r.password;
      if (global.PILog) global.PILog.add('user.add', r.email, (name || '') + ' · ระดับ ' + String(level).toUpperCase() + ' · ผู้ดูแล ' + parent);
      load(true);
    }).catch(function (e) {
      global.toast('ไม่สำเร็จ: ' + (e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = 'บันทึก + สร้างรหัสผ่าน'; }
    });
  }

  /* ---------------- Tree popup ---------------- */
  function childrenOf(email) {
    return USERS.filter(function (u) { return String(u.parent || '').toLowerCase() === String(email || '').toLowerCase(); });
  }
  function treeNode(u, depth) {
    var l = ladder(u.level), kids = childrenOf(u.email), bu = teamOf(u);
    var isMe = String(u.email).toLowerCase() === String(me().email || '').toLowerCase();
    var label = String(u.name || '').trim();
    var initial = label ? label.charAt(0) : String(u.email || '?').slice(0, 2).toUpperCase();
    return '<li><div class="tp-node' + (isMe ? ' me' : '') + '">'
      + '<span class="tp-av tp-l' + l.n + '">' + esc(initial) + '</span>'
      + '<div style="min-width:0"><div class="tp-nm">' + esc(u.name || u.email) + (isMe ? ' <span class="tp-me">คุณ</span>' : '') + '</div>'
      + '<div class="tp-s2">' + esc(u.email) + '</div></div>'
      + (kids.length ? '<span class="tp-kids">' + kids.length + ' คน</span>' : '')
      + (bu ? '<span class="tp-badge bu">' + esc(bu) + '</span>' : '')
      + '<span class="tp-badge lv' + l.n + '">L' + l.n + '</span>'
      + '</div>'
      + (kids.length ? '<ul>' + kids.map(function (k) { return treeNode(k, depth + 1); }).join('') + '</ul>' : '')
      + '</li>';
  }

  function treeModal() {
    var root = null;
    for (var i = 0; i < USERS.length; i++) if (String(USERS[i].email).toLowerCase() === String(me().email || '').toLowerCase()) root = USERS[i];
    var inTree = 0;
    (function count(n) { inTree++; childrenOf(n.email).forEach(count); })(root || { email: '' });
    var orphan = Math.max(0, USERS.length - inTree);
    var legend = LADDER.map(function (l) {
      return '<span><i class="tp-dot tp-l' + l.n + '"></i>L' + l.n + ' ' + l.label + '</span>';
    }).join('');
    var body = '<div class="tp-treewrap">'
      + '<div class="tp-legend">' + legend + '</div>'
      + (orphan ? '<div class="tp-empty" style="text-align:left;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:9px;padding:8px 11px;margin-bottom:10px">'
        + '<i class="fa-solid fa-circle-info"></i> มี ' + orphan + ' บัญชีที่ไม่ได้อยู่ในสายงานนี้ (ยังไม่กำหนดผู้ดูแลต้นสาย)</div>' : '')
      + (root ? '<ul class="tp-tree">' + treeNode(root, 0) + '</ul>'
              : '<div class="tp-empty">ไม่พบข้อมูลของคุณในระบบ</div>')
      + '</div>';
    global.setModal('แผนผังเครือข่าย', 'เริ่มจาก ' + (me().name || me().email || '-') + ' · ทั้งหมด ' + USERS.length + ' คน',
      body, [{ label: 'ปิด', primary: true }], true);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'tpSearch') return;
    state.q = e.target.value;
    var tbody = document.querySelector('.tp-table tbody');
    if (!tbody) { global.render(); return; }
    global.render();
    var inp = document.getElementById('tpSearch');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });

  document.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('[data-tp-filter]');
    if (sel) {
      state[sel.getAttribute('data-tp-filter')] = sel.value;
      global.render();
      return;
    }
    if (e.target.id === 'tpLevel') fillUplines();
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-tp-new]')) { registerModal(); return; }
    if (t.closest('[data-tp-action="retry"]')) { LOADED = false; load(true); return; }
    if (t.closest('[data-tp-tree]')) { if (!LOADED) { load(true); } treeModal(); return; }
    if (t.closest('[data-tp-reset]')) { state = { q: '', level: '', team: '' }; global.render(); return; }
    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'tp-save') { saveRegister(); return; }
      if (a === 'tp-copy') {
        var txt = String(window.__TP_PW__ || '');
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(txt).then(function () { global.toast('คัดลอกรหัสผ่านแล้ว'); },
            function () { global.toast('คัดลอกไม่สำเร็จ'); });
        } else { global.toast('คัดลอกไม่สำเร็จ'); }
        return;
      }
    }
  });

  /* ---------------- CSS ---------------- */
  function injectCss() {
    if (document.getElementById('tp-style')) return;
    var css = ''
      + '.tp{padding-bottom:6px}'
      + '.tp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.tp-head h1{margin:0;color:#0F2B46;font-size:21px;font-weight:600}'
      + '.tp-sub{color:#667085;font-size:11.5px;margin-top:4px}'
      + '.tp-head-acts{display:flex;gap:8px;flex-wrap:wrap}'
      + '.tp-btn{border:1px solid #E5EAF0;background:#fff;color:#344054;border-radius:8px;padding:8px 12px;font-size:11px;'
      + 'font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;height:34px}'
      + '.tp-btn:hover{border-color:#B7C5D6;box-shadow:0 3px 9px rgba(15,43,70,.08)}'
      + '.tp-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      + '.tp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px}'
      + '.tp-stat{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,43,70,.05);min-width:0}'
      + '.tp-stat-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;color:#667085;font-size:10.5px;min-height:26px}'
      + '.tp-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;flex:0 0 28px}'
      + '.tp-stat-val{font-size:20px;font-weight:600;margin:8px 0 6px;color:#0F2B46}'
      + '.tp-stat-sub{font-size:10px;color:#667085;line-height:1.5;overflow:hidden;text-overflow:ellipsis}'
      + '.tp-panel{background:#fff;border:1px solid #EDF0F4;border-radius:12px;padding:15px;box-shadow:0 2px 8px rgba(15,43,70,.05)}'
      + '.tp-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}'
      + '.tp-ph h3{margin:0;color:#0F2B46;font-size:13px;font-weight:600}'
      + '.tp-s2{color:#98A2B3;font-size:9.5px;margin-top:3px;line-height:1.5}'
      + '.tp-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}'
      + '.tp-search{position:relative;flex:1;min-width:180px;max-width:280px}'
      + '.tp-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#98A2B3;font-size:10px}'
      + '.tp-search input{width:100%;border:1px solid #DCE3EB;border-radius:8px;padding:8px 10px 8px 26px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-height:34px}'
      + '.tp-toolbar select{border:1px solid #DCE3EB;border-radius:8px;background:#fff;color:#344054;padding:7px 8px;'
      + 'font-size:11px;min-height:34px;outline:none;font-family:inherit;min-width:140px}'
      + '.tp-tablewrap{overflow:auto;width:100%}'
      + '.tp-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11.5px}'
      + '.tp-table th{background:#F8FAFC;color:#667085;font-weight:500;font-size:10px;padding:9px 10px;text-align:left;border-bottom:1px solid #E9EEF5}'
      + '.tp-table td{padding:10px;border-bottom:1px solid #F1F5F9;color:#344054;vertical-align:middle}'
      + '.tp-table tbody tr:last-child td{border-bottom:0}'
      + '.tp-table tbody tr:hover td{background:#F8FBFF}'
      + '.tp-user{display:flex;align-items:center;gap:9px;min-width:0}'
      + '.tp-av{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;flex:0 0 28px;background:#64748B}'
      + '.tp-l1{background:#0F2B46}.tp-l2{background:#7C3AED}.tp-l3{background:#2563EB}'
      + '.tp-l4{background:#0E9384}.tp-l5{background:#D97706}.tp-l6{background:#64748B}'
      + '.tp-nm{color:#0F2B46;font-weight:600;font-size:11.5px;display:flex;align-items:center;gap:5px}'
      + '.tp-me{background:#DBEAFE;color:#1D4ED8;border-radius:99px;padding:1px 6px;font-size:8.5px;font-weight:600}'
      + '.tp-badge{display:inline-flex;align-items:center;border-radius:99px;padding:3px 9px;font-size:9.5px;font-weight:500;white-space:nowrap}'
      + '.tp-badge.lv1{background:#E0E7FF;color:#3730A3}.tp-badge.lv2{background:#F3E8FF;color:#6D28D9}'
      + '.tp-badge.lv3{background:#DBEAFE;color:#1D4ED8}.tp-badge.lv4{background:#CCFBF1;color:#0F766E}'
      + '.tp-badge.lv5{background:#FEF3C7;color:#B45309}.tp-badge.lv6{background:#F1F5F9;color:#475569}'
      + '.tp-badge.bu{background:#EEF2FF;color:#4338CA}'
      + '.tp-badge.on{background:#DCFCE7;color:#15803D}.tp-badge.off{background:#FEE2E2;color:#B91C1C}'
      + '.tp-dim{color:#C2CBD8}'
      + '.tp-empty{text-align:center;color:#98A2B3;padding:26px;font-size:11.5px}'
      + '.tp-tag{background:#EEF2FF;color:#3730A3;border-radius:99px;padding:3px 9px;font-size:9.5px;font-weight:600}'
      + '.tp-sk-wrap{padding:4px 2px 8px}'
      + '.tp-sk-hint{font-size:10.5px;color:#98A2B3;display:flex;align-items:center;gap:6px;margin-bottom:10px}'
      + '.tp-sk-row{display:flex;align-items:center;gap:11px;padding:10px 6px;border-bottom:1px solid #F4F7FB}'
      + '.tp-sk{display:block;background:linear-gradient(90deg,#EEF2F7 25%,#F7FAFD 37%,#EEF2F7 63%);'
      + 'background-size:400% 100%;animation:tp-sk 1.3s ease infinite;border-radius:6px}'
      + '.tp-sk-av{width:30px;height:30px;border-radius:50%;flex:0 0 30px}'
      + '.tp-sk-line{height:9px}'
      + '.tp-sk-pill{width:58px;height:18px;border-radius:99px}'
      + '@keyframes tp-sk{0%{background-position:100% 50%}100%{background-position:0 50%}}'
      + '@media(prefers-reduced-motion:reduce){.tp-sk{animation:none}}'
      + '.tp-err{background:#FFF7ED;border:1px solid #FFEDD5;color:#9A3412;border-radius:9px;padding:10px 12px;font-size:11px;margin-bottom:10px}'
      + '.tp-hint{background:#EFF6FF;border:1px solid #DBEAFE;color:#1E40AF;border-radius:9px;padding:10px 12px;font-size:10.5px;line-height:1.6;margin-bottom:12px}'
      + '.tp-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
      + '.tp-fg{display:grid;gap:5px;font-size:10px;color:#475467;min-width:0}'
      + '.tp-fg.full{grid-column:1/-1}'
      + '.tp-fg input,.tp-fg select{border:1px solid #DCE3EB;border-radius:8px;padding:9px 10px;font-size:11px;'
      + 'font-family:inherit;outline:none;color:#344054;min-width:0;width:100%}'
      + '.tp-fg input:focus,.tp-fg select:focus{border-color:#60A5FA;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
      + '.tp-pwbox{background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px;text-align:center}'
      + '.tp-pwbox code{display:block;margin-top:6px;font-size:18px;font-weight:600;letter-spacing:1px;color:#0F2B46}'
      /* tree */
      + '.tp-treewrap{max-height:64vh;overflow:auto;padding:2px}'
      + '.tp-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:#667085;margin-bottom:12px;'
      + 'background:#F8FAFC;border:1px solid #EEF2F7;border-radius:9px;padding:8px 11px}'
      + '.tp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}'
      + '.tp-tree,.tp-tree ul{list-style:none;margin:0;padding:0}'
      + '.tp-tree ul{padding-left:26px;position:relative}'
      + '.tp-tree ul>li{position:relative;padding:6px 0 0}'
      + '.tp-tree ul>li::before{content:"";position:absolute;left:-13px;top:0;bottom:0;border-left:1.5px solid #E3EAF3}'
      + '.tp-tree ul>li:last-child::before{bottom:calc(100% - 34px)}'
      + '.tp-tree ul>li::after{content:"";position:absolute;left:-13px;top:34px;width:14px;border-top:1.5px solid #E3EAF3}'
      + '.tp-node{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E9EEF5;border-radius:11px;'
      + 'padding:10px 13px;position:relative;z-index:1}'
      + '.tp-node:hover{border-color:#C7D7EE;box-shadow:0 8px 18px rgba(15,43,70,.08)}'
      + '.tp-node.me{border-color:#93C5FD;background:#F5F9FF;box-shadow:0 0 0 3px rgba(37,99,235,.08)}'
      + '.tp-kids{margin-left:auto;color:#667085;font-size:9.5px;background:#F4F7FB;border-radius:99px;padding:3px 8px}'
      + '@media(max-width:1024px){.tp-tree ul{padding-left:18px}}'
      + '@media(max-width:760px){.tp-head h1{font-size:18px}.tp-stats{grid-template-columns:1fr 1fr}'
      + '.tp-form{grid-template-columns:1fr}.tp-toolbar select{min-width:120px}}'
      + '@media(max-width:480px){.tp-stats{grid-template-columns:1fr}.tp-head-acts{width:100%}}';
    var el = document.createElement('style');
    el.id = 'tp-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  global.TeamPage = {
    render: render,
    reload: function () { load(true); },
    users: function () { return USERS; }
  };
})(window);
