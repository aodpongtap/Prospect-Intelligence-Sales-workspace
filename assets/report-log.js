/* ===================================================================
   Report Log — บันทึกกิจกรรมในระบบ + ส่งออกเป็นไฟล์ Excel (.xlsx)
   ใช้ข้อมูลจาก Reports / Projects / Users ที่มีอยู่แล้ว
   ไม่ต้องพึ่ง library ภายนอก (เขียน XLSX เองแบบ ZIP store)
   =================================================================== */
(function (global) {
  'use strict';

  var LS_LOG = 'pi_log_v1';
  var MAX_ROWS = 800;

  var ACTIONS = {
    'deal.add':    { label: 'เพิ่มดีล',        color: '#16A34A', icon: 'fa-solid fa-circle-plus' },
    'deal.edit':   { label: 'แก้ไขดีล',       color: '#2563EB', icon: 'fa-solid fa-pen' },
    'deal.del':    { label: 'ลบดีล',           color: '#DC2626', icon: 'fa-solid fa-trash' },
    'target.save': { label: 'แก้ไขเป้าหมาย',  color: '#7C3AED', icon: 'fa-solid fa-bullseye' },
    'team.add':    { label: 'เพิ่มทีม',        color: '#0E9384', icon: 'fa-solid fa-people-group' },
    'team.del':    { label: 'ลบทีม',           color: '#DC2626', icon: 'fa-solid fa-user-minus' },
    'project.add': { label: 'เพิ่มโครงการ',    color: '#16A34A', icon: 'fa-solid fa-diagram-project' },
    'project.edit':{ label: 'แก้ไขโครงการ',   color: '#2563EB', icon: 'fa-solid fa-pen-to-square' },
    'project.del': { label: 'ลบโครงการ',       color: '#DC2626', icon: 'fa-solid fa-trash' },
    'task.add':    { label: 'เพิ่มงานย่อย',    color: '#0EA5E9', icon: 'fa-solid fa-list-check' },
    'task.toggle': { label: 'เปลี่ยนสถานะงาน', color: '#F59E0B', icon: 'fa-solid fa-arrows-rotate' },
    'task.edit':   { label: 'แก้ไขงานย่อย',   color: '#2563EB', icon: 'fa-solid fa-pen' },
    'task.del':    { label: 'ลบงานย่อย',       color: '#DC2626', icon: 'fa-solid fa-trash' },
    'user.add':    { label: 'ลงทะเบียนผู้ใช้', color: '#16A34A', icon: 'fa-solid fa-user-plus' },
    'user.sale':   { label: 'กำหนดเซลส์ให้บัญชี', color: '#7C3AED', icon: 'fa-solid fa-link' },
    'user.del':    { label: 'ลบผู้ใช้',         color: '#DC2626', icon: 'fa-solid fa-user-minus' },
    'auth.login':  { label: 'เข้าสู่ระบบ',     color: '#64748B', icon: 'fa-solid fa-right-to-bracket' },
    'export':      { label: 'ส่งออกข้อมูล',    color: '#0F2B46', icon: 'fa-solid fa-file-excel' }
  };

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function money(v) { return '฿' + num(v).toLocaleString('th-TH'); }
  function nowISO() { return new Date().toISOString(); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function thDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + (d.getFullYear() + 543) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function thDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + (d.getFullYear() + 543);
  }

  /* ---------------- store ---------------- */
  function readAll() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_LOG) || '[]');
      return Object.prototype.toString.call(a) === '[object Array]' ? a : [];
    } catch (e) { return []; }
  }
  function writeAll(a) {
    try { localStorage.setItem(LS_LOG, JSON.stringify(a.slice(0, MAX_ROWS))); } catch (e) {}
  }

  /** เพิ่มบันทึกกิจกรรม */
  function add(action, target, detail) {
    try {
      var me = global.__ME__ || {};
      var rec = {
        t: nowISO(),
        a: String(action || 'other'),
        u: String(me.email || 'system'),
        n: String(me.name || ''),
        lv: String(me.level || ''),
        tg: String(target || ''),
        d: String(detail || '')
      };
      var all = readAll();
      all.unshift(rec);
      writeAll(all);
      return rec;
    } catch (e) { return null; }
  }
  function list() { return readAll(); }
  function clear() { writeAll([]); }

  /* ---------------- filters / state ---------------- */
  var state = { q: '', action: '', user: '', from: '', to: '' };

  function filtered() {
    var q = String(state.q || '').trim().toLowerCase();
    var from = state.from ? new Date(state.from + 'T00:00:00').getTime() : 0;
    var to = state.to ? new Date(state.to + 'T23:59:59').getTime() : 0;
    return readAll().filter(function (r) {
      if (state.action && r.a !== state.action) return false;
      if (state.user && r.u !== state.user) return false;
      var t = new Date(r.t).getTime();
      if (from && t < from) return false;
      if (to && t > to) return false;
      if (q && (r.u + ' ' + r.n + ' ' + r.tg + ' ' + r.d + ' ' + r.a + ' ' + labelOf(r.a)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function labelOf(code) { return (ACTIONS[code] && ACTIONS[code].label) || code; }
  function colorOf(code) { return (ACTIONS[code] && ACTIONS[code].color) || '#64748B'; }
  function iconOf(code) { return (ACTIONS[code] && ACTIONS[code].icon) || 'fa-solid fa-circle-dot'; }

  /* =========================================================
     XLSX writer (ZIP store, no compression) — ไม่ต้องใช้ library
     ========================================================= */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) { return new TextEncoder().encode(str); }

  function zip(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var data = typeof f.data === 'string' ? utf8(f.data) : f.data;
      var crc = crc32(data);

      var lh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);          // UTF-8 flag
      dv.setUint16(8, 0, true);                // store
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x2821, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      chunks.push(lh, data);

      var ch = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x2821, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);

      offset += lh.length + data.length;
    });

    var centralSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    var all = chunks.concat(central, [eocd]);
    var total = all.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function xEsc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function colName(i) {
    var s = '';
    i = i + 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function sheetXml(rows) {
    var body = rows.map(function (row, ri) {
      var cells = row.map(function (v, ci) {
        var ref = colName(ci) + (ri + 1);
        var isNum = (typeof v === 'number') && isFinite(v);
        if (isNum) return '<c r="' + ref + '"' + (ri === 0 ? ' s="1"' : '') + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xEsc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    var cols = '';
    if (rows.length && rows[0].length) {
      var cw = '';
      for (var i = 0; i < rows[0].length; i++) {
        var w = 16;
        if (i === 0) w = 20;
        cw += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }
      cols = '<cols>' + cw + '</cols>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"' + (rows.length > 1 ? ' tabSelected="1"' : '') + '>'
      + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }

  /** สร้างไฟล์ .xlsx จากหลายชีต: [{name, rows}] */
  function buildXlsx(sheets) {
    var used = {};
    sheets = (sheets || []).filter(function (s) { return s && s.rows; }).map(function (s, i) {
      var nm = String(s.name || ('Sheet' + (i + 1))).replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31) || ('Sheet' + (i + 1));
      while (used[nm]) nm = (nm + '_').slice(0, 31);
      used[nm] = 1;
      return { name: nm, rows: s.rows.length ? s.rows : [['ไม่มีข้อมูล']] };
    });
    if (!sheets.length) sheets = [{ name: 'Sheet1', rows: [['ไม่มีข้อมูล']] }];

    var files = [];
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    sheets.forEach(function (s, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    ct += '</Types>';
    files.push({ name: '[Content_Types].xml', data: ct });

    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>'
    });

    var wbSheets = sheets.map(function (s, i) {
      return '<sheet name="' + xEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }).join('');
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets>' + wbSheets + '</sheets></workbook>'
    });

    var rels = sheets.map(function (s, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        + 'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    }).join('');
    rels += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>'
    });

    files.push({
      name: 'xl/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font>'
        + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FF0F2B46"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        + '</styleSheet>'
    });

    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s.rows) });
    });

    return zip(files);
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  /* ---------------- data → sheets ---------------- */
  function logRows(rows) {
    return [['วันที่-เวลา', 'ผู้ใช้', 'ชื่อ', 'สิทธิ์', 'กิจกรรม', 'รายการ', 'รายละเอียด']].concat(
      rows.map(function (r) {
        return [thDateTime(r.t), r.u, r.n || '', String(r.lv || '').toUpperCase(), labelOf(r.a), r.tg, r.d];
      })
    );
  }
  function dealRows() {
    var d = (global.SalesReport && global.SalesReport.data) ? global.SalesReport.data() : null;
    if (!d) return [['ไม่มีข้อมูลดีล']];
    var saleOf = function (id) {
      for (var i = 0; i < d.sales.length; i++) if (d.sales[i].id === id) return d.sales[i];
      return { name: id, team: '' };
    };
    var stName = { 0: 'กำลังคุย', 1: 'Pipeline', 2: 'รอยืนยัน PO', 3: 'รอส่งของ', 4: 'Actual (ปิดงานแล้ว)', 5: 'ยกเลิก' };
    return [['เลขที่ SO', 'เลขที่ QT/INV', 'ลูกค้า', 'ชื่องาน', 'เซลส์', 'ทีม', 'สถานะ', 'มูลค่างาน', 'โอกาสปิด (%)', 'เดือนที่คาดว่าจะปิด', 'ปี', 'วันที่เสนอราคา', 'หมายเหตุ']].concat(
      d.deals.map(function (x) {
        var s = saleOf(x.saleId);
        return [x.no, x.so, x.customer, x.job, s.name, s.team, (x.status + ' · ' + (stName[x.status] || '')), num(x.amount), num(x.prob), num(x.month), num(x.year), x.quoteDate || '', x.note || ''];
      })
    );
  }
  function projectRows() {
    var pr = (global.ProjectTracking && global.ProjectTracking.list) ? global.ProjectTracking.list() : [];
    var ST = ['รับช่วงงาน', 'วางแผน', 'ติดตั้ง', 'ทดสอบ & ส่งมอบ', 'ส่งมอบแล้ว'];
    return [['รหัส', 'ชื่อโครงการ', 'ลูกค้า', 'ทีม', 'ผู้รับผิดชอบ', 'เซลส์ผู้ส่งงาน', 'ขั้นตอน', 'วันเริ่ม', 'กำหนดส่งมอบ', 'Blocker', 'จำนวนงาน', 'งานเสร็จ', 'หมายเหตุ']].concat(
      pr.map(function (p) {
        var tasks = p.tasks || [];
        return [p.id, p.name, p.customer, p.team || '', p.owner, p.sale || '', ST[p.stage] || '', p.startDate || '', p.deadline || '', p.blocker || '', tasks.length,
          tasks.filter(function (t) { return t.status === 'เสร็จแล้ว'; }).length, p.note || ''];
      })
    );
  }
  function customerRows() {
    if (global.CustomerIntel && global.CustomerIntel.customers) {
      var cs = global.CustomerIntel.customers() || [];
      return [['ลูกค้า', 'ทีม', 'เซลส์', 'จำนวนดีล', 'ยอดปิดงาน', 'ดีลที่เปิดอยู่', 'สถานะ']].concat(
        cs.map(function (c) { return [c.name, c.team || '', (c.salesArr || []).join(', '), num(c.dealCount), num(c.won), num(c.open), c.health || '']; })
      );
    }
    return [['ไม่มีข้อมูลลูกค้า']];
  }
  function targetRows() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('pi_sr_targets_v2') || 'null'); } catch (e) {}
    var TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    var rows = [['ปี (ค.ศ.)', 'ทีม (BU)', 'เดือน', 'เป้าหมาย (บาท)']];
    if (raw) {
      Object.keys(raw).forEach(function (y) {
        Object.keys(raw[y] || {}).forEach(function (team) {
          (raw[y][team] || []).forEach(function (v, i) {
            rows.push([num(y), team, TH[i] || (i + 1), num(v)]);
          });
        });
      });
    }
    return rows.length > 1 ? rows : [['ยังไม่มีการตั้งเป้าหมาย']];
  }
  function userRows(users) {
    var LBL = { admin: 'Admin', bu: 'BU', head: 'Head Team', sup: 'Supervisor', sale: 'เซลล์ (Sale)', agent: 'ตัวแทน / MCN', editor: 'Editor', viewer: 'Viewer' };
    return [['อีเมล', 'ชื่อ', 'ระดับ', 'ผู้ดูแลต้นสาย', 'สถานะ']].concat(
      (users || []).map(function (u) { return [u.email, u.name || '', LBL[u.level] || u.level, u.parent || '', u.status || 'ใช้งาน']; })
    );
  }

  function exportLogExcel() {
    var rows = filtered();
    var blob = buildXlsx([{ name: 'Log', rows: logRows(rows) }]);
    download(blob, 'report-log-' + stamp() + '.xlsx');
    add('export', 'Report Log (.xlsx)', rows.length + ' รายการ');
    if (typeof global.toast === 'function') global.toast('ดาวน์โหลด Excel แล้ว (' + rows.length + ' รายการ)');
    if (typeof global.render === 'function') global.render();
  }

  function exportAllExcel() {
    var withUsers = function (users) {
      var blob = buildXlsx([
        { name: 'Log', rows: logRows(filtered()) },
        { name: 'Deals', rows: dealRows() },
        { name: 'Projects', rows: projectRows() },
        { name: 'Customers', rows: customerRows() },
        { name: 'Targets', rows: targetRows() },
        { name: 'Users', rows: userRows(users) }
      ]);
      download(blob, 'sales-workspace-data-' + stamp() + '.xlsx');
      add('export', 'ข้อมูลทั้งระบบ (.xlsx)', 'Log / Deals / Projects / Customers / Targets / Users');
      if (typeof global.toast === 'function') global.toast('ดาวน์โหลดข้อมูลทั้งระบบเป็น Excel แล้ว');
      if (typeof global.render === 'function') global.render();
    };
    if (global.PIAuth && global.PIAuth.refresh) {
      global.PIAuth.refresh().then(withUsers).catch(function () { withUsers([]); });
    } else { withUsers([]); }
  }

  /* ---------------- CSS ---------------- */
  function injectCss() {
    if (document.getElementById('lg-style')) return;
    var css = ''
      + '.lg{display:flex;flex-direction:column;gap:14px}'
      + '.lg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}'
      + '.lg-head h1{font-size:19px;color:#0F2B46;margin:0 0 3px;font-weight:700}'
      + '.lg-sub{font-size:11px;color:#667085}'
      + '.lg-acts{display:flex;gap:8px;flex-wrap:wrap}'
      + '.lg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #DCE3EB;background:#fff;color:#0F2B46;'
      + 'border-radius:9px;padding:8px 12px;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;white-space:nowrap}'
      + '.lg-acts{display:flex;gap:8px;flex-wrap:wrap}'
      + '.lg-btn:hover{border-color:#C7D7EE;box-shadow:0 6px 14px rgba(15,43,70,.07)}'
      + '.lg-btn.dark{background:#0F2B46;border-color:#0F2B46;color:#fff}'
      + '.lg-btn.green{background:#16A34A;border-color:#16A34A;color:#fff}'
      + '.lg-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}'
      + '.lg-kpi{background:#fff;border:1px solid #E9EEF5;border-radius:12px;padding:12px 14px}'
      + '.lg-kpi small{display:block;font-size:10px;color:#667085;margin-bottom:5px}'
      + '.lg-kpi b{font-size:18px;color:#0F2B46}'
      + '.lg-panel{background:#fff;border:1px solid #E9EEF5;border-radius:12px;padding:12px 14px}'
      + '.lg-filters{display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}'
      + '.lg-fl{display:flex;flex-direction:column;gap:4px}'
      + '.lg-fl label{font-size:10px;color:#667085;font-weight:600}'
      + '.lg-fl input,.lg-fl select{border:1px solid #DCE3EB;border-radius:8px;padding:7px 9px;font-size:11px;color:#0F2B46;background:#fff;min-width:120px}'
      + '.lg-tablewrap{overflow:auto;border:1px solid #EEF2F7;border-radius:10px}'
      + '.lg-table{width:100%;border-collapse:collapse;font-size:11px;min-width:760px}'
      + '.lg-table th{background:#F8FAFC;color:#475467;font-size:10px;text-align:left;padding:9px 10px;border-bottom:1px solid #EEF2F7;white-space:nowrap}'
      + '.lg-table td{padding:9px 10px;border-bottom:1px solid #F4F7FB;color:#0F2B46;vertical-align:top}'
      + '.lg-table tr:hover td{background:#FBFDFF}'
      + '.lg-act{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:99px;white-space:nowrap}'
      + '.lg-who{font-weight:600}'
      + '.lg-mail{color:#98A2B3;font-size:10px}'
      + '.lg-empty{text-align:center;color:#98A2B3;padding:26px 10px;font-size:11px}'
      + '.lg-foot{font-size:10px;color:#98A2B3;margin-top:8px}'
      + '.lg-embed{gap:12px}'
      + '.lg-embed .lg-panel{padding:14px 16px}'
      + '.lg-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}'
      + '.lg-title{display:block;font-size:13px;color:#0F2B46;font-weight:600}'
      + '.lg-kpis-mini{grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}'
      + '.lg-kpis-mini .lg-kpi{padding:9px 12px;border-radius:10px}'
      + '.lg-kpis-mini .lg-kpi b{font-size:15px}'
      + '.lg-embed .lg-tablewrap{max-height:440px}'
      + '.lg-embed .lg-table th{position:sticky;top:0;z-index:1}'
      + '@media(max-width:860px){.lg-kpis{grid-template-columns:repeat(2,1fr)}'
      + '.lg-embed .lg-ph .lg-acts{width:100%}.lg-embed .lg-ph .lg-btn{flex:1;justify-content:center}}'
      + '@media(max-width:560px){'
      + '.lg-embed .lg-ph .lg-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
      + '.lg-embed .lg-ph .lg-acts .lg-btn:last-child{grid-column:1/-1}'
      + '.lg-filters{gap:8px}'
      + '.lg-fl{flex:1 1 calc(50% - 4px);min-width:0}'
      + '.lg-fl:first-child{flex:1 1 100%}'
      + '.lg-fl input,.lg-fl select{width:100%;min-width:0}'
      + '.lg-fl .lg-btn{width:100%;justify-content:center}}';
    var el = document.createElement('style');
    el.id = 'lg-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------------- render (รองรับทั้งหน้าเดี่ยว และฝังใน Reports) ---------------- */
  function render(opts) {
    opts = opts || {};
    var embed = !!opts.embedded;
    injectCss();
    var all = readAll();
    var rows = filtered();
    var today = new Date().toDateString();
    var todayCount = all.filter(function (r) { return new Date(r.t).toDateString() === today; }).length;
    var users = {};
    all.forEach(function (r) { users[r.u] = 1; });
    var lastT = all.length ? thDateTime(all[0].t) : '—';

    var actOpts = '<option value="">ทุกกิจกรรม</option>' + Object.keys(ACTIONS).map(function (k) {
      return '<option value="' + esc(k) + '"' + (state.action === k ? ' selected' : '') + '>' + esc(ACTIONS[k].label) + '</option>';
    }).join('');
    var userOpts = '<option value="">ทุกผู้ใช้</option>' + Object.keys(users).sort().map(function (u) {
      return '<option value="' + esc(u) + '"' + (state.user === u ? ' selected' : '') + '>' + esc(u) + '</option>';
    }).join('');

    var trs = rows.slice(0, 300).map(function (r) {
      var c = colorOf(r.a);
      return '<tr>'
        + '<td style="white-space:nowrap">' + esc(thDateTime(r.t)) + '</td>'
        + '<td><div class="lg-who">' + esc(r.n || r.u) + '</div>'
        + (r.n && r.n !== r.u ? '<div class="lg-mail">' + esc(r.u) + '</div>' : '') + '</td>'
        + '<td><span class="lg-act" style="background:' + c + '15;color:' + c + '"><i class="' + iconOf(r.a) + '"></i> ' + esc(labelOf(r.a)) + '</span></td>'
        + '<td>' + esc(r.tg || '—') + '</td>'
        + '<td>' + esc(r.d || '—') + '</td>'
        + '</tr>';
    }).join('');

    var actBtns = '<button class="lg-btn green" data-lg-action="export-log" title="ดาวน์โหลดบันทึกกิจกรรมตามตัวกรองเป็นไฟล์ Excel"><i class="fa-solid fa-file-excel"></i> Excel (Log)</button>'
      + '<button class="lg-btn dark" data-lg-action="export-all" title="ดาวน์โหลดข้อมูลทั้งระบบ 6 ชีต เป็นไฟล์ Excel"><i class="fa-solid fa-file-arrow-down"></i> Excel ทั้งระบบ</button>'
      + '<button class="lg-btn" data-lg-action="clear" title="ล้างบันทึกกิจกรรมทั้งหมด"><i class="fa-solid fa-eraser"></i> ล้าง Log</button>';

    var headBlock = embed
      ? ''
      : '<div class="lg-head"><div><h1>Report Log</h1>'
        + '<div class="lg-sub">บันทึกทุกกิจกรรมที่เกิดขึ้นในระบบ (เพิ่ม/แก้ไข/ลบดีล · โครงการ · ผู้ใช้ · เป้าหมาย) — ดาวน์โหลดเป็นไฟล์ Excel ได้</div></div>'
        + '<div class="lg-acts">' + actBtns + '</div></div>';

    return '<div class="lg' + (embed ? ' lg-embed' : '') + '">'
      + headBlock
      + (embed
        ? '<div class="lg-kpis lg-kpis-mini">'
          + '<div class="lg-kpi"><small>รายการทั้งหมด</small><b>' + all.length + ' รายการ</b></div>'
          + '<div class="lg-kpi"><small>วันนี้</small><b>' + todayCount + ' รายการ</b></div>'
          + '<div class="lg-kpi"><small>ผู้ใช้ที่ทำรายการ</small><b>' + Object.keys(users).length + ' คน</b></div>'
          + '<div class="lg-kpi"><small>รายการล่าสุด</small><b style="font-size:12px">' + esc(lastT) + '</b></div>'
          + '</div>'
        : '<div class="lg-kpis">'
          + '<div class="lg-kpi"><small>รายการทั้งหมด</small><b>' + all.length + ' รายการ</b></div>'
          + '<div class="lg-kpi"><small>วันนี้</small><b>' + todayCount + ' รายการ</b></div>'
          + '<div class="lg-kpi"><small>ผู้ใช้ที่ทำรายการ</small><b>' + Object.keys(users).length + ' คน</b></div>'
          + '<div class="lg-kpi"><small>รายการล่าสุด</small><b style="font-size:13px">' + esc(lastT) + '</b></div>'
          + '</div>')
      + '<div class="lg-panel">'
      + (embed
        ? '<div class="lg-ph"><div><b class="lg-title">ประวัติกิจกรรม (Report Log)</b>'
          + '<div class="lg-sub">บันทึกทุกกิจกรรมในระบบ — เพิ่ม/แก้ไข/ลบดีล · โครงการ · ผู้ใช้ · เป้าหมาย</div></div>'
          + '<div class="lg-acts">' + actBtns + '</div></div>'
        : '')
      + '<div class="lg-filters">'
      + '<div class="lg-fl"><label>ค้นหา</label><input id="lgSearch" placeholder="ผู้ใช้ / รายการ / รายละเอียด" value="' + esc(state.q) + '"></div>'
      + '<div class="lg-fl"><label>กิจกรรม</label><select data-lg-filter="action">' + actOpts + '</select></div>'
      + '<div class="lg-fl"><label>ผู้ใช้</label><select data-lg-filter="user">' + userOpts + '</select></div>'
      + '<div class="lg-fl"><label>จากวันที่</label><input type="date" data-lg-filter="from" value="' + esc(state.from) + '"></div>'
      + '<div class="lg-fl"><label>ถึงวันที่</label><input type="date" data-lg-filter="to" value="' + esc(state.to) + '"></div>'
      + '<div class="lg-fl"><button class="lg-btn" data-lg-action="reset"><i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง</button></div>'
      + '</div>'
      + '<div class="lg-tablewrap"><table class="lg-table"><thead><tr>'
      + '<th>วันที่-เวลา</th><th>ผู้ใช้</th><th>กิจกรรม</th><th>รายการ</th><th>รายละเอียด</th>'
      + '</tr></thead><tbody>' + (trs || '<tr><td colspan="5" class="lg-empty">ยังไม่มีบันทึกกิจกรรม — เมื่อมีการเพิ่ม/แก้ไขข้อมูล ระบบจะบันทึกให้อัตโนมัติ</td></tr>') + '</tbody></table></div>'
      + '<div class="lg-foot">แสดง ' + Math.min(rows.length, 300) + ' จาก ' + rows.length + ' รายการ (เก็บสูงสุด ' + MAX_ROWS + ' รายการล่าสุด) · ไฟล์ Excel มี 6 ชีต: Log, Deals, Projects, Customers, Targets, Users</div>'
      + '</div>'
      + '</div>';
  }

  /* ---------------- events ---------------- */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'lgSearch') return;
    state.q = e.target.value;
    if (typeof global.render !== 'function') return;
    global.render();
    var inp = document.getElementById('lgSearch');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });

  document.addEventListener('change', function (e) {
    var key = e.target.getAttribute && e.target.getAttribute('data-lg-filter');
    if (!key) return;
    state[key] = e.target.value;
    if (typeof global.render === 'function') global.render();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var btn = e.target.closest('[data-lg-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-lg-action');
    if (act === 'export-log') { exportLogExcel(); return; }
    if (act === 'export-all') { exportAllExcel(); return; }
    if (act === 'reset') { state = { q: '', action: '', user: '', from: '', to: '' }; if (global.render) global.render(); return; }
    if (act === 'clear') {
      if (!global.confirm('ล้างบันทึกกิจกรรมทั้งหมด?')) return;
      clear();
      add('export', 'ล้าง Log', 'ล้างบันทึกกิจกรรม');
      if (global.render) global.render();
      if (typeof global.toast === 'function') global.toast('ล้าง Log แล้ว');
    }
  });

  global.PILog = {
    add: add, list: list, clear: clear, render: render,
    labels: ACTIONS, buildXlsx: buildXlsx, exportLogExcel: exportLogExcel, exportAllExcel: exportAllExcel
  };
})(window);
