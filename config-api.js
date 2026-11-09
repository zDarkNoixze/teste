import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { sanitize } from './src/content.js';

/*
 * Dev-server only (`pnpm dev`, which is what the preview runs):
 *   /config            → editor page (config.html)
 *   GET  /api/config   → current content/site.json
 *   PUT  /api/config   → sanitize + save; Vite then reloads every open tab of the site
 *   POST /api/upload   → saves an image into public/uploads/
 */

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Arquivo grande demais'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function configApi() {
  let root;
  const file = () => path.join(root, 'content/site.json');
  const uploads = () => path.join(root, 'public/uploads');

  return {
    name: 'x1-config-api',
    apply: 'serve',
    configResolved(c) {
      root = c.root;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        try {
          if (url.pathname === '/config' || url.pathname === '/config/') {
            req.url = `/config.html${url.search}`;
            return next();
          }

          if (url.pathname === '/api/config') {
            if (req.method === 'GET') return send(res, 200, sanitize(JSON.parse(await readFile(file(), 'utf8'))));
            if (req.method === 'PUT') {
              const data = sanitize(JSON.parse((await readBody(req, 1_000_000)).toString('utf8')));
              const tmp = `${file()}.tmp`;
              await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
              await rename(tmp, file());
              return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
            }
            return send(res, 405, { error: 'Método não permitido' });
          }

          if (url.pathname === '/api/upload') {
            if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
            const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const ext = IMAGE_TYPES[type];
            if (!ext) return send(res, 415, { error: 'Use PNG, JPG, WEBP, GIF ou AVIF' });
            const body = await readBody(req, 8_000_000);
            const base = (url.searchParams.get('name') || 'imagem')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\.[a-z0-9]+$/i, '')
              .replace(/[^a-z0-9]+/gi, '-')
              .replace(/^-|-$/g, '')
              .toLowerCase()
              .slice(0, 40) || 'imagem';
            const name = `${base}-${Date.now().toString(36)}.${ext}`;
            await mkdir(uploads(), { recursive: true });
            await writeFile(path.join(uploads(), name), body);
            return send(res, 200, { path: `uploads/${name}` });
          }
        } catch (err) {
          return send(res, err.status || 400, { error: err instanceof SyntaxError ? 'JSON inválido' : err.message });
        }
        next();
      });
    },
  };
}
