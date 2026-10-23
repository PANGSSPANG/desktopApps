import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // 导入/解压用例会生成 30MB 级 fixture，默认 5s 不够。
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
