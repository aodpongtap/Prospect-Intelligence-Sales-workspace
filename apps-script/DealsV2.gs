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
  return { ok: true, deals: all, count: all.length, level: s.level };
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
 */
function saveDealV2(token, payload) {
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
  var row = 0;
  var existing = null;
  if (no) {
    var last = sh.getLastRow();
    var col = last >= 2 ? sh.getRange(2, map.no, last - 1, 1).getValues() : [];
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0] || '').trim() === no) {
        row = i + 2;
        var ownerCol = map.ownerEmail ? sh.getRange(row, map.ownerEmail).getValue() : '';
        existing = { ownerEmail: String(ownerCol || '').toLowerCase() };
        break;
      }
    }
    /* ชนกันข้ามเครื่อง (เลขซ้ำแต่คนละเจ้าของ) → ออกเลขใหม่ให้ */
    if (existing && existing.ownerEmail && existing.ownerEmail !== String(s.email).toLowerCase() && !seesAllLevel_(s.level)) {
      no = '';
      row = 0;
    }
  }
  if (!row) no = no || nextDealNo_(year, sh);

  var nowIso = new Date().toISOString();
  var saleId = String(p.saleId || s.saleId || '').trim().toUpperCase();
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
    /* อัปเดตเฉพาะคอลัมน์ที่มี header */
    Object.keys(map).forEach(function (h) {
      if (h === 'createdAt') return;
      if (rec[h] === undefined) return;
      var cell = sh.getRange(row, map[h]);
      if (h === 'quoteDate') { cell.setNumberFormat('@'); cell.setValue(rec[h]); return; }
      cell.setValue(rec[h]);
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
    sh.appendRow(rowVals);
    if (map.quoteDate) sh.getRange(sh.getLastRow(), map.quoteDate).setNumberFormat('@');
  }

  if (typeof appendTab_ === 'function' && sh.getName() === 'Logs') { /* no-op */ }
  try {
    appendTab_('Logs', { ts: nowIso, action: row ? 'deal.edit' : 'deal.add', ref: no + ' · ' + customer, detail: job + ' · ' + Number(p.amount || 0) + ' · st' + status, by: String(s.email).toLowerCase() });
  } catch (e) {}

  return { ok: true, no: no, deals: readDealsV2_().filter(function (d) { return dealVisible_(s, d); }) };
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
