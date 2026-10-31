import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  // The server build talks to the real API; leave the in-browser API out of it.
  resolve: { alias: [{ find: /^\.\/local\/api\.js$/, replacement: new URL('./src/local/stub.js', import.meta.url).pathname }] },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
