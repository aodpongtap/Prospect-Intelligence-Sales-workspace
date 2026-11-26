/**
 * Prospect Intelligence Sales workspace — auth ผ่าน Google Sheets (JSONP API)
 *
 * ต้องมี Apps Script Web App ที่ deploy แล้ว (api=1) และตั้ง access เป็น
 * "Anyone, even anonymous" เพื่อให้เว็บ HTML เรียกได้
 *
 * API_FALLBACK: ใช้ localStorage เมื่อเรียก API ไม่ได้ (ออฟไลน์/ยังไม่ deploy)
 */
(function (global) {
  var API = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';
  var SESSION_KEY = 'pi_session_v2';
  var TTL_MS = 12 * 3600 * 1000;

  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var cb = 'piCb_' + Math.random().toString(36).slice(2);
      var script = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('เชื่อมต่อ Google Sheets ไม่ได้ (timeout)')); }, 25000);

      function done() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = function (data) { done(); resolve(data); };
      script.onerror = function () { done(); reject(new Error('เชื่อมต่อ Google Sheets ไม่ได้')); };

      var qs = Object.keys(params)
        .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');

      script.src = API + '?api=1&callback=' + cb + '&' + qs;
      document.head.appendChild(script);
    });
  }

  function call(action, extra) {
    var params = { api: '1', action: action, _ts: Date.now() };
    Object.keys(extra || {}).forEach(function (k) { params[k] = extra[k]; });
    var qs = Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');

    return fetch(API + '?' + qs, { method: 'GET', redirect: 'follow', cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) { throw new Error('รูปแบบข้อมูลจาก API ไม่ถูกต้อง'); }
      })
      .catch(function () {
        throw new Error('เชื่อมต่อ Google Sheets ไม่ได้ กรุณาตรวจสอบสิทธิ์ที่ Apps Script');
      });
  }

  /* ---------- session (เก็บในเครื่อง) ---------- */
  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!s || Number(s.exp) < Date.now()) return null;
      return s;
    } catch (e) { return null; }
  }
  function setSession(s) {
    s.exp = Date.now() + TTL_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function token() { var s = getSession(); return s && s.token ? s.token : ''; }
  /** ระดับที่ได้สิทธิ์เท่า Admin (L1 Admin + L2 BU) */
  function isAdmin(s) { var l = s ? String(s.level).toLowerCase() : ''; return l === 'admin' || l === 'bu'; }

  /* ---------- cache รายชื่อผู้ใช้ ---------- */
  var cache = [];

  function login(email, password) {
    return call('login', { email: email, password: password }).then(function (r) {
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'เข้าสู่ระบบไม่สำเร็จ' };
      setSession({ email: r.email, name: r.name || '', level: r.level, token: r.token, saleId: r.saleId || '', team: String(r.team || '').toUpperCase() });
      if (window.PILog) {
        try {
          var prevMe = window.__ME__;
          window.__ME__ = { email: r.email, name: r.name || '', level: r.level, saleId: r.saleId || '', team: String(r.team || '').toUpperCase() };
          window.PILog.add('auth.login', r.email, 'เข้าสู่ระบบสำเร็จ · สิทธิ์ ' + String(r.level || '').toUpperCase());
          window.__ME__ = prevMe;
        } catch (e) {}
      }
      return { ok: true, user: { email: r.email, name: r.name, level: r.level, saleId: r.saleId || '', team: String(r.team || '').toUpperCase() } };
    });
  }

  function loadUsers() {
    return call('users', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
      cache = r.users || [];
      return cache;
    });
  }

  /* ---------- ข้อมูลพนักงาน (รหัสพนักงาน / เริ่มงาน / ชื่อเล่น / ติดต่อ) ---------- */
  var EMP_KEYS = ['empCode', 'startDate', 'empStatus', 'nickname', 'phone', 'lineId', 'gmail'];
  function empParam(extra) {
    if (!extra) return undefined;
    var o = {};
    for (var i = 0; i < EMP_KEYS.length; i++) {
      var k = EMP_KEYS[i];
      if (extra[k] !== undefined) o[k] = String(extra[k] == null ? '' : extra[k]).trim();
    }
    return JSON.stringify(o);
  }

  function addUser(email, name, level, parent, saleId, team, extra) {
    var params = { token: token(), email: email, name: name, level: level, parent: parent || '' };
    if (saleId !== undefined && saleId !== null) params.saleId = String(saleId).trim().toUpperCase();
    if (team !== undefined && team !== null) params.team = String(team).trim().toUpperCase();
    var ep = empParam(extra);
    if (ep) params.extra = ep;
    return call('add', params).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'เพิ่มผู้ใช้ไม่สำเร็จ');
      cache = r.users || cache;
      return { email: r.email, password: r.password };
    });
  }

  function resetPassword(email) {
    return call('reset', { token: token(), email: email }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'รีเซ็ตรหัสไม่สำเร็จ');
      return { email: r.email, password: r.password };
    });
  }

  function updateUser(email, level, status, parent, saleId, name, team, extra) {
    var params = { token: token(), email: email, level: level, status: status, parent: parent || '' };
    if (saleId !== undefined && saleId !== null) params.saleId = String(saleId).trim().toUpperCase();
    if (name !== undefined && name !== null) params.name = String(name).trim();
    if (team !== undefined && team !== null) params.team = String(team).trim().toUpperCase();
    var ep2 = empParam(extra);
    if (ep2) params.extra = ep2;
    return call('update', params).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'อัปเดตไม่สำเร็จ');
      cache = r.users || cache;
      /* ถ้าแก้สิทธิ์ของตัวเอง → อัปเดต session ในเครื่องให้ตรงทันที */
      if (params.level !== undefined && params.level !== null && String(params.level) !== '') {
        var meLv = getSession();
        if (meLv && String(meLv.email || '').toLowerCase() === String(email || '').toLowerCase()) {
          meLv.level = String(params.level).toLowerCase();
          meLv.isAdmin = meLv.level === 'admin' || meLv.level === 'bu';
          setSession(meLv);
        }
        try {
          if (window.__ME__ && String(window.__ME__.email || '').toLowerCase() === String(email || '').toLowerCase()) {
            window.__ME__.level = String(params.level).toLowerCase();
            window.__ME__.isAdmin = window.__ME__.level === 'admin' || window.__ME__.level === 'bu';
          }
        } catch (e) {}
      }
      if (params.saleId !== undefined) {
        var me = getSession();
        if (me && String(me.email || '').toLowerCase() === String(email || '').toLowerCase()) {
          me.saleId = params.saleId;
          setSession(me);
        }
        try { if (window.__ME__) window.__ME__.saleId = params.saleId; } catch (e) {}
      }
      if (params.name !== undefined) {
        var me2 = getSession();
        if (me2 && String(me2.email || '').toLowerCase() === String(email || '').toLowerCase()) {
          me2.name = params.name;
          setSession(me2);
        }
        try { if (window.__ME__) window.__ME__.name = params.name; } catch (e) {}
      }
      return { ok: true };
    });
  }

  function removeUser(email) {
    return call('remove', { token: token(), email: email }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ลบผู้ใช้ไม่สำเร็จ');
      cache = r.users || cache;
      return { ok: true };
    });
  }

  /* ---------- deals (ดีลของแต่ละคน) ---------- */
  function listDeals() {
    return call('deals', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดดีลไม่สำเร็จ');
      return r.deals || [];
    });
  }

  function addDeal(d) {
    return call('addDeal', {
      token: token(), name: d.name, customer: d.customer, value: d.value,
      stage: d.stage, probability: d.probability, close: d.close,
      nextAction: d.nextAction, status: d.status
    }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกดีลไม่สำเร็จ');
      return r;
    });
  }

  function deleteDeal(id) {
    return call('deleteDeal', { token: token(), id: id }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ลบดีลไม่สำเร็จ');
      return r;
    });
  }

  /* ---------- Deals v2: ซิงก์กับแท็บ `Deals` บน Google Sheet ---------- */
  function listDealsV2() {
    return call('dealsV2', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดดีลจากคลาวด์ไม่สำเร็จ');
      return { deals: r.deals || [], deletedNos: r.deletedNos || [], count: r.count || 0 };
    });
  }
  function saveDealV2(d) {
    return call('saveDeal', { token: token(), deal: JSON.stringify(d || {}) }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกดีลบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }
  function deleteDealV2(no) {
    return call('delDeal', { token: token(), no: no }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ลบดีลบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }
  function dealLogs(no) {
    return call('dealLogs', { token: token(), no: no }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดประวัติไม่สำเร็จ');
      return r.logs || [];
    });
  }

  /* ---------- Targets / DailyReports ---------- */
  function listTargetsV2() {
    return call('targetsV2', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดเป้าหมายไม่สำเร็จ');
      return r.targets || [];
    });
  }
  function saveTargetV2(team, year, month, amount) {
    return call('saveTarget', { token: token(), team: team, year: year, month: month, amount: amount }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกเป้าหมายไม่สำเร็จ');
      return r.targets || [];
    });
  }
  function listDailyV2() {
    return call('dailyV2', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดบันทึกกิจกรรมไม่สำเร็จ');
      return { items: r.items || [], deletedRefs: r.deletedRefs || [] };
    });
  }
  function saveDailyV2(item) {
    return call('saveDaily', { token: token(), item: JSON.stringify(item || {}) }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกกิจกรรมบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }
  function deleteDailyV2(ref) {
    return call('delDaily', { token: token(), ref: ref }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ลบบันทึกบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }

  /* ---------- Projects (Project Tracking) ---------- */
  function listProjects() {
    return call('projectsV2', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลดโครงการไม่สำเร็จ');
      return r;
    });
  }
  function saveProject(p) {
    return call('saveProject', { token: token(), project: JSON.stringify(p || {}) }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกโครงการบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }
  function deleteProject(no) {
    return call('delProject', { token: token(), no: no }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ลบโครงการบนคลาวด์ไม่สำเร็จ');
      return r;
    });
  }

  /* ---------- Activity Log / Backup ---------- */
  function listLogs(opts) {
    var o = opts || {};
    return call('logs', { token: token(), q: o.q || '', kind: o.kind || '', by: o.by || '', limit: o.limit || 300 }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'โหลด Logs ไม่สำเร็จ');
      return r;
    });
  }
  function backupInfo() {
    return call('backupInfo', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'อ่านสถานะ backup ไม่สำเร็จ');
      return r;
    });
  }
  function backupNow(mode) {
    return call('backupNow', { token: token(), mode: mode || '' }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'สำรองข้อมูลไม่สำเร็จ');
      return r;
    });
  }
  function installBackup() {
    return call('installBackup', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ติดตั้ง trigger ไม่สำเร็จ');
      return r;
    });
  }
  function clearLogs() {
    return call('logsClear', { token: token() }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ล้าง Log ไม่สำเร็จ');
      return r;
    });
  }

  global.PIAuth = {
    // ว่าง = ทุกบัญชีแก้ระดับสิทธิ์ได้จากหน้าจัดการผู้ใช้งาน
    coreAdmins: [],
    headSales: [
      'sittharphon.1994@gmail.com',
      'chanphaphat.k@gmail.com'
    ],
    defaultPassword: 'Tsr@2026',
    api: API,
    seed: function () { return loadUsers().catch(function () { return []; }); },
    login: login,
    logout: function () { clearSession(); return Promise.resolve({ ok: true }); },
    session: getSession,
    isAdmin: isAdmin,
    listUsers: function () { return cache.slice(); },
    refresh: loadUsers,
    addUser: addUser,
    resetPassword: resetPassword,
    updateUser: updateUser,
    removeUser: removeUser,
    listDeals: listDeals,
    addDeal: addDeal,
    deleteDeal: deleteDeal,
    listDealsV2: listDealsV2,
    saveDealV2: saveDealV2,
    deleteDealV2: deleteDealV2,
    dealLogs: dealLogs,
    listTargetsV2: listTargetsV2,
    saveTargetV2: saveTargetV2,
    listDailyV2: listDailyV2,
    saveDailyV2: saveDailyV2,
    deleteDailyV2: deleteDailyV2,
    listLogs: listLogs,
    listProjects: listProjects,
    saveProject: saveProject,
    deleteProject: deleteProject,
    backupInfo: backupInfo,
    backupNow: backupNow,
    installBackup: installBackup,
    clearLogs: clearLogs
  };
})(window);
