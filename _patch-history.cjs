// one-off: route all persistence calls through commit() (keeps history)
const fs = require('fs');
const p = 'd:/Test Code/tsr-store-studio/index.html';
let s = fs.readFileSync(p, 'utf8');
const anchor = /HIST\.i = HIST\.stack\.length - 1;(\r?\n)(\s*)scheduleSave\(\);/;
if (!anchor.test(s)) { console.error('anchor not found'); process.exit(1); }
s = s.replace(anchor, (m, nl, ind) => 'HIST.i = HIST.stack.length - 1;' + nl + ind + '__KEEP_SAVE__();');
const n = (s.match(/scheduleSave\(\);/g) || []).length;
s = s.replace(/scheduleSave\(\);/g, 'commit();');
s = s.replace('__KEEP_SAVE__();', 'scheduleSave();');
fs.writeFileSync(p, s, 'utf8');
console.log('converted calls:', n);
