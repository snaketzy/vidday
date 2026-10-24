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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  setMuted,
  setPlaying,
  setPosition,
  setQuality,
  setRate,
  setSubtitle,
  setVolume,
  toggleMute,
  type AudioTrack,
  type Quality,
  type SubtitleTrack,
} from '@/store/slices/player-slice'
import { recordProgress } from '@/store/slices/watch-slice'
import type { Episode, Title } from '@/types'

/** 演示用播放源：Mux 多码率 HLS（master playlist，含多档画质轨道） */
const SOURCE_URL =
  'https://stream.mux.com/XceDtWCR2F01InyWrAcI00JeLtWCDPcOjN4g01im00Y0100FQ.m3u8'

const SUBTITLE_OPTIONS: SubtitleTrack[] = ['off', '简体中文', 'English']
const AUDIO_OPTIONS: AudioTrack[] = ['国语配音', '原声']

const CONTROLS_TIMEOUT = 3200

const controlClass = 'text-white hover:bg-white/15 focus-visible:ring-white/40'
const menuClass = 'border-white/10 bg-[#181818] text-white'

/** 由轨道高度推导展示名 */
const heightLabel = (height: number) => (height >= 2160 ? '4K' : `${height}p`)

interface QualityLevel {
  /** hls.js 中的轨道索引，用于手动切档 */
  index: number
  /** 档位标识（同时作为 Redux 中的取值），如 `720p` */
  key: string
  label: string
  height: number
  bitrate: number
}

/** 依据 HLS 轨道信息生成画质选项：同高度仅保留码率最高的一条，并按清晰度降序 */
function toQualityLevels(levels: { height: number; bitrate: number }[]): QualityLevel[] {
  const byHeight = new Map<number, QualityLevel>()
  levels.forEach((level, index) => {
    if (!level.height) return
    const existing = byHeight.get(level.height)
    if (existing && existing.bitrate >= level.bitrate) return
    byHeight.set(level.height, {
      index,
      key: `${level.height}p`,
      label: heightLabel(level.height),
      height: level.height,
      bitrate: level.bitrate,
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

/** 当前播放位置所处的缓冲区间末端（秒）；用于绘制进度条上的缓冲进度 */
function bufferedEnd(video: HTMLVideoElement): number {
  if (!Number.isFinite(video.duration)) return 0
  const { buffered, currentTime } = video
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) return buffered.end(i)
  }
  return buffered.length > 0 ? buffered.end(buffered.length - 1) : 0
}

interface VideoPlayerProps {
  title: Title
  episode?: Episode
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
  const hlsRef = useRef<Hls | null>(null)
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

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const list = toQualityLevels(hls.levels)
      setLevels(list)
      dispatch(setQuality(pickQuality(list, qualityRef.current)))
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = hls.levels[data.level]
      setLiveHeight(level ? level.height : null)
    })
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
    if (video) setBuffered(bufferedEnd(video))
  }, [])

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

  /* 快捷键 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
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
  }, [dispatch, navigate, toggleFullscreen, togglePlayback, seekRelative, wake])

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

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden bg-black text-white"
      onMouseMove={wake}
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
                  {player.subtitle !== 'off' ? (
                    <span className="hidden text-xs sm:inline">{player.subtitle}</span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                <DropdownMenuLabel className="text-xs text-white/45">字幕</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={player.subtitle}
                  onValueChange={(value) => dispatch(setSubtitle(value as SubtitleTrack))}
                >
                  {SUBTITLE_OPTIONS.map((track) => (
                    <DropdownMenuRadioItem key={track} value={track} className="cursor-pointer">
                      {track === 'off' ? '关闭' : track}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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
                  <span className="hidden text-xs lg:inline">{player.audio}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                <DropdownMenuLabel className="text-xs text-white/45">音轨</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={player.audio}
                  onValueChange={(value) => dispatch(setAudio(value as AudioTrack))}
                >
                  {AUDIO_OPTIONS.map((track) => (
                    <DropdownMenuRadioItem key={track} value={track} className="cursor-pointer">
                      {track}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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
    </div>
  )
}
