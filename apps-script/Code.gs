/**
 * Prospect Intelligence Sales workspace — Google Apps Script Web App
 *
 * ระบบล็อกอิน: อีเมล + รหัสผ่าน (เก็บ hash ใน Google Sheet)
 * - Admin 4 บัญชี (ดู ADMIN_EMAILS) จัดการผู้ใช้ได้
 * - รหัสผ่านสร้างอัตโนมัติจากหน้า User Management (แสดงครั้งเดียว)
 * - Session เก็บใน Script Properties (12 ชม.)
 */

var APP_TITLE = 'Prospect Intelligence Sales workspace';
var SHEET_FILE_NAME = 'Prospect Intelligence - Users';
var SHEET_TAB = 'Users';
var LEVELS = ['admin', 'bu', 'head', 'sup', 'sale', 'agent'];
var LEVEL_LABELS = {
  admin: 'L1 · Admin',
  bu: 'L2 · BU',
  head: 'L3 · Head Team',
  sup: 'L4 · Supervisor',
  sale: 'L5 · เซลล์ (Sale)',
  agent: 'L6 · ตัวแทน / MCN'
};
function levelN_(level) {
  var i = LEVELS.indexOf(String(level || '').toLowerCase());
  return i < 0 ? LEVELS.length : i + 1;
}
var ADMIN_EMAILS = [
  'aodpongtaptsr@gmail.com'
];
// บัญชีที่เป็น "Head Sale" (L3 · Head Team) — ไม่ใช่ Admin หลัก
var HEAD_SALES_EMAILS = [
  'sittharphon.1994@gmail.com',
  'chanphaphat.k@gmail.com'
];
var SEED_PASSWORD = 'Tsr@2026';          // รหัสเริ่มต้นของ admin (แนะนำให้รีเซ็ตทันที)
var SESSION_PROP = 'SESSIONS';
var SESSION_TTL_MS = 12 * 3600 * 1000;

/* ---------------- routing ---------------- */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (String(p.api) === '1') return apiResponse_(p);
    return handleGet_(e);
  } catch (err) {
    return HtmlService.createHtmlOutput(errorPage_(err))
      .setTitle(APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * JSON / JSONP API สำหรับเว็บ HTML ภายนอก (ดึงผู้ใช้จาก Google Sheets)
 * เรียก: .../exec?api=1&action=login&email=..&password=..&callback=cb
 */
function apiResponse_(p) {
  var cb = String(p.callback || '');
  if (cb && !/^[A-Za-z0-9_$.]+$/.test(cb)) cb = '';   // กัน JS injection ผ่าน callback
  var out;
  try {
    var action = String(p.action || '');
    if (action === 'seed') { ensureSeed_(); out = { ok: true }; }
    else if (action === 'login') out = login(p.email, p.password);
    else if (action === 'me') out = getMe(p.token);
    else if (action === 'users') out = getUsers(p.token);
    else if (action === 'add') out = addUser(p.token, p.email, p.name, p.level, p.parent, p.saleId);
    else if (action === 'reset') out = resetPassword(p.token, p.email);
    else if (action === 'update') out = updateUser(p.token, p.email, p.level, p.status, p.parent, p.saleId);
    else if (action === 'remove') out = deleteUser(p.token, p.email);
    else if (action === 'deals') out = getDeals(p.token);
    else if (action === 'addDeal') out = addDeal(p.token, p.name, p.customer, p.value, p.stage, p.probability, p.close, p.nextAction, p.status);
    else if (action === 'deleteDeal') out = deleteDeal(p.token, p.id);
    else out = { ok: false, error: 'unknown action: ' + action };
  } catch (err) {
    out = { ok: false, error: (err && err.message) ? String(err.message) : String(err) };
  }
  var body = cb ? (cb + '(' + JSON.stringify(out) + ');') : JSON.stringify(out);
  return ContentService.createTextOutput(body)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  // เผื่อเรียกแบบ POST form-encoded
  var p = (e && e.parameter) || {};
  p.api = '1';
  return apiResponse_(p);
}

function handleGet_(e) {
  var page = String((e && e.parameter && e.parameter.page) || 'index').toLowerCase();
  if (page === 'login') return renderPage_('Login', 'เข้าสู่ระบบ · ' + APP_TITLE);
  if (page === 'users') return renderPage_('Users', 'User Management · ' + APP_TITLE);
  return renderPage_('Index', APP_TITLE);
}

function renderPage_(file, title) {
  var t = HtmlService.createTemplateFromFile(file);
  t.webAppUrl = getWebAppUrl();
  return t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ใช้ฝังไฟล์ HTML อื่นใน template เช่น <?!= include('AuthSheets'); ?>
 */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function errorPage_(err) {
  var msg = (err && err.message) ? String(err.message) : String(err);
  var safe = msg.replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:Segoe UI,sans-serif;background:#F8FAFC;color:#182230;padding:30px}' +
    '.card{max-width:640px;margin:auto;background:#fff;border:1px solid #E5EAF0;border-radius:12px;padding:24px}' +
    'pre{background:#fff1f2;border:1px solid #ffe4e6;color:#b91c1c;padding:12px;border-radius:8px;white-space:pre-wrap}</style>' +
    '</head><body><div class="card"><h2>เกิดข้อผิดพลาด</h2><pre>' + safe + '</pre>' +
    '<p><a href="' + getWebAppUrl() + '">กลับหน้าแรก</a></p></div></body></html>';
}

function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

/* ---------------- sheet store ---------------- */

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('USERS_SHEET_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_FILE_NAME);
    props.setProperty('USERS_SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) sh = ss.insertSheet(SHEET_TAB);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['email', 'name', 'level', 'status', 'passHash', 'salt', 'createdAt', 'lastLogin', 'parent', 'saleId']);
    sh.getRange('A1:J1').setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (String(sh.getRange('I1').getValue() || '') === '') {
    // อพยพข้อมูลเดิม: เพิ่มคอลัมน์ parent (ผู้ดูแลต้นสาย)
    sh.getRange('I1').setValue('parent');
    sh.getRange('A1:I1').setFontWeight('bold');
  }
  if (String(sh.getRange('J1').getValue() || '') === '') {
    // อพยพข้อมูลเดิม: เพิ่มคอลัมน์ saleId (รหัสเซลส์ S01–S05 ที่ผูกกับบัญชีนี้)
    sh.getRange('J1').setValue('saleId');
    sh.getRange('A1:J1').setFontWeight('bold');
  }
  return sh;
}

function readRows_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 10).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        email: String(r[0]).trim().toLowerCase(),
        name: String(r[1] || ''),
        level: String(r[2] || 'agent').toLowerCase(),
        status: String(r[3] || 'active').toLowerCase(),
        passHash: String(r[4] || ''),
        salt: String(r[5] || ''),
        createdAt: r[6] ? String(r[6]) : '',
        lastLogin: r[7] ? String(r[7]) : '',
        parent: String(r[8] || '').trim().toLowerCase(),
        saleId: String(r[9] || '').trim().toUpperCase(),
        row: null
      };
    });
}

function findRow_(email) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  var t = String(email || '').trim().toLowerCase();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === t) return i + 2;
  }
  return 0;
}

/* ---------------- password ---------------- */

function hash_(pw, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw) + '|' + String(salt), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join('');
}

function newSalt_() { return Utilities.getUuid(); }

function randPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#';
  var out = '';
  for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/* ---------------- seed & auth ---------------- */

function ensureSeed_() {
  var existing = readRows_().map(function (r) { return r.email; });
  var sh = getSheet_();
  ADMIN_EMAILS.forEach(function (em) {
    var e = String(em).toLowerCase();
    if (existing.indexOf(e) < 0) {
      var salt = newSalt_();
      sh.appendRow([e, '', 'admin', 'active', hash_(SEED_PASSWORD, salt), salt, new Date().toISOString(), '', '', '']);
    }
  });
  // Head Sale (L3) — ปรับระดับอัตโนมัติถ้ายังเป็น admin อยู่
  HEAD_SALES_EMAILS.forEach(function (em) {
    var e = String(em).toLowerCase();
    var row = findRow_(e);
    if (!row) return;
    var lv = String(sh.getRange(row, 3).getValue() || '').toLowerCase();
    if (lv !== 'head') sh.getRange(row, 3).setValue('head');
  });
}

function session_(token) {
  if (!token) return null;
  var all = {};
  try { all = JSON.parse(PropertiesService.getScriptProperties().getProperty(SESSION_PROP) || '{}'); } catch (e) { all = {}; }
  var s = all[String(token)];
  if (!s) return null;
  if (Number(s.exp) < Date.now()) return null;
  return s;
}

function saveSession_(token, data) {
  var props = PropertiesService.getScriptProperties();
  var all = {};
  try { all = JSON.parse(props.getProperty(SESSION_PROP) || '{}'); } catch (e) { all = {}; }
  // ล้าง session หมดอายุ
  var now = Date.now();
  Object.keys(all).forEach(function (k) { if (Number(all[k].exp) < now) delete all[k]; });
  all[token] = data;
  props.setProperty(SESSION_PROP, JSON.stringify(all));
}

function isAdminLevel_(level) { return String(level).toLowerCase() === 'admin'; }
/** ใครบันทึกดีลได้: Admin / BU / Head Team / Supervisor / เซลล์ (L1–L5) */
function canSell_(level) {
  var l = String(level).toLowerCase();
  return ['admin', 'bu', 'head', 'sup', 'sale', 'editor'].indexOf(l) >= 0;
}

/* ---------------- deals (Google Sheet tab "Deals") ---------------- */

var DEALS_TAB = 'Deals';

function getDealsSheet_() {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(DEALS_TAB);
  if (!sh) {
    sh = ss.insertSheet(DEALS_TAB);
    sh.appendRow(['id', 'ownerEmail', 'ownerName', 'name', 'customer', 'value', 'stage', 'probability', 'close', 'nextAction', 'status', 'createdAt', 'updatedAt']);
    sh.getRange('A1:M1').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readDeals_() {
  var sh = getDealsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 13).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        id: String(r[0]), ownerEmail: String(r[1] || '').toLowerCase(), ownerName: String(r[2] || ''),
        name: String(r[3] || ''), customer: String(r[4] || ''), value: Number(r[5] || 0),
        stage: String(r[6] || 'Prospect'), probability: Number(r[7] || 0), close: String(r[8] || ''),
        nextAction: String(r[9] || ''), status: String(r[10] || 'Healthy'),
        createdAt: r[11] ? String(r[11]) : '', updatedAt: r[12] ? String(r[12]) : '', row: null
      };
    });
}

function findDealRow_(id) {
  var sh = getDealsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function listDeals_(s) {
  var all = readDeals_();
  if (isAdminLevel_(s.level)) return all;
  var me = String(s.email).toLowerCase();

  // Supervisor ขึ้นไป (L2–L4) เห็นดีลรวมของลูกข่ายใต้สายงานตัวเอง
  if (levelN_(s.level) <= 4) {
    var team = descendantsOf_(me).map(function (r) { return String(r.email).toLowerCase(); });
    return all.filter(function (d) {
      var o = String(d.ownerEmail || '').toLowerCase();
      return o === me || team.indexOf(o) >= 0;
    });
  }
  return all.filter(function (d) { return d.ownerEmail === me; });
}

function getDeals(key) {
  var s = session_(key);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  return { ok: true, level: s.level, deals: listDeals_(s) };
}

function addDeal(key, name, customer, value, stage, probability, close, nextAction, status) {
  var s = session_(key);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!canSell_(s.level)) throw new Error('บัญชีนี้ไม่มีสิทธิ์บันทึกดีล');

  var n = String(name || '').trim();
  var c = String(customer || '').trim();
  if (!n) throw new Error('กรุณากรอกชื่องาน/ดีล');
  if (!c) throw new Error('กรุณากรอกชื่อลูกค้า');

  var id = 'D-' + Date.now();
  var sh = getDealsSheet_();
  sh.appendRow([
    id,
    String(s.email).toLowerCase(),
    String(s.name || ''),
    n, c,
    Number(value || 0),
    String(stage || 'Prospect'),
    Number(probability || 0),
    String(close || ''),
    String(nextAction || ''),
    String(status || 'Healthy'),
    new Date().toISOString(),
    new Date().toISOString()
  ]);
  return { ok: true, id: id, deals: listDeals_(s) };
}

function deleteDeal(key, id) {
  var s = session_(key);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var row = findDealRow_(id);
  if (!row) throw new Error('ไม่พบดีลนี้');
  var sh = getDealsSheet_();
  var owner = String(sh.getRange(row, 2).getValue() || '').toLowerCase();
  if (!isAdminLevel_(s.level) && owner !== String(s.email).toLowerCase()) {
    throw new Error('ลบได้เฉพาะดีลของตนเอง');
  }
  sh.deleteRow(row);
  return { ok: true, deals: listDeals_(s) };
}

function login(email, password) {
  ensureSeed_();
  var e = String(email || '').trim().toLowerCase();
  if (!e || !password) return { ok: false, error: 'กรอกอีเมลและรหัสผ่าน' };

  var row = findRow_(e);
  if (!row) return { ok: false, error: 'ไม่พบอีเมลนี้ในระบบ กรุณาติดต่อผู้ดูแล' };

  var sh = getSheet_();
  var v = sh.getRange(row, 1, 1, 8).getValues()[0];
  if (String(v[3]).toLowerCase() === 'disabled') return { ok: false, error: 'บัญชีนี้ถูกปิดการใช้งาน' };

  if (hash_(password, String(v[5])) !== String(v[4])) return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };

  sh.getRange(row, 8).setValue(new Date().toISOString());
  var token = Utilities.getUuid().replace(/-/g, '');
  var saleId = String(sh.getRange(row, 10).getValue() || '').trim().toUpperCase();
  var data = { email: e, name: String(v[1] || ''), level: String(v[2] || 'viewer').toLowerCase(), saleId: saleId, exp: Date.now() + SESSION_TTL_MS };
  saveSession_(token, data);
  return { ok: true, token: token, email: e, name: data.name, level: data.level, saleId: saleId };
}

function getMe(token) {
  var s = session_(token);
  if (!s) return { ok: false };
  return { ok: true, email: s.email, name: s.name, level: s.level, saleId: s.saleId || '', isAdmin: isAdminLevel_(s.level) };
}

function logout(token) {
  var props = PropertiesService.getScriptProperties();
  var all = {};
  try { all = JSON.parse(props.getProperty(SESSION_PROP) || '{}'); } catch (e) { all = {}; }
  if (token) delete all[String(token)];
  props.setProperty(SESSION_PROP, JSON.stringify(all));
  return { ok: true };
}

/* ---------------- user management API ---------------- */

function publicUser_(r) {
  return {
    email: r.email, name: r.name, level: r.level, status: r.status,
    createdAt: r.createdAt, lastLogin: r.lastLogin, parent: r.parent || '',
    saleId: r.saleId || '',
    levelLabel: LEVEL_LABELS[r.level] || r.level
  };
}

/** ลูกข่ายทั้งหมดใต้สายงาน (ไม่รวมตัวเอง) */
function descendantsOf_(email) {
  var all = readRows_();
  var out = [], queue = [String(email || '').toLowerCase()], guard = 0;
  while (queue.length && guard++ < 5000) {
    var cur = queue.shift();
    all.forEach(function (r) {
      if (r.parent === cur) { out.push(r); queue.push(r.email); }
    });
  }
  return out;
}

/** ผู้ใช้ที่มองเห็นได้: admin = ทั้งหมด, อื่น ๆ = ตัวเอง + ลูกข่ายใต้สายงาน */
function visibleUsers_(me) {
  var all = readRows_();
  var myEmail = String(me.email || '').toLowerCase();
  if (isAdminLevel_(me.level)) return all;
  var ids = descendantsOf_(myEmail).map(function (r) { return r.email; });
  return all.filter(function (r) { return r.email === myEmail || ids.indexOf(r.email) >= 0; });
}

function getUsers(token) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', canManage: false, users: [], levels: LEVELS, labels: LEVEL_LABELS };
  ensureSeed_();
  var canManage = levelN_(s.level) <= 4;   // Admin / BU / Head Team / Supervisor
  return {
    ok: true, canManage: canManage, isAdmin: isAdminLevel_(s.level), me: s.email, myLevel: s.level,
    users: visibleUsers_(s).map(publicUser_), levels: LEVELS, labels: LEVEL_LABELS, admins: ADMIN_EMAILS
  };
}

function addUser(token, email, name, level, parent, saleId) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (levelN_(s.level) > 4) throw new Error('เฉพาะ Admin / BU / Head Team / Supervisor เท่านั้นที่สร้าง ID ได้');

  var e = String(email || '').trim().toLowerCase();
  if (!e || e.indexOf('@') < 0) throw new Error('อีเมลไม่ถูกต้อง');
  if (findRow_(e)) throw new Error('มีอีเมลนี้ในระบบแล้ว');

  var lv = String(level || 'agent').toLowerCase();
  if (LEVELS.indexOf(lv) < 0) throw new Error('ระดับสิทธิ์ไม่ถูกต้อง');

  // ต้องเลือกระดับที่ต่ำกว่าตัวเอง (ยกเว้น admin สร้างได้ทุก nível)
  if (!isAdminLevel_(s.level) && levelN_(lv) <= levelN_(s.level)) {
    throw new Error('สร้างได้เฉพาะระดับที่ต่ำกว่าตัวเอง');
  }

  var p = String(parent || '').trim().toLowerCase();
  if (!p) throw new Error('ต้องเลือกผู้ดูแลต้นสาย');
  var pr = null, all = readRows_();
  for (var i = 0; i < all.length; i++) if (all[i].email === p) { pr = all[i]; break; }
  if (!pr) throw new Error('ไม่พบผู้ดูแลต้นสายในระบบ');
  if (levelN_(pr.level) >= levelN_(lv)) throw new Error('ผู้ดูแลต้นสายต้องอยู่ระดับสูงกว่า');
  if (!isAdminLevel_(s.level)) {
    var myEmail = String(s.email).toLowerCase();
    var allowed = descendantsOf_(myEmail).map(function (r) { return r.email; }).concat([myEmail]);
    if (allowed.indexOf(p) < 0) throw new Error('เลือกผู้ดูแลต้นสายได้เฉพาะในสายงานของตัวเอง');
  }

  var pw = randPassword_();
  var salt = newSalt_();
  var sid = String(saleId || '').trim().toUpperCase();
  if (sid && !/^S\d{2}$/.test(sid)) throw new Error('รหัสเซลส์ต้องอยู่ในรูป S01–S99');
  getSheet_().appendRow([e, String(name || ''), lv, 'active', hash_(pw, salt), salt, new Date().toISOString(), '', p, sid]);

  return { ok: true, email: e, password: pw, users: visibleUsers_(session_(token)).map(publicUser_) };
}

function resetPassword(token, email) {
  var s = session_(token);
  if (!s || levelN_(s.level) > 4) throw new Error('เฉพาะ Admin / BU / Head Team / Supervisor เท่านั้น');

  var e = String(email || '').trim().toLowerCase();
  if (!canManageTarget_(s, e)) throw new Error('ไม่มีสิทธิ์จัดการผู้ใช้นี้ (นอกสายงาน)');
  var row = findRow_(e);
  if (!row) throw new Error('ไม่พบผู้ใช้นี้');

  var pw = randPassword_();
  var salt = newSalt_();
  var sh = getSheet_();
  sh.getRange(row, 5).setValue(hash_(pw, salt));
  sh.getRange(row, 6).setValue(salt);

  return { ok: true, email: e, password: pw };
}

/** จัดการได้เฉพาะลูกข่ายใต้สายงานของตัวเอง (admin จัดการได้ทุกคน) */
function canManageTarget_(s, targetEmail) {
  if (isAdminLevel_(s.level)) return true;
  var myEmail = String(s.email || '').toLowerCase();
  if (targetEmail === myEmail) return false;
  return descendantsOf_(myEmail).some(function (r) { return r.email === targetEmail; });
}

function updateUser(token, email, level, status, parent, saleId) {
  var s = session_(token);
  if (!s || levelN_(s.level) > 4) throw new Error('เฉพาะ Admin / BU / Head Team / Supervisor เท่านั้น');

  var e = String(email || '').trim().toLowerCase();
  if (!canManageTarget_(s, e)) throw new Error('ไม่มีสิทธิ์จัดการผู้ใช้นี้ (นอกสายงาน)');
  var row = findRow_(e);
  if (!row) throw new Error('ไม่พบผู้ใช้นี้');

  var isProtected = ADMIN_EMAILS.indexOf(e) >= 0;
  var sh = getSheet_();

  if (level !== undefined && level !== null && String(level) !== '') {
    if (isProtected) throw new Error('เปลี่ยนสิทธิ์ของ Admin หลักไม่ได้');
    var lv = String(level).toLowerCase();
    if (LEVELS.indexOf(lv) < 0) throw new Error('ระดับสิทธิ์ไม่ถูกต้อง');
    if (!isAdminLevel_(s.level) && levelN_(lv) <= levelN_(s.level)) throw new Error('กำหนดได้เฉพาะระดับที่ต่ำกว่าตัวเอง');
    sh.getRange(row, 3).setValue(lv);
  }
  if (status !== undefined && status !== null && String(status) !== '') {
    if (isProtected) throw new Error('ปิดการใช้งาน Admin หลักไม่ได้');
    var st = String(status).toLowerCase();
    if (['active', 'disabled'].indexOf(st) < 0) throw new Error('สถานะไม่ถูกต้อง');
    sh.getRange(row, 4).setValue(st);
  }
  if (parent !== undefined && parent !== null && String(parent) !== '') {
    var p = String(parent).toLowerCase();
    var all = readRows_();
    var pr = null;
    for (var i = 0; i < all.length; i++) if (all[i].email === p) { pr = all[i]; break; }
    if (!pr) throw new Error('ไม่พบผู้ดูแลต้นสาย');
    if (!canManageTarget_(s, p)) throw new Error('เลือกผู้ดูแลต้นสายได้เฉพาะในสายงานของตัวเอง');
    var curLevel = String(sh.getRange(row, 3).getValue() || '').toLowerCase();
    if (levelN_(pr.level) >= levelN_(curLevel)) throw new Error('ผู้ดูแลต้นสายต้องอยู่ระดับสูงกว่า');
    sh.getRange(row, 9).setValue(p);
  }
  if (saleId !== undefined && saleId !== null) {
    var sid = String(saleId).trim().toUpperCase();
    if (sid && !/^S\d{2}$/.test(sid)) throw new Error('รหัสเซลส์ต้องอยู่ในรูป S01–S99');
    sh.getRange(row, 10).setValue(sid);
  }
  return { ok: true, users: visibleUsers_(s).map(publicUser_) };
}

function deleteUser(token, email) {
  var s = session_(token);
  if (!s || levelN_(s.level) > 4) throw new Error('เฉพาะ Admin / BU / Head Team / Supervisor เท่านั้น');

  var e = String(email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.indexOf(e) >= 0) throw new Error('ลบ Admin หลักไม่ได้');
  if (!canManageTarget_(s, e)) throw new Error('ไม่มีสิทธิ์ลบผู้ใช้นี้ (นอกสายงาน)');
  if (descendantsOf_(e).length) throw new Error('ลบไม่ได้: ยังมีลูกข่ายใต้สังกัด');

  var row = findRow_(e);
  if (!row) throw new Error('ไม่พบผู้ใช้นี้');
  getSheet_().deleteRow(row);
  return { ok: true, users: visibleUsers_(s).map(publicUser_) };
}

/* ---------------- helpers (รันมือใน editor ถ้าจำเป็น) ---------------- */

function resetUserSheet() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('USERS_SHEET_ID');
  var sh = getSheet_();
  var url = sh.getParent().getUrl();
  Logger.log('User sheet ready: ' + url);
  return url;
}

function seedAdminAccounts() {
  ensureSeed_();
  Logger.log('Seeded admins: ' + ADMIN_EMAILS.join(', ') + ' (password: ' + SEED_PASSWORD + ')');
  Logger.log('Head Sale (L3): ' + HEAD_SALES_EMAILS.join(', '));
  return ADMIN_EMAILS;
}
