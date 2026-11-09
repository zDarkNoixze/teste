import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { configApi } from './config-api.js';

// Browsers that get the modern bundle; everything older (e.g. iOS 10–14) loads the legacy one.
const MODERN = ['chrome >= 87', 'edge >= 88', 'firefox >= 78', 'safari >= 14', 'ios >= 14'];

export default defineConfig({
  plugins: [
    configApi(),
    legacy({
      // iPhone 5 (2012) tops out at iOS 10; old Android WebViews are covered by Chrome 49+.
      targets: ['defaults', 'iOS >= 10', 'Safari >= 10', 'Chrome >= 49', 'Android >= 5', 'Samsung >= 5'],
      modernTargets: MODERN,
      modernPolyfills: false,
    }),
  ],
  build: {
    // Lowers/prefixes CSS (inset, -webkit-backdrop-filter…) for the oldest supported Safari.
    cssTarget: ['safari10', 'chrome49', 'firefox60'],
    chunkSizeWarningLimit: 800,
  },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
