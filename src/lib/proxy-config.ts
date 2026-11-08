/**
 * 把内置代理的远端配置来源（后端地址 + app key）注册给主进程（仅桌面版生效）。
 *
 * 之后由主进程统一负责拉取：启动时同步一次、每 30 分钟例行同步、以及
 * 「所有节点失效」时自动重拉并热替换（不重启内核、不中断播放）。
 *
 * 拉取必须由主进程发起 —— 渲染层的请求会走内核代理，节点全挂时不可达。
 */
import { getProxyConfigSource } from '@/lib/public-api'

export async function registerProxyConfigSource(): Promise<void> {
  const proxy = window.vidday?.proxy
  if (!proxy) return

  const { bases, appKey } = getProxyConfigSource()
  if (bases.length === 0) return

  try {
    await proxy.setConfigSource({ bases, appKey })
  } catch {
    // 注册失败不影响播放；下次启动会再注册
  }
}
