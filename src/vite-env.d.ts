/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vidday 后台服务基址（server/），如 http://127.0.0.1:8790；留空则用同源 */
  readonly VITE_API_BASE_URL?: string
  /** App 级密钥；须与 server/.env 的 APP_API_KEY 一致，经 x-app-key 头携带 */
  readonly VITE_APP_API_KEY?: string
  /** 中插广告总开关，仅显式 'false' 时关闭 */
  readonly VITE_ENABLE_ADS?: string
  /** Web 端「下载客户端」入口：各平台下载地址，留空则仅展示图标不跳转 */
  readonly VITE_DOWNLOAD_WINDOWS_URL?: string
  readonly VITE_DOWNLOAD_MACOS_URL?: string
  readonly VITE_DOWNLOAD_ANDROID_URL?: string
}

/** 订阅拉取状态。字段与 `electron/shared.ts` 的 SubscriptionState 对齐。 */
interface ViddaySubscriptionState {
  /** 是否配置了订阅地址 */
  configured: boolean
  /** 最近一次拉取是否成功 */
  ok: boolean
  /** 失败原因；成功或未配置时为 null */
  error: string | null
  /** 最近一次成功拉取的时间（ISO），从未成功为 null */
  updatedAt: string | null
  /** 订阅内解析出的节点数量 */
  nodeCount: number
}

/** 代理运行时状态。字段与 `electron/shared.ts` 的 ProxyStatus 对齐。 */
interface ViddayProxyStatus {
  /** 代理核心是否已就绪并接管了本应用流量 */
  enabled: boolean
  /** 是否改用本机（系统）网络：true 时本应用不经内核转发，跟随系统代理设置 */
  hostNetwork: boolean
  /** 人类可读的原因/说明，便于排查 */
  reason: string
  /** 本地混合端口（HTTP + SOCKS 同端口） */
  mixedPort: number
  /** Clash API 控制端口 */
  controllerPort: number
  /** 已加载的定制线路数量 */
  lineCount: number
  /** 订阅拉取状态 */
  subscription: ViddaySubscriptionState
}

/** 代理节点概览。 */
interface ViddayProxyNode {
  name: string
  type: string
}

/** 一个代理组及其节点。 */
interface ViddayProxyGroup {
  name: string
  type: string
  /** 当前选中的节点名 */
  now: string
  nodes: ViddayProxyNode[]
}

/** 单节点延迟测速结果，delay 为 null 表示超时或失败。 */
interface ViddayNodeDelay {
  name: string
  delay: number | null
}

/** 桌面外壳通过预加载脚本暴露的能力面；浏览器（非 Electron）下为 undefined。 */
interface ViddayBridge {
  platform: string
  versions: { electron: string; chrome: string; node: string }
  proxy: {
    status: () => Promise<ViddayProxyStatus>
    restart: () => Promise<ViddayProxyStatus>
    refreshSubscription: () => Promise<ViddayProxyStatus>
    /** 当前生效的订阅地址（用户级配置优先） */
    getSubscription: () => Promise<string>
    /** 保存新的订阅地址并重启内核 */
    setSubscription: (url: string) => Promise<ViddayProxyStatus>
    groups: () => Promise<ViddayProxyGroup[]>
    /** 切换网络出口：true 走本机（系统）网络，false 走应用内置内核代理 */
    setHostNetwork: (enabled: boolean) => Promise<ViddayProxyStatus>
    select: (group: string, node: string, activateRoute?: string) => Promise<void>
    delay: (node: string, slot?: number) => Promise<ViddayNodeDelay>
  }
}

interface Window {
  vidday?: ViddayBridge
}
