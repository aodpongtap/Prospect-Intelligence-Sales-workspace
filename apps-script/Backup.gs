/**
 * ระบบหลังบ้าน: Backup รายวัน + Activity Log (สำหรับ Admin)
 * -----------------------------------------------------------------
 * - dailyBackup_()            : สำรองข้อมูลลง "ไฟล์เดียวใน Drive" ชื่อ "Prospect Intelligence AE workspace"
 * - installDailyBackupTrigger(): ติดตั้ง trigger ทุกวัน 02:00
 * - listLogsApi_(token, opt)  : อ่านแท็บ Logs (Admin/BU เท่านั้น) รองรับ filter
 * API:
 *   ?action=logs&token=…&q=…&kind=deal&by=…&limit=300
 *   ?action=backupNow&token=…        (สำรองเดี๋ยวนี้)
 *   ?action=installBackup&token=…    (ติดตั้ง/รีเซ็ต trigger)
 *   ?action=backupInfo&token=…       (สถานะ backup ล่าสุด + trigger)
 */

/* ชื่อไฟล์/โฟลเดอร์สำรอง — รวมทุกตารางไว้ในไฟล์เดียวเพื่อความเป็นระเบียบใน Google Drive */
var BACKUP_FILE_NAME = 'Prospect Intelligence AE workspace';
var BACKUP_FOLDER_NAME = 'Prospect Intelligence AE workspace — สำรองข้อมูล';
var BACKUP_KEEP_DAYS = 30;
var BACKUP_KEEP_TABS = 3;
var BACKUP_POOL_SIZE = 7;
var WEBAPP_URL_FALLBACK = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';

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
    var fn = String(f.getName());
    if (fn.indexOf('PI-backup-') !== 0 && fn.indexOf('PI-backup-slot-') !== 0) continue;
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

/** สำรองเป็น "ไฟล์ Spreadsheet แยก" ใน Drive แบบหมุนเวียน 7 ไฟล์ (ใช้สิทธิ์ spreadsheets เท่านั้น ไม่ต้องมี Drive scope) */
function poolBackup_(props) {
  var src = getSheet_().getParent();
  var ids = [];
  try { ids = JSON.parse(props.getProperty('BACKUP_POOL_IDS') || '[]'); } catch (e) { ids = []; }
  ids = (ids || []).filter(function (id) {
    try { SpreadsheetApp.openById(id); return true; } catch (e2) { return false; }
  });
  while (ids.length < BACKUP_POOL_SIZE) {
    var fresh = SpreadsheetApp.create('PI-backup-slot-' + (ids.length + 1));
    ids.push(fresh.getId());
  }
  props.setProperty('BACKUP_POOL_IDS', JSON.stringify(ids));

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var idx = Number(props.getProperty('BACKUP_POOL_IDX') || 0) % ids.length;
  if (isNaN(idx) || idx < 0) idx = 0;
  var dst = SpreadsheetApp.openById(ids[idx]);

  /* เคลียร์แท็บเดิมทั้งหมด เหลือแท็บชั่วคราว 1 แท็บ */
  var olds = dst.getSheets();
  var tmp = olds[0];
  try { tmp.setName('_tmp'); } catch (e3) {}
  for (var i = 1; i < olds.length; i++) {
    try { dst.deleteSheet(olds[i]); } catch (e4) {}
  }

  var copied = 0, sheets = src.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sh = sheets[j], nm = sh.getName();
    if (nm.indexOf('BK ') === 0) continue;         /* ไม่คัดลอกแท็บสำรองชั่วคราว */
    var vals = [];
    try { vals = sh.getDataRange().getValues(); } catch (e5) { vals = []; }
    var target = dst.insertSheet(nm.slice(0, 99));
    if (vals.length && vals[0] && vals[0].length) {
      try { target.getRange(1, 1, vals.length, vals[0].length).setValues(vals); } catch (e6) {}
    }
    copied++;
  }
  try { dst.deleteSheet(tmp); } catch (e7) {}
  try { dst.rename('PI-backup-' + stamp); } catch (e8) {}

  props.setProperty('BACKUP_POOL_IDX', String((idx + 1) % ids.length));
  props.setProperty('LAST_BACKUP_AT', new Date().toISOString());
  props.setProperty('LAST_BACKUP_NAME', 'PI-backup-' + stamp);
  props.setProperty('LAST_BACKUP_URL', dst.getUrl());
  props.setProperty('LAST_BACKUP_MODE', 'pool');
  return {
    ok: true, mode: 'pool', file: 'PI-backup-' + stamp, url: dst.getUrl(),
    removed: 0, folder: 'ไฟล์สำรองแยกใน Drive (' + ids.length + ' ชุดหมุนเวียน)', sheets: copied
  };
}

/* ------------------------------------------------------------------
 * โหมดหลัก: ไฟล์เดียวรวมทุกตาราง — "Prospect Intelligence AE workspace"
 * ------------------------------------------------------------------ */

/** ไอดีไฟล์สำรองหลัก (สร้างครั้งแรกแล้วจำไว้ใน Script Properties) */
function backupFileId_(props) {
  var id = props.getProperty('BACKUP_FILE_ID');
  if (id) {
    try { SpreadsheetApp.openById(id); return id; } catch (e) { /* ไฟล์ถูกลบ → สร้างใหม่ */ }
  }
  var ss = SpreadsheetApp.create(BACKUP_FILE_NAME);
  props.setProperty('BACKUP_FILE_ID', ss.getId());
  return ss.getId();
}

/** ย้ายไฟล์เข้าโฟลเดอร์สำรอง (ทำได้เฉพาะเมื่อมีสิทธิ์ Drive) */
function tryMoveToFolder_(fileId) {
  try {
    var folder = backupFolder_();
    DriveApp.getFileById(fileId).moveTo(folder);
    return folder.getName();
  } catch (e) {
    return '';
  }
}

/** ลบไฟล์สำรองแบบเก่าที่กระจัดกระจาย (PI-backup-*) — ทำได้เฉพาะเมื่อมีสิทธิ์ Drive */
function tryCleanLegacyBackups_(keepId) {
  var n = 0;
  try {
    var files = DriveApp.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getId() === keepId) continue;
      var nm = String(f.getName());
      if (nm.indexOf('PI-backup-') !== 0 && nm.indexOf('PI-backup-slot-') !== 0) continue;
      try { f.setTrashed(true); n++; } catch (e2) {}
    }
  } catch (e) {}
  return n;
}

/**
 * สำรองข้อมูลทุกแท็บของฐานข้อมูลลง "ไฟล์เดียว" ใน Google Drive
 * ไฟล์: Prospect Intelligence AE workspace  (เขียนทับทุกครั้ง = มีข้อมูลล่าสุดเสมอ)
 * แท็บ: Users · Deals · DailyReports · Targets · Teams · Products · Projects · Logs + _Meta + _History
 */
function singleBackup_(props) {
  var src = getSheet_().getParent();
  var dst = SpreadsheetApp.openById(backupFileId_(props));
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var names = [], totalRows = 0, sheets = src.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i], nm = String(sh.getName());
    if (nm.indexOf('BK ') === 0) continue;                 /* ข้ามแท็บสำรองชั่วคราว */
    if (/^_/.test(nm)) continue;
    var vals = [];
    try { vals = sh.getDataRange().getValues(); } catch (e) { vals = []; }
    var tabName = nm.slice(0, 99);
    var target = dst.getSheetByName(tabName) || dst.insertSheet(tabName);
    try { target.clear(); } catch (e2) {}
    if (vals.length && vals[0] && vals[0].length) {
      var w = Math.min(vals[0].length, 60);
      var out = vals.map(function (r) {
        var o = r.slice(0, w).map(function (v) { return (v instanceof Date) ? v.toISOString() : v; });
        while (o.length < w) o.push('');
        return o;
      });
      try { target.getRange(1, 1, out.length, w).setValues(out); } catch (e3) {}
      totalRows += Math.max(0, out.length - 1);
    }
    names.push(tabName);
  }

  /* ลบแท็บที่ไม่มีในต้นฉบับแล้ว (ยกเว้นแท็บระบบของไฟล์สำรอง) */
  dst.getSheets().forEach(function (s) {
    var n = String(s.getName());
    if (n === '_Meta' || n === '_History') return;
    if (names.indexOf(n) < 0) { try { dst.deleteSheet(s); } catch (e) {} }
  });

  /* แท็บ _Meta = สรุปข้อมูลไฟล์นี้ */
  var meta = dst.getSheetByName('_Meta') || dst.insertSheet('_Meta');
  try { meta.clear(); } catch (e4) {}
  var metaRows = [
    ['ไฟล์สำรอง: ' + BACKUP_FILE_NAME],
    ['สำรองล่าสุด', stamp],
    ['ต้นฉบับ (Google Sheet)', src.getUrl()],
    ['จำนวนแท็บ', String(names.length)],
    ['จำนวนแถวข้อมูลรวม', String(totalRows)],
    ['รายการแท็บ', names.join(', ')],
    ['หมายเหตุ', 'ไฟล์นี้เขียนทับทุกครั้งที่สำรองข้อมูล — ข้อมูลล่าสุดอยู่ในแท็บตามชื่อตาราง']
  ];
  try { meta.getRange(1, 1, metaRows.length, 2).setValues(metaRows); } catch (e5) {}

  /* แท็บ _History = ประวัติการสำรอง (ไม่ลบ ทำให้ตรวจย้อนหลังได้) */
  var hist = dst.getSheetByName('_History');
  if (!hist) {
    hist = dst.insertSheet('_History');
    try { hist.appendRow(['วันที่สำรอง', 'จำนวนแท็บ', 'จำนวนแถวรวม']); } catch (e6) {}
  }
  try { hist.appendRow([stamp, names.length, totalRows]); } catch (e7) {}

  /* จัดเก็บให้เป็นระเบียบ: ย้ายเข้าโฟลเดอร์ + ล้างไฟล์แบบเก่า (ถ้ามีสิทธิ์ Drive) */
  var folderName = tryMoveToFolder_(dst.getId());
  var removed = tryCleanLegacyBackups_(dst.getId());

  props.setProperty('LAST_BACKUP_AT', new Date().toISOString());
  props.setProperty('LAST_BACKUP_NAME', dst.getName());
  props.setProperty('LAST_BACKUP_URL', dst.getUrl());
  props.setProperty('LAST_BACKUP_MODE', 'single');
  return {
    ok: true, mode: 'single', file: dst.getName(), url: dst.getUrl(),
    folder: folderName || 'My Drive', sheets: names.length, rows: totalRows, removed: removed
  };
}

/** สำรองข้อมูลทั้งไฟล์ (เรียกโดย trigger รายวัน หรือปุ่ม "สำรองเดี๋ยวนี้") */
function dailyBackup_(forceMode) {
  var props = PropertiesService.getScriptProperties();
  if (forceMode === 'sheet') return sheetSnapshot_(props);
  if (forceMode === 'pool') return poolBackup_(props);
  if (forceMode === 'single') return singleBackup_(props);

  /* ลำดับ: ไฟล์เดียวรวมทุกตาราง → คัดลอกทั้งไฟล์ → ไฟล์หมุนเวียน → แท็บในไฟล์เดียวกัน */
  try {
    return singleBackup_(props);
  } catch (e0) {
    var singleErr = String((e0 && e0.message) || e0).slice(0, 160);
    try {
      var outDrive = driveBackup_(props);
      outDrive.note = 'สำรองเป็นไฟล์คัดลอกทั้งไฟล์ (single-file mode ใช้ไม่ได้: ' + singleErr + ')';
      return outDrive;
    } catch (e1) {
      try {
        var outPool = poolBackup_(props);
        outPool.note = 'สำรองเป็นไฟล์แยกแบบหมุนเวียน (ไม่ต้องมีสิทธิ์ Drive)';
        outPool.singleError = singleErr;
        return outPool;
      } catch (e2) {
        var outSheet = sheetSnapshot_(props);
        outSheet.note = 'สำรองเป็นแท็บในไฟล์เดียวกันแทน';
        outSheet.singleError = singleErr;
        outSheet.driveError = String((e1 && e1.message) || e1).slice(0, 160);
        outSheet.poolError = String((e2 && e2.message) || e2).slice(0, 160);
        return outSheet;
      }
    }
  }
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

/** คีย์ลับสำหรับเรียก backup จากตัวตั้งเวลาภายนอก (cron) */
function backupKey_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('BACKUP_KEY');
  if (!k) {
    k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
    props.setProperty('BACKUP_KEY', k);
  }
  return k;
}

/** URL สำหรับให้บริการตั้งเวลา (GitHub Actions / cron-job.org) เรียกวันละครั้ง */
function backupCronUrl_() {
  var base = '';
  try { base = getWebAppUrl(); } catch (e) { base = ''; }
  if (!base) base = WEBAPP_URL_FALLBACK;
  return base + '?api=1&action=backupCron&key=' + backupKey_();
}

/** คีย์ลับสำหรับสั่ง force backup (ไม่ถูกเปิดเผยที่ไหน — ใช้ผ่านหน้า Admin หรือ editor เท่านั้น) */
function backupForceKey_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('BACKUP_FORCE_KEY');
  if (!k) {
    k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
    props.setProperty('BACKUP_FORCE_KEY', k);
  }
  return k;
}

/** เรียกจากภายนอก: สำรองข้อมูลถ้ายังไม่ได้ทำใน 20 ชั่วโมงที่ผ่านมา */
function backupCronApi_(key, mode, forceKey) {
  if (String(key || '') !== backupKey_()) return { ok: false, error: 'key ไม่ถูกต้อง' };
  var props = PropertiesService.getScriptProperties();
  var forced = String(mode || '').toLowerCase() === 'force' && String(forceKey || '') === backupForceKey_();
  var last = props.getProperty('LAST_BACKUP_AT');
  if (!forced && last && (Date.now() - new Date(last).getTime()) < 20 * 3600 * 1000) {
    return { ok: true, skipped: true, lastAt: last, lastName: props.getProperty('LAST_BACKUP_NAME') || '' };
  }
  var r = dailyBackup_();
  r.skipped = false;
  return r;
}

/** ล้าง Log ทั้งหมด (Admin เท่านั้น) — สำรองข้อมูลเดิมลงแท็บ Logs_archive_… ก่อน */
function clearLogsApi_(token) {
  var s = session_(token);
  if (!s || !isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName('Logs');
  if (!sh) return { ok: true, cleared: 0, archived: '' };
  var last = sh.getLastRow();
  var n = Math.max(0, last - 1);
  var archived = '';
  if (n > 0) {
    var width = Math.max(sh.getLastColumn(), 5);
    var vals = sh.getRange(1, 1, last, width).getValues();
    archived = ('Logs_archive_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm')).slice(0, 99);
    var a = ss.getSheetByName(archived) || ss.insertSheet(archived);
    a.clear();
    a.getRange(1, 1, vals.length, width).setValues(vals);
    sh.getRange(2, 1, n, width).clearContent();
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LAST_LOG_CLEAR_AT', new Date().toISOString());
  props.setProperty('LAST_LOG_CLEAR_BY', String(s.email));
  props.setProperty('LAST_LOG_CLEAR_N', String(n));
  return { ok: true, cleared: n, archived: archived };
}

/** เรียกจากภายนอก: ต้องมี key เท่านั้น (กันคนอื่นยิงเล่น) — ทำได้ไม่เกิน 1 ครั้ง / 20 ชั่วโมง */
function backupDailyApi_(key) {
  if (String(key || '') !== backupKey_()) return { ok: false, error: 'key ไม่ถูกต้อง' };
  var props = PropertiesService.getScriptProperties();
  var last = props.getProperty('LAST_BACKUP_AT');
  if (last && (Date.now() - new Date(last).getTime()) < 20 * 3600 * 1000) {
    return { ok: true, skipped: true, lastAt: last };
  }
  var r = dailyBackup_();
  return { ok: !!r.ok, mode: r.mode, skipped: false, at: new Date().toISOString() };
}

/**
 * ทดสอบ/ขอสิทธิ์ Drive + Trigger — รันจาก Apps Script Editor 1 ครั้ง
 * ผลลัพธ์ที่ถูกต้อง: "Drive OK: My Drive | triggers: 0"
 * ถ้าขึ้น Authorization required → กด Review permissions แล้ว Allow ทุกสิทธิ์
 */
function testDrivePermission() {
  var root = DriveApp.getRootFolder();          /* ถ้าไม่มีสิทธิ์ Drive จะ error ที่บรรทัดนี้ */
  var folder = backupFolder_();
  var n = ScriptApp.getProjectTriggers().length;
  return 'Drive OK: ' + root.getName() + ' | folder: ' + folder.getName() + ' | triggers: ' + n;
}

/** ตรวจว่าบัญชีที่เว็บแอปรันอยู่คือใคร และมีสิทธิ์ Drive/Trigger หรือไม่ (ใช้ diagnost) */
function whoAmI_(token) {
  var s = token ? session_(token) : null;
  if (!s || !isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  var out = { ok: true };
  try { out.effective = Session.getEffectiveUser().getEmail(); } catch (e) { out.effective = 'ERR: ' + e.message; }
  try { out.active = Session.getActiveUser().getEmail(); } catch (e2) { out.active = 'ERR: ' + e2.message; }
  try { DriveApp.getRootFolder(); out.drive = true; } catch (e3) { out.drive = false; out.driveError = String((e3 && e3.message) || e3).slice(0, 140); }
  try { ScriptApp.getProjectTriggers(); out.trigger = true; } catch (e4) { out.trigger = false; }
  try { out.sheet = getSheet_().getName(); } catch (e5) { out.sheet = 'ERR: ' + e5.message; }
  return out;
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
    lastMode: props.getProperty('LAST_BACKUP_MODE') || '',
    fileName: BACKUP_FILE_NAME,
    fileId: props.getProperty('BACKUP_FILE_ID') || '',
    fileUrl: props.getProperty('BACKUP_FILE_ID') ? ('https://docs.google.com/spreadsheets/d/' + props.getProperty('BACKUP_FILE_ID') + '/edit') : '',
    folderName: BACKUP_FOLDER_NAME,
    cronUrl: isAdminLevel_(s.level) ? backupCronUrl_() : '',
    cronDaily: true,
    poolSize: BACKUP_POOL_SIZE,
    retentionDays: BACKUP_POOL_SIZE,
    busy: !!props.getProperty('BACKUP_LAZY')
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
  'target.save', 'user.add', 'user.edit', 'user.del', 'auth.login', 'sale.add', 'sale.del',
  'project.add', 'project.edit', 'project.del', 'project.stage', 'task.add', 'task.edit', 'task.del', 'task.toggle'];

function listLogsApi_(token, q, kind, by, limit) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', logs: [] };
  if (!isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');

  var rows = [];
  try { rows = readTab_('Logs'); } catch (e) { rows = []; }
  var kw = String(q || '').trim().toLowerCase();
  var kd = String(kind || '').trim().toLowerCase();
  var uid = String(by || '').trim().toLowerCase();

  var all = rows.map(function (r) {
    return {
      ts: String(r.ts || ''),
      action: String(r.action || ''),
      ref: String(r.ref || ''),
      detail: String(r.detail || ''),
      by: String(r.by || '').toLowerCase()
    };
  }).filter(function (l) {
    return !!(l.ts || l.action);
  });

  /* สรุปจำนวนตามประเภท — นับจากข้อมูลทั้งหมด (ไม่ขึ้นกับตัวกรอง) */
  var counts = { total: all.length };
  all.forEach(function (l) {
    var k = String(l.action || 'other').split('.')[0] || 'other';
    if (k === 'task') k = 'project';        /* งานย่อยนับรวมในหมวดโครงการ */
    counts[k] = (counts[k] || 0) + 1;
  });

  var out = all.filter(function (l) {
    if (kd) {
      if (kd === 'task') { if (l.action.indexOf('task.') !== 0) return false; }
      else {
        var fam = (l.action.indexOf('task.') === 0) ? 'project' : l.action.split('.')[0];
        if (fam !== kd) return false;
      }
    }
    if (uid && l.by !== uid) return false;
    if (kw && (l.ref + ' ' + l.detail + ' ' + l.by + ' ' + l.action).toLowerCase().indexOf(kw) < 0) return false;
    return true;
  });
  out.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  var lim = Math.min(Math.max(Number(limit) || 300, 1), 2000);
  var sliced = out.slice(0, lim);
  counts.filtered = out.length;

  return { ok: true, logs: sliced, counts: counts, actions: LOG_ACTIONS };
}
