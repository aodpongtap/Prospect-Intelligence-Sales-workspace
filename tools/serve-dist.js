// เซิร์ฟเวอร์ทดสอบไฟล์ static
// ใช้: node tools/serve-dist.js [port] [rootDir]
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist'));
const PORT = Number(process.argv[2] || 8123);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('serving dist/ on http://localhost:' + PORT));
