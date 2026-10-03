const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const allowed = new Set(['index.html', 'startup.js', 'app.js', 'booking.js', 'collaboration.js', 'i18n.js', 'sw.js', 'ui.css', 'manifest.webmanifest']);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  // Firebase authorizes localhost for this project, but not the loopback IP.
  if (req.headers.host === `127.0.0.1:${port}` && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(302, { Location: `http://localhost:${port}${req.url}`, 'Cache-Control': 'no-store' }).end();
    return;
  }
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, name);
  if (!(allowed.has(name) || /^icons\/[\w.-]+\.(png|svg)$/.test(name)) || !file.startsWith(root + path.sep)) {
    res.writeHead(404).end(); return;
  }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404).end(); return; }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(file)];
    res.writeHead(200, { 'Content-Type': type || 'text/plain', 'Cache-Control': 'no-cache' }); res.end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`Orbyx: http://localhost:${port}`));
