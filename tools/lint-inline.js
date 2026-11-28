// ตรวจ syntax ของ <script> inline ในไฟล์ HTML และไฟล์ .js/.gs ทั้งหมด
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const targets = [
  'index.html', 'users.html', 'login.html',
  'partner-crm/index.html', 'partner-care/index.html',
  'roi-calculator/index.html',
  'assets/auth-sheets.js', 'assets/sales-report.js', 'assets/daily-report.js',
  'apps-script/Code.gs', 'apps-script/Users.html', 'apps-script/Login.html', 'apps-script/Index.html'
];

function checkCode(code, label) {
  try { new vm.Script(code, { filename: label }); return null; }
  catch (e) { return e.message; }
}

let problems = 0;
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { console.log('MISSING  ' + rel); continue; }
  const src = fs.readFileSync(p, 'utf8');
  if (/\.html$/i.test(rel)) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(src))) {
      const attrs = m[1] || '';
      if (/\bsrc=/.test(attrs)) continue;
      if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(attrs)) continue;
      i++;
      const err = checkCode(m[2], rel + '#script' + i);
      if (err) { problems++; console.log('SYNTAX   ' + rel + ' script#' + i + ' -> ' + err); }
    }
    console.log('OK-scan  ' + rel + ' (' + i + ' inline script blocks)');
  } else {
    const err = checkCode(src, rel);
    if (err) { problems++; console.log('SYNTAX   ' + rel + ' -> ' + err); }
    else console.log('OK-parse ' + rel);
  }
}
console.log('\nproblems = ' + problems);
