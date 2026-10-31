// Builds the whole platform as a static site that runs in the browser (no server). Output: client/dist-local
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  define: { 'import.meta.env.VITE_LOCAL': JSON.stringify('1') },
  resolve: { alias: [{ find: /^\.\/db\.js$/, replacement: here('./src/local/db.js'), customResolver: undefined }] },
  build: { outDir: 'dist-local', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
});
