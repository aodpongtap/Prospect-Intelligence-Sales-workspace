/* QA static checks: syntax, asset refs, tokens, duplicated label numbering */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = 'D:/Test Code/bi-dashboard';
const NODE = 'C:/Users/pongtap.p/tools/node/node.exe';
const out = { syntax: [], refs: [], tokens: null, labels: {} };

fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
  try {
    execFileSync(NODE, ['--check', path.join(dir, f)], { stdio: 'pipe' });
    out.syntax.push('OK   ' + f);
  } catch (e) {
    out.syntax.push('FAIL ' + f + ' :: ' + String(e.stderr || e.message).slice(0, 160));
  }
});

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const re = /(?:href|src)="([^"]+)"/g;
let m;
while ((m = re.exec(html))) {
  const f = m[1].split('?')[0];
  out.refs.push((fs.existsSync(path.join(dir, f)) ? 'OK   ' : 'MISS ') + f);
}
out.tokens = [...new Set((html.match(/\?v=[0-9a-z]+/g) || []))];

/* duplicated / missing number prefixes in the lookup table */
const lk = fs.readFileSync(path.join(dir, 'lookups.js'), 'utf8');
const teams = [...new Set((lk.match(/"(\d+\.\s[^"]+)"/g) || []).map(s => s.slice(1, -1)))].sort();
const nums = {};
teams.forEach(t => { const n = t.match(/^(\d+)\./)[1]; (nums[n] = nums[n] || []).push(t); });
out.labels.dupes = Object.entries(nums).filter(([k, v]) => v.length > 1).map(([k, v]) => k + ' => ' + v.join(' | '));
out.labels.teams = teams;
out.labels.un = (lk.match(/"[^"]*Service\/Credit[^"]*"|"Employee"|"E-Commerce"/g) || []).slice(0, 6);

console.log(JSON.stringify(out, null, 2));
