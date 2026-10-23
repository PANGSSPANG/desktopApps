import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, protocol, session, shell } from 'electron'
import { applyNativeTheme } from './ipc/books'
import { registerIpc } from './ipc/register'
import { LibraryRepository } from './storage/library-repo'
import { createAppPaths, isBookId, type AppPaths } from './storage/paths'
import { resolveWindowBounds, trackWindowState } from './window-state'

const COVER_SCHEME = 'reader'

protocol.registerSchemesAsPrivileged([
  {
    scheme: COVER_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  },
])

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let repository: LibraryRepository | null = null
let appPaths: AppPaths | null = null
let unregisterWindowState: (() => void) | null = null

app.setName('electricReader')

const cdpPort = process.env.ELECTRICREADER_CDP_PORT
if (cdpPort) {
  // Chromium 132+ 拒绝命令行传入 --remote-debugging-port，必须走内部 API。
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
}

const userDataOverride = process.env.ELECTRICREADER_USER_DATA
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride))

function registerCoverProtocol(): void {
  protocol.handle(COVER_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'cover') return new Response(null, { status: 404 })
      const bookId = url.pathname.replace(/^\/+/, '')
      if (!appPaths || !isBookId(bookId)) return new Response(null, { status: 400 })
      const data = await readFile(appPaths.coverFile(bookId))
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'cache-control': 'no-cache',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

function openExternalIfSafe(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      void shell.openExternal(parsed.toString())
    }
  } catch {
    // 非法 URL 直接忽略。
  }
}

function createMainWindow(): BrowserWindow {
  if (!appPaths) throw new Error('应用路径尚未初始化')
  const state = repository?.getWindowState()
  const bounds = resolveWindowBounds(state)
  const preload = path.join(__dirname, '../preload/index.js')

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: 'electricReader',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191817' : '#f4efe6',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      webSecurity: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    openExternalIfSafe(url)
  })

  // 书内链接可能尝试把 iframe 导航到外部站点；应用保持离线，只把 http(s) 交给系统浏览器。
  win.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return
    const url = details.url
    if (
      url.startsWith('about:') ||
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith('file:')
    ) {
      return
    }
    details.preventDefault()
    openExternalIfSafe(url)
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  win.once('ready-to-show', () => {
    if (state?.maximized) win.maximize()
    win.show()
  })

  win.on('closed', () => {
    unregisterWindowState?.()
    unregisterWindowState = null
  })

  if (repository) unregisterWindowState = trackWindowState(win, repository)

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (process.env.ELECTRICREADER_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  return win
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.electricreader.app')

  const root = app.getPath('userData')
  appPaths = createAppPaths(root)
  repository = new LibraryRepository(appPaths)
  await repository.init()

  if (repository.loadWarning) {
    console.warn(repository.loadWarning)
  }

  const settings = repository.getSettings()
  applyNativeTheme(settings)

  registerCoverProtocol()
  registerIpc({
    repo: repository,
    paths: appPaths,
    getWindow: () => mainWindow,
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.on('will-download', (event) => {
    event.preventDefault()
  })

  Menu.setApplicationMenu(null)

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('启动失败', error)
      dialog.showErrorBox(
        'electricReader 无法启动',
        error instanceof Error ? error.message : '未知错误，请重试',
      )
      app.quit()
    })
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && repository) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }
})
