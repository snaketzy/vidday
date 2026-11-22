import { app, ipcMain, net, session } from 'electron'
import type { Session } from 'electron'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type {
  NodeDelay,
  ProxyConfigSource,
  ProxyGroupView,
  ProxyLine,
  ProxyStatus,
  RecoveryState,
  SubscriptionState,
} from './shared'

/**
 * 内置代理层，对标 Clash Verge 的内核托管方式：
 * 主进程以 sidecar 形式拉起 mihomo，生成配置、等待控制端口就绪，
 * 再把本应用的 Chromium session 指向本地混合端口（仅应用内生效，不改系统网络）。
 */

/** 本地混合端口（HTTP + SOCKS 同端口）。默认 7899，避开 Clash(7890)/Verge(7897) 常用端口 */
const DEFAULT_MIXED_PORT = 7899
/** Clash API 控制端口。默认 9099：9090 常被占用，9097 是 Clash Verge Rev 的默认控制端口 */
const DEFAULT_CONTROLLER_PORT = 9099
/** 控制 API 密钥，仅本机回环使用 */
const CONTROLLER_SECRET = 'vidday-local'
/** 控制端口就绪的等待上限 */
const CONTROLLER_READY_TIMEOUT = 10_000
/** 测速目标与超时 */
const DELAY_TEST_URL = 'http://www.gstatic.com/generate_204'
const DELAY_TEST_TIMEOUT = 5000
/** 线路分组名 */
const PROXY_GROUP = 'PROXY'
const MANUAL_GROUP = '手动切换'
const AUTO_GROUP = '自动选择'
const FALLBACK_GROUP = '故障转移'
/** 自动选择组支持的策略；mihomo 解析到未知策略会让整个配置解析失败，故需白名单校验 */
const AUTO_STRATEGIES = ['url-test', 'round-robin', 'consistent-hashing', 'sticky-sessions'] as const
type AutoStrategy = (typeof AUTO_STRATEGIES)[number]
/**
 * 自动选择组默认策略。url-test 选择延迟最低的可用节点；负载均衡策略可供需要分摊时覆盖：
 * consistent-hashing 按 eTLD+1 哈希、sticky-sessions 按「源IP+目标」哈希，
 * 而本应用所有媒体都在同一域名下，两者都会把请求固定到同一个节点；round-robin 会在节点间轮换。
 */
const DEFAULT_AUTO_STRATEGY: AutoStrategy = 'url-test'
/** 延迟优选仅在新节点至少快出此毫秒数时切换，避免微小抖动导致频繁切换 */
const AUTO_TEST_TOLERANCE_MS = 50
/** 健康检查请求超时（毫秒），不是精确 RTT 筛选值；0 表示不设置超时 */
const DEFAULT_AUTO_MAX_DELAY_MS = 300
/** 订阅 provider 名，需与 buildConfig 中的 key 一致 */
const SUBSCRIPTION_PROVIDER = 'subscription'
/** mihomo 不为 provider 内的节点提供独立 /proxies/{node} 资源，用隐藏 selector 做单节点测速。 */
const TEST_GROUP_PREFIX = '__VIDDAY_TEST_'
const TEST_GROUP_COUNT = 6
/** 拉取订阅时伪装成 Clash Verge，多数机场据此返回 Clash 格式而非 base64 链接 */
const SUBSCRIPTION_UA = 'clash-verge/v2.0.0'
/** 订阅拉取超时 */
const SUBSCRIPTION_FETCH_TIMEOUT = 15_000
/**
 * 启动探测外网连通性的目标。
 * 注意不能再用 www.gstatic.com —— 它走 Google CDN、国内可直连（mihomo 正是用它做延迟测试），
 * 无法代表「能上外网」；这里用被封锁的 www.google.com，直连不可达、经代理才返回 204。
 */
const EXTERNAL_PROBE_URL = 'https://www.google.com/generate_204'
/** 启动探测超时；拿不准宁可走代理，故宁短勿长 */
const EXTERNAL_PROBE_TIMEOUT = 3000
/** 探测专用 session 的分区名（无 persist 前缀即内存态） */
const PROBE_PARTITION = 'vidday-network-probe'
/** 未显式配置时的订阅默认更新间隔（秒） */
const DEFAULT_SUBSCRIPTION_INTERVAL = 3600
/** 远端配置拉取超时 */
const REMOTE_CONFIG_TIMEOUT = 5000
/** 远端配置例行同步间隔（毫秒）：长时间驻留也能拿到最新订阅地址 */
const REMOTE_CONFIG_INTERVAL = 30 * 60 * 1000
/** 出网探测专用 session 的分区名（与启动探测区分，内存态） */
const EGRESS_PROBE_PARTITION = 'vidday-egress-probe'
/** 出网探测间隔（毫秒）：经内核验活，连续失败即触发配置重拉 */
const EGRESS_PROBE_INTERVAL = 10_000
/** 连续失败阈值：达到即判定「所有节点失效」 */
const EGRESS_FAILURE_THRESHOLD = 3
/** 恢复重试退避（毫秒）：1/2/4/8/16/30 分钟，封顶 30 分钟 */
const RECOVERY_BACKOFF_MS = [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000]
/** 按节点名称识别常见地区；mihomo 只会显示实际匹配到节点的组。 */
const REGION_GROUPS = [
  { name: '香港节点', filter: '(?i)(香港|Hong Kong|(^|[| _-])HK($|[| _-])|HKG)' },
  { name: '台湾节点', filter: '(?i)(台湾|台灣|Taiwan|(^|[| _-])TW($|[| _-])|TWN)' },
  { name: '日本节点', filter: '(?i)(日本|Japan|(^|[| _-])JP($|[| _-])|JPN)' },
  { name: '新加坡节点', filter: '(?i)(新加坡|Singapore|(^|[| _-])SG($|[| _-])|SGP)' },
  { name: '美国节点', filter: '(?i)(美国|美國|United States|USA|(^|[| _-])US($|[| _-])|🇺🇸)' },
  { name: '韩国节点', filter: '(?i)(韩国|韓國|South Korea|(^|[| _-])KR($|[| _-])|KOR)' },
  { name: '英国节点', filter: '(?i)(英国|英國|United Kingdom|(^|[| _-])UK($|[| _-])|GBR)' },
  { name: '德国节点', filter: '(?i)(德国|德國|Germany|(^|[| _-])DE($|[| _-])|DEU)' },
  { name: '法国节点', filter: '(?i)(法国|法國|France|(^|[| _-])FR($|[| _-])|FRA)' },
  { name: '加拿大节点', filter: '(?i)(加拿大|Canada|(^|[| _-])CA($|[| _-])|CAN)' },
  { name: '澳大利亚节点', filter: '(?i)(澳大利亚|澳洲|Australia|(^|[| _-])AU($|[| _-])|AUS)' },
  { name: '马来西亚节点', filter: '(?i)(马来西亚|Malaysia|(^|[| _-])MY($|[| _-])|MYS)' },
  { name: '泰国节点', filter: '(?i)(泰国|Thailand|(^|[| _-])TH($|[| _-])|THA)' },
  { name: '印度节点', filter: '(?i)(印度|India|(^|[| _-])IN($|[| _-])|IND)' },
]
/** 内核内置的伪节点/伪分组，不算作可测试的线路 */
const PSEUDO_NODES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'PASS-RULE',
  'COMPATIBLE',
  'GLOBAL',
  'PROXY',
])

/** `resources/lines.json` 的配置结构 */
interface LinesConfig {
  /** 订阅地址（Clash 格式）。内核会按 interval 定时拉取更新 */
  subscriptionUrl?: string
  /** 订阅更新间隔（秒） */
  subscriptionInterval?: number
  /** 静态节点列表（与订阅二选一，也可并存） */
  proxies?: ProxyLine[]
  /** 是否改用本机（系统）网络：true 时本应用不经内核转发，恢复跟随系统代理 */
  useHostNetwork?: boolean
  /** 「自动选择」组策略，默认 url-test（最低延迟优选） */
  autoStrategy?: AutoStrategy
  /** 自动组健康检查请求超时（毫秒），不是精确 RTT 筛选值；0 表示不设置 */
  autoMaxDelayMs?: number
  /** 覆盖默认端口 */
  mixedPort?: number
  controllerPort?: number
}

let core: ChildProcessWithoutNullStreams | null = null
let mixedPort = DEFAULT_MIXED_PORT
let controllerPort = DEFAULT_CONTROLLER_PORT
/** 内核工作目录（配置与订阅落盘处）；setupProxy 时确定 */
let configDir = ''
/** 订阅定时刷新句柄 */
let refreshTimer: ReturnType<typeof setInterval> | null = null
/** 远端配置来源（渲染层注册）；为空表示尚未注册，不能拉配置 */
let configSource: ProxyConfigSource | null = null
/** 远端配置例行同步句柄 */
let remoteConfigTimer: ReturnType<typeof setInterval> | null = null
/** 出网探测专用 session（经内核，验证真实出口） */
let egressSession: Session | null = null
/** 出网看门狗句柄 */
let watchdogTimer: ReturnType<typeof setInterval> | null = null
/** 连续出网失败计数 */
let egressFailures = 0
/** 恢复退避档位与下次可重试时间 */
let recoveryBackoffIndex = 0
let nextRecoveryAt = 0
/** 恢复进行中标记，避免与看门狗重入 */
let recovering = false

const EMPTY_SUBSCRIPTION: SubscriptionState = {
  configured: false,
  ok: false,
  error: null,
  updatedAt: null,
  nodeCount: 0,
}

let subscription = EMPTY_SUBSCRIPTION

/**
 * 看门狗的可观测状态。用同一对象引用挂在 status 上，
 * 就地改字段即可让渲染层通过 IPC 看到最新值（供开发环境排查）。
 */
const recovery: RecoveryState = {
  count: 0,
  lastAt: null,
  nextAt: null,
  consecutiveFailures: 0,
}

let status: ProxyStatus = {
  enabled: false,
  hostNetwork: false,
  reason: '尚未初始化',
  mixedPort,
  controllerPort,
  lineCount: 0,
  subscription,
  recovery,
}

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

/** 打包后核心在 resourcesPath 下；开发期在仓库 resources/ 下。二者都找不到则整体跳过代理。 */
function resolveCoreBinary(): string | null {
  const bin = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'mihomo', bin)]
    : [path.join(app.getAppPath(), 'resources', 'mihomo', bin)]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** 读取单个配置文件；文件缺失或损坏时返回 null。 */
function readConfigFile(file: string): LinesConfig | null {
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    // 兼容直接写 Clash proxies 数组的简写形式
    if (Array.isArray(parsed)) return { proxies: parsed as ProxyLine[] }
    if (typeof parsed === 'object' && parsed !== null) return parsed as LinesConfig
    return null
  } catch {
    return null
  }
}

/** 随包发布的默认配置。打包后在 resourcesPath 下，开发期在仓库 resources/ 下。 */
function bundledConfigFile(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'lines.json')
    : path.join(app.getAppPath(), 'resources', 'lines.json')
}

/** 用户级配置（可写）。用户可在面板里改订阅地址，不必动仓库文件。 */
function userConfigFile(): string {
  return path.join(app.getPath('userData'), 'lines.json')
}

/** 读取生效配置：用户级 lines.json 覆盖随包的 resources/lines.json。 */
function readConfig(): LinesConfig {
  return { ...readConfigFile(bundledConfigFile()), ...readConfigFile(userConfigFile()) }
}

/** 把改动合并写入用户级配置，保留其中已有的其它字段。 */
function writeUserConfig(patch: Partial<LinesConfig>): void {
  const current = readConfigFile(userConfigFile()) ?? {}
  const file = userConfigFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`, 'utf8')
}

/**
 * 订阅落盘路径。内核以 `type: file` 的 provider 读取该文件，不做网络拉取，
 * 因此拉取失败（403/超时等）可以被主进程精确捕获并展示，而不是在内核里静默成 0 线路。
 */
function subscriptionFilePath(): string {
  return path.join(configDir, 'providers', 'subscription.yaml')
}

/** 写入空订阅占位，保证内核带 file provider 时也能正常启动。 */
function writeEmptySubscription(): void {
  const file = subscriptionFilePath()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, 'proxies: []\n', 'utf8')
}

/**
 * 确保订阅文件存在，但绝不覆盖已有内容。
 * 拉取失败时保留上一次成功的结果（last-known-good），避免订阅源抖动导致线路全空。
 */
function ensureSubscriptionFile(): void {
  if (!existsSync(subscriptionFilePath())) writeEmptySubscription()
}

/**
 * 由主进程拉取订阅并落盘。
 * 用 Node 原生 fetch（走系统网络），不经本应用自己的代理，避免与内核形成依赖环。
 */
async function fetchSubscription(config: LinesConfig): Promise<SubscriptionState> {
  const url = config.subscriptionUrl
  if (!url) return EMPTY_SUBSCRIPTION

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUBSCRIPTION_FETCH_TIMEOUT)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': SUBSCRIPTION_UA },
      signal: controller.signal,
    })
    if (!response.ok) {
      ensureSubscriptionFile()
      const suffix = response.statusText ? ` ${response.statusText}` : ''
      return {
        configured: true,
        ok: false,
        error: `订阅拉取失败：HTTP ${response.status}${suffix}`,
        updatedAt: subscription.updatedAt,
        nodeCount: 0,
      }
    }
    const text = await response.text()
    if (!text.trim()) {
      ensureSubscriptionFile()
      return {
        configured: true,
        ok: false,
        error: '订阅内容为空',
        updatedAt: subscription.updatedAt,
        nodeCount: 0,
      }
    }
    writeFileSync(subscriptionFilePath(), text, 'utf8')
    return {
      configured: true,
      ok: true,
      error: null,
      updatedAt: new Date().toISOString(),
      // 真实节点数以内核解析结果回填
      nodeCount: subscription.nodeCount,
    }
  } catch (error) {
    ensureSubscriptionFile()
    const aborted = error instanceof Error && error.name === 'AbortError'
    const reason = aborted
      ? '订阅拉取超时'
      : `订阅拉取出错：${error instanceof Error ? error.message : String(error)}`
    return { configured: true, ok: false, error: reason, updatedAt: subscription.updatedAt, nodeCount: 0 }
  } finally {
    clearTimeout(timer)
  }
}

/** 探测专用 session（内存态，无 persist 前缀）；与 defaultSession 隔离，避免受本应用内核代理影响 */
let probeSession: Session | null = null

/**
 * 启动时判定网络出口：本机（跟随系统代理设置）可连上外网则不启用内核代理，否则启用。
 * 用 Chromium 网络栈 + 独立 session 的 system 模式 —— 会真正走 macOS 系统代理，
 * 因此能反映「本机代理开/关」：本机代理开着且能出外网即判定可直连，反之走内置内核。
 */
export async function resolveHostNetworkOnStartup(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXTERNAL_PROBE_TIMEOUT)
  try {
    probeSession ??= session.fromPartition(PROBE_PARTITION)
    await probeSession.setProxy({ mode: 'system' })
    const response = await probeSession.fetch(EXTERNAL_PROBE_URL, { signal: controller.signal })
    // 严格等值 204：经系统代理真能到达 Google 才命中；劫持页多返回 200，不能当作可达
    return response.status === 204
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 落定启动探测结果：更新运行时状态并写入用户配置。
 * 原理上「重启覆盖」——每次应用启动都会重新判定，手动开关只在本次会话内有效。
 */
export function setHostNetworkMode(hostNetwork: boolean): ProxyStatus {
  writeUserConfig({ useHostNetwork: hostNetwork })
  status = { ...status, hostNetwork }
  return status
}

/** 解析自动选择组的策略：非法值回落默认，避免 mihomo 因未知策略拒绝整份配置。 */
function resolveAutoStrategy(value?: string): AutoStrategy {
  return AUTO_STRATEGIES.includes(value as AutoStrategy)
    ? (value as AutoStrategy)
    : DEFAULT_AUTO_STRATEGY
}

/** 解析延迟门槛：缺省用默认值，显式填 0 或非法值视为不启用。 */
function resolveAutoMaxDelay(value?: number): number {
  if (value === undefined) return DEFAULT_AUTO_MAX_DELAY_MS
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

/**
 * 生成 mihomo 配置。
 * mihomo 用 YAML 解析器，而 JSON 是 YAML 子集，直接写 JSON 可规避手写 YAML 的转义问题。
 */
function buildConfig(config: LinesConfig): { text: string; hasNodes: boolean } {
  const staticProxies = config.proxies ?? []
  const useSubscription = Boolean(config.subscriptionUrl)
  const hasNodes = useSubscription || staticProxies.length > 0
  const autoStrategy = resolveAutoStrategy(config.autoStrategy)
  const autoMaxDelayMs = resolveAutoMaxDelay(config.autoMaxDelayMs)

  const body: Record<string, unknown> = {
    'mixed-port': mixedPort,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'warning',
    'external-controller': `127.0.0.1:${controllerPort}`,
    secret: CONTROLLER_SECRET,
    'unified-delay': true,
    'tcp-concurrent': true,
    // 记住手动选择的节点，重启后不丢失
    profile: { 'store-selected': true },
    proxies: staticProxies,
    rules: hasNodes ? [`MATCH,${PROXY_GROUP}`] : ['MATCH,DIRECT'],
  }

  if (useSubscription) {
    body['proxy-providers'] = {
      [SUBSCRIPTION_PROVIDER]: {
        // 订阅由主进程拉取并入盘，内核只读本地文件；文件支持 Clash YAML 与 base64 订阅
        type: 'file',
        path: subscriptionFilePath(),
        'health-check': {
          enable: true,
          url: DELAY_TEST_URL,
          interval: 300,
          // 组级 timeout 不会传导给 use 引入的节点，延迟门槛必须配在 provider 上；
          // 同时关掉 lazy，保证每个周期都测全量节点，门槛才有可靠依据。
          ...(autoMaxDelayMs > 0 ? { timeout: autoMaxDelayMs, lazy: false } : {}),
        },
      },
    }
  }

  if (hasNodes) {
    const staticNames = staticProxies.map((line) => line.name)
    const withSources = (group: Record<string, unknown>): Record<string, unknown> => {
      if (staticNames.length > 0) group.proxies = staticNames
      if (useSubscription) group.use = [SUBSCRIPTION_PROVIDER]
      return group
    }
    const autoGroup = withSources({
      name: AUTO_GROUP,
      type: autoStrategy === 'url-test' ? 'url-test' : 'load-balance',
      ...(autoStrategy === 'url-test'
        ? { tolerance: AUTO_TEST_TOLERANCE_MS }
        : { strategy: autoStrategy }),
      url: DELAY_TEST_URL,
      interval: 300,
      // 门槛作用于 proxies 字段的静态节点；订阅节点走 provider 的 health-check.timeout
      ...(autoMaxDelayMs > 0 ? { timeout: autoMaxDelayMs } : {}),
    })
    const groups: Record<string, unknown>[] = [
      // 「自动选择」置顶：PROXY_GROUP 是 select 组，默认选中 proxies 第一项。
      autoGroup,
      withSources({ name: MANUAL_GROUP, type: 'select' }),
      withSources({
        name: FALLBACK_GROUP,
        type: 'fallback',
        url: DELAY_TEST_URL,
        interval: 300,
      }),
    ]

    if (useSubscription) {
      for (const region of REGION_GROUPS) {
        groups.push({
          name: region.name,
          type: 'select',
          use: [SUBSCRIPTION_PROVIDER],
          filter: region.filter,
        })
      }
    }

    const routeGroupNames = groups.map((group) => group.name)
    if (useSubscription) {
      for (let index = 0; index < TEST_GROUP_COUNT; index += 1) {
        groups.push({
          name: `${TEST_GROUP_PREFIX}${index + 1}`,
          type: 'select',
          use: [SUBSCRIPTION_PROVIDER],
        })
      }
    }

    groups.push({
      name: PROXY_GROUP,
      type: 'select',
      proxies: routeGroupNames,
    })
    body['proxy-groups'] = groups
  }

  return { text: JSON.stringify(body, null, 2), hasNodes }
}

/* ------------------------------------------------------------------ *
 * 内核生命周期
 * ------------------------------------------------------------------ */

/** 调用本地 Clash API。 */
async function clashApi<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await net.fetch(`http://127.0.0.1:${controllerPort}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${CONTROLLER_SECRET}`, ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`Clash API ${pathname} 返回 ${response.status}`)
  if (response.status === 204 || response.status === 205) return undefined as T
  const body = await response.text()
  return body.trim() ? (JSON.parse(body) as T) : (undefined as T)
}

/** 轮询控制端口，直到内核就绪或超时。 */
async function waitForController(): Promise<boolean> {
  const deadline = Date.now() + CONTROLLER_READY_TIMEOUT
  while (Date.now() < deadline) {
    try {
      const response = await net.fetch(`http://127.0.0.1:${controllerPort}/version`, {
        headers: { authorization: `Bearer ${CONTROLLER_SECRET}` },
      })
      if (response.ok) return true
    } catch {
      // 端口尚未监听，继续等待
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250))
  }
  return false
}

/** 过滤掉内核内置伪节点，只保留真实线路。 */
function realNodes(all?: string[]): string[] {
  return (all ?? []).filter((name) => !PSEUDO_NODES.has(name))
}

/** 读取手动组中的真实线路数，用于状态展示。 */
async function countNodes(): Promise<number> {
  try {
    const group = await clashApi<{ all?: string[] }>(
      `/proxies/${encodeURIComponent(MANUAL_GROUP)}`,
    )
    return realNodes(group.all).length
  } catch {
    return 0
  }
}

/** 读取订阅 provider 实际解析出的节点数。 */
async function countProviderNodes(): Promise<number> {
  try {
    const provider = await clashApi<{ proxies?: { name: string }[] }>(
      `/providers/proxies/${SUBSCRIPTION_PROVIDER}`,
    )
    return realNodes((provider.proxies ?? []).map((item) => item.name)).length
  } catch {
    return 0
  }
}

/** 启动代理核心。找不到内核或显式禁用时返回未启用状态，调用方据此跳过 setProxy。 */
export async function setupProxy(): Promise<ProxyStatus> {
  if (process.env.VIDDAY_DISABLE_PROXY === '1') {
    status = { ...status, enabled: false, reason: '已通过 VIDDAY_DISABLE_PROXY 禁用' }
    return status
  }

  const binary = resolveCoreBinary()
  if (!binary) {
    status = { ...status, enabled: false, reason: '未找到 mihomo 内核，已跳过代理' }
    return status
  }

  const config = readConfig()
  const hostNetwork = config.useHostNetwork ?? false
  mixedPort = config.mixedPort ?? DEFAULT_MIXED_PORT
  controllerPort = config.controllerPort ?? DEFAULT_CONTROLLER_PORT
  configDir = path.join(app.getPath('userData'), 'proxy')
  mkdirSync(configDir, { recursive: true })

  // 先拉订阅再起内核：内核用 file provider 只读本地文件，因此必须落盘在前
  subscription = await fetchSubscription(config)
  if (config.subscriptionUrl && !existsSync(subscriptionFilePath())) writeEmptySubscription()

  const { text, hasNodes } = buildConfig(config)
  const configPath = path.join(configDir, 'config.yaml')
  writeFileSync(configPath, text, 'utf8')

  core = spawn(binary, ['-f', configPath, '-d', configDir], { stdio: 'pipe' })
  core.stderr?.on('data', (chunk: Buffer) => {
    console.warn('[mihomo]', chunk.toString().trim())
  })
  core.on('exit', (code) => {
    core = null
    status = { ...status, enabled: false, reason: `内核已退出（code ${String(code)}）` }
  })

  const ready = await waitForController()
  if (ready && config.subscriptionUrl) {
    subscription = { ...subscription, nodeCount: await countProviderNodes() }
  }
  const lineCount = ready ? await countNodes() : 0

  let reason: string
  if (!ready) reason = '控制端口未就绪'
  else if (config.subscriptionUrl && !subscription.ok)
    reason = `已启用（${subscription.error ?? '订阅不可用'}，暂走直连）`
  else if (hasNodes) reason = '已启用'
  else reason = '已启用（无线路，走 DIRECT）'

  status = {
    enabled: ready,
    hostNetwork,
    reason,
    mixedPort,
    controllerPort,
    lineCount,
    subscription,
    recovery,
  }
  startRefreshTimer(config.subscriptionUrl ? (config.subscriptionInterval ?? DEFAULT_SUBSCRIPTION_INTERVAL) : 0)
  if (ready) {
    startRemoteConfigSync()
    startWatchdog()
  }
  return status
}

/**
 * 把本应用的 session 指向内置代理，或恢复为系统网络。
 * 仅影响该 session，不改系统代理。
 * - 内核未就绪 / 选择「使用本机网络」时：恢复 Chromium 默认的 system 模式（跟随系统代理设置）；
 * - 否则：指向本地混合端口。
 */
export async function applyProxyToSession(target: Session): Promise<void> {
  if (!status.enabled || status.hostNetwork) {
    await target.setProxy({ mode: 'system' })
    return
  }
  await target.setProxy({
    proxyRules: `socks5://127.0.0.1:${mixedPort}`,
    // 回环与本机地址直连：dev server、本地后端、Clash API 都不进代理
    proxyBypassRules: '<local>,localhost,127.0.0.1',
  })
}

/** 重新拉取订阅并让内核重载 provider（无需重启内核）。 */
async function refreshSubscription(): Promise<ProxyStatus> {
  const config = readConfig()
  if (!configDir) {
    configDir = path.join(app.getPath('userData'), 'proxy')
    mkdirSync(configDir, { recursive: true })
  }

  subscription = await fetchSubscription(config)
  if (status.enabled && config.subscriptionUrl) {
    try {
      // file provider 不会自行感知文件变化，需要显式让内核重载
      await clashApi(`/providers/proxies/${SUBSCRIPTION_PROVIDER}`, { method: 'PUT' })
      subscription = { ...subscription, nodeCount: await countProviderNodes() }
    } catch {
      // 内核未就绪时忽略；下次启动会重新加载文件
    }
  }

  status = {
    ...status,
    lineCount: status.enabled ? await countNodes() : status.lineCount,
    subscription,
  }
  return status
}

/** 按订阅间隔定时刷新；内核为 file provider，不会自行更新，需主进程驱动。interval<=0 表示不启用。 */
function startRefreshTimer(intervalSeconds: number): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (intervalSeconds <= 0) return
  refreshTimer = setInterval(() => {
    void refreshSubscription()
  }, intervalSeconds * 1000)
}

/* ------------------------------------------------------------------ *
 * 远端配置同步与出网看门狗
 * ------------------------------------------------------------------ */

/**
 * 拉取远端订阅地址。
 *
 * 必须用 Node 原生 fetch（走系统网络），**不能**经由本应用的内核代理——
 * 否则「所有节点失效」时连配置都拉不到，陷入「节点挂 → 拉不到配置 → 换不了节点」的死锁。
 * 返回 null 表示所有来源都失败（调用方保持现状），空串表示服务端未下发。
 */
async function fetchRemoteSubscriptionUrl(): Promise<string | null> {
  const source = configSource
  if (!source || source.bases.length === 0) return null

  for (const base of source.bases) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT)
    try {
      const headers: Record<string, string> = { accept: 'application/json' }
      if (source.appKey) headers['x-app-key'] = source.appKey
      const response = await fetch(`${base}/api/public/proxy-config`, {
        headers,
        signal: controller.signal,
      })
      if (!response.ok) continue
      const data = (await response.json()) as { subscriptionUrl?: unknown }
      if (typeof data.subscriptionUrl === 'string') return data.subscriptionUrl.trim()
    } catch {
      // 该来源不可达，尝试下一个兜底地址
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/**
 * 同步远端配置：订阅地址变化时热替换（不重启内核）。返回是否发生变更。
 * 地址未变或拉取失败均返回 false，交由调用方决定是否再拉一次订阅。
 */
async function syncRemoteProxyConfig(): Promise<boolean> {
  const url = await fetchRemoteSubscriptionUrl()
  if (url === null || url === '') return false

  const current = (readConfig().subscriptionUrl ?? '').trim()
  if (url === current) return false

  writeUserConfig({ subscriptionUrl: url })
  if (!status.enabled) return true
  if (current) {
    // 已有订阅 → provider 段不变，热重载即可，不中断播放
    await refreshSubscription()
    return true
  }
  // 从无到有 → provider 段新增，需重启内核
  teardownProxy()
  await setupProxy()
  return true
}

/** 按间隔例行同步远端配置，保证长时间驻留也能拿到最新订阅地址。 */
function startRemoteConfigSync(): void {
  if (remoteConfigTimer) {
    clearInterval(remoteConfigTimer)
    remoteConfigTimer = null
  }
  if (!configSource) return
  remoteConfigTimer = setInterval(() => {
    void syncRemoteProxyConfig()
  }, REMOTE_CONFIG_INTERVAL)
}

function stopRemoteConfigSync(): void {
  if (remoteConfigTimer) {
    clearInterval(remoteConfigTimer)
    remoteConfigTimer = null
  }
}

/** 经内核探测外网可达性：独立 session 指向混合端口，验证的是真实出口。 */
async function probeEgress(): Promise<boolean> {
  try {
    egressSession ??= session.fromPartition(EGRESS_PROBE_PARTITION)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EXTERNAL_PROBE_TIMEOUT)
    try {
      const response = await egressSession.fetch(EXTERNAL_PROBE_URL, { signal: controller.signal })
      return response.status === 204
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/**
 * 看门狗：内置代理接管中，若经代理出网连续失败，判定「所有节点失效」，
 * 自动重拉远端配置与订阅并热替换；仍不行则按指数退避稍后重试。
 */
async function watchdogTick(): Promise<void> {
  // 未启用内核 / 走本机网络 / 未配置订阅时不适用：此时看门狗没有「可恢复」的目标
  if (!status.enabled || status.hostNetwork || !status.subscription.configured) {
    egressFailures = 0
    recovery.consecutiveFailures = 0
    return
  }
  if (recovering) return

  if (await probeEgress()) {
    egressFailures = 0
    recovery.consecutiveFailures = 0
    recovery.nextAt = null
    recoveryBackoffIndex = 0
    nextRecoveryAt = 0
    return
  }

  egressFailures += 1
  recovery.consecutiveFailures = egressFailures
  if (egressFailures < EGRESS_FAILURE_THRESHOLD) return
  if (Date.now() < nextRecoveryAt) return

  recovering = true
  egressFailures = 0
  try {
    const changed = await syncRemoteProxyConfig()
    // 地址未变时也重拉一次订阅：可能只是订阅源 / 节点临时抖动
    if (!changed && status.enabled) await refreshSubscription()
  } catch {
    // 恢复失败，按退避稍后重试
  } finally {
    const step = Math.min(recoveryBackoffIndex, RECOVERY_BACKOFF_MS.length - 1)
    nextRecoveryAt = Date.now() + RECOVERY_BACKOFF_MS[step]
    recoveryBackoffIndex = Math.min(recoveryBackoffIndex + 1, RECOVERY_BACKOFF_MS.length - 1)
    recovery.count += 1
    recovery.lastAt = new Date().toISOString()
    recovery.nextAt = new Date(nextRecoveryAt).toISOString()
    recovery.consecutiveFailures = 0
    recovering = false
  }
}

function startWatchdog(): void {
  if (watchdogTimer) return
  void (async () => {
    egressSession ??= session.fromPartition(EGRESS_PROBE_PARTITION)
    await egressSession.setProxy({
      proxyRules: `socks5://127.0.0.1:${mixedPort}`,
      proxyBypassRules: '<local>,localhost,127.0.0.1',
    })
  })()
  watchdogTimer = setInterval(() => {
    void watchdogTick()
  }, EGRESS_PROBE_INTERVAL)
}

function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  egressFailures = 0
  recovery.consecutiveFailures = 0
}

/** 停止内核。 */
export function teardownProxy(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  stopRemoteConfigSync()
  stopWatchdog()
  if (core) {
    core.kill()
    core = null
  }
  if (status.enabled) status = { ...status, enabled: false, reason: '已停止' }
}

/* ------------------------------------------------------------------ *
 * 线路测试 IPC
 * ------------------------------------------------------------------ */

/** 列出所有选择器分组及其节点，供测试面板渲染。 */
async function listGroups(): Promise<ProxyGroupView[]> {
  // 注意：/proxies 返回的是 { proxies: {...} } 包了一层；单个 /proxies/{name} 才是不带壳的对象
  const payload = await clashApi<{
    proxies?: Record<
      string,
      { type?: string; now?: string; all?: string[] }
    >
  }>('/proxies')
  const proxies = payload.proxies ?? {}
  return Object.entries(proxies)
    .map(([name, entry]) => ({
      name,
      type: entry.type ?? 'Selector',
      now: entry.now ?? '',
      nodes: realNodes(entry.all).map((nodeName) => ({
        name: nodeName,
        type: proxies[nodeName]?.type ?? 'Proxy',
      })),
    }))
    .filter(
      (item) => item.nodes.length > 0 && !item.name.startsWith(TEST_GROUP_PREFIX),
    )
}

/** 对单个节点测速；订阅节点通过未参与实际路由的临时 selector 访问。 */
async function testDelay(name: string, slot = 0): Promise<NodeDelay> {
  const testGroup = `${TEST_GROUP_PREFIX}${(slot % TEST_GROUP_COUNT) + 1}`
  let selectedInTestGroup = false

  try {
    await clashApi(`/proxies/${encodeURIComponent(testGroup)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    selectedInTestGroup = true
  } catch {
    // 静态 proxies 不在订阅测试组中，继续使用其独立 API 资源测速。
  }

  try {
    const search = new URLSearchParams({ timeout: String(DELAY_TEST_TIMEOUT), url: DELAY_TEST_URL })
    const result = await clashApi<{ delay: number }>(
      `/proxies/${encodeURIComponent(selectedInTestGroup ? testGroup : name)}/delay?${search.toString()}`,
    )
    return { name, delay: Number.isFinite(result.delay) ? result.delay : null }
  } catch {
    return { name, delay: null }
  }
}

/** 注册渲染层可调用的代理 IPC。 */
export function registerProxyIpc(): void {
  ipcMain.handle('proxy:status', (): ProxyStatus => status)

  ipcMain.handle('proxy:restart', async (): Promise<ProxyStatus> => {
    teardownProxy()
    return setupProxy()
  })

  ipcMain.handle('proxy:refresh-subscription', (): Promise<ProxyStatus> => refreshSubscription())

  // 当前生效的订阅地址（用户级配置优先）
  ipcMain.handle('proxy:get-subscription', (): string => readConfig().subscriptionUrl ?? '')

  // 渲染层注册远端配置来源（后端地址 + app key）。主进程据此拉取配置与订阅：
  // 拉取必须走系统网络、绕开内核，故只能由主进程发起。
  ipcMain.handle(
    'proxy:set-config-source',
    (_event, source: ProxyConfigSource): void => {
      configSource = {
        bases: Array.isArray(source?.bases)
          ? source.bases
              .filter((base): base is string => typeof base === 'string' && base.trim().length > 0)
              .map((base) => base.trim().replace(/\/+$/, ''))
          : [],
        appKey: typeof source?.appKey === 'string' ? source.appKey : '',
      }
      startRemoteConfigSync()
      void syncRemoteProxyConfig()
    },
  )

  // 保存新的订阅地址。仅当「有订阅 <-> 无订阅」切换（provider 段增删）时才重启内核；
  // 单纯更换地址走热重载，不中断正在播放的内容，实现用户无感替换。
  ipcMain.handle('proxy:set-subscription', async (_event, url: string): Promise<ProxyStatus> => {
    const next = url.trim()
    const hadSubscription = Boolean(readConfig().subscriptionUrl)
    writeUserConfig({ subscriptionUrl: next })
    if (status.enabled && hadSubscription === Boolean(next)) {
      return refreshSubscription()
    }
    teardownProxy()
    return setupProxy()
  })

  ipcMain.handle('proxy:groups', async (): Promise<ProxyGroupView[]> => {
    if (!status.enabled) return []
    return listGroups()
  })

  // 切换网络出口：本机（系统）网络 <-> 应用内置内核代理。内核保持运行，仅切换本应用的 session。
  ipcMain.handle(
    'proxy:set-host-network',
    async (_event, enabled: boolean): Promise<ProxyStatus> => {
      writeUserConfig({ useHostNetwork: enabled })
      status = { ...status, hostNetwork: enabled }
      // 立即生效：切到系统网络时恢复 system 模式，切回内置网络时重新指向本地端口
      await applyProxyToSession(session.defaultSession)
      // mihomo/系统代理只影响新建连接，断开既有连接使 App 流量立刻切换出口
      await session.defaultSession.closeAllConnections()
      return status
    },
  )

  ipcMain.handle(
    'proxy:select',
    async (_event, group: string, node: string, activateRoute?: string): Promise<void> => {
      await clashApi(`/proxies/${encodeURIComponent(group)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: node }),
      })
      if (activateRoute) {
        await clashApi(`/proxies/${encodeURIComponent(PROXY_GROUP)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: activateRoute }),
        })
      }
      // mihomo 只改变新建连接的出口；关闭 Chromium 连接池使 App 流量立即切到新线路。
      await session.defaultSession.closeAllConnections()
    },
  )

  ipcMain.handle(
    'proxy:delay',
    async (_event, node: string, slot?: number): Promise<NodeDelay> => testDelay(node, slot),
  )
}
