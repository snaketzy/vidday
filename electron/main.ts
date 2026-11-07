import { app, BrowserWindow, net, protocol, screen, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { applyProxyToSession, registerProxyIpc, setupProxy, teardownProxy } from './proxy'

/**
 * 渲染层走自定义协议而非 file://：
 * - 注册为 standard + secure，BrowserRouter 的 history/pushState 才可用（无需改 HashRouter）；
 * - origin 固定为 app://vidday，fetch / 媒体请求行为与浏览器一致。
 */
const APP_SCHEME = 'app'
const APP_HOST = 'vidday'

/** 主进程产物位于 electron/dist，向上两级即应用根（打包后在 asar 内同理） */
const APP_ROOT = path.join(__dirname, '..', '..')
/** Vite 产物目录 */
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null

/** 把 app:// 路径解析为磁盘文件；未知路径（前端路由）回退 index.html。 */
function resolveRendererFile(pathname: string): string | null {
  const candidate = path.join(RENDERER_DIST, decodeURIComponent(pathname))
  if (!candidate.startsWith(RENDERER_DIST)) return null

  if (existsSync(candidate) && path.extname(candidate) !== '') return candidate
  if (existsSync(candidate) && !path.extname(candidate)) {
    const indexInDir = path.join(candidate, 'index.html')
    if (existsSync(indexInDir)) return indexInDir
  }

  const fallback = path.join(RENDERER_DIST, 'index.html')
  return existsSync(fallback) ? fallback : null
}

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const file = resolveRendererFile(pathname)
    if (!file) {
      return new Response('未找到前端产物，请先执行 npm run build', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

async function createWindow(): Promise<void> {
  const { x, y, width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workArea
  const windowWidth = Math.min(1440, workAreaWidth)
  const windowHeight = Math.min(Math.round(workAreaHeight * 0.8), workAreaHeight)

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.round(x + (workAreaWidth - windowWidth) / 2),
    y: Math.round(y + (workAreaHeight - windowHeight) / 2),
    minWidth: Math.min(1024, windowWidth),
    minHeight: Math.min(640, windowHeight),
    show: false,
    backgroundColor: '#141414',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 站外链接交给系统浏览器，禁止应用内被导航到任意站点
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 先起代理再加载页面，保证首个媒体请求就走本地线路。
  // dev 下 dev server 与本地后端都在 bypass 规则内，不会被绕进代理。
  await setupProxy()
  await applyProxyToSession(session.defaultSession)

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
  } else {
    await mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/`)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    registerAppProtocol()
    registerProxyIpc()
    await createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    teardownProxy()
  })
}
