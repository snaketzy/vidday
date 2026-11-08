import { useCallback, useEffect, useState } from 'react'
import { cn } from 'cn'
import {
  Activity,
  Check,
  CircleDot,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

/** 代理核心（mihomo）的分组名，需与 `electron/proxy.ts` 的 PROXY_GROUP 保持一致。 */
const PROXY_GROUP = 'PROXY'
const MANUAL_GROUP = '手动切换'

type DelayState = Record<string, number | null>

const GROUP_ICONS: Record<string, typeof CircleDot> = {
  Selector: CircleDot,
  URLTest: Activity,
  Fallback: ShieldCheck,
}

function groupTypeLabel(type: string): string {
  if (type === 'URLTest') return '自动选择'
  if (type === 'Fallback') return '故障转移'
  return '手动切换'
}

/** 延迟对应的颜色：越快越绿，便于一眼比较线路质量。 */
function delayTone(delay: number | null): string {
  if (delay === null) return 'text-rose-400'
  if (delay < 200) return 'text-emerald-400'
  if (delay < 500) return 'text-amber-400'
  return 'text-rose-400'
}

function delayLabel(delay: number | null): string {
  return delay === null ? '超时' : `${delay} ms`
}

/** 把 ISO 时间格式化为本地 HH:mm:ss，便于观察看门狗触发时序。 */
function formatClock(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function protocolLabel(type: string): string {
  const normalized = type.toLowerCase()
  const labels: Record<string, string> = {
    shadowsocks: 'SS',
    ss: 'SS',
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    hysteria: 'Hysteria',
    hysteria2: 'Hysteria2',
    tuic: 'TUIC',
    wireguard: 'WireGuard',
    socks5: 'SOCKS5',
    http: 'HTTP',
  }
  return labels[normalized] ?? type
}

/** 并发执行任务并限制同时在跑的数量，避免批量测速瞬间打爆控制端口。 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, slot: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, (_, slot) =>
    (async () => {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1
        await worker(item, slot)
      }
    })(),
  )
  await Promise.all(runners)
}

/**
 * 内置代理的线路测试面板，显示在「播放线路」页。
 * 只在 Electron 桌面版可用；普通浏览器下 `window.vidday` 不存在，仅展示提示。
 */
export function NetworkPanel() {
  const proxy = window.vidday?.proxy

  const [status, setStatus] = useState<ViddayProxyStatus | null>(null)
  const [groups, setGroups] = useState<ViddayProxyGroup[]>([])
  const [delays, setDelays] = useState<DelayState>({})
  const [testing, setTesting] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<'refresh' | 'restart' | 'all' | null>(null)
  const [subUrl, setSubUrl] = useState('')
  const [savingSub, setSavingSub] = useState(false)
  const [nodeQuery, setNodeQuery] = useState('')
  const [switching, setSwitching] = useState(false)
  const [switchingNetwork, setSwitchingNetwork] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [switchFeedback, setSwitchFeedback] = useState<{
    message: string
    error: boolean
  } | null>(null)

  const routeGroup = groups.find((item) => item.name === PROXY_GROUP) ?? null
  /** 当前是否走本机（系统）网络；false 表示由应用内置内核转发 */
  const hostNetwork = status?.hostNetwork ?? false
  const visibleGroups = groups.filter(
    (item) => item.name !== PROXY_GROUP && item.name !== 'GLOBAL' && item.nodes.length > 0,
  )
  const activeGroup =
    visibleGroups.find((item) => item.name === routeGroup?.now) ??
    visibleGroups.find((item) => item.name === MANUAL_GROUP) ??
    visibleGroups[0] ??
    null
  const nodes = activeGroup?.nodes ?? []
  const filteredNodes = nodes.filter((node) =>
    node.name.toLowerCase().includes(nodeQuery.trim().toLowerCase()),
  )

  const load = useCallback(async () => {
    if (!proxy) return
    const nextStatus = await proxy.status()
    setStatus(nextStatus)
    setGroups(nextStatus.enabled ? await proxy.groups() : [])
    setSubUrl(await proxy.getSubscription())
  }, [proxy])

  useEffect(() => {
    void load()
  }, [load])

  const handleRefresh = async () => {
    if (!proxy) return
    setBusy('refresh')
    try {
      // 重新拉取订阅并让内核重载 provider，再刷新分组
      const nextStatus = await proxy.refreshSubscription()
      setStatus(nextStatus)
      setGroups(nextStatus.enabled ? await proxy.groups() : [])
    } finally {
      setBusy(null)
    }
  }

  const handleSaveSub = async () => {
    if (!proxy) return
    setSavingSub(true)
    setDelays({})
    try {
      // 保存后主进程会按新地址重新拉取；单纯换地址走热重载，不重启内核
      const nextStatus = await proxy.setSubscription(subUrl.trim())
      setStatus(nextStatus)
      setGroups(nextStatus.enabled ? await proxy.groups() : [])
    } finally {
      setSavingSub(false)
    }
  }

  const handleRestart = async () => {
    if (!proxy) return
    setBusy('restart')
    setDelays({})
    try {
      const nextStatus = await proxy.restart()
      setStatus(nextStatus)
      setGroups(nextStatus.enabled ? await proxy.groups() : [])
    } finally {
      setBusy(null)
    }
  }

  const testOne = async (node: string, slot = 0): Promise<void> => {
    if (!proxy) return
    setTesting((prev) => new Set(prev).add(node))
    try {
      const result = await proxy.delay(node, slot)
      setDelays((prev) => ({ ...prev, [result.name]: result.delay }))
    } finally {
      setTesting((prev) => {
        const next = new Set(prev)
        next.delete(node)
        return next
      })
    }
  }

  const handleTestAll = async () => {
    if (!proxy || nodes.length === 0) return
    setBusy('all')
    setDelays({})
    try {
      await runWithConcurrency(nodes, 6, (node, slot) => testOne(node.name, slot))
    } finally {
      setBusy(null)
    }
  }

  const handleChooseGroup = async (group: ViddayProxyGroup) => {
    if (!proxy || !routeGroup || routeGroup.now === group.name) return
    setSwitching(true)
    setSwitchFeedback(null)
    try {
      await proxy.select(PROXY_GROUP, group.name)
      setGroups((prev) =>
        prev.map((item) =>
          item.name === PROXY_GROUP ? { ...item, now: group.name } : item,
        ),
      )
      setSwitchFeedback({ message: `已切换到「${group.name}」`, error: false })
    } catch (error) {
      setSwitchFeedback({
        message: error instanceof Error ? error.message : '切换代理组失败',
        error: true,
      })
    } finally {
      setSwitching(false)
    }
  }

  const handleSelectNode = async (nodeName: string) => {
    if (!proxy || !activeGroup || activeGroup.type !== 'Selector') return
    if (activeGroup.now === nodeName && routeGroup?.now === activeGroup.name) return
    setSwitching(true)
    setSwitchFeedback(null)
    try {
      await proxy.select(
        activeGroup.name,
        nodeName,
        routeGroup?.now === activeGroup.name ? undefined : activeGroup.name,
      )
      setGroups((prev) =>
        prev.map((item) => {
          if (item.name === activeGroup.name) return { ...item, now: nodeName }
          if (item.name === PROXY_GROUP) return { ...item, now: activeGroup.name }
          return item
        }),
      )
      setSwitchFeedback({ message: `已切换到「${nodeName}」`, error: false })
    } catch (error) {
      setSwitchFeedback({
        message: error instanceof Error ? error.message : '切换节点失败',
        error: true,
      })
    } finally {
      setSwitching(false)
    }
  }

  const handleToggleHostNetwork = async (next: boolean) => {
    if (!proxy) return
    setSwitchingNetwork(true)
    setNetworkError(null)
    try {
      // 主进程会即时重设 session 出口并断开既有连接；内核保持运行
      const updated = await proxy.setHostNetwork(next)
      setStatus(updated)
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : '切换网络出口失败')
    } finally {
      setSwitchingNetwork(false)
    }
  }

  if (!proxy) {
    return (
      <section className="mt-6 rounded-md border border-white/10 bg-[#181818] p-6">
        <h2 className="text-base font-semibold text-white/90">线路与网络</h2>
        <p className="mt-1 text-xs text-white/45">
          内置代理仅在 Vidday 桌面版可用；当前运行在浏览器中，未接入本地内核。
        </p>
      </section>
    )
  }

  const sub = status?.subscription
  const subValue = !sub
    ? '—'
    : !sub.configured
      ? '未配置'
      : sub.ok
        ? `已更新 · ${sub.nodeCount} 条`
        : (sub.error ?? '拉取失败')

  const groupPriority = [MANUAL_GROUP, '自动选择', '故障转移']
  const sortedGroups = [...visibleGroups].sort((left, right) => {
    const leftIndex = groupPriority.indexOf(left.name)
    const rightIndex = groupPriority.indexOf(right.name)
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    }
    return left.name.localeCompare(right.name)
  })

  const statusRows: { label: string; value: string; tone?: string }[] = [
    { label: '状态', value: status?.reason ?? '读取中…' },
    { label: '订阅', value: subValue, tone: sub && sub.configured && !sub.ok ? 'text-rose-300' : undefined },
    { label: '混合端口', value: status ? String(status.mixedPort) : '—' },
    { label: '控制端口', value: status ? String(status.controllerPort) : '—' },
    { label: '线路数量', value: status ? String(status.lineCount) : '—' },
  ]

  // 仅开发版可见：暴露看门狗的自动恢复情况，便于验证「节点全失效 → 自动重拉配置」
  if (import.meta.env.DEV) {
    const recovery = status?.recovery
    statusRows.push(
      { label: '连续失败', value: recovery ? `${recovery.consecutiveFailures} / 3` : '—' },
      {
        label: '自动恢复',
        value: recovery && recovery.count > 0 ? `${recovery.count} 次` : '未触发',
        tone: recovery && recovery.count > 0 ? 'text-amber-300' : undefined,
      },
      { label: '最近恢复', value: formatClock(recovery?.lastAt ?? null) },
      { label: '下次重试', value: formatClock(recovery?.nextAt ?? null) },
    )
  }

  const badgeTone = !status?.enabled
    ? 'bg-white/10 text-white/50'
    : hostNetwork
      ? 'bg-amber-500/15 text-amber-300'
      : 'bg-emerald-500/15 text-emerald-300'
  const badgeLabel = !status?.enabled ? '未启用' : hostNetwork ? '走本机网络' : '已接管'

  return (
    <section className="mt-6 rounded-md border border-white/10 bg-[#181818] p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white/90">线路与网络</h2>
          <p className="mt-1 text-xs text-white/45">
            应用内流量默认经本地内核（mihomo）转发，不修改系统代理，仅对本应用生效；也可改用本机网络。
          </p>
        </div>
        <Badge className={cn('shrink-0 gap-1', badgeTone)}>
          {status?.enabled ? <Wifi /> : <WifiOff />}
          {badgeLabel}
        </Badge>
      </div>

      {/* 网络出口切换：本机（系统）网络 <-> 应用内置内核代理 */}
      <div className="mt-5 rounded-lg border border-white/10 bg-[#101010] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label
              htmlFor="vidday-host-network"
              className="text-sm font-medium text-white/90"
            >
              使用本机网络
            </label>
            <p className="mt-1 text-xs text-white/45">
              开启后停用内置内核代理，本应用流量改用本机网络（跟随系统代理设置）。
            </p>
          </div>
          <Switch
            id="vidday-host-network"
            checked={hostNetwork}
            onCheckedChange={(next) => void handleToggleHostNetwork(next)}
            disabled={!status?.enabled || switchingNetwork}
            aria-label="使用本机网络"
          />
        </div>
        <p
          className={cn(
            'mt-3 text-xs',
            switchingNetwork || !status?.enabled
              ? 'text-white/45'
              : hostNetwork
                ? 'text-amber-300'
                : 'text-emerald-300',
          )}
        >
          {switchingNetwork
            ? '正在切换网络出口…'
            : !status?.enabled
              ? '内核未启用，本应用当前走本机网络'
              : hostNetwork
                ? '已走本机网络（内核代理未接管本应用）'
                : '已走应用内置网络'}
        </p>
        {networkError ? (
          <p className="mt-1 text-xs text-rose-300">{networkError}</p>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        {statusRows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 border-b border-white/5 pb-2">
            <dt className="shrink-0 text-white/45">{row.label}</dt>
            <dd className={cn('text-right text-white/85', row.tone)}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {/* 订阅地址可配置：仅开发版可见；正式版不暴露该入口，换线路来源无需改动仓库文件 */}
      {import.meta.env.DEV ? (
        <div className="mt-4">
          <label className="text-xs text-white/45" htmlFor="vidday-sub-url">
            订阅地址
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="vidday-sub-url"
              value={subUrl}
              onChange={(event) => setSubUrl(event.target.value)}
              spellCheck={false}
              placeholder="https://example.com/api/v1/subscribe?token=..."
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#101010] px-3 py-2 text-xs text-white/85 outline-none placeholder:text-white/25 focus:border-white/40"
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 border-white/25 bg-transparent text-white/80 hover:border-white hover:bg-white/10 hover:text-white"
              onClick={handleSaveSub}
              disabled={busy !== null || savingSub}
            >
              {savingSub ? <Loader2 className="animate-spin" /> : <Save />}
              保存并更新
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-white/35">
            保存后会按新地址重新拉取；单纯换地址走热重载，不重启内核。若地址不变、只想重试，点「刷新」即可。
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-white/25 bg-transparent text-white/80 hover:border-white hover:bg-white/10 hover:text-white"
          onClick={handleRestart}
          disabled={busy !== null || savingSub}
        >
          {busy === 'restart' ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RotateCw />
          )}
          重启内核
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={handleRefresh}
          disabled={busy !== null || savingSub}
        >
          {busy === 'refresh' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          刷新
        </Button>
      </div>

      <div className="mt-7 border-t border-white/10 pt-6">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">代理组</h3>
            <p className="mt-1 text-xs text-white/40">
              Proxy Groups · 切换会重连 App 网络，播放内容可能短暂缓冲
            </p>
          </div>
          <Badge variant="outline" className="border-white/15 text-white/55">
            {sortedGroups.length} 组
          </Badge>
          {switching ? (
            <Badge className="gap-1 bg-brand/15 text-brand">
              <Loader2 className="animate-spin" />
              正在重连
            </Badge>
          ) : switchFeedback ? (
            <span className={cn('text-xs', switchFeedback.error ? 'text-rose-300' : 'text-emerald-300')}>
              {switchFeedback.message}
            </span>
          ) : null}
        </div>

        {sortedGroups.length > 0 ? (
          <ul className="mt-4 grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {sortedGroups.map((group) => {
              const isActive = routeGroup?.now === group.name
              const GroupIcon = GROUP_ICONS[group.type] ?? CircleDot
              return (
                <li key={group.name}>
                  <button
                    type="button"
                    onClick={() => void handleChooseGroup(group)}
                    disabled={!status?.enabled || switching}
                    className={cn(
                      'flex min-h-24 w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                      isActive
                        ? 'border-brand/60 bg-brand/10'
                        : 'border-white/10 bg-[#22232c] hover:border-white/25 hover:bg-white/[0.06]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md',
                        isActive ? 'bg-brand/20 text-brand' : 'bg-white/5 text-white/65',
                      )}
                    >
                      <GroupIcon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white/90">
                          {group.name}
                        </span>
                        {isActive ? <Check className="size-4 shrink-0 text-brand" /> : null}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="h-5 border-brand/50 px-1.5 text-[10px] font-normal text-brand"
                        >
                          {group.type}
                        </Badge>
                        <span className="truncate text-xs text-white/45">
                          {group.nodes.length} 条线路
                        </span>
                      </span>
                      <span className="mt-2 block truncate text-xs text-white/60">
                        当前 · {group.now || '等待选择'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-white/5 bg-black/30 px-3 py-6 text-center text-xs text-white/40">
            {status?.enabled
              ? (sub?.configured && sub.error
                  ? sub.error
                  : '暂时没有可用代理组，请刷新订阅或重启内核。')
              : '代理核心未启用。'}
          </p>
        )}

        <div className="mt-7 border-t border-white/10 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-white">
                {activeGroup?.name ?? '节点列表'}
              </h3>
              <p className="mt-1 text-xs text-white/40">
                {activeGroup
                  ? `${groupTypeLabel(activeGroup.type)} · ${nodes.length} 条线路`
                  : '选择一个代理组查看线路'}
                {activeGroup && activeGroup.type !== 'Selector' ? ' · 节点由内核自动选择' : ''}
              </p>
            </div>
            <label className="relative min-w-40 flex-1 sm:max-w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <input
                value={nodeQuery}
                onChange={(event) => setNodeQuery(event.target.value)}
                placeholder="搜索节点"
                className="h-9 w-full rounded-md border border-white/10 bg-black/25 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/30"
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-brand hover:bg-brand/10 hover:text-brand"
              onClick={handleTestAll}
              disabled={busy !== null || nodes.length === 0}
            >
              {busy === 'all' ? <Loader2 className="animate-spin" /> : <Zap />}
              全部测速
            </Button>
          </div>

          {filteredNodes.length === 0 ? (
            <p className="mt-4 rounded-lg border border-white/5 bg-black/30 px-3 py-8 text-center text-xs text-white/40">
              {nodes.length > 0 ? '没有匹配的节点' : '该组暂时没有节点'}
            </p>
          ) : (
            <ul className="mt-4 grid max-h-[28rem] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredNodes.map((node) => {
                const isNow = activeGroup?.now === node.name
                const isTesting = testing.has(node.name)
                const tested = Object.prototype.hasOwnProperty.call(delays, node.name)
                const delay = delays[node.name] ?? null
                const canSelect = activeGroup?.type === 'Selector'
                return (
                  <li
                    key={node.name}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      isNow ? 'border-brand/60 bg-brand/10' : 'border-white/10 bg-[#22232c]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectNode(node.name)}
                      disabled={!status?.enabled || !canSelect || switching}
                      className="w-full text-left disabled:cursor-default"
                      title={canSelect ? '切换到此节点' : '自动组由 mihomo 选择当前节点'}
                    >
                      <span className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-white/35" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">
                          {node.name}
                        </span>
                        {isNow ? <Check className="size-4 shrink-0 text-brand" /> : null}
                      </span>
                      <span className="mt-3 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="h-5 border-white/20 px-1.5 text-[10px] font-normal text-white/60"
                        >
                          {protocolLabel(node.type)}
                        </Badge>
                        {isNow ? (
                          <span className="text-[10px] text-brand">当前线路</span>
                        ) : null}
                        {activeGroup?.type !== 'Selector' && isNow ? (
                          <span className="text-[10px] text-white/40">自动选中</span>
                        ) : null}
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          isTesting ? 'text-white/40' : tested ? delayTone(delay) : 'text-white/45',
                        )}
                      >
                        {isTesting ? '测速中…' : tested ? delayLabel(delay) : '未测速'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-white/50 hover:bg-white/10 hover:text-white"
                        onClick={() => void testOne(node.name)}
                        disabled={isTesting || busy === 'all'}
                        aria-label={`测试 ${node.name} 的延迟`}
                      >
                        <Zap />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
