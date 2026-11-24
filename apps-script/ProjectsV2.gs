/**
 * Projects v2 — ซิงก์โครงการ (Project Tracking) ขึ้น Google Sheet
 * -----------------------------------------------------------------
 * ใช้ร่วมกับ DataSchema.gs (แท็บ `Projects`)
 * API:
 *   ?action=projectsV2&token=…              → โครงการที่ผู้ใช้มีสิทธิ์เห็น
 *   ?action=saveProject&token=…&project=<json>  → upsert ตาม `no` (= id ฝั่งเว็บ)
 *   ?action=delProject&token=…&no=…         → soft delete (deleted=1)
 */

var PROJ_TAB = 'Projects';

function projSheet_() {
  var ss = getSheet_().getParent();
  var sh = ss.getSheetByName(PROJ_TAB);
  if (!sh) { setupDataSheets(); sh = ss.getSheetByName(PROJ_TAB); }
  return sh;
}
function projHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
}
function projColMap_(sh) {
  var map = {};
  projHeaders_(sh).forEach(function (h, i) { if (h) map[h] = i + 1; });
  return map;
}

function readProjects_() {
  var sh = projSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var map = projColMap_(sh);
  if (!map.no) return [];
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, last - 1, width).getValues();
  var out = [];
  rows.forEach(function (r) {
    function v(name) { var c = map[name]; return c ? r[c - 1] : ''; }
    var no = String(v('no') || '').trim();
    if (!no) return;
    if (Number(v('deleted')) === 1) return;
    var tasks = [];
    try { tasks = JSON.parse(String(v('tasksJson') || '[]')) || []; } catch (e) { tasks = []; }
    var rawStage = v('stage'), rawProg = v('progress');
    out.push({
      id: no,
      customer: String(v('customer') || ''),
      name: String(v('job') || ''),
      stage: (rawStage instanceof Date) ? 0 : (Number(rawStage) || 0),
      owner: String(v('ownerName') || ''),
      ownerEmail: String(v('ownerEmail') || '').toLowerCase(),
      sale: String(v('saleName') || ''),
      team: String(v('team') || '').toUpperCase(),
      startDate: normDate_(v('startDate')),
      deadline: normDate_(v('dueDate')),
      blocker: String(v('blocker') || ''),
      note: String(v('note') || ''),
      drRef: String(v('drRef') || '').trim().toUpperCase(),
      progress: (rawProg instanceof Date) ? 0 : (Number(rawProg) || 0),
      tasks: Array.isArray(tasks) ? tasks : [],
      createdAt: String(v('createdAt') || ''),
      updatedAt: String(v('updatedAt') || '')
    });
  });
  out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  return out;
}

/** สิทธิ์การมองเห็นโครงการ */
function projVisible_(s, p) {
  if (seesAllLevel_(s.level)) return true;
  var me = String(s.email || '').toLowerCase();
  if (p.ownerEmail === me) return true;
  if (levelN_(s.level) <= 4) {
    var team = String(s.team || '').trim().toUpperCase();
    if (team && p.team === team) return true;
    var down = descendantsOf_(me).map(function (r) { return String(r.email || '').toLowerCase(); });
    return down.indexOf(p.ownerEmail) >= 0;
  }
  return false;
}

function listProjectsApi_(token) {
  var s = session_(token);
  if (!s) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', projects: [] };
  var all = readProjects_().filter(function (p) { return projVisible_(s, p); });
  return { ok: true, projects: all };
}

function saveProjectApi_(token, payload) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var p = payload || {};
  var no = String(p.id || p.no || '').trim();
  if (!no) throw new Error('ไม่พบรหัสโครงการ');
  if (!String(p.name || '').trim()) throw new Error('ต้องระบุชื่อโครงการ');
  if (!String(p.customer || '').trim()) throw new Error('ต้องระบุลูกค้า');

  var sh = projSheet_();
  var map = projColMap_(sh);
  var nowIso = new Date().toISOString();
  var width = sh.getLastColumn();
  var last = sh.getLastRow();
  var rowIdx = 0;
  if (last >= 2 && map.no) {
    var nos = sh.getRange(2, map.no, last - 1, 1).getValues();
    for (var i = 0; i < nos.length; i++) {
      if (String(nos[i][0] || '').trim() === no) { rowIdx = i + 2; break; }
    }
  }
  var prev = rowIdx ? sh.getRange(rowIdx, 1, 1, width).getValues()[0] : [];
  function prevVal(name) { var c = map[name]; return (c && prev.length) ? prev[c - 1] : ''; }
  var createdAt = rowIdx ? String(prevVal('createdAt') || nowIso) : nowIso;

  var rec = {
    no: no,
    customer: String(p.customer || ''),
    job: String(p.name || ''),
    dealNo: String(p.dealNo || ''),
    stage: Number(p.stage || 0),
    ownerEmail: String(p.ownerEmail || s.email || '').toLowerCase(),
    ownerName: String(p.owner || ''),
    saleName: String(p.sale || ''),
    team: String(p.team || '').toUpperCase(),
    startDate: normDate_(p.startDate),
    dueDate: normDate_(p.deadline),
    deliveredDate: Number(p.stage) >= 4 ? (String(prevVal('deliveredDate') || '') || nowIso.slice(0, 10)) : '',
    progress: Number(p.progress || 0),
    blocker: String(p.blocker || ''),
    note: String(p.note || ''),
    drRef: String(p.drRef || '').toUpperCase(),
    tasksJson: JSON.stringify(Array.isArray(p.tasks) ? p.tasks : []),
    createdAt: createdAt,
    updatedAt: nowIso,
    deleted: 0
  };

  var row = [];
  for (var c = 1; c <= width; c++) row.push('');
  Object.keys(rec).forEach(function (k) { if (map[k]) row[map[k] - 1] = rec[k]; });
  if (rowIdx) sh.getRange(rowIdx, 1, 1, width).setValues([row]);
  else sh.appendRow(row);

  appendTab_('Logs', {
    ts: nowIso,
    action: rowIdx ? 'project.edit' : 'project.add',
    ref: no + ' · ' + rec.customer,
    detail: rec.job + ' · ขั้นตอน ' + rec.stage + ' · ทีม ' + (rec.team || '-') + ' · ความคืบหน้า ' + rec.progress + '%',
    by: String(s.email).toLowerCase()
  });

  return { ok: true, no: no, updatedAt: nowIso, created: !rowIdx };
}

function deleteProjectApi_(token, no) {
  var s = session_(token);
  if (!s) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var id = String(no || '').trim();
  if (!id) throw new Error('ไม่พบรหัสโครงการ');
  var sh = projSheet_();
  var map = projColMap_(sh);
  if (!map.no || !map.deleted) throw new Error('แท็บ Projects ยังไม่พร้อม');
  var last = sh.getLastRow();
  var found = 0;
  if (last >= 2) {
    var nos = sh.getRange(2, map.no, last - 1, 1).getValues();
    for (var i = 0; i < nos.length; i++) {
      if (String(nos[i][0] || '').trim() === id) { found = i + 2; break; }
    }
  }
  if (!found) throw new Error('ไม่พบโครงการนี้');
  sh.getRange(found, map.deleted).setValue(1);
  if (map.updatedAt) sh.getRange(found, map.updatedAt).setValue(new Date().toISOString());
  appendTab_('Logs', {
    ts: new Date().toISOString(), action: 'project.del', ref: id, detail: 'soft delete', by: String(s.email).toLowerCase()
  });
  return { ok: true };
}
