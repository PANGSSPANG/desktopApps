import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

const sharedDir = resolve(__dirname, 'src/shared')
const rendererDir = resolve(__dirname, 'src/renderer')

/**
 * 渲染层 index.html 里预留了 CSP 占位符：开发态需要内联脚本与 HMR websocket，
 * 生产态收紧为 'self'。占位符留在 HTML 中，避免维护两份入口文件。
 */
function cspPlugin(): Plugin {
  let dev = false
  return {
    name: 'electricreader-csp',
    configResolved(config) {
      dev = config.command === 'serve'
    },
    transformIndexHtml(html) {
      const scriptSrc = dev ? "'self' 'unsafe-inline'" : "'self'"
      const connectSrc = dev ? "'self' ws: http: https:" : "'self'"
      return html
        .replace('__CSP_SCRIPT_SRC__', scriptSrc)
        .replace('__CSP_CONNECT_SRC__', connectSrc)
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': sharedDir },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': sharedDir },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': sharedDir,
        '@renderer': rendererDir,
      },
    },
    plugins: [react(), tailwindcss(), cspPlugin()],
  },
})
