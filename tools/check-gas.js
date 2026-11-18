// Script ตรวจสอบเว็บแอป Apps Script (ไม่ต้องใช้ Google account)
// ใช้: node tools/check-gas.js
const https = require('https');

const BASE = 'https://script.google.com/macros/s/AKfycbwHKKd0IlCKNylIjK2LilDkeisbIbqaqiIkmuodlp3ZgWortsO9HLY4jNjCjMmAphW-/exec';

function get(url, depth = 0) {
  return new Promise((resolve) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && depth < 6) {
        r.resume();
        resolve(get(r.headers.location, depth + 1));
        return;
      }
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
  });
}

(async () => {
  const login = await get(BASE + '?page=login');
  console.log('login page:', login.status, login.body.length, 'hasLoginForm=' + login.body.includes('\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a'));

  const api = await get(BASE + '?api=1&action=login&email=demo.sale%40example.com&password=fA8Y9e3r7S');
  let j = null;
  try { j = JSON.parse(api.body); } catch (e) {}
  console.log('api login:', api.status, j ? 'ok=' + j.ok + ' level=' + j.level + ' name=' + j.name : api.body.slice(0, 120));

  if (j && j.token) {
    const deals = await get(BASE + '?api=1&action=deals&token=' + encodeURIComponent(j.token));
    let d = null;
    try { d = JSON.parse(deals.body); } catch (e) {}
    console.log('api deals:', deals.status, d ? 'ok=' + d.ok + ' count=' + (d.deals || []).length : deals.body.slice(0, 120));
  }

  // ตรวจ Index page (อยู่ใน sandbox iframe ของ Apps Script)
  const home = await get(BASE);
  const m = home.body.match(/src="(https:\/\/[^"]+googleusercontent\.com\/userCodeAppPanel[^"]*)"/);
  if (m) {
    const panel = await get(m[1].replace(/&amp;/g, '&'));
    console.log('index panel:', panel.status, panel.body.length,
      'applyMe=' + panel.body.includes('__applyMe__'),
      'authSheets=' + panel.body.includes('auth-sheets.js'),
      'greeting=' + panel.body.includes('\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35, '));
  } else {
    const b = home.body;
    console.log('index page:', home.status, b.length,
      'applyMe=' + b.includes('__applyMe__'),
      'authSheets=' + b.includes('auth-sheets.js'),
      'aiPrompts=' + b.includes('renderPrompts'),
      'scopeBar=' + b.includes('scopeBar'),
      'saleObserver=' + b.includes('obs.disconnect'),
      'kpiFoot=' + b.includes('kpi-foot'));
  }
})();
