import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Absolute base so service-worker scope resolution works (a relative './'
  // base breaks SW registration — ARCHITECTURE §9). GitHub Pages deploys under
  // /LexiconManor/; CI may override via MANOR_BASE. AAA 7.5 hard-checks the
  // built dist/ for this prefix in manifest start_url/scope + SW precache URLs.
  base: process.env.MANOR_BASE ?? '/LexiconManor/',
});
