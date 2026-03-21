import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';

const tsPlugin = () => typescript({
  moduleResolution: 'Bundler',
  module: null,
});

export default defineConfig([
  // Node ESM bundle
  {
    input: ['./src/index.ts'],
    output: {
      dir: 'dist/esm',
      entryFileNames: '[name].mjs',
      format: 'esm',
    },
    external: [() => true],
    plugins: [tsPlugin()],
  },
  // Browser ESM bundle — resolves via src/browser/index.ts
  {
    input: { index: './src/browser/index.ts' },
    output: {
      dir: 'dist/esm/browser',
      entryFileNames: '[name].mjs',
      format: 'esm',
    },
    external: [() => true],
    plugins: [tsPlugin()],
  },
]);
