import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** server 根目录（不依赖进程 cwd，保证在任意目录启动都正确）。 */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 依次尝试 server/.env 与仓库根 .env，找到第一个存在的即加载。
 * 后端凭证只应放在 server/.env（该目录不进前端打包产物）。
 */
function loadEnvFile(): void {
  const candidates = [path.join(serverRoot, '.env'), path.join(serverRoot, '../../.env')]
  for (const file of candidates) {
    try {
      process.loadEnvFile(file)
      return
    } catch {
      // 文件不存在则忽略，继续尝试下一个
    }
  }
}

loadEnvFile()

/** 取必填项；缺失时直接抛错，避免服务以半可用状态启动。 */
function required(name: string, value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error(`缺少必要环境变量 ${name}，请在 server/.env 中配置（参见 server/.env.example）`)
  return trimmed
}

export const env = {
  serverRoot,
  port: Number(process.env.PORT ?? '') || 8790,
  /**
   * App 级密钥：前端与 Electron 各持一份，经 `x-app-key` 请求头携带。
   * 必填——未配置时拒绝启动，防止接口在公网裸奔。
   */
  appKey: required('APP_API_KEY', process.env.APP_API_KEY),
  /** 允许的跨域来源；含 `*` 表示不限制（默认）。 */
  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  /** 图片资源（海报 / 剧照 / 头像）的公开访问前缀 */
  assetsBaseUrl:
    (process.env.MEDIA_ASSETS_BASE_URL ?? '').trim().replace(/\/+$/, '') ||
    'https://media.laybackzzz.com/Assets',
  mysql: {
    host: required('MYSQL_HOST', process.env.MYSQL_HOST),
    port: Number(process.env.MYSQL_PORT ?? '') || 3306,
    user: required('MYSQL_USER', process.env.MYSQL_USER),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: required('MYSQL_DATABASE', process.env.MYSQL_DATABASE),
  },
}
