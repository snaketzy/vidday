/**
 * Web 播放器 QoE 采集器：把一次播放会话的体验指标汇总后上报服务端。
 *
 * 采集口径（一次播放 = 一个会话）：
 *  - 起播耗时 TTFF：创建会话 → 首帧渲染（含播放器预缓冲闸门等待）
 *  - 卡顿：waiting → playing 之间的时长与次数
 *  - 码率：按播放时长对当前档位码率做时间加权平均，并记录峰值
 *  - 切档：档位切换次数（首次落档不计）
 *  - 掉帧：解码 / 丢帧计数
 *  - 错误：播放内核致命 / 非致命错误
 * 另按事件明细上报：ttff / stall / level_switch / error / end，供后台下钻。
 *
 * 上报策略：每秒采样一次，每 15s 汇总上报一次；暂停 / 页面隐藏 / 组件卸载
 * 触发即时上报，卸载时补一次带 endedAt 的收尾上报。全链路失败静默，不阻塞播放。
 */
import {
  PUBLIC_SCHEMA_VERSION,
  reportQoe,
  type PublicQoeEventInput,
  type PublicQoeSessionUpsert,
  type QoeClient,
} from '@/lib/public-api'

/** 会话所属内容信息（快照，便于后台直接展示）。 */
export interface QoeSessionMeta {
  titleId?: number | null
  episodeId?: number | null
  contentType?: string | null
  titleName?: string | null
  playUrl?: string | null
}

/** 采样回调：返回当前播放器快照，由播放器侧读取真实内核数据。 */
export interface QoeSample {
  positionMs?: number
  durationMs?: number
  totalFrames?: number
  droppedFrames?: number
  /** 当前档位码率（kbps）；取不到为 null */
  bitrateKbps?: number | null
}

export interface QoeTrackerOptions {
  meta: QoeSessionMeta
  /** 每秒采样一次；缺省则只统计事件类指标 */
  sample?: () => QoeSample
  client?: QoeClient
  /** 上报间隔（毫秒），默认 15s */
  flushIntervalMs?: number
}

const TICK_MS = 1000
const DEFAULT_FLUSH_INTERVAL_MS = 15_000
/** 本地积压事件上限：超出丢弃最旧的，避免长时间离线导致内存膨胀 */
const MAX_PENDING_EVENTS = 300
/** 单次上报携带的事件条数上限（与服务端一致） */
const MAX_EVENTS_PER_REPORT = 100

/** 生成会话标识：满足服务端 ^[A-Za-z0-9._-]{8,64}$。 */
function createSessionId(client: QoeClient): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${client}-${Date.now().toString(36)}-${rand}`
}

export class QoeTracker {
  private readonly sessionId: string
  private readonly client: QoeClient
  private readonly meta: QoeSessionMeta
  private readonly sample: (() => QoeSample) | undefined
  private readonly flushIntervalMs: number
  private readonly startedAt: string
  private readonly startPerf: number

  private endedAt: string | null = null
  private ttffMs: number | null = null

  /** 播放中累计时长（毫秒），用于码率加权与有效观看时长 */
  private watchedMs = 0
  private playing = false
  private lastTickPerf: number
  private lastFlushPerf: number

  private durationMs = 0
  private rebufferCount = 0
  private rebufferMs = 0
  private stallSincePerf: number | null = null

  private currentBitrateKbps: number | null = null
  private bitrateWeightedKbpsMs = 0
  private bitrateWeightMs = 0
  private peakBitrateKbps: number | null = null
  /** 首次落档不计入切换次数 */
  private levelSeen = false
  private switchCount = 0

  private errorCount = 0
  private droppedFrames = 0
  private totalFrames = 0

  private pendingEvents: PublicQoeEventInput[] = []
  private disposed = false
  private tickTimer: number | undefined
  private readonly onVisibilityChange: () => void

  constructor(options: QoeTrackerOptions) {
    this.client = options.client ?? 'web'
    this.meta = options.meta
    this.sample = options.sample
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.sessionId = createSessionId(this.client)
    this.startedAt = new Date().toISOString()
    this.startPerf = performance.now()
    this.lastTickPerf = this.startPerf
    this.lastFlushPerf = this.startPerf

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void this.flush()
    }
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  /** 首帧渲染：计算起播耗时并记录 ttff 事件。 */
  markFirstFrame(): void {
    if (this.ttffMs !== null) return
    const now = performance.now()
    this.ttffMs = Math.max(0, Math.round(now - this.startPerf))
    this.pushEvent({
      type: 'ttff',
      eventAt: new Date().toISOString(),
      valueMs: this.ttffMs,
      severity: this.ttffMs > 5000 ? 'warn' : 'info',
      message: `起播耗时 ${this.ttffMs}ms`,
    })
    void this.flush()
  }

  /** 播放 / 暂停状态变化。 */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return
    // 结算上一段播放时长：tick 只按固定节拍累计，这里补上间隙
    this.accrue(this.lastTickPerf)
    this.playing = playing
    if (!playing) void this.flush()
  }

  /** 进入缓冲（waiting）。 */
  beginStall(positionMs?: number): void {
    if (this.stallSincePerf !== null) return
    this.stallSincePerf = performance.now()
    this.pushEvent({
      type: 'stall',
      eventAt: new Date().toISOString(),
      positionMs: positionMs ?? null,
      severity: 'warn',
      message: '开始缓冲',
    })
  }

  /** 缓冲结束（playing）。 */
  endStall(positionMs?: number): void {
    if (this.stallSincePerf === null) return
    const duration = Math.max(0, Math.round(performance.now() - this.stallSincePerf))
    this.stallSincePerf = null
    this.rebufferCount += 1
    this.rebufferMs += duration
    this.pushEvent({
      type: 'stall',
      eventAt: new Date().toISOString(),
      positionMs: positionMs ?? null,
      valueMs: duration,
      severity: duration > 2000 ? 'warn' : 'info',
      message: `卡顿 ${duration}ms`,
    })
  }

  /** 档位切换（hls LEVEL_SWITCHED）。 */
  noteLevel(level: { height?: number | null; bitrateKbps?: number | null }, positionMs?: number): void {
    if (level.bitrateKbps != null && level.bitrateKbps > 0) {
      this.currentBitrateKbps = Math.round(level.bitrateKbps)
      this.peakBitrateKbps = Math.max(this.peakBitrateKbps ?? 0, this.currentBitrateKbps)
    }
    // 首次落档只记录当前档位，不计入切换次数
    if (!this.levelSeen) {
      this.levelSeen = true
      return
    }
    this.switchCount += 1
    this.pushEvent({
      type: 'level_switch',
      eventAt: new Date().toISOString(),
      positionMs: positionMs ?? null,
      valueNum: level.height ?? this.currentBitrateKbps ?? null,
      severity: 'info',
      message: level.height ? `切换到 ${level.height}p` : '切换档位',
    })
  }

  /** 播放内核错误。 */
  noteError(message: string, fatal = false): void {
    this.errorCount += 1
    this.pushEvent({
      type: 'error',
      eventAt: new Date().toISOString(),
      severity: fatal ? 'error' : 'warn',
      message: message.slice(0, 512),
    })
    if (fatal) void this.flush()
  }

  /** 卸载：补收尾事件并做一次带 endedAt 的最终上报。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.accrue(this.lastTickPerf)
    this.playing = false
    // 未闭合的卡顿按当前时刻收尾
    if (this.stallSincePerf !== null) this.endStall()
    if (this.tickTimer !== undefined) window.clearInterval(this.tickTimer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
    this.endedAt = new Date().toISOString()
    this.pushEvent({
      type: 'end',
      eventAt: this.endedAt,
      valueMs: Math.round(this.watchedMs),
      severity: 'info',
      message: '会话结束',
    })
    void this.flush()
  }

  private accrue(untilPerf: number): void {
    const dt = untilPerf - this.lastTickPerf
    if (dt <= 0) return
    this.lastTickPerf = untilPerf
    if (this.playing) {
      this.watchedMs += dt
      const kbps = this.currentBitrateKbps
      if (kbps != null && kbps > 0) {
        this.bitrateWeightedKbpsMs += kbps * dt
        this.bitrateWeightMs += dt
      }
    }
  }

  private tick(): void {
    if (this.disposed) return
    const now = performance.now()
    this.accrue(now)

    const snapshot = this.sample?.()
    if (snapshot) {
      if (typeof snapshot.durationMs === 'number' && snapshot.durationMs > 0) {
        this.durationMs = Math.round(snapshot.durationMs)
      }
      if (typeof snapshot.totalFrames === 'number') this.totalFrames = Math.max(this.totalFrames, snapshot.totalFrames)
      if (typeof snapshot.droppedFrames === 'number') {
        this.droppedFrames = Math.max(this.droppedFrames, snapshot.droppedFrames)
      }
      if (snapshot.bitrateKbps != null && snapshot.bitrateKbps > 0) {
        this.currentBitrateKbps = Math.round(snapshot.bitrateKbps)
        this.peakBitrateKbps = Math.max(this.peakBitrateKbps ?? 0, this.currentBitrateKbps)
      }
    }

    if (now - this.lastFlushPerf >= this.flushIntervalMs) {
      this.lastFlushPerf = now
      void this.flush()
    }
  }

  private averageBitrate(): number | null {
    if (this.bitrateWeightMs > 0) return Math.round(this.bitrateWeightedKbpsMs / this.bitrateWeightMs)
    return this.currentBitrateKbps
  }

  private pushEvent(event: PublicQoeEventInput): void {
    this.pendingEvents.push(event)
    if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
      this.pendingEvents.splice(0, this.pendingEvents.length - MAX_PENDING_EVENTS)
    }
  }

  private buildSession(): PublicQoeSessionUpsert {
    return {
      sessionId: this.sessionId,
      client: this.client,
      titleId: this.meta.titleId ?? null,
      episodeId: this.meta.episodeId ?? null,
      contentType: this.meta.contentType ?? null,
      titleName: this.meta.titleName ?? null,
      playUrl: this.meta.playUrl ?? null,
      ttffMs: this.ttffMs,
      durationMs: Math.round(this.durationMs),
      watchedMs: Math.round(this.watchedMs),
      rebufferCount: this.rebufferCount,
      rebufferMs: Math.round(this.rebufferMs),
      avgBitrateKbps: this.averageBitrate(),
      peakBitrateKbps: this.peakBitrateKbps,
      switchCount: this.switchCount,
      errorCount: this.errorCount,
      droppedFrames: this.droppedFrames,
      totalFrames: this.totalFrames,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    }
  }

  private async flush(): Promise<void> {
    const session = this.buildSession()
    const events = this.pendingEvents.splice(0, MAX_EVENTS_PER_REPORT)
    try {
      await reportQoe({ schemaVersion: PUBLIC_SCHEMA_VERSION, session, events })
    } catch {
      // 上报尽力而为：失败把事件放回队首，下次重试
      if (events.length > 0) this.pendingEvents.unshift(...events)
    }
  }
}
