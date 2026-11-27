/* ===========================================================================
   schema.js — คำนวณคอลัมน์ที่มาจากสูตร Excel ใน Report Sale Order.xlsx
   ทุกสูตรคัดลอกมาจากไฟล์จริง (derived-columns.json) และ measure จาก .pbix
   ห้ามแก้ไขโดยไม่ตรวจกับต้นฉบับ
   =========================================================================== */
(function (global) {
  'use strict';

  /* ---------- คอลัมน์ ListBooking (0-based) ---------- */
  const C = {
    so: 1,            // B  เลขที่ใบสั่งซื้อ
    created: 2,       // C  วันที่สร้าง
    channel: 3,       // D  ช่องทาง
    customer: 5,      // F  ชื่อลูกค้า
    province: 9,      // J  จังหวัด
    company: 11,      // L  บริษัท
    group: 12,        // M  กลุ่มสินค้า
    product: 13,      // N  สินค้า
    cashPrice: 14,    // O  ราคาเงินสด
    pkg: 15,          // P  แพ็คเกจ
    listPrice: 16,    // Q  ราคาขาย
    discount: 17,     // R  ส่วนลด
    installments: 19, // T  จำนวนงวด
    saleCode: 25,     // Z  รหัสพนักงานขาย
    createdFrom: 28,  // AC สร้างจาก
    adminStatus: 31,  // AF สถานะ Admin
    adminDate: 32,    // AG วันที่ Admin
    ctStatus: 33,     // AH สถานะ CT
    jobStatus: 39,    // AN สถานะงาน
    installStatus: 46,// AU สถานะติดตั้ง
    installDate: 47,  // AV วันที่ช่างลงข้อมูล
    closeNote: 52,    // BA หมายเหตุปิดใบงาน
    contract: 53,     // BB สัญญา
    contractDate: 54, // BC วันที่ทำสัญญา
    owner: 55,        // BD ผู้รับผิดชอบ
    allStatus: 56,    // BE สถานะ ALL
    saleStatus: 62,   // BK Sale_สถานะ
    refNo: 66,        // BO เลขที่อ้างอิง
    serial: 67,       // BP SerialNumber
    sets: 73          // BV จำนวน Set
  };

  const LK = global.BI_LOOKUPS || {};
  function lkArr(key) { return LK[key] || []; }

  /* ---------- Excel helper functions ---------- */
  const s = v => (v == null ? '' : String(v));
  const trim = v => s(v).trim();
  function isBlank(v) { return v == null || trim(v) === ''; }
  // Excel SEARCH(): case-insensitive substring -> number or #VALUE
  function search(needle, hay) {
    const h = s(hay).toLowerCase(), n = s(needle).toLowerCase();
    return h.indexOf(n); // -1 = ไม่พบ (เทียบเท่า #VALUE)
  }
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function truthy(v) { return s(v); }

  // VLOOKUP(key, range, colIndex, exact=true)
  function vlookup(key, rangeKey, colIndex) {
    if (isBlank(key)) return null;
    const rows = lkArr(rangeKey);
    const k = trim(key);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (trim(row[0]) === k) {
        const v = row[colIndex - 1];
        return v === undefined || v === null || v === '' ? null : v;
      }
    }
    return null;
  }

  const D = (y, m, d) => new Date(y, m - 1, d);
  const TODAY = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  function dateOnly(v) {
    if (!(v instanceof Date) || isNaN(v)) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  function trunc(v) {
    if (!(v instanceof Date) || isNaN(v)) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  function dayDiff(a, b) {
    if (!(a instanceof Date) || !(b instanceof Date)) return null;
    return Math.round((a - b) / 86400000);
  }

  /* ---------- สูตรทีละคอลัมน์ ---------- */

  // col 93 CO  MEMO ทีม
  function fMemoTeam(r, dateSO) {
    if (search('ดริง', r[C.customer]) >= 0) return 'BU DL';
    if (search('Dealers', r[C.createdFrom]) >= 0) return 'BU DL';
    const z = trim(r[C.saleCode]);
    if (z === 'A81460' || z === 'A85605') return 'Corporate';
    if (z === 'A81453') {
      if (!dateSO) return null;
      return dateSO > D(2025, 8, 16) ? 'BU' : 'Corporate';
    }
    if (z === 'A79597') {
      if (!dateSO) return null;
      return (dateSO >= D(2025, 7, 1) && dateSO <= D(2025, 8, 31)) ? 'Corporate' : 'BU';
    }
    if (trim(r[C.createdFrom]) === 'Online') return 'BU';
    return r[C.createdFrom] == null ? null : trim(r[C.createdFrom]);
  }

  // col 99 CU  สถานะใบงาน
  function fJobStage(r) {
    const refNo = trim(r[C.refNo]), serial = trim(r[C.serial]);
    if (refNo !== '' && serial !== '') return 'ปิดงานแล้ว/ทำสัญญาแล้ว';
    if (refNo === '' && serial !== '') return 'ปิดงานแล้ว/ไม่มีสัญญา';
    if (search('ยกเลิก', r[C.saleStatus]) >= 0) return 'ยกเลิกใบงาน';
    if (search('ไม่ผ่าน', r[C.ctStatus]) >= 0 || search('ยกเลิก', r[C.ctStatus]) >= 0) return 'ยกเลิกใบงาน';
    if (search('ยกเลิก', r[C.closeNote]) >= 0) return 'ยกเลิกใบงาน';
    return 'on process';
  }

  // col 130 DZ  Check SV. Cancel
  // สูตรจริงจากไฟล์ Excel (Data saleOrder!DZ):
  //   IF([สัญญา]<>"","",
  //      IF(OR(ISNUMBER(SEARCH("ยกเลิก",[หมายเหตุปิดใบงาน])),
  //            AND(LEFT([หมายเหตุปิดใบงาน],1)="C", ISNUMBER(--MID([หมายเหตุปิดใบงาน],2,2)))),
  //         "Cancel",""))
  function fCheckSVCancel(r) {
    if (trim(r[C.contract]) !== '') return '';
    const note = s(r[C.closeNote]);
    const cancelByNote = search('ยกเลิก', note) >= 0;
    const cancelByCode = note.trim().length >= 3 && note.trim().charAt(0) === 'C' &&
      /^\d{2}$/.test(note.trim().substr(1, 2));
    return (cancelByNote || cancelByCode) ? 'Cancel' : '';
  }

  // col 103 CY  MapStutus  = CONCAT(ผู้รับผิดชอบ, สถานะ ALL, สถานะใบงาน)
  // col 106 DB  สถานะใบงาน3
  function fStatus3(r, jobStage, svCancel) {
    if (trim(r[C.contract]) !== '') return '1.Done';
    if (svCancel === '') {
      const memo = trim(r[C.owner]) + trim(r[C.allStatus]) + trim(jobStage);
      const v = vlookup(memo, 'Master Stutus!D:F', 3);
      return v == null ? null : trim(v);
    }
    return '3.Cancel';
  }

  // col 127 DW  revenue
  function fRevenue(r) {
    const cash = r[C.cashPrice], list = r[C.listPrice];
    const base = isBlank(cash) ? Number(list) || 0 : Number(cash) || 0;
    const disc = Number(r[C.discount]) || 0;
    return base - disc / 1.07;
  }

  // col 125 DU  ช่างปิดใบงาน
  function fTechClose(r, dateSO) {
    const inst = r[C.installDate];
    if (isBlank(inst)) return dateSO;
    const st = trim(r[C.installStatus]);
    if (st === 'ปิดงานแล้ว' || st === 'ปิด Tricket แล้ว' || st === 'ปิด Ticket แล้ว') return dateOnly(inst);
    return dateSO;
  }

  /* ---------- สร้างชุดข้อมูลสำหรับ dashboard ---------- */
  function build(rows) {
    const out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dateSO = dateOnly(r[C.created]);
      const memoTeam = fMemoTeam(r, dateSO);
      const team = vlookup(memoTeam, 'แปลง Name!M:N', 2);
      const jobStage = fJobStage(r);
      const svCancel = fCheckSVCancel(r);
      const st3 = fStatus3(r, jobStage, svCancel);
      const revenue = fRevenue(r);
      const units = Number(r[C.sets]) || 0;
      const techClose = fTechClose(r, dateSO);
      const closeDate = trim(r[C.contractDate]) === '' ? techClose : dateOnly(r[C.contractDate]);

      // col 111 DG Date Admin
      let dateAdmin;
      if (trim(r[C.adminStatus]) === 'ไม่ผ่าน') dateAdmin = dateOnly(r[C.adminDate]);
      else if (isBlank(r[C.adminDate])) dateAdmin = TODAY();
      else if (st3 === '3.Cancel') dateAdmin = closeDate;
      else dateAdmin = dateOnly(r[C.adminDate]);

      // col 112 DH SLA Admin = MAX(Date Admin - Date SO, 0)
      let slaAdmin = null;
      if (dateAdmin && dateSO) slaAdmin = Math.max(dayDiff(dateAdmin, dateSO), 0);

      // col 110 DF SLA ปิดงาน
      let slaClose = null;
      if (st3 === '1.Done' || st3 === '3.Cancel') {
        if (closeDate && dateSO) slaClose = dayDiff(closeDate, dateSO);
      } else if (dateSO) {
        slaClose = Math.max(dayDiff(TODAY(), dateSO), 0);
      }

      // สถานะ Admin (groups) ตาม DAX
      const admRaw = trim(r[C.adminStatus]);
      let admGroup;
      if (admRaw === '') admGroup = '(Blank)';
      else if (admRaw === 'ผ่าน') admGroup = '1.ผ่าน';
      else if (['รอตรวจสอบ', 'ระหว่างแก้ไข', 'ระหว่างตรวจสอบหลังแก้ไข'].indexOf(admRaw) >= 0) admGroup = '2.Pening';
      else if (admRaw === 'ไม่ผ่าน') admGroup = '3.ไม่ผ่าน';
      else admGroup = admRaw;

      const prodCat = vlookup(r[C.group], 'แปลง Name!AG:AH', 2);
      const area = vlookup(r[C.province], 'แปลง Name!AZ:BA', 2);
      const gbkk = vlookup(area, 'แปลง Name!BA:BB', 2);

      out[i] = {
        so: r[C.so],
        dateSO: dateSO,
        mth: dateSO ? dateSO.getFullYear() * 100 + (dateSO.getMonth() + 1) : null,
        team: team,
        memoTeam: memoTeam,
        revenue: revenue,
        units: units,
        status3: st3,
        jobStage: jobStage,
        admGroup: admGroup,
        pkg: Number(r[C.installments]) === 1 ? 'เงินสด' : 'ผ่อน',
        customer: r[C.customer],
        province: r[C.province],
        group: r[C.group],
        product: r[C.product],
        prodCat: prodCat,
        area: area,
        gbkk: gbkk,
        salesperson: trim(r[C.owner]),
        channel: r[C.channel],
        slaAdmin: slaAdmin,
        slaClose: slaClose,
        closeDate: closeDate,
        adminDate: dateAdmin,
        installDate: dateOnly(r[C.installDate]),
        installStatus: trim(r[C.installStatus])
      };
    }
    return out;
  }

  global.BISchema = { build: build, C: C, vlookup: vlookup };
})(window);
