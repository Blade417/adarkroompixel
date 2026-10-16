import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // the original audio is served as-is (AudioLibrary paths 'audio/x.flac' map to './x.flac')
  publicDir: 'original/audio',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // keep small art sheets as files so they stay inspectable in the build output
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        game: 'index.html',
        expedition: 'docs/art/pixel-expedition-v1/index.html'
      }
    }
  },
  server: { port: 5174 },
  preview: { port: 4174 },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
