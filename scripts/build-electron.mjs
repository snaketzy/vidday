import { rmSync } from 'node:fs'

import { build } from 'esbuild'

/**
 * 构建 Electron 主进程与预加载脚本。
 * 产物固定为 .cjs：与 package.json 的 "type": "module" 解耦，避免 ESM 主进程的兼容坑。
 * src/ 的渲染层不在这里处理，仍由 vite build 输出到 dist/。
 */
const OUT_DIR = 'electron/dist'

rmSync(OUT_DIR, { recursive: true, force: true })

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
}

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: `${OUT_DIR}/main.cjs` })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: `${OUT_DIR}/preload.cjs` })
