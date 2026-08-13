const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'output');
const PORT = process.env.PORT || 8000;
const PROC_FILE = path.join(ROOT, 'Procurement Records.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function readProc() {
  try { return JSON.parse(fs.readFileSync(PROC_FILE, 'utf8')); }
  catch (e) { return []; }
}

function writeProc(data) {
  fs.writeFileSync(PROC_FILE, JSON.stringify(data, null, 2), 'utf8');
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/procurement') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(readProc()));
      return;
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          writeProc(Array.isArray(data) ? data : []);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
  }

  if (req.url === '/' || url === '/') url = '/Exact_autodesk_report.html';

  const filePath = path.join(ROOT, url.replace(/^\/+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Serving http://127.0.0.1:' + PORT + '/Exact_autodesk_report.html');
});
