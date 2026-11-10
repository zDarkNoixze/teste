// Zero-dependency static server for dist/ (Node >= 18).
// Env: ROOT (default ./dist), PORT (8080), HOST (0.0.0.0), BASE_PATH (e.g. /portfolio).
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, join, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.ROOT || join(here, 'dist'));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '').replace(/^(?!\/)(?=.)/, '/');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.hdr': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.wasm', '.hdr']);

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

async function fileInfo(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
  res.end(body);
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

  if (BASE) {
    if (pathname === BASE) {
      res.writeHead(301, { ...SECURITY, Location: BASE + '/' });
      return res.end();
    }
    if (!pathname.startsWith(BASE + '/')) return send(res, 404, 'Not Found');
    pathname = pathname.slice(BASE.length);
  }

  let file = resolve(join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');

  if (pathname.endsWith('/')) file = join(file, 'index.html');
  let st = await fileInfo(file);
  if (!st && !extname(pathname)) {
    // SPA-style fallback only for extensionless paths.
    file = join(ROOT, 'index.html');
    st = await fileInfo(file);
  }
  if (!st) return send(res, 404, 'Not Found');

  const ext = extname(file).toLowerCase();
  const rel = file.slice(ROOT.length + 1).split(sep).join('/');
  let servePath = file;
  let encoding = null;
  if (COMPRESSIBLE.has(ext)) {
    const ae = String(req.headers['accept-encoding'] || '');
    for (const [enc, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
      if (new RegExp(`(^|[\\s,])${enc}\\s*(;\\s*q=(?!0(\\.0*)?(,|$)))?(,|$)`, 'i').test(ae)) {
        const c = await fileInfo(file + suffix);
        if (c) {
          servePath = file + suffix;
          encoding = enc;
          st = c;
          break;
        }
      }
    }
  }

  const headers = {
    ...SECURITY,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Last-Modified': st.mtime.toUTCString(),
    ETag: `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${encoding ? '-' + encoding : ''}"`,
  };
  if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
  if (encoding) headers['Content-Encoding'] = encoding;

  if (rel.startsWith('assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else if (ext === '.html' || rel === 'poster.json') headers['Cache-Control'] = 'no-cache';
  else headers['Cache-Control'] = 'public, max-age=86400';

  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  const fresh = inm
    ? inm.split(',').some((t) => t.trim() === headers.ETag || t.trim() === '*')
    : ims && Math.floor(st.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000);
  if (fresh) {
    delete headers['Content-Length'];
    delete headers['Content-Type'];
    res.writeHead(304, headers);
    return res.end();
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(servePath)
    .on('error', () => res.destroy())
    .pipe(res);
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
    else res.destroy();
  });
});
server.keepAliveTimeout = 65_000;

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST}:${PORT}${BASE || ''}/`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
