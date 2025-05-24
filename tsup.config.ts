import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  sourcemap: true,
  clean: true,
  dts: false, // Not needed for CLI
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  target: 'node20',
  shims: true, // Add Node.js shims
  splitting: false,
  treeshake: true
});