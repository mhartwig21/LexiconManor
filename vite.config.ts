import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Absolute base so service-worker scope resolution works (a relative './'
  // base breaks SW registration — ARCHITECTURE §9). GitHub Pages deploys under
  // /LexiconManor/; CI may override via MANOR_BASE. AAA 7.5 hard-checks the
  // built dist/ for this prefix in manifest start_url/scope + SW precache URLs.
  base: process.env.MANOR_BASE ?? '/LexiconManor/',
  build: {
    rollupOptions: {
      output: {
        // Split the (large, rarely-changing) puzzle/dialogue/volume content
        // from app code: a content regen no longer invalidates the code chunk
        // and vice versa, and the code chunk stays under the AAA 9.6 eye.
        // The chunk is LAZY: app/pools.ts is the one runtime importer (via
        // dynamic import(), warmed after first paint by bootPlatform, awaited
        // at the day-start gate). manualChunks keeps the chunk name stable so
        // the SW precache still covers it for offline play (AAA 7.4).
        // scripts/build-sw-precache.ts hard-fails CI if the content chunk
        // ever turns eager again or eager JS exceeds 300KB gzip (AAA 9.6).
        manualChunks(id: string) {
          const p = id.replace(/\\/g, '/');
          if (p.includes('/content/generated/') || p.includes('/content/authored/')) {
            return 'content';
          }
          return undefined;
        },
      },
    },
  },
});
