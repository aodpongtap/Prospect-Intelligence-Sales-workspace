/**
 * Prospect Intelligence Sales workspace — Google Apps Script Web App
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone with Google account  (Google จะบังคับล็อกอินให้เอง)
 *
 * User Management: เก็บรายชื่อผู้ใช้ใน Google Sheet (สร้างอัตโนมัติ)
 * Master Admin = MASTER_EMAIL เท่านั้น (กำหนดสิทธิ์/เพิ่ม/ลบผู้ใช้)
 */

var APP_TITLE = 'Prospect Intelligence Sales workspace';
var MASTER_EMAIL = 'aodpongtaptsr@gmail.com';
var SHEET_FILE_NAME = 'Prospect Intelligence - Users';
var SHEET_TAB = 'Users';
var LEVELS = ['admin', 'editor', 'viewer'];

/* ---------------- web app routes ---------------- */

function doGet(e) {
  try {
    return handleGet_(e);
  } catch (err) {
    return HtmlService.createHtmlOutput(errorPage_(err))
      .setTitle(APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function errorPage_(err) {
  var msg = (err && err.message) ? String(err.message) : String(err);
  var safe = msg.replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + APP_TITLE + '</title>' +
    '<style>body{font-family:"Prompt",Segoe UI,sans-serif;background:#F8FAFC;color:#182230;margin:0;padding:32px}' +
    '.card{max-width:680px;margin:0 auto;background:#fff;border:1px solid #E5EAF0;border-radius:14px;padding:26px;box-shadow:0 8px 24px rgba(15,43,70,.08)}' +
    'h1{font-size:19px;color:#0F2B46;margin:0 0 10px}p{font-size:13px;line-height:1.7;color:#475467}' +
    'pre{background:#fff1f2;border:1px solid #ffe4e6;color:#b91c1c;padding:12px;border-radius:9px;white-space:pre-wrap;font-size:12px}' +
    'ul{font-size:13px;color:#475467;line-height:1.8}</style></head><body><div class="card">' +
    '<h1>เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล</h1>' +
    '<p>ระบบไม่สามารถเปิด Google Sheet ที่ใช้เก็บรายชื่อผู้ใช้ได้</p><pre>' + safe + '</pre>' +
    '<p><strong>วิธีแก้ (ทำครั้งเดียว):</strong></p><ul>' +
    '<li>เปิด Apps Script Editor แล้วรันฟังก์ชัน <code>resetUserSheet</code></li>' +
    '<li>หรือรีเฟรชหน้าอีกครั้งเพื่อให้ระบบสร้างชีตใหม่ให้อัตโนมัติ</li>' +
    '<li>ตรวจว่าบัญชีที่ล็อกอินคือ aodpongtaptsr@gmail.com</li></ul>' +
    '<p><a href="' + getWebAppUrl() + '">กลับหน้าแรก</a></p></div></body></html>';
}

function handleGet_(e) {
  var page = String((e && e.parameter && e.parameter.page) || 'index').toLowerCase();
  var email = getUserEmail();
  var level = getUserLevel(email);
  touchLogin_(email);

  if (page === 'users') {
    var tpl = HtmlService.createTemplateFromFile('Users');
    tpl.userEmail = email;
    tpl.userLevel = level;
    tpl.webAppUrl = getWebAppUrl();
    return tpl.evaluate()
      .setTitle('User Management · ' + APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var t = HtmlService.createTemplateFromFile('Index');
  t.userEmail = email;
  t.userLevel = level;
  t.webAppUrl = getWebAppUrl();
  return t.evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------------- session ---------------- */

function getUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

function getSessionInfo() {
  var email = getUserEmail();
  var level = getUserLevel(email);
  return {
    email: email,
    level: level,
    canManageUsers: level === 'master',
    url: getWebAppUrl()
  };
}

/* ---------------- user store (Google Sheet) ---------------- */

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('USERS_SHEET_ID');
  var ss = null;

  // 1) เปิดจาก ID ที่เคยบันทึกไว้
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }

  // 2) ถ้ายังไม่มี/เปิดไม่ได้ → สร้างใหม่ (ไม่ใช้ DriveApp จึงไม่ต้องขอ scope drive)
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_FILE_NAME);
    props.setProperty('USERS_SHEET_ID', ss.getId());
  }

  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) {
    sh = ss.insertSheet(SHEET_TAB);
    sh.appendRow(['email', 'level', 'status', 'createdAt', 'lastLogin']);
    sh.getRange('A1:E1').setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(['email', 'level', 'status', 'createdAt', 'lastLogin']);
    sh.getRange('A1:E1').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readUsers_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, 5).getValues();
  return values
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        email: String(r[0]).trim().toLowerCase(),
        level: String(r[1] || 'viewer').trim().toLowerCase(),
        status: String(r[2] || 'active').trim().toLowerCase(),
        createdAt: r[3] ? String(r[3]) : '',
        lastLogin: r[4] ? String(r[4]) : ''
      };
    });
}

function findRow_(email) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var values = sh.getRange(2, 1, last - 1, 1).getValues();
  var target = String(email || '').trim().toLowerCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === target) return i + 2;
  }
  return 0;
}

function getUserLevel(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return 'viewer';
  if (e === MASTER_EMAIL) return 'master';
  try {
    var row = findRow_(e);
    if (!row) return 'viewer';
    var sh = getSheet_();
    var v = sh.getRange(row, 1, 1, 3).getValues()[0];
    if (String(v[2] || '').toLowerCase() === 'disabled') return 'disabled';
    return String(v[1] || 'viewer').toLowerCase();
  } catch (err) {
    return 'viewer';
  }
}

/**
 * ใช้เมื่อชีตผู้ใช้มีปัญหา (ID ค้าง/ถูกลบ) — ล้างค่าและสร้างชีตใหม่
 * รันจาก Apps Script Editor > เลือกฟังก์ชัน resetUserSheet > Run
 */
function resetUserSheet() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('USERS_SHEET_ID');
  var sh = getSheet_();
  var url = sh.getParent().getUrl();
  Logger.log('User sheet ready: ' + url);
  return url;
}

function touchLogin_(email) {
  try {
    if (!email || email.toLowerCase() === MASTER_EMAIL) return;
    var row = findRow_(email);
    if (!row) return;
    getSheet_().getRange(row, 5).setValue(new Date().toISOString());
  } catch (err) { /* ignore */ }
}

/* ---------------- API called from client ---------------- */

function getUsers() {
  var me = getUserEmail();
  var level = getUserLevel(me);
  if (level !== 'master') {
    return { ok: false, error: 'เฉพาะ Master Admin เท่านั้น', canManage: false, users: [], levels: LEVELS };
  }
  var users = readUsers_();
  users.unshift({
    email: MASTER_EMAIL,
    level: 'master',
    status: 'active',
    createdAt: '',
    lastLogin: ''
  });
  return { ok: true, canManage: true, me: me, users: users, levels: LEVELS, owner: MASTER_EMAIL };
}

function addUser(email, level, status) {
  if (getUserLevel(getUserEmail()) !== 'master') throw new Error('เฉพาะ Master Admin เท่านั้น');
  var e = String(email || '').trim().toLowerCase();
  if (!e || e.indexOf('@') < 0) throw new Error('อีเมลไม่ถูกต้อง');
  if (e === MASTER_EMAIL) throw new Error('มีบัญชีนี้อยู่แล้ว (Master)');
  if (findRow_(e)) throw new Error('มีอีเมลนี้ในระบบแล้ว');

  var lv = String(level || 'viewer').toLowerCase();
  if (LEVELS.indexOf(lv) < 0) lv = 'viewer';

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    getSheet_().appendRow([e, lv, String(status || 'active').toLowerCase(), new Date().toISOString(), '']);
  } finally {
    lock.releaseLock();
  }
  return getUsers();
}

function updateUser(email, level, status) {
  if (getUserLevel(getUserEmail()) !== 'master') throw new Error('เฉพาะ Master Admin เท่านั้น');
  var e = String(email || '').trim().toLowerCase();
  if (e === MASTER_EMAIL) throw new Error('แก้ไขบัญชี Master ไม่ได้');
  var row = findRow_(e);
  if (!row) throw new Error('ไม่พบผู้ใช้นี้');

  var sh = getSheet_();
  if (level !== undefined && level !== null && String(level) !== '') {
    var lv = String(level).toLowerCase();
    if (LEVELS.indexOf(lv) < 0) throw new Error('ระดับสิทธิ์ไม่ถูกต้อง');
    sh.getRange(row, 2).setValue(lv);
  }
  if (status !== undefined && status !== null && String(status) !== '') {
    var st = String(status).toLowerCase();
    if (['active', 'disabled'].indexOf(st) < 0) throw new Error('สถานะไม่ถูกต้อง');
    sh.getRange(row, 3).setValue(st);
  }
  return getUsers();
}

function deleteUser(email) {
  if (getUserLevel(getUserEmail()) !== 'master') throw new Error('เฉพาะ Master Admin เท่านั้น');
  var e = String(email || '').trim().toLowerCase();
  if (e === MASTER_EMAIL) throw new Error('ลบบัญชี Master ไม่ได้');
  var row = findRow_(e);
  if (!row) throw new Error('ไม่พบผู้ใช้นี้');
  getSheet_().deleteRow(row);
  return getUsers();
}

function getUserSheetUrl() {
  try { return getSheet_().getParent().getUrl(); } catch (err) { return ''; }
}

