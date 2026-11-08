import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
