import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/react/',
  publicDir: false,
  build: { outDir: '../../../public/react', emptyOutDir: true },
  esbuild: { jsx: 'automatic' },
});
