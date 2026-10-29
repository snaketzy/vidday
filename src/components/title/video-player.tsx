import Hls from 'hls.js'
import {
  ArrowLeft,
  Captions,
  Film,
  Gauge,
  Languages,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { cn } from 'cn'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { backdrop } from '@/lib/art'
import { formatTime } from '@/lib/format'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  DEFAULT_QUALITY,
  PLAYBACK_RATES,
  SUBTITLE_OFF,
  endSession,
  loadSession,
  markEnded,
  seek,
  selectPlayer,
  setAudio,
  setAutoplayNext,
  setBuffering,
  setControlsVisible,
  setDuration,
  setFullscreen,
  setMediaTracks,
  setMuted,
  setPlaying,
  setPosition,
  setQuality,
  setRate,
  setSubtitle,
  setVolume,
  toggleMute,
  type MediaTrackOption,
  type Quality,
} from '@/store/slices/player-slice'
import { recordProgress } from '@/store/slices/watch-slice'
import type { Episode, Title } from '@/types'

/**
 * 播放源：Cloudflare Stream 多码率 HLS master playlist，
 * 轨道信息（音轨 / 字幕）在装载后从播放内核读取，不做写死。
 */
const SOURCE_URL =
  // import.meta.env.VITE_SOURCE_URL ||
  // 'https://customer-juxwzlg9p7suy0ju.cloudflarestream.com/66d514fd69385d3e701c8c9b96ff107b/manifest/video.m3u8'
  // 'http://media.laybackzzz.com/test/winnie/hls/master.m3u8'
  'http://media.laybackzzz.com/HLS/tt22022452/HEVC/master.m3u8'
const CONTROLS_TIMEOUT = 3200

/** Stats for nerds 是调试能力，仅在开发环境提供，生产构建下彻底不出现 */
const STATS_FOR_NERDS_ENABLED = import.meta.env.DEV

/** 演示用广告素材：本地自托管实拍素材（Pexels，2K 2560×1440，约 33s） */
const AD_SOURCE = '/ads/ad-sample.mp4'
/** 中插广告间隔（秒）：正片每播放 60s 触发一次 */
const AD_INTERVAL = 60
/** 广告可跳过前的强制观看时长（秒） */
const AD_SKIP_AFTER = 5

const controlClass = 'text-white hover:bg-white/15 focus-visible:ring-white/40'
const menuClass = 'border-white/10 bg-[#181818] text-white'

/** 由轨道高度推导展示名 */
const heightLabel = (height: number) => (height >= 2160 ? '4K' : `${height}p`)

const clampPercent = (value: number, max: number) => Math.min(100, Math.max(0, (value / max) * 100))

/** 连接速度统一以 Kbps 展示 */
const formatBitsPerSecond = (value: number | null) => {
  if (!value || !Number.isFinite(value) || value <= 0) return '--'
  return `${Math.round(value / 1_000)} Kbps`
}

const formatBytes = (value: number | null) => {
  if (!value || !Number.isFinite(value) || value <= 0) return '--'
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`
  return `${Math.round(value / 1024)} KB`
}

const formatRange = (value?: string) => {
  if (!value) return 'bt709 / SDR'
  return value.toUpperCase() === 'PQ' ? 'bt2020 / HDR' : 'bt709 / SDR'
}

const createSessionCode = () =>
  Math.random()
    .toString(36)
    .slice(2, 18)
    .toUpperCase()

type VideoPlaybackQualityWithWebkit = HTMLVideoElement & {
  webkitDecodedFrameCount?: number
  webkitDroppedFrameCount?: number
}

function readPlaybackFrames(video: HTMLVideoElement) {
  const qualityVideo = video as VideoPlaybackQualityWithWebkit
  if (typeof qualityVideo.getVideoPlaybackQuality === 'function') {
    const quality = qualityVideo.getVideoPlaybackQuality()
    const total = quality.totalVideoFrames ?? 0
    const dropped = quality.droppedVideoFrames ?? 0
    return { total, dropped }
  }
  return {
    total: qualityVideo.webkitDecodedFrameCount ?? 0,
    dropped: qualityVideo.webkitDroppedFrameCount ?? 0,
  }
}

function optimalLevelForViewport(levels: QualityLevel[], width: number, height: number) {
  if (levels.length === 0) return null
  const byWidth = [...levels].sort((a, b) => a.width - b.width)
  return byWidth.find((level) => level.width >= width && level.height >= height) ?? byWidth[byWidth.length - 1]
}

/** Network Activity 的统计窗口（毫秒） */
const NETWORK_WINDOW_MS = 5000

/**
 * hls.js 透传的底层网络对象：默认 XhrLoader 为 XMLHttpRequest，
 * 若换成 fetch 版 loader 则为 Response。
 */
type NetworkDetailsLike = XMLHttpRequest | Response | null

/**
 * cf-ray 结尾的三字码是 Cloudflare 接入机房（IATA 代码）。
 * 这里只收录常见节点用于中文标注，未收录的原样显示三字码。
 */
const EDGE_COLO_LABELS: Record<string, string> = {
  HKG: '香港',
  TPE: '台北',
  NRT: '东京',
  KIX: '大阪',
  ICN: '首尔',
  SIN: '新加坡',
  BKK: '曼谷',
  KUL: '吉隆坡',
  MNL: '马尼拉',
  HAN: '河内',
  SGN: '胡志明市',
  CGK: '雅加达',
  DEL: '新德里',
  BOM: '孟买',
  SYD: '悉尼',
  MEL: '墨尔本',
  LAX: '洛杉矶',
  SJC: '圣何塞',
  SEA: '西雅图',
  DFW: '达拉斯',
  ORD: '芝加哥',
  IAD: '阿什本',
  ATL: '亚特兰大',
  YYZ: '多伦多',
  GRU: '圣保罗',
  LHR: '伦敦',
  AMS: '阿姆斯特丹',
  FRA: '法兰克福',
  CDG: '巴黎',
  MAD: '马德里',
  DXB: '迪拜',
  WAW: '华沙',
  ARN: '斯德哥尔摩',
}

/** 从响应头读取当前接入机房，cf-ray 形如 `a5033e168faa26d1-HKG` */
function edgeColoFromResponse(networkDetails: NetworkDetailsLike): string | null {
  if (!networkDetails) return null
  const ray =
    networkDetails instanceof XMLHttpRequest
      ? networkDetails.getResponseHeader('cf-ray')
      : networkDetails.headers.get('cf-ray')
  const colo = ray?.split('-').pop()?.trim().toUpperCase()
  return colo && /^[A-Z]{3}$/.test(colo) ? colo : null
}

/** 组装机房展示文案，如 `香港（HKG）`；未收录的节点只显示三字码 */
function formatServingNode(colo: string | null): string {
  if (!colo) return '--'
  const label = EDGE_COLO_LABELS[colo]
  return label ? `${label}（${colo}）` : colo
}

interface QualityLevel {
  /** hls.js 中的轨道索引，用于手动切档 */
  index: number
  /** 档位标识（同时作为 Redux 中的取值），如 `720p` */
  key: string
  label: string
  width: number
  height: number
  frameRate: number | null
  bitrate: number
  audioCodec?: string
  videoCodec?: string
  videoRange?: string
}

/** 依据 HLS 轨道信息生成画质选项：同高度仅保留码率最高的一条，并按清晰度降序 */
function toQualityLevels(
  levels: Array<{
    height?: number
    width?: number
    frameRate?: number
    bitrate: number
    audioCodec?: string
    videoCodec?: string
    videoRange?: string
  }>,
): QualityLevel[] {
  const byHeight = new Map<number, QualityLevel>()
  levels.forEach((level, index) => {
    if (!level.height) return
    const existing = byHeight.get(level.height)
    if (existing && existing.bitrate >= level.bitrate) return
    byHeight.set(level.height, {
      index,
      key: `${level.height}p`,
      label: heightLabel(level.height),
      width: level.width ?? 0,
      height: level.height,
      frameRate: level.frameRate ?? null,
      bitrate: level.bitrate,
      audioCodec: level.audioCodec,
      videoCodec: level.videoCodec,
      videoRange: level.videoRange,
    })
  })
  return [...byHeight.values()].sort((a, b) => b.height - a.height)
}

/** 优先沿用已选档位；缺失时回退到默认档位，再缺失则取与默认档位最接近的轨道 */
function pickQuality(levels: QualityLevel[], preferred: Quality): Quality {
  if (preferred === 'auto') return 'auto'
  if (levels.some((level) => level.key === preferred)) return preferred
  if (levels.some((level) => level.key === DEFAULT_QUALITY)) return DEFAULT_QUALITY
  const target = Number.parseInt(DEFAULT_QUALITY, 10) || 720
  const nearest = levels.reduce<QualityLevel | null>(
    (best, level) =>
      !best || Math.abs(level.height - target) < Math.abs(best.height - target) ? level : best,
    null,
  )
  return nearest ? nearest.key : 'auto'
}

/** 播放内核轨道信息（hls.js 的 MediaPlaylist / 原生 textTracks 都能映射到该结构） */
interface MediaPlaylistLike {
  name?: string
  lang?: string
  default?: boolean
}

/** 把播放内核的真实轨道转成下拉选项；同名轨道追加序号保证 key 唯一 */
function toMediaTrackOptions(tracks: MediaPlaylistLike[], fallbackPrefix: string): MediaTrackOption[] {
  const used = new Map<string, number>()
  return tracks.map((track, index) => {
    const label = track.name || track.lang || `${fallbackPrefix} ${index + 1}`
    const seen = used.get(label) ?? 0
    used.set(label, seen + 1)
    return {
      key: seen === 0 ? label : `${label}#${seen + 1}`,
      label,
      index,
      isDefault: Boolean(track.default),
    }
  })
}

/** 原生 HLS 的音轨接口（仅 Safari 实现），用于降级路径 */
interface NativeAudioTrack {
  enabled: boolean
  label?: string
  language?: string
}

type VideoWithAudioTracks = HTMLVideoElement & {
  audioTracks?: { length: number; [index: number]: NativeAudioTrack | undefined }
}

function nativeAudioTracks(video: HTMLVideoElement): NativeAudioTrack[] {
  const tracks = (video as VideoWithAudioTracks).audioTracks
  if (!tracks) return []
  return Array.from({ length: tracks.length }, (_, index) => tracks[index]).filter(
    (track): track is NativeAudioTrack => Boolean(track),
  )
}

interface BufferedWindow {
  end: number
  health: number
}

/** 当前播放点所在的连续缓冲区；进度条与 Buffer Health 共用这套计算 */
function bufferedWindow(video: HTMLVideoElement): BufferedWindow {
  if (!Number.isFinite(video.duration)) return { end: 0, health: 0 }
  const { buffered, currentTime } = video
  for (let i = 0; i < buffered.length; i += 1) {
    const start = buffered.start(i)
    const end = buffered.end(i)
    if (start <= currentTime && currentTime <= end) {
      return {
        end,
        health: Math.max(0, end - currentTime),
      }
    }
  }
  return { end: 0, health: 0 }
}

interface VideoPlayerProps {
  title: Title
  episode?: Episode
}

interface ContextMenuState {
  x: number
  y: number
}

interface NerdStats {
  playbackState: string
  viewport: string
  frames: string
  currentRes: string
  volume: string
  codecs: string
  color: string
  servingNode: string
  connectionSpeed: string
  connectionSpeedBps: number | null
  networkActivity: string
  networkActivityPercent: number
  bufferHealth: string
  bufferHealthSeconds: number | null
  mysteryText: string
  timestamp: string
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] items-baseline gap-4">
      <span className="text-right font-semibold text-white">{label}</span>
      <span className="truncate text-white/95">{value}</span>
    </div>
  )
}

function StatsMeter({ value, percent }: { value: string; percent: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-center gap-4">
      <div className="h-5 overflow-hidden rounded-sm bg-black/80">
        <div className="flex h-full items-center bg-[#7bc1b7]" style={{ width: `${percent}%` }}>
          <div className="ml-auto h-full w-16 bg-[#bfe3a7]/90" />
        </div>
      </div>
      <span className="truncate text-white/95">{value}</span>
    </div>
  )
}

/**
 * HLS 播放器：基于 hls.js 渲染真实画面，播放状态、进度、时长均由媒体事件回写；
 * 画质选项来自 master playlist 的轨道信息，默认停留在 720P 档位。
 */
export function VideoPlayer({ title, episode }: VideoPlayerProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const player = useAppSelector(selectPlayer)
  const progress = useAppSelector((state) => state.watch.progress)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const adVideoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  /** 最近一次分片请求命中的 Cloudflare 接入机房三字码 */
  const edgeColoRef = useRef<string | null>(null)
  /** 最近 5 秒内完成下载的分片样本，用于统计实时下载量 */
  const fragSamplesRef = useRef<{ at: number; bytes: number }[]>([])
  /** 当前是否处于广告播放中（供事件回调读取，避免闭包过期） */
  const adActiveRef = useRef(false)
  /** 当前广告计时窗口的起点（秒）：自该位置起正片实际播放满 60s 触发广告 */
  const adAnchorRef = useRef(0)
  const hideTimer = useRef<number | undefined>(undefined)
  /** 续播进度占比（0-1）：演示流时长与 mock 时长不同，按比例映射到真实时长 */
  const resumeRef = useRef(0)
  const playerRef = useRef(player)
  const progressRef = useRef(progress)
  const qualityRef = useRef(player.quality)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [levels, setLevels] = useState<QualityLevel[]>([])
  /** 自适应模式下当前实际播放的轨道高度 */
  const [liveHeight, setLiveHeight] = useState<number | null>(null)
  const [mediaReady, setMediaReady] = useState(false)
  /** 已缓冲到的位置（秒），用于进度条的缓冲层 */
  const [buffered, setBuffered] = useState(0)
  /** 是否正在播放中插广告 */
  const [adActive, setAdActive] = useState(false)
  /** 广告播放位置 / 时长（秒） */
  const [adPosition, setAdPosition] = useState(0)
  const [adDuration, setAdDuration] = useState(0)
  /** 是否已满 5s、可跳过 */
  const [adSkippable, setAdSkippable] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [statsVisible, setStatsVisible] = useState(false)
  const sourcePlaybackId = useMemo(
    () => SOURCE_URL.match(/cloudflarestream\.com\/([^/]+)\//)?.[1] ?? 'unknown',
    [],
  )
  const sessionCode = useMemo(() => createSessionCode(), [])
  const [nerdStats, setNerdStats] = useState<NerdStats>({
    playbackState: '初始化中',
    viewport: '--',
    frames: '--',
    currentRes: '--',
    volume: '--',
    codecs: '--',
    color: 'bt709 / SDR',
    servingNode: '--',
    connectionSpeed: '--',
    connectionSpeedBps: null,
    networkActivity: '--',
    networkActivityPercent: 0,
    bufferHealth: '--',
    bufferHealthSeconds: null,
    mysteryText: 'CF Stream HLS / waiting for first sample',
    timestamp: new Date().toLocaleString('zh-CN'),
  })

  playerRef.current = player
  progressRef.current = progress
  qualityRef.current = player.quality

  const episodes = useMemo(() => title.seasons.flatMap((season) => season.episodes), [title])
  const episodeIndex = episode ? episodes.findIndex((item) => item.id === episode.id) : -1
  const nextEpisode = episodeIndex >= 0 ? episodes[episodeIndex + 1] : undefined
  const prevEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined

  const minutes = episode ? episode.duration : (title.runtime ?? 110)
  /** 名义时长：媒体元数据到达前先占位，随后由真实时长覆盖 */
  const nominalDuration = Math.max(60, Math.round(minutes * 60))

  /* 进入播放页：装载会话（续播到上次位置），离开时写回观看进度 */
  useEffect(() => {
    const record = progressRef.current.find((item) => item.titleId === title.id)
    const sameEpisode = record ? (record.episodeId ?? null) === (episode?.id ?? null) : false
    const resumeRatio =
      record && sameEpisode && record.duration > 0 ? Math.min(record.position / record.duration, 1) : 0
    resumeRef.current = resumeRatio
    dispatch(
      loadSession({
        titleId: title.id,
        episodeId: episode?.id ?? null,
        position: Math.round(resumeRatio * nominalDuration),
        duration: nominalDuration,
      }),
    )

    return () => {
      const current = playerRef.current
      if (current.duration > 0 && current.position > 3) {
        dispatch(
          recordProgress({
            titleId: title.id,
            episodeId: episode?.id,
            percent: Math.min(100, Math.round((current.position / current.duration) * 100)),
            position: Math.floor(current.position),
            duration: current.duration,
            updatedAt: new Date().toISOString(),
          }),
        )
      }
      dispatch(endSession())
    }
  }, [dispatch, title.id, episode?.id, nominalDuration])

  /* 装载 HLS：读取轨道信息并生成画质选项 */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!Hls.isSupported()) {
      // Safari 等原生支持 HLS 的浏览器：交给系统自适应，无法手动切档
      video.src = SOURCE_URL
      return
    }

    // 固定前向缓冲区间，避免自适应把整片一次性缓冲完导致缓冲进度看不出边界
    const hls = new Hls({ enableWorker: true, maxBufferLength: 30, maxMaxBufferLength: 60 })
    hlsRef.current = hls
    hls.loadSource(SOURCE_URL)
    hls.attachMedia(video)

    /* 从播放内核读取当前视频源的真实轨道，回写到状态供下拉渲染 */
    const publishTracks = () => {
      dispatch(
        setMediaTracks({
          subtitleTracks: toMediaTrackOptions(hls.subtitleTracks, '字幕'),
          audioTracks: toMediaTrackOptions(hls.audioTracks, '音轨'),
        }),
      )
    }

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const list = toQualityLevels(hls.levels)
      setLevels(list)
      dispatch(setQuality(pickQuality(list, qualityRef.current)))
      publishTracks()
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = hls.levels[data.level]
      setLiveHeight(level ? level.height : null)
    })
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, publishTracks)
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, publishTracks)

    /* 从实际分片 / 媒体播放列表响应里读取接入机房（仅 Cloudflare 会回 cf-ray） */
    const captureEdgeColo = (_event: unknown, data: { networkDetails?: NetworkDetailsLike }) => {
      const colo = edgeColoFromResponse(data.networkDetails ?? null)
      if (colo) edgeColoRef.current = colo
    }
    hls.on(Hls.Events.FRAG_LOADED, captureEdgeColo)
    hls.on(Hls.Events.LEVEL_LOADED, captureEdgeColo)

    /*
     * 下载量取自 hls.js 自己的分片统计，而不是 Resource Timing：
     * 跨域资源缺少 Timing-Allow-Origin 时浏览器会把字节数一律上报为 0。
     */
    const recordFragLoad = (
      _event: unknown,
      data: { frag: { stats: { loaded: number; total: number; loading: { start: number } } } },
    ) => {
      const stats = data.frag.stats
      const bytes = stats.loaded || stats.total
      if (!bytes) return
      // 按「开始下载的时刻」入窗：下载本身只有一两秒，之后的缓冲间歇也归属这段窗口，
      // 否则读数会在两次分片之间掉回 `--`
      const samples = fragSamplesRef.current
      samples.push({ at: stats.loading.start, bytes })
      const cutoff = performance.now() - NETWORK_WINDOW_MS
      while (samples.length > 0 && samples[0].at < cutoff) samples.shift()
    }
    hls.on(Hls.Events.FRAG_LOADED, recordFragLoad)
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      else hls.destroy()
    })

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [dispatch])

  /* 画质切档：auto 交还自适应，其余档位锁定到对应轨道 */
  useEffect(() => {
    const hls = hlsRef.current
    if (!hls || levels.length === 0) return
    if (player.quality === 'auto') {
      hls.currentLevel = -1
      return
    }
    const level = levels.find((item) => item.key === player.quality)
    if (level) hls.currentLevel = level.index
  }, [player.quality, levels])

  /* 原生 HLS（Safari 旧版）：从 video 元素读取真实字幕 / 音轨 */
  useEffect(() => {
    const video = videoRef.current
    if (!video || hlsRef.current) return

    const publishTracks = () => {
      const subtitles: MediaTrackOption[] = []
      const textTracks = video.textTracks
      for (let i = 0; i < textTracks.length; i += 1) {
        const track = textTracks[i]
        if (!track || (track.kind !== 'subtitles' && track.kind !== 'captions')) continue
        const label = track.label || track.language || `字幕 ${subtitles.length + 1}`
        subtitles.push({ key: label, label, index: i, isDefault: track.mode === 'showing' })
      }
      const audios = nativeAudioTracks(video).map((track, index) => {
        const label = track.label || track.language || `音轨 ${index + 1}`
        return { key: label, label, index, isDefault: track.enabled }
      })
      dispatch(setMediaTracks({ subtitleTracks: subtitles, audioTracks: audios }))
    }

    // 轨道信息异步到达：既监听 textTracks 变更，也在元数据就绪时兜底读一次
    const tracks = video.textTracks
    tracks.addEventListener('addtrack', publishTracks)
    tracks.addEventListener('change', publishTracks)
    tracks.addEventListener('removetrack', publishTracks)
    video.addEventListener('loadedmetadata', publishTracks)
    publishTracks()
    return () => {
      tracks.removeEventListener('addtrack', publishTracks)
      tracks.removeEventListener('change', publishTracks)
      tracks.removeEventListener('removetrack', publishTracks)
      video.removeEventListener('loadedmetadata', publishTracks)
    }
  }, [dispatch])

  /* 音轨 / 字幕选择下发到播放内核 */
  useEffect(() => {
    const hls = hlsRef.current
    if (hls) {
      if (player.subtitle === SUBTITLE_OFF) {
        hls.subtitleDisplay = false
        hls.subtitleTrack = -1
      } else {
        const track = player.subtitleTracks.find((item) => item.key === player.subtitle)
        if (track) {
          hls.subtitleTrack = track.index
          hls.subtitleDisplay = true
        }
      }
      const audio = player.audioTracks.find((item) => item.key === player.audio)
      if (audio) hls.audioTrack = audio.index
      return
    }

    // 原生 HLS：直接切换 video 元素的轨道
    const video = videoRef.current
    if (!video) return
    const textTracks = video.textTracks
    for (let i = 0; i < textTracks.length; i += 1) {
      const track = textTracks[i]
      if (!track) continue
      const option = player.subtitleTracks.find((item) => item.index === i)
      if (!option) continue
      track.mode = option.key === player.subtitle ? 'showing' : 'disabled'
    }
    const activeAudio = player.audioTracks.find((item) => item.key === player.audio)
    if (activeAudio) {
      nativeAudioTracks(video).forEach((track, index) => {
        track.enabled = index === activeAudio.index
      })
    }
  }, [player.subtitle, player.audio, player.subtitleTracks, player.audioTracks])

  /* 轨道列表变化后校正选择：字幕失效则关闭，音轨失效则回退到源默认轨 */
  useEffect(() => {
    const { subtitleTracks, audioTracks, subtitle, audio } = playerRef.current
    if (subtitleTracks.length > 0 && subtitle !== SUBTITLE_OFF && !subtitleTracks.some((item) => item.key === subtitle)) {
      dispatch(setSubtitle(SUBTITLE_OFF))
    }
    if (audioTracks.length > 0 && !audioTracks.some((item) => item.key === audio)) {
      const fallback = audioTracks.find((item) => item.isDefault) ?? audioTracks[0]
      if (fallback) dispatch(setAudio(fallback.key))
    }
  }, [dispatch, player.subtitle, player.audio, player.subtitleTracks, player.audioTracks])

  /* 音量 / 静音 / 倍速下发到播放内核 */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = player.volume
    video.muted = player.muted
  }, [player.volume, player.muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = player.rate
  }, [player.rate])

  const startPlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const attempt = video.play()
    if (!attempt) return
    void attempt.catch(() => {
      // 浏览器拦截带声播放：静音后重试，用户可手动恢复声音
      video.muted = true
      dispatch(setMuted(true))
      void video.play().catch(() => dispatch(setPlaying(false)))
    })
  }, [dispatch])

  const syncBuffered = useCallback(() => {
    const video = videoRef.current
    if (video) setBuffered(bufferedWindow(video).end)
  }, [])

  /** 结束广告：收起覆盖层并恢复正片播放 */
  const endAd = useCallback(() => {
    const ad = adVideoRef.current
    if (ad) ad.pause()
    adActiveRef.current = false
    setAdActive(false)
    setAdSkippable(false)
    startPlayback()
  }, [startPlayback])

  /** 开始播放中插广告：暂停正片、装载并播放广告素材 */
  const startAd = useCallback(() => {
    const ad = adVideoRef.current
    const main = videoRef.current
    if (!ad || !main) return
    main.pause()
    adActiveRef.current = true
    setAdActive(true)
    // 广告覆盖层会盖住播放器，顺手收起可能已打开的右键菜单
    setContextMenu(null)
    setAdSkippable(false)
    setAdPosition(0)
    setAdDuration(0)
    ad.currentTime = 0
    ad.volume = playerRef.current.muted ? 0 : playerRef.current.volume
    ad.muted = playerRef.current.muted
    void ad.play().catch(() => {
      // 自动播放被拦截：静音重试，用户可手动开声
      ad.muted = true
      void ad.play().catch(() => endAd())
    })
  }, [endAd])

  /* 广告媒体事件：回写进度、时长，并在播完时结束广告 */
  useEffect(() => {
    const ad = adVideoRef.current
    if (!ad) return

    const onTimeUpdate = () => {
      setAdPosition(ad.currentTime)
      setAdSkippable(ad.currentTime >= AD_SKIP_AFTER)
    }
    const onLoadedMetadata = () => setAdDuration(Number.isFinite(ad.duration) ? ad.duration : 0)
    const onEnded = () => endAd()
    // 素材加载失败时不再静默收起，留痕便于排查
    const onError = () => {
      console.error('[ad] 广告素材加载失败', AD_SOURCE, ad.error)
      endAd()
    }

    ad.addEventListener('timeupdate', onTimeUpdate)
    ad.addEventListener('loadedmetadata', onLoadedMetadata)
    ad.addEventListener('ended', onEnded)
    ad.addEventListener('error', onError)
    return () => {
      ad.removeEventListener('timeupdate', onTimeUpdate)
      ad.removeEventListener('loadedmetadata', onLoadedMetadata)
      ad.removeEventListener('ended', onEnded)
      ad.removeEventListener('error', onError)
    }
  }, [endAd])

  /* 中插调度：自上次广告或拖动进度以来，正片实际播放满 60s 触发一次广告 */
  useEffect(() => {
    if (adActive) return
    if (player.position - adAnchorRef.current >= AD_INTERVAL) {
      adAnchorRef.current = player.position
      startAd()
    }
  }, [player.position, adActive, startAd])

  /* 媒体事件回写播放状态 */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      dispatch(setPosition(video.currentTime))
      syncBuffered()
    }
    const onDurationChange = () => {
      dispatch(setDuration(video.duration))
      syncBuffered()
    }
    const onLoadedMetadata = () => setMediaReady(true)
    const onPlay = () => dispatch(setPlaying(true))
    const onPause = () => dispatch(setPlaying(false))
    const onEnded = () => dispatch(markEnded())
    const onWaiting = () => dispatch(setBuffering(true))
    const onPlaying = () => dispatch(setBuffering(false))
    const onSeeked = () => dispatch(setBuffering(false))
    const onProgress = () => syncBuffered()

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('progress', onProgress)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('progress', onProgress)
    }
  }, [dispatch, syncBuffered])

  /* 媒体就绪（首次加载 / 切换剧集）后应用续播位置并起播 */
  useEffect(() => {
    if (!mediaReady) return
    const video = videoRef.current
    if (!video) return
    const limit = Number.isFinite(video.duration) ? Math.max(0, video.duration - 1) : 0
    const target = Math.min(resumeRef.current * limit, limit)
    video.currentTime = target
    // 切换剧集 / 重新加载后重置广告计时窗口
    adAnchorRef.current = target
    video.volume = playerRef.current.volume
    video.muted = playerRef.current.muted
    video.playbackRate = playerRef.current.rate
    dispatch(seek(target))
    startPlayback()
  }, [mediaReady, title.id, episode?.id, dispatch, startPlayback])

  /* 播放页禁止页面滚动 */
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (playerRef.current.ended) {
        video.currentTime = 0
        dispatch(seek(0))
      }
      startPlayback()
      return
    }
    video.pause()
  }, [dispatch, startPlayback])

  /** 跳转到指定时间点（秒） */
  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current
      if (!video) return
      const limit = Number.isFinite(video.duration) ? video.duration : 0
      const target = Math.min(Math.max(seconds, 0), limit)
      video.currentTime = target
      // 手动跳转（拖动进度条 / 快进快退）后重置广告计时
      adAnchorRef.current = target
      dispatch(seek(target))
    },
    [dispatch],
  )

  const seekRelative = useCallback(
    (delta: number) => {
      const video = videoRef.current
      if (!video) return
      seekTo(video.currentTime + delta)
    },
    [seekTo],
  )

  const wake = useCallback(() => {
    dispatch(setControlsVisible(true))
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    if (playerRef.current.isPlaying) {
      hideTimer.current = window.setTimeout(() => dispatch(setControlsVisible(false)), CONTROLS_TIMEOUT)
    }
  }, [dispatch])

  useEffect(() => {
    wake()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [wake, player.isPlaying])

  useEffect(() => {
    const onChange = () => dispatch(setFullscreen(Boolean(document.fullscreenElement)))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [dispatch])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handleClose = () => setContextMenu(null)
    window.addEventListener('pointerdown', handleClose)
    window.addEventListener('blur', handleClose)
    return () => {
      window.removeEventListener('pointerdown', handleClose)
      window.removeEventListener('blur', handleClose)
    }
  }, [contextMenu])

  const openContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // 始终屏蔽浏览器原生菜单
      event.preventDefault()
      // 广告时段不响应右键，与生产环境表现一致
      if (adActiveRef.current) return
      wake()
      // 诊断入口只在开发环境弹出
      if (!STATS_FOR_NERDS_ENABLED) return
      const rect = containerRef.current?.getBoundingClientRect()
      const menuWidth = 196
      const menuHeight = 54
      const x = rect ? Math.min(event.clientX - rect.left, rect.width - menuWidth - 12) : event.clientX
      const y = rect ? Math.min(event.clientY - rect.top, rect.height - menuHeight - 12) : event.clientY
      setContextMenu({ x: Math.max(12, x), y: Math.max(12, y) })
    },
    [wake],
  )

  const refreshNerdStats = useCallback(() => {
    const video = videoRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (!video || !rect) return

    const hls = hlsRef.current
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const frames = readPlaybackFrames(video)
    const activeLevel =
      hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : undefined
    const activeQuality = activeLevel
      ? levels.find((level) => level.height === activeLevel.height && level.width === activeLevel.width) ?? null
      : levels.find((level) => level.key === playerRef.current.quality) ?? null
    const optimalLevel = optimalLevelForViewport(levels, rect.width * dpr, rect.height * dpr)
    const bufferWindowState = bufferedWindow(video)
    const forwardBuffer = bufferWindowState.health
    const bandwidthEstimate = hls ? hls.bandwidthEstimate : null
    // 滑动窗口只保留最近 5 秒的分片，这里顺手丢弃过期样本
    const networkSamples = fragSamplesRef.current
    const networkCutoff = performance.now() - NETWORK_WINDOW_MS
    while (networkSamples.length > 0 && networkSamples[0].at < networkCutoff) networkSamples.shift()
    const networkBytes = networkSamples.reduce((sum, sample) => sum + sample.bytes, 0)
    // 刻度按当前档位的平均码率自适应：满格即「刚好按码率下载」
    const levelBitrate = activeLevel?.averageBitrate ?? activeLevel?.bitrate ?? 0
    const levelBytesPerWindow = (levelBitrate / 8) * (NETWORK_WINDOW_MS / 1000)
    const networkPercent = levelBytesPerWindow > 0 ? clampPercent(networkBytes, levelBytesPerWindow) : 0
    const fps = activeQuality?.frameRate ?? null
    const currentWidth = video.videoWidth || activeQuality?.width || 0
    const currentHeight = video.videoHeight || activeQuality?.height || 0
    const optimalRes = optimalLevel
      ? `${optimalLevel.width}x${optimalLevel.height}${optimalLevel.frameRate ? `@${Math.round(optimalLevel.frameRate)}` : ''}`
      : '--'
    const stateLabel = adActiveRef.current
      ? '广告中'
      : playerRef.current.ended
        ? '已结束'
        : playerRef.current.buffering
          ? '缓冲中'
          : playerRef.current.isPlaying
            ? '播放中'
            : '暂停'

    setNerdStats({
      playbackState: stateLabel,
      viewport: `${Math.round(rect.width)}x${Math.round(rect.height)}*${dpr.toFixed(2)}`,
      frames: `${frames.dropped} dropped of ${frames.total}`,
      currentRes:
        currentWidth && currentHeight
          ? `${currentWidth}x${currentHeight}${fps ? `@${Math.round(fps)}` : ''} / ${optimalRes}`
          : `-- / ${optimalRes}`,
      volume: `${Math.round((playerRef.current.muted ? 0 : playerRef.current.volume) * 100)}% / ${playerRef.current.rate}x`,
      codecs: `${activeLevel?.videoCodec ?? activeQuality?.videoCodec ?? '--'} / ${activeLevel?.audioCodec ?? activeQuality?.audioCodec ?? '--'}`,
      color: formatRange(activeQuality?.videoRange),
      servingNode: formatServingNode(edgeColoRef.current),
      connectionSpeed: formatBitsPerSecond(bandwidthEstimate),
      connectionSpeedBps: bandwidthEstimate && Number.isFinite(bandwidthEstimate) ? bandwidthEstimate : null,
      networkActivity: networkBytes > 0 ? `${formatBytes(networkBytes)} / 5s` : '--',
      networkActivityPercent: networkPercent,
      bufferHealth: `${forwardBuffer.toFixed(2)} s`,
      bufferHealthSeconds: forwardBuffer,
      mysteryText: `${sourcePlaybackId} q:${playerRef.current.quality} live:${liveHeight ? `${liveHeight}p` : 'n/a'} pos:${video.currentTime.toFixed(2)} buf:${bufferWindowState.end.toFixed(2)}`,
      timestamp: new Date().toLocaleString('zh-CN'),
    })
  }, [buffered, levels, liveHeight, sourcePlaybackId])

  useEffect(() => {
    if (!statsVisible) return
    refreshNerdStats()
    const timer = window.setInterval(refreshNerdStats, 1000)
    return () => window.clearInterval(timer)
  }, [refreshNerdStats, statsVisible])

  /* 快捷键 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'Escape' && contextMenu) {
        event.preventDefault()
        closeContextMenu()
        return
      }
      if (event.key === 'Escape' && statsVisible) {
        event.preventDefault()
        setStatsVisible(false)
        return
      }
      // 广告播放期间屏蔽正片控制，仅保留返回
      if (adActiveRef.current) {
        if (event.key === 'Escape' && !document.fullscreenElement) navigate(-1)
        return
      }
      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault()
          togglePlayback()
          break
        case 'ArrowRight':
          seekRelative(10)
          break
        case 'ArrowLeft':
          seekRelative(-10)
          break
        case 'm':
          dispatch(toggleMute())
          break
        case 'f':
          toggleFullscreen()
          break
        case 'Escape':
          if (!document.fullscreenElement) navigate(-1)
          break
        default:
          break
      }
      wake()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeContextMenu, contextMenu, dispatch, navigate, seekRelative, statsVisible, toggleFullscreen, togglePlayback, wake])

  /* 播放结束：自动播放下一集 */
  useEffect(() => {
    if (!player.ended || !nextEpisode || !player.autoplayNext) return
    navigate(`/watch/${title.id}/${nextEpisode.id}`)
  }, [player.ended, player.autoplayNext, nextEpisode, navigate, title.id])

  const VolumeIcon =
    player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2
  const episodeLabel = episode ? `第 ${episode.season} 季 第 ${episode.number} 集 · ${episode.title}` : null
  const autoSuffix =
    player.quality === 'auto' && liveHeight ? `（当前 ${heightLabel(liveHeight)}）` : ''
  const subtitleLabel = player.subtitleTracks.find((track) => track.key === player.subtitle)?.label
  const audioLabel = player.audioTracks.find((track) => track.key === player.audio)?.label

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden bg-black text-white"
      onMouseMove={wake}
      onContextMenu={openContextMenu}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        poster={backdrop(title.art)}
        playsInline
      />

      {/* 点击画面切换播放状态 */}
      <button
        type="button"
        aria-label={player.isPlaying ? '暂停' : '播放'}
        className="absolute inset-0 z-0 cursor-default"
        onClick={() => {
          togglePlayback()
          wake()
        }}
      />

      {/* 中插广告：素材常驻挂载以便绑定媒体事件，仅在广告时段显示 */}
      <video
        ref={adVideoRef}
        src={AD_SOURCE}
        className={cn(
          'absolute inset-0 z-50 h-full w-full bg-black object-contain',
          adActive ? 'block' : 'hidden',
        )}
        playsInline
        preload="metadata"
      />

      {/* 广告时段 UI：角标、进度与 5s 后出现的跳过按钮 */}
      {adActive ? (
        <div className="absolute inset-0 z-50">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 md:p-6">
            <span className="rounded bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">广告</span>
            <span className="text-xs text-white/70">赞助内容</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 bg-gradient-to-t from-black/85 to-transparent px-4 pb-5 pt-16 md:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs tabular-nums text-white/70">
                {`广告 ${formatTime(adPosition)} / ${formatTime(adDuration)}`}
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${adDuration > 0 ? Math.min(100, (adPosition / adDuration) * 100) : 0}%` }}
                />
              </div>
            </div>
            {adSkippable ? (
              <Button className="shrink-0 gap-2 bg-white text-black hover:bg-white/85" onClick={endAd}>
                <SkipForward className="size-4" />
                跳过广告
              </Button>
            ) : (
              <div className="shrink-0 rounded-md border border-white/25 px-3 py-2 text-xs tabular-nums text-white/80">
                {`${Math.max(1, Math.ceil(AD_SKIP_AFTER - adPosition))} 秒后可跳过`}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 缓冲指示 */}
      {player.buffering && player.isPlaying && !player.ended ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span
            role="status"
            aria-label="缓冲中"
            className="size-10 animate-spin rounded-full border-2 border-white/25 border-t-white"
          />
        </div>
      ) : null}

      {/* 顶部信息栏 */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent p-4 transition-opacity duration-300 md:p-6',
          player.controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Button
          size="icon"
          variant="ghost"
          aria-label="返回"
          className={controlClass}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold md:text-base">{title.name}</p>
          {episodeLabel ? <p className="truncate text-xs text-white/60">{episodeLabel}</p> : null}
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="返回作品详情"
          className={cn(controlClass, 'ml-auto')}
          onClick={() => navigate(`/title/${title.id}`)}
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* 播放结束遮罩 */}
      {player.ended ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85">
          <p className="text-lg font-semibold">{nextEpisode ? '下一集即将播放' : '已播放完毕'}</p>
          {nextEpisode ? (
            <p className="text-sm text-white/60">{`第 ${nextEpisode.season} 季 第 ${nextEpisode.number} 集 · ${nextEpisode.title}`}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button className="bg-white text-black hover:bg-white/85" onClick={togglePlayback}>
              <Play className="size-4 fill-current" />
              重新播放
            </Button>
            {nextEpisode ? (
              <Button
                variant="secondary"
                className="bg-white/20 text-white hover:bg-white/30"
                onClick={() => navigate(`/watch/${title.id}/${nextEpisode.id}`)}
              >
                <SkipForward className="size-4" />
                播放下一集
              </Button>
            ) : null}
            <Button variant="ghost" className={controlClass} onClick={() => navigate(`/title/${title.id}`)}>
              返回作品详情
            </Button>
          </div>
        </div>
      ) : null}

      {/* Stats for nerds：类似 YouTube 的实时播放诊断浮层（仅开发环境） */}
      {STATS_FOR_NERDS_ENABLED && statsVisible ? (
        <section className="absolute left-4 top-4 z-40 max-w-[min(760px,calc(100vw-2rem))] rounded-2xl bg-[rgba(33,33,33,0.82)] px-5 py-4 text-[15px] leading-7 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur md:left-6 md:top-6">
          <button
            type="button"
            aria-label="关闭播放统计"
            className="absolute right-3 top-2 text-xl text-white/90 transition hover:text-white"
            onClick={() => setStatsVisible(false)}
          >
            [x]
          </button>
          <div className="space-y-0.5 pr-8">
            <StatsRow label="Video ID / sCPN" value={`${sourcePlaybackId} / ${sessionCode}`} />
            <StatsRow label="Viewport / Frames" value={`${nerdStats.viewport} / ${nerdStats.frames}`} />
            <StatsRow label="State / Current Res" value={`${nerdStats.playbackState} / ${nerdStats.currentRes}`} />
            <StatsRow label="Volume / Speed" value={nerdStats.volume} />
            <StatsRow label="Codecs" value={nerdStats.codecs} />
            <StatsRow label="Color" value={nerdStats.color} />
            <StatsRow label="Serving Node" value={nerdStats.servingNode} />
            <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-4 pt-1">
              <span className="text-right font-semibold text-white">Connection Speed</span>
              <StatsMeter
                value={nerdStats.connectionSpeed}
                percent={clampPercent((nerdStats.connectionSpeedBps ?? 0) / 1000, 24000)}
              />
            </div>
            <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-4">
              <span className="text-right font-semibold text-white">Network Activity</span>
              <StatsMeter
                value={nerdStats.networkActivity}
                percent={nerdStats.networkActivityPercent}
              />
            </div>
            <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-4">
              <span className="text-right font-semibold text-white">Buffer Health</span>
              <StatsMeter
                value={nerdStats.bufferHealth}
                percent={clampPercent(nerdStats.bufferHealthSeconds ?? 0, 60)}
              />
            </div>
            <StatsRow label="Mystery Text" value={nerdStats.mysteryText} />
            <StatsRow label="Date" value={nerdStats.timestamp} />
          </div>
        </section>
      ) : null}

      {/* 底部控制栏 */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-5 pt-16 transition-opacity duration-300 md:px-6',
          player.controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/75">
            {formatTime(player.position)}
          </span>
          <Slider
            value={[player.position]}
            buffered={buffered}
            min={0}
            max={player.duration || 1}
            step={1}
            aria-label="播放进度"
            onValueChange={(value) => seekTo(value[0] ?? 0)}
            className="[&_[data-slot=slider-buffered]]:bg-[#640D14] [&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-brand [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/20"
          />
          <span className="w-14 shrink-0 text-xs tabular-nums text-white/55">
            {formatTime(player.duration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={player.isPlaying ? '暂停' : '播放'}
            className={controlClass}
            onClick={() => {
              togglePlayback()
              wake()
            }}
          >
            {player.isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </Button>

          {episode ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label="上一集"
                disabled={!prevEpisode}
                className={controlClass}
                onClick={() => prevEpisode && navigate(`/watch/${title.id}/${prevEpisode.id}`)}
              >
                <SkipBack className="size-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="下一集"
                disabled={!nextEpisode}
                className={controlClass}
                onClick={() => nextEpisode && navigate(`/watch/${title.id}/${nextEpisode.id}`)}
              >
                <SkipForward className="size-5" />
              </Button>
            </>
          ) : null}

          <Button
            size="icon"
            variant="ghost"
            aria-label="后退 10 秒"
            className={controlClass}
            onClick={() => seekRelative(-10)}
          >
            <RotateCcw className="size-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="前进 10 秒"
            className={controlClass}
            onClick={() => seekRelative(10)}
          >
            <RotateCw className="size-5" />
          </Button>

          <div className="group/volume flex items-center">
            <Button
              size="icon"
              variant="ghost"
              aria-label={player.muted ? '取消静音' : '静音'}
              className={controlClass}
              onClick={() => dispatch(toggleMute())}
            >
              <VolumeIcon className="size-5" />
            </Button>
            <Slider
              value={[player.muted ? 0 : Math.round(player.volume * 100)]}
              min={0}
              max={100}
              step={1}
              aria-label="音量"
              onValueChange={(value) => dispatch(setVolume((value[0] ?? 0) / 100))}
              className="w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/volume:w-24 group-hover/volume:opacity-100 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/30"
            />
          </div>

          {title.seasons.length ? (
            <Button
              variant="ghost"
              className={cn(controlClass, 'gap-2 px-2 text-sm')}
              onClick={() => setEpisodesOpen((open) => !open)}
            >
              <Film className="size-5" />
              <span className="hidden sm:inline">选集</span>
            </Button>
          ) : null}

          {nextEpisode && player.autoplayNext ? (
            <p className="ml-2 hidden min-w-0 truncate text-xs text-white/55 lg:block">
              即将播放：{`第 ${nextEpisode.season} 季 第 ${nextEpisode.number} 集 · ${nextEpisode.title}`}
            </p>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={cn(controlClass, 'gap-2 px-2 text-sm')}>
                  <Gauge className="size-5" />
                  <span className="hidden sm:inline">{player.rate}x</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                <DropdownMenuLabel className="text-xs text-white/45">播放速度</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={String(player.rate)}
                  onValueChange={(value) => dispatch(setRate(Number(value)))}
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <DropdownMenuRadioItem key={rate} value={String(rate)} className="cursor-pointer">
                      {rate === 1 ? '正常（1x）' : `${rate}x`}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="字幕"
                  className={cn(controlClass, 'gap-2 px-2 text-sm')}
                >
                  <Captions className="size-5" />
                  {subtitleLabel ? <span className="hidden text-xs sm:inline">{subtitleLabel}</span> : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                <DropdownMenuLabel className="text-xs text-white/45">字幕</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={player.subtitle}
                  onValueChange={(value) => dispatch(setSubtitle(value))}
                  className="max-h-80 overflow-y-auto"
                >
                  <DropdownMenuRadioItem value={SUBTITLE_OFF} className="cursor-pointer">
                    关闭
                  </DropdownMenuRadioItem>
                  {player.subtitleTracks.map((track) => (
                    <DropdownMenuRadioItem key={track.key} value={track.key} className="cursor-pointer">
                      {track.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {player.subtitleTracks.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs text-white/40">
                    正在读取字幕信息…
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="音轨"
                  className={cn(controlClass, 'gap-2 px-2 text-sm')}
                >
                  <Languages className="size-5" />
                  {audioLabel ? <span className="hidden text-xs lg:inline">{audioLabel}</span> : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                <DropdownMenuLabel className="text-xs text-white/45">音轨</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={player.audio}
                  onValueChange={(value) => dispatch(setAudio(value))}
                  className="max-h-80 overflow-y-auto"
                >
                  {player.audioTracks.map((track) => (
                    <DropdownMenuRadioItem key={track.key} value={track.key} className="cursor-pointer">
                      {track.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {player.audioTracks.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs text-white/40">
                    正在读取音轨信息…
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="设置" className={cn(controlClass, 'px-2')}>
                  <Settings className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(menuClass, 'w-52')}>
                <DropdownMenuLabel className="text-xs text-white/45">画质</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={player.quality}
                  onValueChange={(value) => dispatch(setQuality(value))}
                >
                  <DropdownMenuRadioItem value="auto" className="cursor-pointer">
                    {`自动${autoSuffix}`}
                  </DropdownMenuRadioItem>
                  {levels.map((level) => (
                    <DropdownMenuRadioItem key={level.key} value={level.key} className="cursor-pointer">
                      {level.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {levels.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs text-white/40">
                    正在读取画质信息…
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuCheckboxItem
                  checked={player.autoplayNext}
                  onCheckedChange={(checked) => dispatch(setAutoplayNext(Boolean(checked)))}
                  onSelect={(event) => event.preventDefault()}
                  className="cursor-pointer"
                >
                  自动播放下一集
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => navigate(`/title/${title.id}`)}
                >
                  作品详情
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="icon"
              variant="ghost"
              aria-label={player.fullscreen ? '退出全屏' : '全屏'}
              className={controlClass}
              onClick={toggleFullscreen}
            >
              {player.fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* 选集面板 */}
      {episodesOpen && title.seasons.length ? (
        <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[360px] flex-col border-l border-white/10 bg-[#141414]/95 backdrop-blur">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
            <p className="text-sm font-semibold">选集</p>
            <Button
              size="icon"
              variant="ghost"
              aria-label="关闭选集"
              className={cn(controlClass, 'ml-auto')}
              onClick={() => setEpisodesOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {title.seasons.map((season) => (
              <div key={season.number} className="mb-2">
                <p className="px-2 py-2 text-xs uppercase tracking-widest text-white/40">{season.title}</p>
                {season.episodes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/watch/${title.id}/${item.id}`)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-md p-2 text-left transition hover:bg-white/10',
                      item.id === episode?.id && 'bg-white/10',
                    )}
                  >
                    <span className="mt-0.5 w-5 shrink-0 text-center text-sm text-white/50">{item.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white/90">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] text-white/50">{item.duration} 分钟</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {/* 播放器专属右键菜单，目前只承载 Stats for nerds，因此同样仅开发环境构建 */}
      {STATS_FOR_NERDS_ENABLED && contextMenu ? (
        <div
          className="absolute z-50 min-w-48 rounded-xl border border-white/10 bg-[#1b1b1b]/95 p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
            onClick={() => {
              setStatsVisible((visible) => !visible)
              setContextMenu(null)
              wake()
            }}
          >
            {statsVisible ? 'Hide stats for nerds' : 'Stats for nerds'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
