/* รวมตาราง Master Stutus ที่ถอดได้จากโมเดล Power BI เข้ากับ lookups.js เดิม
   แล้วเขียนเป็น bi-dashboard/master-status.js (โหลดทับหลัง lookups.js)
   หมายเหตุ: เขียนไฟล์ด้วย fs (UTF-8 ไม่มี BOM) — ห้ามใช้ PowerShell Set-Content กับข้อความไทย */
const fs = require('fs');

const LOOKUPS = 'D:\\Test Code\\bi-dashboard\\lookups.js';
const MODEL = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\master-status.json';
const OUTJS = 'D:\\Test Code\\bi-dashboard\\master-status.js';
const REPORT = 'C:\\Users\\pongtap.p\\system-backup\\pbix-data\\merge-report.json';

function main() {
  const src = fs.readFileSync(LOOKUPS, 'utf8');
  const win = {};
  new Function('window', src)(win);
  const existing = (win.BI_LOOKUPS || {})['Master Stutus!D:F'] || [];
  const model = JSON.parse(fs.readFileSync(MODEL, 'utf8')).excel || {};

  const rows = new Map();
  existing.forEach(r => { if (r && r[0] != null) rows.set(String(r[0]).trim(), r.slice()); });

  const added = [], changed = [];
  Object.keys(model).forEach(k => {
    const st = String(model[k]).trim();
    if (!rows.has(k)) {
      rows.set(k, [k, '', st]);
      added.push([k, st]);
    } else {
      const cur = rows.get(k);
      if (String(cur[2] == null ? '' : cur[2]).trim() !== st) {
        changed.push([k, cur[2], st]);
        cur[2] = st;
        rows.set(k, cur);
      }
    }
  });

  const out = [...rows.values()];
  const js = '/* ===== สร้างจากโมเดล Power BI จริง (pbi-tools export-data) — อย่าแก้ด้วยมือ ===== */\n' +
    '(function () {\n' +
    '  window.BI_LOOKUPS = window.BI_LOOKUPS || {};\n' +
    '  window.BI_LOOKUPS["Master Stutus!D:F"] = ' + JSON.stringify(out) + ';\n' +
    '})();\n';
  fs.writeFileSync(OUTJS, js, 'utf8');

  const rep = { existing: existing.length, model: Object.keys(model).length, merged: out.length, added, changed };
  fs.writeFileSync(REPORT, JSON.stringify(rep, null, 1), 'utf8');
  console.log('existing=' + existing.length, 'model=' + Object.keys(model).length, 'merged=' + out.length,
    'added=' + added.length, 'changed=' + changed.length);
}

main();
