import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/serial-scanner/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
