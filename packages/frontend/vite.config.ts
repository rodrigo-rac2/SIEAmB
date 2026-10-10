/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The site is served from the domain root on Vercel. VITE_BASE stays as an escape hatch
// for a sub-path deployment.
export default defineConfig(() => ({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
