/**
 * ซิงก์ข้อมูลส่วนที่เหลือขึ้น Google Sheet
 * - Targets   (เป้าหมายรายทีม/รายคน × เดือน)  → targetsV2 / saveTarget
 * - DailyReports (บันทึกเข้าพบลูกค้า)         → dailyV2 / saveDaily / delDaily
 * ใช้โครงเดียวกับ DealsV2.gs (แท็บสร้างจาก DataSchema.gs)
 */

var TARGETS_TAB = 'Targets';
var DAILY_TAB = 'DailyReports';

/** เวลา HH:mm — รองรับกรณี Sheets เก็บเป็น Date (เช่น 16:00 → 1899-12-30T16:00Z) */
function normTime_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm'); } catch (e) { return ''; }
  }
  var s = String(v).trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : s;
}

function tab_(name) {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(name);
  if (!sh) { setupDataSheets(); sh = ss.getSheetByName(name); }
  return sh;
}
function tabHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
}
function tabRows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var heads = tabHeaders_(sh);
  return sh.getRange(2, 1, last - 1, heads.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    heads.forEach(function (h, j) { if (h) o[h] = r[j]; });
    return o;
  });
}

/* ============================ TARGETS ============================ */

function listTargetsApi_(token) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', targets: [] };
  var all = tabRows_(tab_(TARGETS_TAB))
    .filter(function (r) { return Number(r.deleted || 0) !== 1; })
    .map(function (r) {
      return {
        team: String(r.team || '').trim().toUpperCase(),
        saleId: String(r.saleId || '').trim().toUpperCase(),
        year: Number(r.year || 0),
        month: Number(r.month || 0),
        amount: Number(r.amount || 0),
        updatedAt: String(r.updatedAt || '')
      };
    })
    .filter(function (t) { return t.team && t.year && t.month; });
  if (!seesAllLevel_(s.level)) {
    var myTeam = String(s.team || '').trim().toUpperCase();
    all = all.filter(function (t) { return !myTeam || t.team === myTeam; });
  }
  return { ok: true, targets: all };
}

/** upsert เป้าหมาย 1 ช่อง (team + saleId + year + month) */
function saveTargetApi_(token, p) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (levelN_(s.level) > 4) throw new Error('เฉพาะ Admin / BU / Head Team / Supervisor เท่านั้นที่แก้เป้าหมายได้');

  var team = String(p.team || '').trim().toUpperCase();
  var saleId = String(p.saleId || '').trim().toUpperCase();
  var year = Number(p.year);
  var month = Number(p.month);
  var amount = Number(p.amount || 0);
  if (!team || !year || !(month >= 1 && month <= 12)) throw new Error('ข้อมูลเป้าหมายไม่ครบ');
  if (!seesAllLevel_(s.level) && String(s.team || '').toUpperCase() !== team) throw new Error('แก้เป้าหมายได้เฉพาะทีมของตัวเอง');

  var sh = tab_(TARGETS_TAB);
  var rows = tabRows_(sh);
  var hit = null;
  rows.forEach(function (r) {
    if (String(r.team || '').toUpperCase() === team && String(r.saleId || '').toUpperCase() === saleId &&
      Number(r.year) === year && Number(r.month) === month) hit = r;
  });
  var heads = tabHeaders_(sh);
  var nowIso = new Date().toISOString();
  if (hit) {
    var map = {}; heads.forEach(function (h, i) { if (h) map[h] = i + 1; });
    sh.getRange(hit._row, map.amount).setValue(amount);
    if (map.updatedAt) sh.getRange(hit._row, map.updatedAt).setValue(nowIso);
  } else {
    sh.appendRow(heads.map(function (h) {
      if (h === 'team') return team;
      if (h === 'saleId') return saleId;
      if (h === 'year') return year;
      if (h === 'month') return month;
      if (h === 'amount') return amount;
      if (h === 'updatedAt') return nowIso;
      return '';
    }));
  }
  return listTargetsApi_(token);
}

/* ============================ DAILY REPORTS ============================ */

function dailyOf_(r) {
  return {
    ref: String(r.ref || '').trim().toUpperCase(),
    date: normDate_(r.date),
    time: normTime_(r.time),
    customer: String(r.customer || ''),
    qt: String(r.qt || ''),
    channel: String(r.channel || 'visit'),
    value: Number(r.value || 0),
    summary: String(r.summary || ''),
    nextDate: normDate_(r.nextDate),
    nextTime: normTime_(r.nextTime),
    nextNote: String(r.nextNote || ''),
    saleId: String(r.saleId || '').trim().toUpperCase(),
    by: String(r.by || '').toLowerCase(),
    dmName: String(r.dmName || '').trim(),
    dmPhone: String(r.dmPhone || '').trim(),
    dmEmail: String(r.dmEmail || '').trim(),
    updatedAt: String(r.updatedAt || '')
  };
}

function listDailyApi_(token) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', items: [], deletedRefs: [] };
  var rows = tabRows_(tab_(DAILY_TAB));
  var deletedRefs = rows.filter(function (r) { return Number(r.deleted || 0) === 1 && r.ref; })
    .map(function (r) { return String(r.ref || '').trim().toUpperCase(); });
  var all = rows
    .filter(function (r) { return Number(r.deleted || 0) !== 1; })
    .map(dailyOf_)
    .filter(function (d) { return d.ref; });
  if (!seesAllLevel_(s.level)) {
    var mySale = String(s.saleId || '').trim().toUpperCase();
    all = all.filter(function (d) { return d.saleId === mySale && mySale; });
    deletedRefs = [];   /* ระดับ AE ไม่ต้องรู้รายการที่คนอื่นลบ */
  }
  return { ok: true, items: all, deletedRefs: deletedRefs };
}

/** ออกเลข ref ถัดไปของวันนั้น (DR-YYYYMMDD-NN) */
function nextDailyRef_(dateStr, sh) {
  var d = String(normDate_(dateStr) || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  var prefix = 'DR-' + d + '-';
  var max = 0;
  tabRows_(sh).forEach(function (r) {
    var ref = String(r.ref || '').toUpperCase();
    if (ref.indexOf(prefix) === 0) {
      var n = Number(ref.slice(prefix.length));
      if (!isNaN(n)) max = Math.max(max, n);
    }
  });
  return prefix + String(max + 1).padStart(2, '0');
}

/** บันทึกกิจกรรม — ใช้ LockService กันการออกเลข ref ซ้ำเมื่อบันทึกพร้อมกันหลายคน */
function saveDailyApi_(token, p) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(30000); } catch (e) { locked = false; }
  if (!locked) throw new Error('ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณากดบันทึกอีกครั้ง');
  try {
    return saveDailyApiCore_(token, p);
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e2) {} }
  }
}

function saveDailyApiCore_(token, p) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!canSell_(s.level)) throw new Error('บัญชีนี้ไม่มีสิทธิ์บันทึกกิจกรรม');
  var customer = String(p.customer || '').trim();
  if (!customer) throw new Error('กรอกชื่อลูกค้า');
  if (!validCustomer_(customer)) throw new Error('ชื่อลูกค้าไม่ถูกต้อง — กรุณากรอกชื่อจริง (ห้ามใช้ n/a, -, test, ทดสอบ)');
  var finalSaleId = assertSaleId_(s, p.saleId);

  var sh = tab_(DAILY_TAB);
  var rows = tabRows_(sh);
  var ref = String(p.ref || '').trim().toUpperCase();
  var myMail = String(s.email || '').toLowerCase();
  var hit = null;
  /* แก้ได้เฉพาะบันทึกของตัวเอง (Admin แก้ได้ทุกใบ) — ref ของคนอื่นห้ามทับ */
  if (ref) {
    rows.forEach(function (r) {
      if (String(r.ref || '').toUpperCase() !== ref) return;
      var owner = String(r.by || '').toLowerCase();
      if (owner === myMail || isAdminLevel_(s.level)) hit = r;
    });
  }
  if (!hit) ref = nextDailyRef_(p.date, sh);   /* ไม่พบบันทึกของตัวเอง → ออกเลขใหม่จากเซิร์ฟเวอร์ */
  /* แก้ทับของคนอื่น (Admin) → ต้องคงเจ้าของเดิมไว้ ไม่ย้ายเจ้าของเป็นคนที่กดแก้ */
  var ownerEmail = hit ? String(hit.by || myMail).toLowerCase()
    : (isAdminLevel_(s.level) && p.by ? String(p.by).toLowerCase() : myMail);

  var nowIso = new Date().toISOString();
  var heads = tabHeaders_(sh);
  var rec = {
    ref: ref,
    date: normDate_(p.date),
    time: normTime_(p.time),
    customer: customer,
    qt: String(p.qt || ''),
    channel: String(p.channel || 'visit'),
    value: Number(p.value || 0),
    summary: String(p.summary || ''),
    nextDate: normDate_(p.nextDate),
    nextTime: normTime_(p.nextTime),
    nextNote: String(p.nextNote || ''),
    saleId: finalSaleId || String(s.saleId || '').trim().toUpperCase(),
    by: ownerEmail,
    dmName: String(p.dmName || '').trim().slice(0, 120),
    dmPhone: String(p.dmPhone || '').trim().slice(0, 30),
    dmEmail: String(p.dmEmail || '').trim().slice(0, 120),
    updatedAt: nowIso
  };
  if (hit) {
    var map = {}; heads.forEach(function (h, i) { if (h) map[h] = i + 1; });
    Object.keys(map).forEach(function (h) {
      if (h === 'createdAt' || rec[h] === undefined) return;
      var cell = sh.getRange(hit._row, map[h]);
      if (h === 'date' || h === 'nextDate') { cell.setNumberFormat('@'); cell.setValue(rec[h]); return; }
      if (TEXT_COLUMNS.indexOf(h) >= 0) { setCellText_(sh, hit._row, map[h], rec[h]); return; }
      cell.setValue(rec[h]);
    });
    if (map.deleted) sh.getRange(hit._row, map.deleted).setValue(0);
  } else {
    rec.createdAt = nowIso;
    appendRowText_(sh, heads.map(function (h) {
      if (h === 'createdAt') return nowIso;
      if (h === 'deleted') return 0;
      return rec[h] === undefined ? '' : rec[h];
    }), heads);
    var lastRow = sh.getLastRow();
    ['date', 'nextDate'].forEach(function (h) {
      var idx = heads.indexOf(h);
      if (idx >= 0) sh.getRange(lastRow, idx + 1).setNumberFormat('@');
    });
  }
  try {
    appendTab_('Logs', { ts: nowIso, action: hit ? 'daily.edit' : 'daily.add', ref: ref + ' · ' + customer, detail: String(rec.channel) + ' · ฿' + Number(rec.value || 0), by: rec.by });
  } catch (e) {}
  return { ok: true, ref: ref, items: listDailyApi_(token).items };
}

function delDailyApi_(token, ref) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var sh = tab_(DAILY_TAB);
  var rows = tabRows_(sh);
  var hit = null;
  rows.forEach(function (r) { if (String(r.ref || '').toUpperCase() === String(ref || '').toUpperCase()) hit = r; });
  if (!hit) throw new Error('ไม่พบบันทึกนี้');
  var heads = tabHeaders_(sh);
  var map = {}; heads.forEach(function (h, i) { if (h) map[h] = i + 1; });
  if (!seesAllLevel_(s.level) && String(hit.by || '').toLowerCase() !== String(s.email).toLowerCase()) {
    throw new Error('ลบได้เฉพาะบันทึกของตนเอง');
  }
  if (map.deleted) sh.getRange(hit._row, map.deleted).setValue(1);
  else sh.deleteRow(hit._row);
  return { ok: true, items: listDailyApi_(token).items };
}
