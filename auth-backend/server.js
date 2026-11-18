'use strict';
// TSR3 auth backend: login, sessions (HttpOnly cookie), roles, user management.
// No external dependencies. Listens on 127.0.0.1 only; nginx proxies to it.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 9511);
const HOST = '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const COOKIE = 'tsr3_sid';
const SESSION_TTL_MS = 12 * 3600 * 1000;      // 12h sliding
const LEVELS = ['admin', 'editor', 'viewer']; // levels master can assign
const LEVEL_LABEL = { master: 'Master Admin', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

// ---------- storage ----------
function loadJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
function saveJSON(f, obj) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, f);
}
let users = loadJSON(USERS_FILE, {});      // username -> {username, hash, level, disabled, createdAt, ...}
let sessions = loadJSON(SESS_FILE, {});    // sid(sha256) -> {username, exp}
const saveUsers = () => saveJSON(USERS_FILE, users);
let sessDirty = false;
const saveSessions = () => { sessDirty = true; };
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of Object.entries(sessions)) if (s.exp < now) { delete sessions[k]; sessDirty = true; }
  if (sessDirty) { sessDirty = false; saveJSON(SESS_FILE, sessions); }
}, 5000).unref();

// ---------- passwords (scrypt) ----------
const SC = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64, SC);
  return `scrypt$${SC.N}$${SC.r}$${SC.p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, s, h] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const expect = Buffer.from(h, 'base64');
    const dk = crypto.scryptSync(pw, Buffer.from(s, 'base64'), expect.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(dk, expect);
  } catch { return false; }
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- master bootstrap (CLI) ----------
// node server.js --init-master <username> <password>  (refuses if a master already exists)
if (process.argv[2] === '--init-master') {
  const [u, pw] = process.argv.slice(3);
  if (Object.values(users).some(x => x.level === 'master')) { console.error('master already exists'); process.exit(1); }
  if (!u || !pw) { console.error('usage: --init-master <user> <pass>'); process.exit(1); }
  users[u.toLowerCase()] = { username: u.toLowerCase(), hash: hashPassword(pw), level: 'master', disabled: false, createdAt: new Date().toISOString(), createdBy: 'bootstrap' };
  saveUsers(); console.log('master created:', u.toLowerCase()); process.exit(0);
}
// node server.js --reset-master-password <password>  (break-glass, run on server only)
if (process.argv[2] === '--reset-master-password') {
  const m = Object.values(users).find(x => x.level === 'master');
  if (!m || !process.argv[3]) { console.error('no master / no password'); process.exit(1); }
  m.hash = hashPassword(process.argv[3]); m.disabled = false; saveUsers();
  console.log('master password reset for', m.username); process.exit(0);
}

// ---------- helpers ----------
const USER_RE = /^[a-z0-9._-]{3,32}$/;
function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร (min 8 chars)';
  if (pw.length > 200) return 'รหัสผ่านยาวเกินไป';
  return null;
}
function parseCookies(h) {
  const out = {}; (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const sidKey = sid => crypto.createHash('sha256').update(sid).digest('hex');
function getSession(req) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid || sid.length > 100) return null;
  const k = sidKey(sid), s = sessions[k];
  if (!s || s.exp < Date.now()) return null;
  const u = users[s.username];
  if (!u || u.disabled) { delete sessions[k]; saveSessions(); return null; }
  if (s.exp - Date.now() < SESSION_TTL_MS - 60000) { s.exp = Date.now() + SESSION_TTL_MS; saveSessions(); }
  return { key: k, user: u };
}
function killSessionsOf(username) {
  for (const [k, s] of Object.entries(sessions)) if (s.username === username) delete sessions[k];
  saveSessions();
}
function publicUser(u) {
  return { username: u.username, displayName: u.displayName || '', level: u.level, levelLabel: LEVEL_LABEL[u.level], disabled: !!u.disabled, createdAt: u.createdAt, lastLogin: u.lastLogin || null };
}
function send(res, code, body, headers = {}) {
  const isStr = typeof body === 'string';
  res.writeHead(code, Object.assign({ 'Content-Type': isStr ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e5) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function clientIp(req) { return req.headers['x-real-ip'] || req.socket.remoteAddress; }
function safeNext(n) { return (typeof n === 'string' && /^\/(?![\/\\])/.test(n) && !n.startsWith('/login') && !n.startsWith('/api/')) ? n : '/'; }
function log(...a) { console.log(new Date().toISOString(), ...a); }

// login throttling: 10 failures / 15 min per IP, 8 per username
const fails = new Map();
function tooMany(key, max) { const f = fails.get(key); return f && f.n >= max && Date.now() - f.t < 15 * 60000; }
function addFail(key) { const f = fails.get(key); if (!f || Date.now() - f.t > 15 * 60000) fails.set(key, { n: 1, t: Date.now() }); else f.n++; }

// ---------- client-side RBAC script (generated per user) ----------
const PERMS = {
  master: { edit: true, export: true, settings: true, manageUsers: true },
  admin:  { edit: true, export: true, settings: true, manageUsers: false },
  editor: { edit: true, export: true, settings: false, manageUsers: false },
  viewer: { edit: false, export: false, settings: false, manageUsers: false },
};
const RBAC_JS = fs.readFileSync(path.join(__dirname, 'public', 'rbac.js'), 'utf8');
const LOGIN_HTML = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8');
const USERS_HTML = fs.readFileSync(path.join(__dirname, 'public', 'users.html'), 'utf8');

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;
  try {
    // auth_request subrequest from nginx
    if (p === '/api/auth/check') return getSession(req) ? send(res, 204, '') : send(res, 401, '');

    if (p === '/login' && m === 'GET') {
      if (getSession(req)) return send(res, 302, '', { Location: safeNext(url.searchParams.get('next')) });
      return send(res, 200, LOGIN_HTML);
    }

    // CSRF guard: state-changing requests must be JSON + custom header (cannot be sent cross-site without CORS)
    if (m !== 'GET' && m !== 'HEAD') {
      if (req.headers['x-tsr3'] !== '1' || !(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 400, { error: 'bad request' });
    }

    if (p === '/api/login' && m === 'POST') {
      const ip = clientIp(req);
      const b = await readBody(req);
      const un = String(b.username || '').trim().toLowerCase();
      if (tooMany('ip:' + ip, 10) || tooMany('u:' + un, 8)) return send(res, 429, { error: 'พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที' });
      const u = users[un];
      const ok = verifyPassword(String(b.password || ''), u ? u.hash : DUMMY_HASH) && u && !u.disabled;
      if (!ok) { addFail('ip:' + ip); addFail('u:' + un); log('login fail', un, ip); return send(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }); }
      fails.delete('u:' + un);
      const sid = crypto.randomBytes(32).toString('base64url');
      sessions[sidKey(sid)] = { username: u.username, exp: Date.now() + SESSION_TTL_MS, ip };
      saveSessions();
      u.lastLogin = new Date().toISOString(); saveUsers();
      log('login ok', un, ip);
      return send(res, 200, { ok: true, next: safeNext(b.next), user: publicUser(u) }, { 'Set-Cookie': `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}` });
    }

    if (p === '/api/logout' && (m === 'POST')) {
      const s = getSession(req); if (s) { delete sessions[s.key]; saveSessions(); }
      return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    }

    // everything below requires login
    const s = getSession(req);
    if (p === '/logout' && m === 'GET') {
      // convenience GET logout (only clears this browser's cookie; harmless)
      if (s) { delete sessions[s.key]; saveSessions(); }
      return send(res, 302, '', { Location: '/login', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    }
    if (!s) {
      if (p.startsWith('/api/')) return send(res, 401, { error: 'unauthenticated' });
      return send(res, 302, '', { Location: '/login?next=' + encodeURIComponent(p) });
    }
    const me = s.user;

    if (p === '/api/me' && m === 'GET') return send(res, 200, { user: publicUser(me), perms: PERMS[me.level] });

    if (p === '/api/rbac.js' && m === 'GET') {
      const cfg = { user: publicUser(me), perms: PERMS[me.level] };
      return send(res, 200, 'window.TSR3_AUTH=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';\n' + RBAC_JS, { 'Content-Type': 'application/javascript; charset=utf-8' });
    }

    if (p === '/api/me/password' && m === 'POST') {
      const b = await readBody(req);
      if (!verifyPassword(String(b.currentPassword || ''), me.hash)) return send(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      const prob = pwProblem(b.newPassword); if (prob) return send(res, 400, { error: prob });
      me.hash = hashPassword(b.newPassword); saveUsers();
      for (const [k, x] of Object.entries(sessions)) if (x.username === me.username && k !== s.key) delete sessions[k];
      saveSessions(); log('password changed (self)', me.username);
      return send(res, 200, { ok: true });
    }

    // ----- master-only -----
    const isMaster = me.level === 'master';
    if (p === '/admin/users') {
      if (!isMaster) return send(res, 403, '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">403 – เฉพาะ Master Admin เท่านั้น <a href="/">กลับหน้าหลัก</a></p>');
      return send(res, 200, USERS_HTML);
    }
    if (p === '/api/users' || p.startsWith('/api/users/')) {
      if (!isMaster) { log('forbidden', me.username, m, p); return send(res, 403, { error: 'forbidden: master admin only' }); }
      if (p === '/api/users' && m === 'GET') return send(res, 200, { users: Object.values(users).map(publicUser).sort((a, b) => (a.level === 'master' ? -1 : b.level === 'master' ? 1 : a.username.localeCompare(b.username))), levels: LEVELS });
      if (p === '/api/users' && m === 'POST') {
        const b = await readBody(req);
        const un = String(b.username || '').trim().toLowerCase();
        if (!USER_RE.test(un)) return send(res, 400, { error: 'ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3-32 ตัว' });
        if (users[un]) return send(res, 409, { error: 'มีชื่อผู้ใช้นี้แล้ว' });
        if (!LEVELS.includes(b.level)) return send(res, 400, { error: 'ระดับสิทธิ์ไม่ถูกต้อง (admin/editor/viewer)' });
        const prob = pwProblem(b.password); if (prob) return send(res, 400, { error: prob });
        users[un] = { username: un, displayName: String(b.displayName || '').slice(0, 60), hash: hashPassword(b.password), level: b.level, disabled: false, createdAt: new Date().toISOString(), createdBy: me.username };
        saveUsers(); log('user created', un, b.level, 'by', me.username);
        return send(res, 201, { user: publicUser(users[un]) });
      }
      const target = decodeURIComponent(p.slice('/api/users/'.length)).toLowerCase();
      const u = users[target];
      if (!u) return send(res, 404, { error: 'ไม่พบผู้ใช้' });
      if (m === 'PATCH') {
        const b = await readBody(req);
        if (u.level === 'master') {
          // master cannot be demoted/disabled; only password/displayName may change
          if (('level' in b && b.level !== 'master') || b.disabled) return send(res, 400, { error: 'ไม่สามารถลดสิทธิ์หรือปิดบัญชี Master Admin ได้' });
        } else if ('level' in b) {
          if (!LEVELS.includes(b.level)) return send(res, 400, { error: 'ระดับสิทธิ์ไม่ถูกต้อง' });
          u.level = b.level;
        }
        if ('displayName' in b) u.displayName = String(b.displayName || '').slice(0, 60);
        if ('disabled' in b && u.level !== 'master') { u.disabled = !!b.disabled; if (u.disabled) killSessionsOf(u.username); }
        if ('password' in b) { const prob = pwProblem(b.password); if (prob) return send(res, 400, { error: prob }); u.hash = hashPassword(b.password); if (u.username !== me.username) killSessionsOf(u.username); }
        saveUsers(); log('user updated', u.username, JSON.stringify(Object.keys(b)), 'by', me.username);
        return send(res, 200, { user: publicUser(u) });
      }
      if (m === 'DELETE') {
        if (u.level === 'master') return send(res, 400, { error: 'ไม่สามารถลบ Master Admin ได้' });
        delete users[target]; saveUsers(); killSessionsOf(target);
        log('user deleted', target, 'by', me.username);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    log('error', e.message);
    return send(res, 400, { error: 'bad request' });
  }
});
server.listen(PORT, HOST, () => log(`tsr3-auth listening on ${HOST}:${PORT}; users=${Object.keys(users).length}`));
