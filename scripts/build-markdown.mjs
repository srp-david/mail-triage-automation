import { build } from 'vite';
import { fileURLToPath } from 'node:url';

await build({
  configFile: false, publicDir: false,
  build: {
    outDir: 'public/markdown', emptyOutDir: true,
    lib: {entry: fileURLToPath(new URL('../packages/ui/viewer/markdown.js', import.meta.url)), formats: ['es'], fileName: () => 'viewer.js'},
  },
});
