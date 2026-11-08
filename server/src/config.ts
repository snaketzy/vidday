/**
 * 运行时配置文件（`server/proxy.config.json`）。
 *
 * 与 `.env` 的区别：`.env` 只在进程启动时读取一次，改完必须重启；
 * 而该文件在每次请求时按 mtime 判断是否需要重读，改动即时生效、无需重启。
 * 因此适合放「可随时替换」的运维值，如内置代理订阅地址。
 *
 * 文件缺失 / 损坏时返回空配置，绝不影响服务启动与其它接口。
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { env } from './env.ts'

export interface AppConfig {
  /** 内置代理订阅地址；留空表示不下发，客户端保持现有配置 */
  proxySubscriptionUrl: string
}

const EMPTY: AppConfig = { proxySubscriptionUrl: '' }

/** 配置文件路径（不依赖进程 cwd） */
const CONFIG_FILE = path.join(env.serverRoot, 'proxy.config.json')

/** mtime 缓存：文件未变更时直接复用，避免每请求都读盘 */
let cache: { mtimeMs: number; value: AppConfig } | null = null

/** 读取当前生效配置；文件变更即时反映。 */
export function readAppConfig(): AppConfig {
  let mtimeMs: number
  try {
    mtimeMs = statSync(CONFIG_FILE).mtimeMs
  } catch {
    // 文件不存在：按空配置处理
    cache = null
    return EMPTY
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache.value

  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Partial<AppConfig>
    const value: AppConfig = {
      proxySubscriptionUrl:
        typeof parsed.proxySubscriptionUrl === 'string' ? parsed.proxySubscriptionUrl.trim() : '',
    }
    cache = { mtimeMs, value }
    return value
  } catch {
    // 文件损坏：沿用上一次有效值，避免一次误改导致下发异常
    return cache?.value ?? EMPTY
  }
}
