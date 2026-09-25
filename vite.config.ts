import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'src/frontend',
  plugins: [preact()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
