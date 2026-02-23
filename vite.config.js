import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync } from 'fs';

export default defineConfig({
  base: '/ragederue/',
  root: '.',

  server: {
    host: true, // équivalent à 0.0.0.0
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

  // plugin that runs after the build and copies assets/ → dist/assets
  plugins: [
    {
      name: 'copy-assets-to-dist',
      closeBundle() {
        const src = resolve(__dirname, 'assets');
        const dest = resolve(__dirname, 'dist/assets');
        // node 16+ provides fs.cpSync for recursive copy
        cpSync(src, dest, { recursive: true });
      }
    }
  ]
});
