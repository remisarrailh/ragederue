import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',

  server: {
    port: 8080,
    // Don't watch server/ — it's a Node process, not client code
    watch: {
      ignored: ['**/server/**', '**/node_modules/**'],
    },
  },

  build: {
    outDir: 'dist',
    target: 'es2020',
    // Phaser is loaded from CDN — don't try to bundle it
    rollupOptions: {
      external: ['phaser'],
    },
  },
});
