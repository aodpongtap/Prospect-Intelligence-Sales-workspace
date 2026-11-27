/* ตั้ง token cache-bust ให้ทุกไฟล์ที่ index.html อ้างถึง
   ใช้: node tools/bump-token.js "?v=1131a"
*/
const fs = require('fs');
const f = 'D:/Test Code/bi-dashboard/index.html';
const NEW = process.argv[2] || '?v=1131a';
let t = fs.readFileSync(f, 'utf8');
const before = (t.match(/\?v=[0-9a-z]+/g) || []).length;
t = t.replace(/\?v=[0-9a-z]+/g, NEW);
fs.writeFileSync(f, t, 'utf8');
const after = (t.match(/\?v=[0-9a-z]+/g) || []).length;
console.log('found=' + before + ' replaced=' + after + ' token=' + NEW);
