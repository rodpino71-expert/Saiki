import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/dominio/__tests__/**/*.test.ts'],
  },
});
