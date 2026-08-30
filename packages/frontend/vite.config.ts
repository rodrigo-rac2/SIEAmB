/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the site at /SIEAmB/ unless a custom domain is set.
// Override with VITE_BASE=/ once the custom domain (e.g. sieamb.ufcg.edu.br) is live.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/SIEAmB/' : '/'),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
