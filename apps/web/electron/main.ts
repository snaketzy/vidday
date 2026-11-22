import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  net,
  protocol,
  screen,
  session,
  shell,
} from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  applyProxyToSession,
  registerProxyIpc,
  resolveHostNetworkOnStartup,
  setHostNetworkMode,
  setupProxy,
  teardownProxy,
} from './proxy'

/**
 * 生产包内摘除调试相关的启动开关。
 * 这些开关属于浏览器进程级别，不经过 webPreferences.devTools 即可挂上调试器读取网络请求与内存，
 * 且 Chromium 启动时就会读取，所以必须在模块顶层同步执行（早于 app ready）。
 */
function stripDebugSwitches(): void {
  if (!app.isPackaged) return
  for (const name of ['remote-debugging-port', 'remote-debugging-pipe']) {
    if (app.commandLine.hasSwitch(name)) app.commandLine.removeSwitch(name)
  }
}

stripDebugSwitches()

/**
 * 生产包内收窄 macOS 应用菜单：只保留 App / 编辑 / 窗口三项。
 * 直接 setApplicationMenu(null) 会一并摘掉 Cmd+C/V/X/A/Z 等系统编辑快捷键，
 * 因此这里保留编辑菜单；同时去掉 View（重新加载 / 缩放 / 开发者工具）与 Help，减少可探测面。
 * 开发环境保持 Electron 默认菜单，便于使用 Cmd+Option+I 等调试快捷键。
 */
function setupApplicationMenu(): void {
  if (!app.isPackaged) return

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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
      // 生产包内彻底关闭渲染进程 DevTools，避免终端用户直接查看网络请求与播放器内存
      devTools: !app.isPackaged,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 站外链接交给系统浏览器，禁止应用内被导航到任意站点
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 启动探测（本机含系统代理能否连上外网）与内核拉起并行，避免探测拖慢启动。
  // 本机代理开着且能出外网则不启用内核代理，否则启用；内核始终运行，面板线路/测速仍可用。
  // dev 下 dev server 与本地后端都在 bypass 规则内，不会被绕进代理。
  const [hostNetwork] = await Promise.all([resolveHostNetworkOnStartup(), setupProxy()])
  setHostNetworkMode(hostNetwork)
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
    setupApplicationMenu()
    registerAppProtocol()
    registerProxyIpc()
    await createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })

  // 关掉窗口即退出应用（含 macOS），并由 before-quit 回收 mihomo 内核，不留后台进程
  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    teardownProxy()
  })
}
