import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { pages, publicPages } from './build/public-pages.js';

export default defineConfig({
  root: 'public',
  plugins: [publicPages(resolve(import.meta.dirname, 'public/index.html'))],
  publicDir: false,
  envDir: resolve(import.meta.dirname),
  build: {
    outDir: '../dist', emptyOutDir: true,
    rollupOptions: { input: {
      ...Object.fromEntries(Object.keys(pages).map(name => [name, resolve(import.meta.dirname, 'public', name)])),
      espace: resolve(import.meta.dirname,'public/espace.html'),
      administration: resolve(import.meta.dirname,'public/administration.html')
    }}
  },
  server: { proxy: {'/api/video': 'http://127.0.0.1:8081'} }
});
