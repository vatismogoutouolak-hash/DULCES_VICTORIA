import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'public',
  publicDir: false,
  envDir: resolve(import.meta.dirname),
  build: {
    outDir: '../dist', emptyOutDir: true,
    rollupOptions: { input: {
      accueil: resolve(import.meta.dirname,'public/index.html'),
      espace: resolve(import.meta.dirname,'public/espace.html'),
      administration: resolve(import.meta.dirname,'public/administration.html')
    }}
  },
  server: { proxy: {'/api/video': 'http://127.0.0.1:8081'} }
});
