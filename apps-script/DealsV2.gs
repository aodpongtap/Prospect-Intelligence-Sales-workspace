/**
 * Deals v2 — ซิงก์ดีลขึ้น Google Sheet (แทนการเก็บแค่ localStorage)
 * -----------------------------------------------------------------
 * ใช้ร่วมกับ DataSchema.gs (แท็บ `Deals`)
 * API:
 *   ?action=dealsV2&token=…      → ดีลที่ผู้ใช้มีสิทธิ์เห็น
 *   ?action=saveDeal&token=…&deal=<json>  → upsert ตาม `no` (เว้นว่าง = ให้เซิร์ฟเวอร์สร้างเลขให้)
 *   ?action=delDeal&token=…&no=… → soft delete (deleted=1)
 */

var DEAL_TAB = 'Deals';

function dealSheet_() {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(DEAL_TAB);
  if (!sh) { setupDataSheets(); sh = ss.getSheetByName(DEAL_TAB); }
  return sh;
}
function dealHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
}
function dealColMap_(sh) {
  var map = {};
  dealHeaders_(sh).forEach(function (h, i) { if (h) map[h] = i + 1; });
  return map;
}

/** อ่านดีลทั้งหมด (เฉพาะแถวที่เป็น schema v2 = มี `no`) */
function readDealsV2_() {
  var sh = dealSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var map = dealColMap_(sh);
  if (!map.no) return [];
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, last - 1, width).getValues();
  var out = [];
  rows.forEach(function (r) {
    function v(name) { var c = map[name]; return c ? r[c - 1] : ''; }
    var no = String(v('no') || '').trim();
    if (!no) return;                                  /* ข้ามแถว legacy ที่ไม่มี no */
    if (Number(v('deleted')) === 1) return;           /* soft delete */
    out.push({
      no: no,
      ownerEmail: String(v('ownerEmail') || '').toLowerCase(),
      saleId: String(v('saleId') || '').trim().toUpperCase(),
      team: String(v('team') || '').trim().toUpperCase(),
      customer: String(v('customer') || ''),
      job: String(v('job') || ''),
      so: String(v('so') || ''),
      docNo: String(v('docNo') || ''),
      quoteDate: normDate_(v('quoteDate')),
      year: Number(v('year') || 0),
      month: Number(v('month') || 0),
      product: String(v('product') || ''),
      amount: Number(v('amount') || 0),
      payment: String(v('payment') || ''),
      status: Number(v('status') || 0),
      prob: Number(v('prob') || 0),
      drRef: String(v('drRef') || '').trim().toUpperCase(),
      note: String(v('note') || ''),
      createdAt: String(v('createdAt') || ''),
      updatedAt: String(v('updatedAt') || '')
    });
  });
  return out;
}

/** สิทธิ์การมองเห็นดีล (admin/BU = ทั้งหมด, head/sup = สายงาน, AE/agent = saleId ตัวเอง) */
function dealVisible_(s, d) {
  if (seesAllLevel_(s.level)) return true;
  var me = String(s.email || '').toLowerCase();
  if (levelN_(s.level) <= 4) {
    if (d.ownerEmail === me) return true;
    var team = descendantsOf_(me).map(function (r) { return r.email; });
    return team.indexOf(d.ownerEmail) >= 0;
  }
  var mySale = String(s.saleId || '').trim().toUpperCase();
  return !!mySale && d.saleId === mySale;
}

function listDealsV2Api_(token) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', deals: [] };
  var all = readDealsV2_().filter(function (d) { return dealVisible_(s, d); });
  return { ok: true, deals: all, count: all.length, level: s.level, deletedNos: deletedDealNos_(s) };
}

/**
 * ล้างดีลซ้ำ (Admin เท่านั้น): ลูกค้า+มูลค่า+drRef เดียวกัน → เก็บใบเก่าสุด ลบทิ้งที่เหลือ (soft delete)
 */
function dedupeDealsApi_(token) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(30000); } catch (e) { locked = false; }
  if (!locked) throw new Error('ระบบกำลังทำงานอื่นอยู่ กรุณาลองใหม่');
  try {
    var sh = dealSheet_();
    var map = dealColMap_(sh);
    var last = sh.getLastRow();
    var removed = [];
    if (last < 2) return { ok: true, removed: removed };
    var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (map.deleted && Number(r[map.deleted - 1]) === 1) continue;
      var no = map.no ? String(r[map.no - 1] || '').trim() : '';
      var cust = map.customer ? String(r[map.customer - 1] || '').trim() : '';
      var amt = map.amount ? Number(r[map.amount - 1] || 0) : 0;
      var dref = map.drRef ? String(r[map.drRef - 1] || '').trim().toUpperCase() : '';
      if (!dref || !cust) continue;
      var key = dref + '||' + cust + '||' + amt;
      if (!seen[key]) { seen[key] = true; continue; }
      if (map.deleted) sh.getRange(i + 2, map.deleted).setValue(1);
      if (map.updatedAt) sh.getRange(i + 2, map.updatedAt).setValue(new Date().toISOString());
      removed.push(no + ' | ' + cust + ' | ' + amt);
    }
    try {
      appendTab_('Logs', { ts: new Date().toISOString(), action: 'deal.dedupe', ref: String(removed.length) + ' ดีล', detail: removed.join(' ; '), by: String(s.email).toLowerCase() });
    } catch (e) {}
    return { ok: true, removed: removed, count: removed.length };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * ล้างข้อมูลดีลทดสอบ (Admin เท่านั้น) — soft delete ทุกแถวที่เข้าข่ายทดสอบ
 * เกณฑ์: ชื่อลูกค้า/ชื่องานมีคำว่า ทดสอบ/ทดลอง/QC · ชื่อลูกค้ารูปแบบ "ลูกค้า YYYY-NNNN" ·
 *        ชื่อลูกค้าเป็น "A" · เจ้าของเป็นบัญชีอีเมลที่มีคำว่า test
 */
function purgeTestDealsApi_(token) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  var sh = dealSheet_();
  var map = dealColMap_(sh);
  var last = sh.getLastRow();
  var hitRows = [], out = [];
  if (last < 2) return { ok: true, deleted: out, count: 0 };
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var RE_TEST = /ทดสอบ|ทดลอง|^QC/i;
  var RE_PLACEHOLDER = /^ลูกค้า\s*\d{4}-\d+/i;
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (map.deleted && Number(r[map.deleted - 1]) === 1) continue;
    var no = map.no ? String(r[map.no - 1] || '').trim() : '';
    var cust = map.customer ? String(r[map.customer - 1] || '').trim() : '';
    var job = map.job ? String(r[map.job - 1] || '').trim() : '';
    var own = map.ownerEmail ? String(r[map.ownerEmail - 1] || '').trim().toLowerCase() : '';
    var hit = RE_TEST.test(cust) || RE_TEST.test(job) || RE_PLACEHOLDER.test(cust) ||
      /^A$/i.test(cust) || /test/i.test(own);
    if (!hit) continue;
    hitRows.push(i + 2);
    out.push(String(no) + ' | ' + cust);
  }
  hitRows.forEach(function (row) {
    if (map.deleted) sh.getRange(row, map.deleted).setValue(1);
    if (map.updatedAt) sh.getRange(row, map.updatedAt).setValue(new Date().toISOString());
  });
  try {
    appendTab_('Logs', {
      ts: new Date().toISOString(), action: 'deal.purgeTest',
      ref: String(out.length) + ' ดีล', detail: out.join(' ; '), by: String(s.email).toLowerCase()
    });
  } catch (e) {}
  return { ok: true, deleted: out, count: out.length };
}

/**
 * แก้เลขดีลที่ซ้ำกัน (Admin เท่านั้น) — เก็บแถวแรกไว้ ให้แถวที่เหลือได้เลขใหม่
 * ใช้หลังพบเลขซ้ำจากการบันทึกพร้อมกันหลายเครื่อง
 */
function fixDupDealNosApi_(token) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!isAdminLevel_(s.level)) throw new Error('เฉพาะ Admin เท่านั้น');
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(30000); } catch (e) { locked = false; }
  if (!locked) throw new Error('ระบบกำลังทำงานอื่นอยู่ กรุณาลองใหม่');
  try {
    var sh = dealSheet_();
    var map = dealColMap_(sh);
    if (!map.no) throw new Error('แท็บ Deals ยังไม่มีคอลัมน์ no');
    var last = sh.getLastRow();
    var fixed = [];
    if (last < 2) return { ok: true, fixed: fixed };
    var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (map.deleted && Number(r[map.deleted - 1]) === 1) continue;
      var no = String(r[map.no - 1] || '').trim();
      if (!no) continue;
      if (!seen[no]) { seen[no] = true; continue; }
      var yr = map.year ? (Number(r[map.year - 1]) || new Date().getFullYear()) : new Date().getFullYear();
      var newNo = nextDealNo_(yr, sh);
      sh.getRange(i + 2, map.no).setValue(newNo);
      if (map.updatedAt) sh.getRange(i + 2, map.updatedAt).setValue(new Date().toISOString());
      fixed.push(no + '→' + newNo);
    }
    try {
      appendTab_('Logs', {
        ts: new Date().toISOString(), action: 'deal.fixDup',
        ref: String(fixed.length) + ' ดีล', detail: fixed.join(' ; '), by: String(s.email).toLowerCase()
      });
    } catch (e) {}
    return { ok: true, fixed: fixed, count: fixed.length };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/** รายการเลขดีลที่ถูกลบแล้ว (ให้ client ลบสำเนาในเครื่องทิ้ง ไม่ให้ดันกลับขึ้นมาฟื้นคืน) */
function deletedDealNos_(s) {
  var out = [];
  try {
    var sh = dealSheet_();
    var map = dealColMap_(sh);
    if (!map.no || !map.deleted) return out;
    var last = sh.getLastRow();
    if (last < 2) return out;
    var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    rows.forEach(function (r) {
      var no = String(r[map.no - 1] || '').trim();
      if (!no) return;
      if (Number(r[map.deleted - 1]) !== 1) return;
      var owner = String(map.ownerEmail ? r[map.ownerEmail - 1] : '').toLowerCase();
      if (seesAllLevel_(s.level) || owner === String(s.email).toLowerCase()) out.push(no);
    });
  } catch (e) {}
  return out.slice(0, 3000);
}

/** เลขดีลถัดไปของปี (YYYY-NNNN) จากข้อมูลบนชีต */
function nextDealNo_(year, sh) {
  var y = Number(year) || new Date().getFullYear();
  var map = dealColMap_(sh);
  var last = sh.getLastRow();
  var max = 0;
  if (last >= 2 && map.no) {
    var col = sh.getRange(2, map.no, last - 1, 1).getValues();
    col.forEach(function (r) {
      var m = String(r[0] || '').match(new RegExp('^' + y + '-(\\d+)$'));
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  return y + '-' + String(max + 1).padStart(4, '0');
}

/**
 * บันทึก/แก้ไขดีล (upsert ตาม no)
 * payload: { no?, customer, job, so, docNo, quoteDate, year, month, product, amount, payment, status, prob, drRef, note, saleId? }
 * ใช้ LockService กันการออกเลขดีลซ้ำเมื่อมีผู้ใช้บันทึกพร้อมกันหลายคน
 */
function saveDealV2(token, payload) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    try { locked = lock.tryLock(30000); } catch (e) { locked = false; }
    if (!locked) throw new Error('ระบบกำลังบันทึกดีลอื่นอยู่ กรุณากดบันทึกอีกครั้ง');
    return saveDealV2_(token, payload);
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e) {} }
  }
}

function saveDealV2_(token, payload) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!canSell_(s.level)) throw new Error('บัญชีนี้ไม่มีสิทธิ์บันทึกดีล');

  var p = payload || {};
  var customer = String(p.customer || '').trim();
  var job = String(p.job || '').trim();
  if (!customer) throw new Error('กรอกชื่อลูกค้า');
  if (!job) throw new Error('กรอกชื่องาน/ดีล');

  var status = Number(p.status);
  if (isNaN(status)) status = 1;
  if (status === 4 && !String(p.docNo || '').trim()) {
    throw new Error('สถานะ “ปิดงานแล้ว” ต้องระบุเลขอินวอย / เลขที่สัญญา / เลขที่ SO');
  }
  var PROB = { 0: 25, 1: 50, 2: 75, 3: 90, 4: 100, 5: 0 };
  var prob = (PROB[status] === undefined ? 50 : PROB[status]);

  var year = Number(p.year) || new Date().getFullYear();
  var month = Number(p.month) || (new Date().getMonth() + 1);

  var sh = dealSheet_();
  var map = dealColMap_(sh);
  if (!map.no) throw new Error('แท็บ Deals ยังไม่มีคอลัมน์ no — กรุณารัน setupDataSheets()');

  var no = String(p.no || '').trim();
  if (p.isNew === true) no = '';   /* ดีลใหม่: ให้เซิร์ฟเวอร์ออกเลขเองเสมอ — กันเลขซ้ำเมื่อข้อมูลในเครื่องล้าสมัย/หลายเครื่องพร้อมกัน */
  var row = 0;
  var existing = null;
  var prevStatus = null;
  var prevAmount = null;
  if (no) {
    var last = sh.getLastRow();
    var col = last >= 2 ? sh.getRange(2, map.no, last - 1, 1).getValues() : [];
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0] || '').trim() === no) {
        row = i + 2;
        var ownerCol = map.ownerEmail ? sh.getRange(row, map.ownerEmail).getValue() : '';
        existing = { ownerEmail: String(ownerCol || '').toLowerCase() };
        if (map.status) prevStatus = Number(sh.getRange(row, map.status).getValue());
        if (map.amount) prevAmount = Number(sh.getRange(row, map.amount).getValue() || 0);
        break;
      }
    }
    /* ชนกันข้ามเครื่อง (เลขซ้ำแต่คนละเจ้าของ) → ออกเลขใหม่ให้ */
    if (existing && existing.ownerEmail && existing.ownerEmail !== String(s.email).toLowerCase() && !seesAllLevel_(s.level)) {
      no = '';
      row = 0;
    }
  }
  if (!row) {
    /* กันดีลซ้ำ: บันทึกเดียวกัน (drRef) + ลูกค้าเดียวกัน → คืนเลขดีลเดิมไม่สร้างใหม่ */
    var wantedRef = String(p.drRef || '').trim().toUpperCase();
    if (wantedRef) {
      var dl = sh.getLastRow();
      if (dl >= 2) {
        var scan = sh.getRange(2, 1, dl - 1, sh.getLastColumn()).getValues();
        for (var q = 0; q < scan.length; q++) {
          var rr = scan[q];
          if (map.deleted && Number(rr[map.deleted - 1]) === 1) continue;
          var dref = map.drRef ? String(rr[map.drRef - 1] || '').trim().toUpperCase() : '';
          var dcust = map.customer ? String(rr[map.customer - 1] || '').trim() : '';
          if (dref && dref === wantedRef && dcust === customer) {
            return { ok: true, no: String(rr[map.no - 1] || ''), dup: true };
          }
        }
      }
    }
  }
  if (!row) no = no || nextDealNo_(year, sh);

  /* กันการ “ฟื้นคืน” ดีลที่ถูกลบไปแล้ว (client อื่นที่ยังมีสำเนาในเครื่องพยายามดันกลับ) */
  if (row && map.deleted && Number(sh.getRange(row, map.deleted).getValue()) === 1) {
    return { ok: true, skipped: true, deleted: true, no: no };
  }

  var nowIso = new Date().toISOString();
  var noChange = false;
  var saleId = String(p.saleId || s.saleId || '').trim().toUpperCase();
  if (!saleId) throw new Error('บัญชีนี้ยังไม่ถูกผูกกับ AE (saleId) — กรุณาให้แอดมินผูก AE ก่อนบันทึกดีล');
  var team = String(s.team || '').trim().toUpperCase();
  if (!team && saleId) {
    /* หา team ของ saleId จากแท็บ Users */
    var u = readRows_().filter(function (r) { return r.saleId === saleId; })[0];
    if (u) team = u.team || '';
  }

  var rec = {
    no: no,
    ownerEmail: row && existing ? String(existing.ownerEmail || s.email) : String(s.email).toLowerCase(),
    saleId: saleId,
    team: team,
    customer: customer,
    job: job,
    so: String(p.so || '').trim(),
    docNo: String(p.docNo || '').trim(),
    quoteDate: normDate_(p.quoteDate) || new Date().toISOString().slice(0, 10),
    year: year,
    month: month,
    product: String(p.product || 'P1'),
    amount: Number(p.amount || 0),
    payment: String(p.payment || 'cash'),
    status: status,
    prob: prob,
    drRef: String(p.drRef || '').trim().toUpperCase(),
    note: String(p.note || ''),
    updatedAt: nowIso
  };

  if (row) {
    /* ตรวจว่ามีอะไรเปลี่ยนจริงไหม — ถ้าไม่มี ไม่ต้องเขียน log ซ้ำ */
    try {
      var cur = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
      var diff = 0;
      Object.keys(map).forEach(function (h) {
        if (h === 'createdAt' || h === 'updatedAt' || h === 'deleted') return;
        if (rec[h] === undefined) return;
        var a = cur[map[h] - 1];
        var b = rec[h];
        if (a instanceof Date) a = Utilities.formatDate(a, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (String(a == null ? '' : a).trim() !== String(b == null ? '' : b).trim()) diff++;
      });
      noChange = diff === 0;
    } catch (eDiff) { noChange = false; }
    /* อัปเดตเฉพาะคอลัมน์ที่มี header */
    Object.keys(map).forEach(function (h) {
      if (h === 'createdAt') return;
      if (rec[h] === undefined) return;
      if (TEXT_COLUMNS.indexOf(h) >= 0) { setCellText_(sh, row, map[h], rec[h]); return; }
      sh.getRange(row, map[h]).setValue(rec[h]);
    });
    if (map.deleted) sh.getRange(row, map.deleted).setValue(0);
  } else {
    rec.createdAt = nowIso;
    var headers = dealHeaders_(sh);
    var rowVals = headers.map(function (h) {
      if (h === 'createdAt') return rec.createdAt;
      if (h === 'deleted') return 0;
      return rec[h] === undefined ? '' : rec[h];
    });
    appendRowText_(sh, rowVals, headers);
    if (map.quoteDate) sh.getRange(sh.getLastRow(), map.quoteDate).setNumberFormat('@');
  }

  try {
    var ST_LABEL = { 0: 'กำลังคยุย Detail', 1: 'Pipeline', 2: 'รอยืนยัน PO', 3: 'รอส่งของ/เปิดบิล', 4: 'Actual (ปิดงานแล้ว)', 5: 'ยกเลิก' };
    var detail = '';
    if (row && prevStatus !== null && prevStatus !== status) {
      detail = 'เปลี่ยนสถานะ: ' + (ST_LABEL[prevStatus] || prevStatus) + ' → ' + (ST_LABEL[status] || status) + ' · ฿' + Number(p.amount || 0).toLocaleString('en-US');
    } else if (row) {
      detail = 'แก้ไขข้อมูลดีล' + (prevAmount !== null && prevAmount !== Number(p.amount || 0) ? ' · มูลค่า ฿' + Number(prevAmount).toLocaleString('en-US') + ' → ฿' + Number(p.amount || 0).toLocaleString('en-US') : '');
    } else {
      detail = 'สร้างดีลใหม่ · ' + (ST_LABEL[status] || status) + ' · ฿' + Number(p.amount || 0).toLocaleString('en-US');
    }
    if (status === 4 && String(p.docNo || '').trim()) detail += ' · เอกสาร ' + String(p.docNo).trim();
    /* ไม่มีอะไรเปลี่ยน (เช่น client ดันสำเนาเดิมขึ้นมา) → ไม่ต้องบันทึก log ซ้ำ */
    if (!(row && noChange)) {
      appendTab_('Logs', { ts: nowIso, action: row ? 'deal.edit' : 'deal.add', ref: no + ' · ' + customer, detail: detail, by: String(s.email).toLowerCase() });
    }
  } catch (e) {}

  return { ok: true, no: no, deals: readDealsV2_().filter(function (d) { return dealVisible_(s, d); }) };
}

/** ประวัติของดีลหนึ่งใบ (จากแท็บ Logs) */
function dealLogsApi_(token, no) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', logs: [] };
  var key = String(no || '').trim();
  if (!key) return { ok: true, logs: [] };
  var all = [];
  try { all = readTab_('Logs'); } catch (e) { all = []; }
  var out = all.filter(function (r) {
    var ref = String(r.ref || '');
    return ref.indexOf(key + ' ·') === 0 || ref === key || ref.indexOf(key) === 0;
  }).map(function (r) {
    return { ts: String(r.ts || ''), action: String(r.action || ''), detail: String(r.detail || ''), by: String(r.by || '') };
  });
  out.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  return { ok: true, logs: out.slice(0, 50) };
}

function deleteDealV2(token, no) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var sh = dealSheet_();
  var map = dealColMap_(sh);
  var row = 0, owner = '';
  var last = sh.getLastRow();
  if (last >= 2 && map.no) {
    var col = sh.getRange(2, map.no, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0] || '').trim() === String(no)) { row = i + 2; break; }
    }
  }
  if (!row) throw new Error('ไม่พบดีลนี้');
  if (map.ownerEmail) owner = String(sh.getRange(row, map.ownerEmail).getValue() || '').toLowerCase();
  if (!seesAllLevel_(s.level) && owner && owner !== String(s.email).toLowerCase()) {
    throw new Error('ลบได้เฉพาะดีลของตนเอง');
  }
  if (map.deleted) sh.getRange(row, map.deleted).setValue(1);
  else sh.deleteRow(row);
  if (map.updatedAt) sh.getRange(row, map.updatedAt).setValue(new Date().toISOString());
  try {
    appendTab_('Logs', { ts: new Date().toISOString(), action: 'deal.del', ref: String(no), detail: 'soft delete', by: String(s.email).toLowerCase() });
  } catch (e) {}
  return { ok: true, deals: readDealsV2_().filter(function (d) { return dealVisible_(s, d); }) };
}
