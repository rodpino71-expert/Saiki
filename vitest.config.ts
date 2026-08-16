import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/dominio/__tests__/**/*.test.ts',
      'web/netlify/functions/__tests__/**/*.test.js',
    ],
  },
});
