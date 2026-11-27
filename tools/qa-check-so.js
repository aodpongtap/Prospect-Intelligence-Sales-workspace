/* ตรวจว่า SO อยู่ในลิสต์โมเดลหรือไม่ + ช่วงเลข SO
   ใช้: node tools/qa-check-so.js SO...
*/
const list = require('D:/Test Code/tools/qa-model-sos.json');
const set = new Set(list);
const wanted = process.argv.slice(2);
wanted.forEach(s => console.log(s, '=> in model?', set.has(s)));
const sorted = list.slice().sort();
console.log('model count:', list.length, '| min:', sorted[0], '| max:', sorted[sorted.length - 1]);
