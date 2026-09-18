import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/preview/',
  publicDir: false,
  build: {
    outDir: '../../../public/preview',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
});
