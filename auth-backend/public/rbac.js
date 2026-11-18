/* TSR3 role-based UI guard. Loaded from /api/rbac.js (server prepends window.TSR3_AUTH for the logged-in user). */
(function () {
  var A = window.TSR3_AUTH || { user: { username: '?', level: 'viewer', levelLabel: 'Viewer' }, perms: {} };
  var P = A.perms || {};
  var EDIT = [/^add-/, /^save-(?!settings$)/, /^edit-/, /^follow-/, /^project-status-/, /^create-ticket$/, /^send-line$/, /^contact-customer$/, /^schedule-maintenance$/];
  var EXPORT = [/^export-/];
  var SETTINGS = [/^save-settings$/];
  function allowed(action) {
    if (!P.edit && EDIT.some(function (r) { return r.test(action); })) return false;
    if (!P.export && EXPORT.some(function (r) { return r.test(action); })) return false;
    if (!P.settings && SETTINGS.some(function (r) { return r.test(action); })) return false;
    return true;
  }
  function deny() {
    if (typeof window.toast === 'function') window.toast('สิทธิ์ของคุณ (' + A.user.levelLabel + ') ไม่สามารถทำรายการนี้ได้');
    else alert('ไม่มีสิทธิ์ทำรายการนี้');
  }
  // Block restricted actions before the dashboard's own handlers run
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (el && !allowed(el.dataset.action)) { e.preventDefault(); e.stopImmediatePropagation(); deny(); }
  }, true);
  if (!P.edit) document.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('.project-card')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Hide restricted controls
  var css = '';
  if (!P.edit) css += '[data-action^="add-"],[data-action^="save-"]:not([data-action="save-settings"]),[data-action^="edit-"],[data-action^="follow-"],[data-action^="project-status-"],[data-action="create-ticket"],[data-action="send-line"],[data-action="contact-customer"],[data-action="schedule-maintenance"]{display:none!important}.project-card{cursor:default!important}';
  if (!P.export) css += '[data-action^="export-"]{display:none!important}';
  if (!P.settings) css += '[data-action="save-settings"]{display:none!important}body.tsr3-ro-settings .content input,body.tsr3-ro-settings .content select{pointer-events:none;opacity:.6}';
  css += '.tsr3-role{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:20px;font-size:9px;background:#eff6ff;color:#1d4ed8;border:1px solid #dbeafe}' +
    '.tsr3-menu{position:relative}.tsr3-drop{display:none;position:absolute;right:0;top:44px;min-width:200px;background:#fff;border:1px solid #E5EAF0;border-radius:10px;box-shadow:0 8px 24px rgba(15,43,70,.12);padding:6px;z-index:50}' +
    '.tsr3-menu.open .tsr3-drop{display:block}.tsr3-drop a,.tsr3-drop button{display:flex;gap:8px;align-items:center;width:100%;padding:9px 10px;border:0;background:none;color:#344054;text-decoration:none;border-radius:7px;font-size:12px;text-align:left}' +
    '.tsr3-drop a:hover,.tsr3-drop button:hover{background:#f1f5f9}.tsr3-drop .danger{color:#DC2626}.tsr3-ro-banner{margin:0 0 14px;padding:9px 12px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:11px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setup() {
    // Profile → real user + menu
    var prof = document.querySelector('.topbar .profile');
    if (prof) {
      var name = A.user.displayName || A.user.username;
      var av = prof.querySelector('.avatar'); if (av) av.textContent = name.slice(0, 2).toUpperCase();
      var copy = prof.querySelector('.profile-copy');
      if (copy) copy.innerHTML = '<strong>' + esc(name) + '</strong><small>' + esc(A.user.levelLabel) + '</small>';
      var wrap = document.createElement('div'); wrap.className = 'tsr3-menu';
      prof.parentNode.insertBefore(wrap, prof); wrap.appendChild(prof); prof.style.cursor = 'pointer';
      var drop = document.createElement('div'); drop.className = 'tsr3-drop';
      drop.innerHTML = (P.manageUsers ? '<a href="/admin/users"><i class="fa-solid fa-users-gear"></i>จัดการผู้ใช้ (Users)</a>' : '') +
        '<button type="button" id="tsr3ChangePw"><i class="fa-solid fa-key"></i>เปลี่ยนรหัสผ่าน</button>' +
        '<button type="button" id="tsr3Logout" class="danger"><i class="fa-solid fa-right-from-bracket"></i>ออกจากระบบ (Logout)</button>';
      wrap.appendChild(drop);
      prof.addEventListener('click', function (e) { e.stopPropagation(); wrap.classList.toggle('open'); });
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
      // Visible logout button next to profile
      var lo = document.createElement('button'); lo.className = 'icon-btn'; lo.title = 'ออกจากระบบ (Logout)'; lo.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
      lo.addEventListener('click', logout); wrap.parentNode.appendChild(lo);
      drop.querySelector('#tsr3Logout').addEventListener('click', logout);
      drop.querySelector('#tsr3ChangePw').addEventListener('click', changePw);
    }
    // Sidebar link for master
    var nav = document.getElementById('navList');
    if (nav && P.manageUsers) {
      var a = document.createElement('a'); a.className = 'nav-item'; a.href = '/admin/users'; a.style.textDecoration = 'none';
      a.innerHTML = '<i class="fa-solid fa-users-gear"></i>User Management'; nav.appendChild(a);
    }
    // Read-only banner for viewers / settings notice
    var content = document.getElementById('content');
    if (content) new MutationObserver(function () {
      var onSettings = typeof currentPage !== 'undefined' && currentPage === 'settings';
      document.body.classList.toggle('tsr3-ro-settings', onSettings && !P.settings);
      if ((!P.edit || (onSettings && !P.settings)) && !content.querySelector('.tsr3-ro-banner')) {
        var b = document.createElement('div'); b.className = 'tsr3-ro-banner';
        b.innerHTML = '<i class="fa-solid fa-eye"></i> โหมดดูอย่างเดียว (Read-only) — บัญชี ' + esc(A.user.username) + ' ระดับ ' + esc(A.user.levelLabel);
        content.insertBefore(b, content.firstChild);
      }
    }).observe(content, { childList: true });
  }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-TSR3': '1' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }
  function logout() { api('POST', '/api/logout').finally(function () { location.href = '/login'; }); }
  function changePw() {
    var cur = prompt('รหัสผ่านปัจจุบัน (Current password)'); if (cur === null) return;
    var nw = prompt('รหัสผ่านใหม่ อย่างน้อย 8 ตัว (New password)'); if (nw === null) return;
    var nw2 = prompt('ยืนยันรหัสผ่านใหม่ (Confirm)'); if (nw !== nw2) return alert('รหัสผ่านใหม่ไม่ตรงกัน');
    api('POST', '/api/me/password', { currentPassword: cur, newPassword: nw }).then(function () { alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'); }, function (e) { alert(e.message); });
  }
  window.TSR3 = { api: api, logout: logout, can: allowed };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
