import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { createServer } from 'vite'

/**
 * 桌面开发模式：起 Vite dev server -> 构建主进程/预加载 -> 拉起 Electron。
 * Electron 通过 ELECTRON_RENDERER_URL 加载 dev server，从而保留 HMR。
 *
 * 同时托管后台服务（server/）：端口已在监听就复用现成实例，否则随前端一起拉起。
 */
// 固定用 5270 起，避开 5173/5174 等其他项目常用的端口；被占用时 Vite 自动向上顺延
const DEV_PORT = 5270
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/**
 * 后台服务端口直接读 `server/.env`，与后端同源，避免两处配置漂移。
 * 缺配置时回退 8790。
 */
function backendPort() {
  try {
    const text = readFileSync(path.join(projectRoot, 'server', '.env'), 'utf8')
    const matched = text.match(/^\s*PORT\s*=\s*(\d+)\s*$/m)
    if (matched) return Number(matched[1])
  } catch {
    // 未创建 server/.env 时按默认端口探测
  }
  return 8790
}

const BACKEND_PORT = backendPort()
const BACKEND_HEALTH = `http://127.0.0.1:${BACKEND_PORT}/health`

/** 探测后台服务是否已在监听且健康（/health 会顺带探一次 MySQL）。 */
async function backendAlive() {
  try {
    const response = await fetch(BACKEND_HEALTH, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

/** 轮询等待后台服务就绪；超时不阻塞启动，只给出提示。 */
async function waitForBackend(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await backendAlive()) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

/** 本次 dev 自行拉起的后台进程；复用了现成实例时为 null，退出时不动它。 */
let backend = null

if (await backendAlive()) {
  console.log(`[dev] 后台服务已在 ${BACKEND_PORT} 运行，复用现有实例`)
} else {
  console.log(`[dev] 未检测到后台服务，随前端一起启动（server/，端口 ${BACKEND_PORT}）…`)
  backend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(projectRoot, 'server'),
    stdio: 'inherit',
    env: process.env,
    // 独立进程组，便于退出时连同 npm / node --watch 的子进程一起回收
    detached: true,
  })
  backend.on('error', (error) => {
    console.error(`[dev] 后台服务启动失败：${error.message}`)
  })
  backend.on('close', (code) => {
    if (code !== 0 && code !== null) console.error(`[dev] 后台服务退出，code=${code}`)
  })

  if (await waitForBackend()) {
    console.log('[dev] 后台服务已就绪')
  } else {
    console.warn('[dev] 后台服务未在预期时间内就绪，前端仍会继续启动；请检查 server/.env')
  }
}

/** 只回收本次自行拉起的后台服务，复用他人实例时不做任何事。 */
function stopBackend() {
  if (!backend || backend.killed) return
  try {
    process.kill(-backend.pid, 'SIGINT')
  } catch {
    backend.kill('SIGINT')
  }
}

const server = await createServer({ server: { port: DEV_PORT } })
await server.listen()

const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${DEV_PORT}/`
console.log(`[dev] Vite dev server: ${url}`)

// 复用同一份构建逻辑，保证 dev 与打包产物一致
await import('./build-electron.mjs')

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: url },
})

child.on('close', async (code) => {
  stopBackend()
  await server.close()
  process.exit(code ?? 0)
})

// Ctrl+C / kill：连带回收自己拉起的后台服务，避免端口残留
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopBackend()
    process.exit(0)
  })
}
