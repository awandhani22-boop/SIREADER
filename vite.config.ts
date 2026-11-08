import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  server: {
    // The browser-facing origin is deliberately fixed to loopback only.
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      // Exact /api namespace boundary; do not proxy /api-foo or unrelated paths.
      '^/api(?:/|$)': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        ws: false,
      },
    },
    // HMR can still be disabled for agent-edit sessions without changing bind safety.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
}));
