import { defineConfig } from 'vite';
import { configApi } from './config-api.js';

export default defineConfig({
  plugins: [configApi()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
