import type { ElectricReaderApi } from '../../src/shared/ipc-contract'

/**
 * E2E 在 page.evaluate 里直接调用 preload 暴露的 window.api；
 * 渲染层自身的声明在 src/renderer/services/api.ts，测试侧需要重复声明一次。
 */
declare global {
  interface Window {
    api: ElectricReaderApi
  }
}

export {}
