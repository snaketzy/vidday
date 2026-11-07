import { spawn } from 'node:child_process'

import electronPath from 'electron'
import { createServer } from 'vite'

/**
 * 桌面开发模式：起 Vite dev server -> 构建主进程/预加载 -> 拉起 Electron。
 * Electron 通过 ELECTRON_RENDERER_URL 加载 dev server，从而保留 HMR。
 */
// 固定用 5270 起，避开 5173/5174 等其他项目常用的端口；被占用时 Vite 自动向上顺延
const DEV_PORT = 5270
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
  await server.close()
  process.exit(code ?? 0)
})
