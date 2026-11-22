// 같이 보는 방 — 아주 작은 로컬 서버 (설치할 것 없음, Node만 있으면 됨)
// 유튜브 플레이어는 file:// 로 연 페이지에서는 재생되지 않아서 http://localhost 로 띄웁니다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const URL_ = `http://localhost:${PORT}`;
const OPEN = process.argv.includes('--open');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function openBrowser() {
  if (!OPEN) return;
  const cmd = process.platform === 'win32' ? `start "" "${URL_}"`
    : process.platform === 'darwin' ? `open "${URL_}"` : `xdg-open "${URL_}"`;
  exec(cmd);
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (p === '/') p = '/index.html';

  const file = path.join(ROOT, path.normalize(p));
  const hidden = p.split('/').some(seg => seg.startsWith('.'));
  if (hidden || !file.startsWith(ROOT + path.sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`이미 실행 중인 것 같아요: ${URL_}`);
    openBrowser();
    return;
  }
  console.error(err);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`같이 보는 방이 열렸어요: ${URL_}`);
  console.log('끄려면 이 창에서 Ctrl+C 를 누르세요.');
  openBrowser();
});
