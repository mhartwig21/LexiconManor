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
        // (True lazy-loading of pools needs an async select() contract —
        // tracked as a follow-up; both chunks still precache for AAA 7.4.)
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
