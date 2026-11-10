import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configApi } from './config-api.js';

// Writes .br/.gz siblings for compressible files so static hosts can serve them as-is.
function precompress() {
  const EXT = /\.(js|mjs|css|html|svg|json|hdr|txt|xml|wasm)$/i;
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  let outDir = 'dist';
  return {
    name: 'precompress',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        for (const f of walk(outDir)) {
          if (!EXT.test(f) || statSync(f).size < 1024) continue;
          const buf = readFileSync(f);
          const br = brotliCompressSync(buf, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 11,
              [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
            },
          });
          const gz = gzipSync(buf, { level: 9 });
          if (br.length < buf.length) writeFileSync(f + '.br', br);
          if (gz.length < buf.length) writeFileSync(f + '.gz', gz);
        }
      },
    },
  };
}

// Browsers that get the modern bundle; everything older (e.g. iOS 10–14) loads the legacy one.
const MODERN = ['chrome >= 87', 'edge >= 88', 'firefox >= 78', 'safari >= 14', 'ios >= 14'];

export default defineConfig({
  // Relative base: dist/ works from "/" or any subfolder.
  base: './',
  plugins: [
    configApi(),
    legacy({
      // iPhone 5 (2012) tops out at iOS 10; old Android WebViews are covered by Chrome 49+.
      targets: ['defaults', 'iOS >= 10', 'Safari >= 10', 'Chrome >= 49', 'Android >= 5', 'Samsung >= 5'],
      modernTargets: MODERN,
      modernPolyfills: false,
    }),
    precompress(),
  ],
  build: {
    // Lowers/prefixes CSS (inset, -webkit-backdrop-filter…) for the oldest supported Safari.
    cssTarget: ['safari10', 'chrome49', 'firefox60'],
    chunkSizeWarningLimit: 800,
  },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
