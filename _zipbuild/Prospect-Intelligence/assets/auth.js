/**
 * Prospect Intelligence Sales workspace — client-side auth (HTML ล้วน)
 *
 * ใช้ localStorage เป็นฐานข้อมูลผู้ใช้ (เหมาะกับ demo / static hosting)
 * - Admin 4 บัญชีถูก seed อัตโนมัติครั้งแรก
 * - รหัสผ่านเก็บเป็น SHA-256 + salt
 * - Session อายุ 12 ชั่วโมง
 *
 * หมายเหตุ: ไม่ใช่ระบบความปลอดภัยระดับ production (ข้อมูลอยู่ในเบราว์เซอร์)
 */
(function (global) {
  var USERS_KEY = 'pi_users_v1';
  var SESSION_KEY = 'pi_session_v1';
  var TTL_MS = 12 * 3600 * 1000;
  var DEFAULT_PASSWORD = 'Tsr@2026';
  var CORE_ADMINS = [
    'aodpongtaptsr@gmail.com',
    'bch.sarocha@gmail.com',
    'sittharphon.1994@gmail.com',
    'chanphaphat.k@gmail.com'
  ];

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }

  function randSalt() {
    var s = '';
    var c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (var i = 0; i < 16; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  function randPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#';
    var out = '';
    for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function sha256(text) {
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        });
    }
    // fallback (เบราว์เซอร์เก่า): hash แบบง่าย
    var h = 0;
    for (var i = 0; i < text.length; i++) { h = ((h << 5) - h + text.charCodeAt(i)) | 0; }
    return Promise.resolve('simple$' + (h >>> 0).toString(16));
  }

  function hash(pw, salt) { return sha256(String(pw) + '|' + String(salt)); }

  /* ---------- seed ---------- */
  function seed() {
    var users = readUsers();
    var changed = false;
    CORE_ADMINS.forEach(function (em) {
      var exists = users.some(function (u) { return u.email === em; });
      if (!exists) {
        var salt = randSalt();
        users.push({
          email: em, name: '', level: 'admin', status: 'active',
          salt: salt, hash: 'pending', createdAt: new Date().toISOString(), lastLogin: ''
        });
        changed = true;
      }
    });
    if (changed) writeUsers(users);
    // hash รหัสเริ่มต้นแบบ async ให้ครบทุกบัญชีที่ยัง pending
    var jobs = users.filter(function (u) { return u.hash === 'pending'; }).map(function (u) {
      return hash(DEFAULT_PASSWORD, u.salt).then(function (h) {
        u.hash = h;
      });
    });
    return Promise.all(jobs).then(function () {
      writeUsers(users);
      return users;
    });
  }

  /* ---------- session ---------- */
  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!s || Number(s.exp) < Date.now()) return null;
      return s;
    } catch (e) { return null; }
  }
  function setSession(data) {
    data.exp = Date.now() + TTL_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function isAdmin(s) { return !!s && String(s.level).toLowerCase() === 'admin'; }

  /* ---------- api ---------- */
  function login(email, password) {
    return seed().then(function (users) {
      var e = String(email || '').trim().toLowerCase();
      var u = users.filter(function (x) { return x.email === e; })[0];
      if (!u) return { ok: false, error: 'ไม่พบอีเมลนี้ในระบบ กรุณาติดต่อผู้ดูแล' };
      if (u.status === 'disabled') return { ok: false, error: 'บัญชีนี้ถูกปิดการใช้งาน' };
      return hash(password, u.salt).then(function (h) {
        if (h !== u.hash) return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
        u.lastLogin = new Date().toISOString();
        writeUsers(users);
        var s = { email: u.email, name: u.name, level: u.level };
        setSession(s);
        return { ok: true, user: s };
      });
    });
  }

  function listUsers() {
    return readUsers().map(function (u) {
      return { email: u.email, name: u.name, level: u.level, status: u.status, createdAt: u.createdAt, lastLogin: u.lastLogin };
    });
  }

  function addUser(email, name, level) {
    var e = String(email || '').trim().toLowerCase();
    if (!e || e.indexOf('@') < 0) return Promise.reject(new Error('อีเมลไม่ถูกต้อง'));
    var users = readUsers();
    if (users.some(function (u) { return u.email === e; })) return Promise.reject(new Error('มีอีเมลนี้ในระบบแล้ว'));
    var pw = randPassword();
    var salt = randSalt();
    return hash(pw, salt).then(function (h) {
      users.push({
        email: e, name: String(name || ''), level: String(level || 'viewer').toLowerCase(),
        status: 'active', salt: salt, hash: h, createdAt: new Date().toISOString(), lastLogin: ''
      });
      writeUsers(users);
      return { email: e, password: pw };
    });
  }

  function resetPassword(email) {
    var users = readUsers();
    var e = String(email || '').toLowerCase();
    var u = users.filter(function (x) { return x.email === e; })[0];
    if (!u) return Promise.reject(new Error('ไม่พบผู้ใช้นี้'));
    var pw = randPassword();
    var salt = randSalt();
    return hash(pw, salt).then(function (h) {
      u.salt = salt; u.hash = h;
      writeUsers(users);
      return { email: e, password: pw };
    });
  }

  function updateUser(email, level, status) {
    var users = readUsers();
    var e = String(email || '').toLowerCase();
    var u = users.filter(function (x) { return x.email === e; })[0];
    if (!u) return Promise.reject(new Error('ไม่พบผู้ใช้นี้'));
    var core = CORE_ADMINS.indexOf(e) >= 0;
    if (level) {
      if (core) return Promise.reject(new Error('เปลี่ยนสิทธิ์ของ Admin หลักไม่ได้'));
      u.level = String(level).toLowerCase();
    }
    if (status) {
      if (core) return Promise.reject(new Error('ปิดการใช้งาน Admin หลักไม่ได้'));
      u.status = String(status).toLowerCase();
    }
    writeUsers(users);
    return Promise.resolve({ ok: true });
  }

  function removeUser(email) {
    var users = readUsers();
    var e = String(email || '').toLowerCase();
    if (CORE_ADMINS.indexOf(e) >= 0) return Promise.reject(new Error('ลบ Admin หลักไม่ได้'));
    var next = users.filter(function (u) { return u.email !== e; });
    if (next.length === users.length) return Promise.reject(new Error('ไม่พบผู้ใช้นี้'));
    writeUsers(next);
    return Promise.resolve({ ok: true });
  }

  global.PIAuth = {
    coreAdmins: CORE_ADMINS,
    defaultPassword: DEFAULT_PASSWORD,
    seed: seed,
    login: login,
    logout: clearSession,
    session: getSession,
    isAdmin: isAdmin,
    listUsers: listUsers,
    addUser: addUser,
    resetPassword: resetPassword,
    updateUser: updateUser,
    removeUser: removeUser
  };
})(window);
