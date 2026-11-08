/**
 * 进程内 TTL 缓存（stale-while-revalidate）。
 *
 * 背景：内容侧只读接口（轮播 / 最新上架 / 题材字典）变更频率极低，
 * 而每次到 MySQL 的往返高达数百毫秒甚至数秒，多段串行查询叠加后会把
 * 单个接口拖到十几秒。这里按 key 缓存结果：
 *  - 命中且未过期 → 直接返回；
 *  - 命中但已过期 → 立即返回旧值，后台异步回源（用户永远不等刷新）；
 *  - 未命中 → 等待回源，并对同一 key 的并发请求做单飞合并。
 *
 * 单实例内存缓存、无跨进程失效通知：内容更新最多滞后一个 TTL。
 */

interface Entry {
  /** 已缓存的值；回源进行中时保留上一轮的旧值（可能为 undefined） */
  value: unknown
  /** 过期时间戳；0 表示尚无有效值 */
  expiresAt: number
  /** 正在进行的回源；同一 key 的并发请求共享它 */
  inflight?: Promise<unknown>
}

const store = new Map<string, Entry>()

/**
 * 读缓存或回源。`ttlMs` 只决定回源频率，不影响读取延迟
 * —— 过期后仍先返回旧值，刷新在后台进行。
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = store.get(key)

  // 新鲜：直接命中
  if (entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.value as T)
  // 已有回源在跑：合并，避免并发穿透
  if (entry?.inflight) return entry.inflight as Promise<T>

  const stale = entry?.value
  const inflight = load().then(
    (value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    },
    (error: unknown) => {
      // 回源失败：有旧值就继续用（短暂延长，稍后再试），否则清掉占位
      if (stale !== undefined) store.set(key, { value: stale, expiresAt: Date.now() + 5_000 })
      else store.delete(key)
      throw error
    },
  )
  store.set(key, { value: stale, expiresAt: entry?.expiresAt ?? 0, inflight })

  // 无旧值：等待回源；有旧值：先回旧值，后台刷新（吞掉后台错误避免 unhandled rejection）
  if (stale === undefined) return inflight
  void inflight.catch(() => undefined)
  return Promise.resolve(stale as T)
}
