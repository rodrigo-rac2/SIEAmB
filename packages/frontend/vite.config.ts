/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Commit being built: Vercel and GitHub Actions expose it, local builds ask git. */
function commitSha(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Emits /version.json so CI can tell which commit a deployment serves
 * (the e2e-preview workflow polls it instead of trusting the GitHub app).
 */
function versionFile(): Plugin {
  return {
    name: 'sieamb-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ sha: commitSha(), builtAt: new Date().toISOString() }),
      });
    },
  };
}

// The site is served from the domain root on Vercel. VITE_BASE stays as an escape hatch
// for a sub-path deployment.
export default defineConfig(() => ({
  plugins: [react(), versionFile()],
  base: process.env.VITE_BASE ?? '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
