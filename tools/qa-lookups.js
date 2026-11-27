const fs = require('fs');
const lk = fs.readFileSync('D:/Test Code/bi-dashboard/lookups.js', 'utf8');
const vals = lk.match(/"([^"]*)"/g) || [];
const hit = {};
vals.forEach(v => {
  const s = v.slice(1, -1);
  if (/^9\.\s/.test(s) || /^Service\/Credit/.test(s)) hit[s] = (hit[s] || 0) + 1;
});
console.log(JSON.stringify(hit, null, 2));
const pairs = lk.match(/\["[^"]*","(?:9\.\s[^"]*|Service\/Credit[^"]*)"\]/g) || [];
console.log('pairs=' + pairs.length);
console.log(pairs.slice(0, 40).join('\n'));
