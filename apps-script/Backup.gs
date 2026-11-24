/**
 * ระบบหลังบ้าน: Backup รายวัน + Activity Log (สำหรับ Admin)
 * -----------------------------------------------------------------
 * - dailyBackup_()            : สำรองไฟล์ Google Sheet ไปโฟลเดอร์ "PI Backups" (เก็บ 30 วัน)
 * - installDailyBackupTrigger(): ติดตั้ง trigger ทุกวัน 02:00
 * - listLogsApi_(token, opt)  : อ่านแท็บ Logs (Admin/BU เท่านั้น) รองรับ filter
 * API:
 *   ?action=logs&token=…&q=…&kind=deal&by=…&limit=300
 *   ?action=backupNow&token=…        (สำรองเดี๋ยวนี้)
 *   ?action=installBackup&token=…    (ติดตั้ง/รีเซ็ต trigger)
 *   ?action=backupInfo&token=…       (สถานะ backup ล่าสุด + trigger)
 */

var BACKUP_FOLDER_NAME = 'PI Backups';
var BACKUP_KEEP_DAYS = 30;
var BACKUP_KEEP_TABS = 3;

/* ---------------------------- Backup ---------------------------- */

function backupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER_ID');
  var folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; } }
  if (!folder) {
    var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
    props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  }
  return folder;
}

/** สำรองข้อมูลทั้งไฟล์เป็นไฟล์ใหม่ใน Drive (ต้องมีสิทธิ์ Drive) */
function driveBackup_(props) {
  var ss = getSheet_().getParent();
  var folder = backupFolder_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var copy = DriveApp.getFileById(ss.getId()).makeCopy('PI-backup-' + stamp, folder);

  /* ลบไฟล์สำรองที่เก่ากว่า BACKUP_KEEP_DAYS วัน */
  var cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 24 * 3600 * 1000);
  var files = folder.getFiles();
  var removed = 0;
  while (files.hasNext()) {
    var f = files.next();
    if (String(f.getName()).indexOf('PI-backup-') !== 0) continue;
    if (f.getDateCreated() < cutoff) { f.setTrashed(true); removed++; }
  }

  props.setProperty('LAST_BACKUP_AT', new Date().toISOString());
  props.setProperty('LAST_BACKUP_NAME', copy.getName());
  props.setProperty('LAST_BACKUP_URL', copy.getUrl());
  props.setProperty('LAST_BACKUP_MODE', 'drive');
  return { ok: true, mode: 'drive', file: copy.getName(), url: copy.getUrl(), removed: removed, folder: folder.getName() };
}

/** สำรองข้อมูลเป็นแท็บ "BK …" ในไฟล์เดียวกัน (ไม่ต้องมีสิทธิ์ Drive) */
function sheetSnapshot_(props) {
  var ss = getSheet_().getParent();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var name = ('BK ' + stamp).slice(0, 99);

  var old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);

  var block = [['# PI Backup ' + stamp + ' (snapshot)'], []];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var nm = sh.getName();
    if (nm.indexOf('BK ') === 0) continue;
    block.push(['### ' + nm]);
    var vals = [];
    try { vals = sh.getDataRange().getValues(); } catch (e) { vals = []; }
    for (var r = 0; r < vals.length; r++) {
      block.push(vals[r].map(function (v) { return (v instanceof Date) ? v.toISOString() : v; }));
    }
    block.push([]);
  }
  if (block.length < 3) block.push(['(ไม่มีข้อมูล)']);

  var sh2 = ss.insertSheet(name);
  sh2.getRange(1, 1, block.length, 30).setValues(block.map(function (row) {
    var out = row.slice(0, 30);
    while (out.length < 30) out.push('');
    return out;
  }));

  /* เก็บเฉพาะแท็บสำรองล่าสุด BACKUP_KEEP_TABS อัน */
  var bks = ss.getSheets().filter(function (s) { return s.getName().indexOf('BK ') === 0; })
    .sort(function (a, b) { return String(a.getName()).localeCompare(String(b.getName())); });
  var removed = 0;
  while (bks.length > BACKUP_KEEP_TABS) {
    var gone = bks.shift();
    if (gone.getSheetId() === sh2.getSheetId()) continue;
    ss.deleteSheet(gone);
    removed++;
  }

  var url = ss.getUrl() + '#gid=' + sh2.getSheetId();
  props.setProperty('LAST_BACKUP_AT', new Date().toISOString());
  props.setProperty('LAST_BACKUP_NAME', name);
  props.setProperty('LAST_BACKUP_URL', url);
  props.setProperty('LAST_BACKUP_MODE', 'sheet');
  return { ok: true, mode: 'sheet', file: name, url: url, removed: removed, folder: 'แท็บสำรองในไฟล์เดียวกัน' };
}

/** สำรองข้อมูลทั้งไฟล์ (เรียกโดย trigger รายวัน หรือปุ่ม "สำรองเดี๋ยวนี้") */
function dailyBackup_(forceMode) {
  var props = PropertiesService.getScriptProperties();
  var out;
  if (forceMode === 'sheet') {
    out = sheetSnapshot_(props);
  } else {
    try {
      out = driveBackup_(props);
    } catch (e) {
      out = sheetSnapshot_(props);
      out.note = 'ยังไม่มีสิทธิ์ Drive — สำรองเป็นแท็บในไฟล์เดียวกันแทน';
      out.driveError = String((e && e.message) || e);
    }
  }
  return out;
}

/** ติดตั้ง trigger สำรองข้อมูลทุกวัน 02:00 (ถ้าไม่มีสิทธิ์ จะเปิดโหมดสำรองอัตโนมัติเมื่อเข้าใช้งาน) */
function installDailyBackupTrigger() {
  var props = PropertiesService.getScriptProperties();
  try {
    var existing = ScriptApp.getProjectTriggers();
    existing.forEach(function (t) {
      if (t.getHandlerFunction() === 'dailyBackup_') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('dailyBackup_')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone(Session.getScriptTimeZone())
      .create();
    props.setProperty('BACKUP_TRIGGER_AT', new Date().toISOString());
    props.deleteProperty('BACKUP_LAZY');
    return { ok: true, installed: true, lazy: false, hour: 2, keepDays: BACKUP_KEEP_DAYS };
  } catch (e) {
    props.setProperty('BACKUP_LAZY', '1');
    return {
      ok: true, installed: false, lazy: true, hour: 2, keepDays: BACKUP_KEEP_DAYS,
      note: 'ยังสร้าง trigger อัตโนมัติไม่ได้ — ระบบจะสำรองให้เองเมื่อมีผู้ใช้เข้าใช้งานครั้งแรกของวัน',
      error: String((e && e.message) || e)
    };
  }
}

/** สำรองอัตโนมัติแบบ lazy: ทำเมื่อเข้าใช้งานครั้งแรกของวัน (ใช้เมื่อ trigger ยังติดตั้งไม่ได้) */
function maybeLazyBackup_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('BACKUP_LAZY') !== '1') return false;
    var last = props.getProperty('LAST_BACKUP_AT');
    if (last && (Date.now() - new Date(last).getTime()) < 20 * 3600 * 1000) return false;
    dailyBackup_();
    return true;
  } catch (e) {
    return false;
  }
}

function backupInfoApi_(token) {
  var s = session_(token);
  if (!s || !seesAllLevel_(s.level)) throw new Error('เฉพาะ Admin / BU เท่านั้น');
  var props = PropertiesService.getScriptProperties();
  var installed = false, triggerReady = true, trigErr = '';
  try {
    installed = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyBackup_'; });
  } catch (e) {
    triggerReady = false;
    trigErr = String((e && e.message) || e);
  }
  var driveReady = true;
  try { DriveApp.getRootFolder(); } catch (e2) { driveReady = false; }
  return {
    ok: true,
    installed: installed,
    lazy: props.getProperty('BACKUP_LAZY') === '1',
    triggerReady: triggerReady,
    driveReady: driveReady,
    triggerError: trigErr,
    keepDays: BACKUP_KEEP_DAYS,
    keepTabs: BACKUP_KEEP_TABS,
    lastAt: props.getProperty('LAST_BACKUP_AT') || '',
    lastName: props.getProperty('LAST_BACKUP_NAME') || '',
    lastUrl: props.getProperty('LAST_BACKUP_URL') || '',
    lastMode: props.getProperty('LAST_BACKUP_MODE') || ''
  };
}

function backupNowApi_(token, mode) {
  var s = session_(token);
  if (!s || !isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  return dailyBackup_(mode);
}

function installBackupApi_(token) {
  var s = session_(token);
  if (!s || !isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  return installDailyBackupTrigger();
}

/**
 * เรียกจากหน้า Apps Script Editor 1 ครั้ง เพื่อขออนุญาตสิทธิ์ Drive + Trigger
 * (หลังอนุมัติแล้ว ปุ่ม "ตั้ง trigger รายวัน" ในหน้า Activity Log จะทำงานเต็มรูปแบบ)
 */
function authorizeBackup() {
  var b = null, t = null, err = '';
  try { b = dailyBackup_(); } catch (e) { err = String((e && e.message) || e); }
  try { t = installDailyBackupTrigger(); } catch (e2) { err += ' | ' + String((e2 && e2.message) || e2); }
  var info = PropertiesService.getScriptProperties().getProperties();
  return { backup: b, trigger: t, error: err, lastAt: info.LAST_BACKUP_AT || '', lazy: info.BACKUP_LAZY || '' };
}

/* ---------------------------- Activity Log ---------------------------- */

var LOG_ACTIONS = ['deal.add', 'deal.edit', 'deal.del', 'daily.add', 'daily.edit', 'daily.del',
  'target.save', 'user.add', 'user.edit', 'user.del', 'auth.login', 'sale.add', 'sale.del'];

function listLogsApi_(token, q, kind, by, limit) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', logs: [] };
  if (!seesAllLevel_(s.level)) throw new Error('เฉพาะ Admin / BU เท่านั้น');

  var rows = [];
  try { rows = readTab_('Logs'); } catch (e) { rows = []; }
  var kw = String(q || '').trim().toLowerCase();
  var kd = String(kind || '').trim().toLowerCase();
  var uid = String(by || '').trim().toLowerCase();

  var out = rows.map(function (r) {
    return {
      ts: String(r.ts || ''),
      action: String(r.action || ''),
      ref: String(r.ref || ''),
      detail: String(r.detail || ''),
      by: String(r.by || '').toLowerCase()
    };
  }).filter(function (l) {
    if (!l.ts && !l.action) return false;
    if (kd && l.action.indexOf(kd) !== 0) return false;
    if (uid && l.by !== uid) return false;
    if (kw && (l.ref + ' ' + l.detail + ' ' + l.by + ' ' + l.action).toLowerCase().indexOf(kw) < 0) return false;
    return true;
  });
  out.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  var lim = Math.min(Math.max(Number(limit) || 300, 1), 2000);
  var sliced = out.slice(0, lim);

  var counts = { total: out.length };
  out.forEach(function (l) {
    var k = String(l.action || 'other').split('.')[0] || 'other';
    counts[k] = (counts[k] || 0) + 1;
  });
  return { ok: true, logs: sliced, counts: counts, actions: LOG_ACTIONS };
}
