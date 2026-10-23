import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'

const CDP_PORT = 19222
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`

export interface RunningApp {
  page: Page
  browser: Browser
  process: ChildProcess
  userData: string
  cdpPort: number
}

export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

function electronExecutable(): string {
  const override = process.env.ELECTRICREADER_ELECTRON_PATH
  if (override) return override
  const base = path.join(process.cwd(), 'node_modules', 'electron', 'dist')
  if (process.platform === 'win32') return path.join(base, 'electron.exe')
  if (process.platform === 'darwin') {
    return path.join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  }
  return path.join(base, 'electron')
}

async function waitForPage(): Promise<{ browser: Browser; page: Page }> {
  const deadline = Date.now() + 30_000
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(CDP_URL)
      const contexts = browser.contexts()
      for (const context of contexts) {
        for (const page of context.pages()) {
          if (page.url().includes('index.html') || page.url().includes('localhost')) {
            return { browser, page }
          }
        }
      }
      const page = contexts[0]?.pages()[0]
      if (page) return { browser, page }
      await browser.close()
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`等待 Electron CDP 超时：${String(lastError)}`)
}

export async function launchApp(userData: string): Promise<RunningApp> {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electronExecutable(), ['.'], {
    cwd: process.cwd(),
    env: {
      ...env,
      NODE_ENV: 'production',
      ELECTRICREADER_USER_DATA: userData,
      ELECTRICREADER_CDP_PORT: String(CDP_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    logs += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    logs += chunk.toString()
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`\n[electricReader exited ${code}]\n${logs}\n`)
    }
  })

  try {
    const { browser, page } = await waitForPage()
    await page.waitForLoadState('domcontentloaded')
    return { page, browser, process: child, userData, cdpPort: CDP_PORT }
  } catch (error) {
    child.kill()
    throw new Error(`${String(error)}\n${logs}`)
  }
}

export async function closeApp(app: RunningApp): Promise<void> {
  try {
    await app.page.close({ runBeforeUnload: true })
  } catch {
    // 窗口可能已关闭。
  }
  await app.browser.close().catch(() => undefined)

  if (app.process.exitCode === null) {
    await Promise.race([
      new Promise<void>((resolve) => app.process.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ])
  }
  if (app.process.exitCode === null) {
    app.process.kill()
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

interface LibraryFileLike {
  books: Array<{
    id: string
    format: string
    title: string
    status: string
    progress: { percent: number; locator: { href: string; cfi?: string } }
  }>
  settings: {
    fontSize: number
    lineHeight: number
    maxWidth: number
    theme: string
    followSystem: boolean
  }
}

export async function readLibrary(userData: string): Promise<LibraryFileLike> {
  const raw = await readFile(path.join(userData, 'library.json'), 'utf8')
  return JSON.parse(raw) as LibraryFileLike
}

export async function cleanup(userData: string): Promise<void> {
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
