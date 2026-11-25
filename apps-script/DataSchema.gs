/**
 * Prospect Intelligence — DATA SCHEMA (v2)
 * --------------------------------------------------------------
 * สร้าง/อัปเดตโครงสร้างแท็บข้อมูลทั้งหมดใน Google Sheet เดียวกับ Users
 * เรียกครั้งเดียว (หรือเมื่อเพิ่มคอลัมน์ใหม่): setupDataSheets()
 * หรือผ่าน API: ?api=1&action=setupSchema&token=<admin token>
 *
 * หลักการ:
 * - 1 เเท็บ = 1 ตาราง, แถวแรกเป็น header (ชื่อคงที่ ใช้เป็น key)
 * - เพิ่มคอลัมน์ใหม่ = ต่อท้ายเท่านั้น (ห้ามสลับ/ลบ เพื่อไม่ให้ข้อมูลเดิมเพี้ยน)
 * - ลบข้อมูล = soft delete (deleted = 1) ไม่ลบแถวจริง เพื่อ audit
 * - ทุกตารางมี updatedAt (ISO) ใช้เทียบเวลา sync ฝั่งเว็บ
 */

var DATA_SCHEMA = {
  /* ผู้ใช้ + ข้อมูลพนักงาน */
  Users: {
    headers: ['email', 'name', 'level', 'status', 'passHash', 'salt', 'createdAt', 'lastLogin',
      'parent', 'saleId', 'team', 'empCode', 'startDate', 'empStatus', 'nickname', 'phone',
      'lineId', 'gmail', 'updatedAt', 'deleted'],
    widths: [180, 150, 70, 60, 0, 0, 130, 130, 180, 60, 80, 90, 90, 80, 90, 100, 110, 170, 130, 60],
    formats: { '11': '@', '15': '@', '16': '@' }
  },

  /* ดีล / Pipeline (โครง v2 — ตรงกับฟอร์มในหน้า AE Pipeline) */
  Deals: {
    headers: ['no', 'ownerEmail', 'saleId', 'team', 'customer', 'job', 'so', 'docNo',
      'quoteDate', 'year', 'month', 'product', 'amount', 'payment', 'status', 'prob',
      'drRef', 'note', 'createdAt', 'updatedAt', 'deleted'],
    widths: [110, 180, 60, 80, 170, 190, 120, 130, 95, 55, 55, 60, 90, 90, 55, 55, 120, 220, 130, 130, 55],
    validations: {
      'status': ['0', '1', '2', '3', '4', '5'],
      'payment': ['cash', 'inst', 'term']
    },
    formats: { '0': '@', '6': '@', '7': '@', '8': 'yyyy-mm-dd', '12': '#,##0', '16': '@' }
  },

  /* บันทึกการเข้าพบลูกค้า (ต้นทางของดีล) */
  DailyReports: {
    headers: ['ref', 'date', 'time', 'customer', 'qt', 'channel', 'value', 'summary',
      'nextDate', 'nextTime', 'nextNote', 'saleId', 'by', 'createdAt', 'updatedAt', 'deleted',
      'dmName', 'dmPhone', 'dmEmail'],
    widths: [130, 95, 60, 170, 110, 70, 90, 240, 95, 60, 200, 60, 180, 130, 130, 55, 150, 130, 190],
    validations: { 'channel': ['visit', 'call', 'email', 'line', 'meeting'] },
    formats: { '0': '@', '1': 'yyyy-mm-dd', '2': '@', '4': '@', '6': '#,##0', '8': 'yyyy-mm-dd', '9': '@', '17': '@', '18': '@' }
  },

  /* เป้าหมาย: ระดับทีม (saleId ว่าง) หรือรายคน (saleId = S01) */
  Targets: {
    headers: ['team', 'saleId', 'year', 'month', 'amount', 'updatedAt'],
    widths: [80, 60, 55, 55, 100, 130],
    formats: { '4': '#,##0' },
    validations: { 'month': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }
  },

  /* ทีม / BU */
  Teams: {
    headers: ['code', 'name', 'headEmail', 'active', 'updatedAt'],
    widths: [80, 140, 190, 60, 130]
  },

  /* สินค้า */
  Products: {
    headers: ['code', 'name', 'short', 'color', 'active', 'updatedAt'],
    widths: [60, 210, 130, 80, 60, 130]
  },

  /* โครงการหลังการขาย / ติดตั้ง (Project Tracking) */
  Projects: {
    headers: ['no', 'customer', 'job', 'dealNo', 'stage', 'ownerEmail', 'startDate', 'dueDate',
      'deliveredDate', 'progress', 'blocker', 'createdAt', 'updatedAt', 'deleted',
      'ownerName', 'saleName', 'team', 'drRef', 'note', 'tasksJson'],
    widths: [120, 170, 190, 110, 130, 180, 95, 95, 95, 70, 220, 130, 130, 55, 150, 150, 90, 110, 240, 320],
    formats: { '0': '@', '3': '@', '6': 'yyyy-mm-dd', '7': 'yyyy-mm-dd', '8': 'yyyy-mm-dd', '9': '#,##0', '10': '@', '17': '@' }
  },

  /* Log การใช้งาน ( audit trail ) */
  Logs: {
    headers: ['ts', 'action', 'ref', 'detail', 'by'],
    widths: [130, 110, 220, 320, 180]
  }
};

/* ------------------------------------------------------------------
 * คอลัมน์ที่ต้องเก็บเป็น "ข้อความ" เสมอ
 * (กัน Google Sheets แปลง 00123 → 123 และตัดศูนย์นำหน้าทิ้ง)
 * ------------------------------------------------------------------ */
var TEXT_COLUMNS = ['no', 'so', 'docNo', 'qt', 'ref', 'drRef', 'dealNo', 'empCode', 'phone',
  'lineId', 'code', 'blocker', 'ts', 'tasksJson'];

/** เขียนค่าแบบบังคับข้อความลงเซลล์เดียว */
function setCellText_(sh, row, col, val) {
  var cell = sh.getRange(row, col);
  try { cell.setNumberFormat('@'); } catch (e) {}
  cell.setValue(val === undefined || val === null ? '' : String(val));
}

/** เขียนทั้งแถว (array เต็มความกว้าง) — คอลัมน์ข้อความถูกจัดรูปแบบก่อนเขียน */
function writeRowText_(sh, rowIdx, values, headers) {
  var heads = headers || [];
  for (var i = 0; i < values.length; i++) {
    var h = String(heads[i] || '');
    if (TEXT_COLUMNS.indexOf(h) < 0) continue;
    try { sh.getRange(rowIdx, i + 1).setNumberFormat('@'); } catch (e) {}
    values[i] = (values[i] === null || values[i] === undefined) ? '' : String(values[i]);
  }
  sh.getRange(rowIdx, 1, 1, values.length).setValues([values]);
}

/** ต่อท้ายแถวใหม่ (บังคับข้อความตาม headers) */
function appendRowText_(sh, values, headers) {
  var row = sh.getLastRow() + 1;
  writeRowText_(sh, row, values, headers);
  return row;
}

/** สร้าง/อัปเดตแท็บทั้งหมดตาม DATA_SCHEMA แล้วคืนสรุปผล */
function setupDataSheets() {
  var ss = getSheet_().getParent();
  var report = { ok: true, tabs: [], created: 0, columnsAdded: 0 };
  Object.keys(DATA_SCHEMA).forEach(function (name) {
    var conf = DATA_SCHEMA[name];
    var res = ensureTab_(ss, name, conf);
    report.tabs.push(name + ' (' + res.columns + ' คอลัมน์' + (res.created ? ' · สร้างใหม่' : '') + (res.added ? ' · เพิ่ม ' + res.added : '') + ')');
    if (res.created) report.created++;
    report.columnsAdded += res.added;
  });
  report.spreadsheetUrl = ss.getUrl();
  report.seeded = seedMasterData_();
  Logger.log(JSON.stringify(report));
  return report;
}

/** ใส่ข้อมูลตั้งต้น (Products / Teams) เฉพาะเมื่อแท็บยังว่าง */
function seedMasterData_() {
  var out = {};
  var iso = new Date().toISOString();
  if (!readTab_('Products').length) {
    [['P1', 'ร้านสะดวกซัก (เครื่องซักผ้า+อบ)', 'ร้านสะดวกซัก', '#2563EB'],
     ['P2', 'ตู้กดน้ำ', 'ตู้กดน้ำ', '#0EA5E9'],
     ['P3', 'ตู้กดน้ำ + เครื่องทำน้ำแข็ง', 'ตู้กดน้ำ+น้ำแข็ง', '#8B5CF6'],
     ['P4', 'เครื่องทำน้ำแข็ง', 'เครื่องน้ำแข็ง', '#0E9384']].forEach(function (p) {
      appendTab_('Products', { code: p[0], name: p[1], short: p[2], color: p[3], active: 1, updatedAt: iso });
    });
    out.products = 4;
  }
  if (!readTab_('Teams').length) {
    [['BU-DLAG', 'BU-DLAG'], ['BU-SML', 'BU-SML']].forEach(function (t) {
      appendTab_('Teams', { code: t[0], name: t[1], headEmail: '', active: 1, updatedAt: iso });
    });
    out.teams = 2;
  }
  return out;
}

/** เรียกผ่าน API (เฉพาะ Admin): ?action=setupSchema */
function setupDataForAdmin_(token) {
  var s = session_(token);
  if (!s || !isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  return setupDataSheets();
}

/**
 * จัดเตรียมแท็บ: สร้างถ้ายังไม่มี, เติม header ที่ขาด (ต่อท้าย), ตั้ง format/validation
 * @return {{created:boolean, added:number, columns:number}}
 */
function ensureTab_(ss, name, conf) {
  var headers = conf.headers || [];
  var sh = ss.getSheetByName(name);
  var created = false;
  if (!sh) { sh = ss.insertSheet(name); created = true; }

  var lastCol = sh.getLastColumn();
  var cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v || '').trim(); }) : [];
  var hasHeader = cur.some(function (h) { return h !== ''; });
  var added = 0;

  if (!hasHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var missing = headers.filter(function (h) { return cur.indexOf(h) < 0; });
    if (missing.length) {
      sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
      added = missing.length;
    }
  }

  /* ตกแต่งหัวตาราง + freeze */
  var widthCols = sh.getLastColumn();
  sh.getRange(1, 1, 1, widthCols)
    .setFontWeight('bold')
    .setBackground('#0F2B46')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  if (conf.widths) {
    conf.widths.forEach(function (w, i) {
      if (w > 0 && i < widthCols) sh.setColumnWidth(i + 1, w);
    });
  }

  /* format คอลัมน์ (1-based index จาก schema) */
  if (conf.formats) {
    Object.keys(conf.formats).forEach(function (idx) {
      var col = Number(idx) + 1;
      try { sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(conf.formats[idx]); } catch (e) {}
    });
  }

  /* validation (dropdown) */
  if (conf.validations) {
    Object.keys(conf.validations).forEach(function (h) {
      var col = headers.indexOf(h) + 1;
      if (col <= 0) return;
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(conf.validations[h], true)
        .setAllowInvalid(true)
        .build();
      try { sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule); } catch (e) {}
    });
  }

  return { created: created, added: added, columns: sh.getLastColumn() };
}

/* ---------------- helper อ่าน/เขียนแบบ generic (ใช้ต่อยอดในอนาคต) ---------------- */

/** อ่านทั้งแท็บเป็น array ของ object ตาม header */
function readTab_(name) {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
  return sh.getRange(2, 1, last - 1, headers.length).getValues()
    .filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); })
    .map(function (r) {
      var o = { _row: 0 };
      headers.forEach(function (h, i) { if (h) o[h] = r[i]; });
      return o;
    });
}

/** ต่อท้ายแถวตาม header ที่กำหนด (เติมค่าว่างให้คอลัมน์ที่ไม่ส่งมา) */
function appendTab_(name, obj) {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(name);
  if (!sh) { setupDataSheets(); sh = ss.getSheetByName(name); }
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
  var row = headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  sh.appendRow(row);
  return sh.getLastRow();
}
