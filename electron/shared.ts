/**
 * 主进程与预加载脚本共享的纯类型定义。
 * 只放 `type/interface`，打包时会被完全擦除，不会把主进程运行时引入预加载包。
 */

/** 一条定制线路，字段与 Clash `proxies` 数组项对齐。 */
export interface ProxyLine {
  name: string
  type: string
  server: string
  port: number
  [key: string]: unknown
}

/** 订阅拉取状态。用于把拉取失败的原因显式暴露到面板，避免"静默 0 线路"。 */
export interface SubscriptionState {
  /** 是否配置了订阅地址 */
  configured: boolean
  /** 最近一次拉取是否成功 */
  ok: boolean
  /** 失败原因（HTTP 状态码 / 超时 / 网络错误）；成功或未配置时为 null */
  error: string | null
  /** 最近一次成功拉取的时间（ISO 字符串）；从未成功为 null */
  updatedAt: string | null
  /** 订阅内解析出的节点数量 */
  nodeCount: number
}

/** 出网看门狗的自动恢复状态，供开发环境观测"节点全失效后自动重拉配置"是否生效。 */
export interface RecoveryState {
  /** 本次会话内触发自动恢复的次数 */
  count: number
  /** 最近一次触发时间（ISO）；从未触发为 null */
  lastAt: string | null
  /** 下一次允许重试的时间（ISO）；无待重试为 null */
  nextAt: string | null
  /** 当前连续出网失败计数，达到阈值即触发恢复 */
  consecutiveFailures: number
}

/** 代理运行时状态，渲染层通过 IPC 读取后展示在「线路」页。 */
export interface ProxyStatus {
  /** 代理核心是否已就绪并接管了本应用流量 */
  enabled: boolean
  /**
   * 是否改用本机（系统）网络：true 时本应用不经内核转发，
   * 恢复 Chromium 默认的 system 模式（跟随系统代理设置）；false 时走内置内核。
   */
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
  subscription: SubscriptionState
  /** 自动恢复状态 */
  recovery: RecoveryState
}

/** 代理节点概览（字段来自 mihomo /proxies API）。 */
export interface ProxyNodeView {
  name: string
  type: string
}

/** 一个代理组（selector/url-test/fallback 等）及其节点。 */
export interface ProxyGroupView {
  name: string
  type: string
  /** 当前选中的节点名 */
  now: string
  nodes: ProxyNodeView[]
}

/** 单节点延迟测速结果，`delay` 为 null 表示超时或失败。 */
export interface NodeDelay {
  name: string
  delay: number | null
}

/**
 * 远端配置来源，由渲染层注册给主进程。
 * 主进程据此拉取配置与订阅（走系统网络、绕开内核）——
 * 「所有节点失败」时渲染层请求会走内核而不可达，只能由主进程发起。
 */
export interface ProxyConfigSource {
  /** 后端基址（绝对地址），主地址在前、兜底在后 */
  bases: string[]
  /** App 级密钥，经 `x-app-key` 头携带 */
  appKey: string
}
