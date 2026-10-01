import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'vrpgl/SPVA7q8R2GwLLYoX1EuuDVZwK/2YwAclv0Iis=',
    },
  },
});
