import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/static/frontend/',
  server: {
    host: process.env.VITE_HOST || '127.0.0.1',
    port: 5173,
    proxy: {
      '/login': {
        target: process.env.FLASK_PROXY_TARGET || 'http://127.0.0.1:5001',
        changeOrigin: true,
        bypass: (request) => request.method === 'GET' ? '/index.html' : undefined,
      },
      '/signup': {
        target: process.env.FLASK_PROXY_TARGET || 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.FLASK_PROXY_TARGET || 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../app/static/frontend',
    emptyOutDir: true,
  },
});
