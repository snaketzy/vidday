import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from 'cn'
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
import { useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
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
  PLAYBACK_RATES,
  endSession,
  loadSession,
  seek,
  seekBy,
  selectPlayer,
  setAudio,
  setAutoplayNext,
  setControlsVisible,
  setFullscreen,
  setQuality,
  setRate,
  setSubtitle,
  setVolume,
  tick,
  toggleMute,
  togglePlay,
  type AudioTrack,
  type Quality,
  type SubtitleTrack,
} from '@/store/slices/player-slice'
import { recordProgress } from '@/store/slices/watch-slice'
import type { Episode, Title } from '@/types'

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'auto', label: '自动（推荐）' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K HDR' },
]

const SUBTITLE_OPTIONS: SubtitleTrack[] = ['off', '简体中文', 'English']
const AUDIO_OPTIONS: AudioTrack[] = ['国语配音', '原声']

const CONTROLS_TIMEOUT = 3200

const controlClass =
  'text-white hover:bg-white/15 focus-visible:ring-white/40'
const menuClass = 'border-white/10 bg-[#181818] text-white'

interface PlayerPlaceholderProps {
  title: Title
  episode?: Episode
}

/**
 * 播放页占位：完整还原播放器交互（播放/暂停、进度、音量、音轨、字幕、画质、倍速、全屏、选集），
 * 画面区域暂以剧照占位，后续接入真实播放内核（HLS / DASH）时替换画面层即可。
 */
export function PlayerPlaceholder({ title, episode }: PlayerPlaceholderProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const player = useAppSelector(selectPlayer)
  const progress = useAppSelector((state) => state.watch.progress)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const playerRef = useRef(player)
  const progressRef = useRef(progress)
  const [episodesOpen, setEpisodesOpen] = useState(false)

  playerRef.current = player
  progressRef.current = progress

  const episodes = useMemo(() => title.seasons.flatMap((season) => season.episodes), [title])
  const episodeIndex = episode ? episodes.findIndex((item) => item.id === episode.id) : -1
  const nextEpisode = episodeIndex >= 0 ? episodes[episodeIndex + 1] : undefined
  const prevEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined

  const minutes = episode ? episode.duration : (title.runtime ?? 110)
  const duration = Math.max(60, Math.round(minutes * 60))

  /* 进入播放页：装载会话（续播到上次位置），离开时写回观看进度 */
  useEffect(() => {
    const record = progressRef.current.find((item) => item.titleId === title.id)
    const resume =
      record && (record.episodeId ?? null) === (episode?.id ?? null) ? record.position : 0
    dispatch(
      loadSession({
        titleId: title.id,
        episodeId: episode?.id ?? null,
        position: resume,
        duration,
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
  }, [dispatch, title.id, episode?.id, duration])

  /* 播放时钟 */
  useEffect(() => {
    const timer = window.setInterval(() => dispatch(tick()), 1000)
    return () => window.clearInterval(timer)
  }, [dispatch])

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
          dispatch(togglePlay())
          break
        case 'ArrowRight':
          dispatch(seekBy(10))
          break
        case 'ArrowLeft':
          dispatch(seekBy(-10))
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
  }, [dispatch, navigate, toggleFullscreen, wake])

  /* 播放结束：自动播放下一集 */
  useEffect(() => {
    if (!player.ended || !nextEpisode || !player.autoplayNext) return
    navigate(`/watch/${title.id}/${nextEpisode.id}`)
  }, [player.ended, player.autoplayNext, nextEpisode, navigate, title.id])

  const volumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2
  const VolumeIcon = volumeIcon
  const episodeLabel = episode ? `第 ${episode.season} 季 第 ${episode.number} 集 · ${episode.title}` : null

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden bg-black text-white"
      onMouseMove={wake}
    >
      <ArtImage
        src={backdrop(title.art)}
        alt={title.name}
        paletteId={title.id}
        eager
        className="absolute inset-0 h-full w-full"
        imageClassName="opacity-45 scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />

      {/* 画面占位说明 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full border border-white/25 bg-black/40">
          <Play className="size-5 fill-current text-white/70" />
        </span>
        <p className="text-sm font-semibold tracking-wide text-white/75">视频播放占位</p>
        <p className="max-w-md px-6 text-xs leading-relaxed text-white/45">
          {title.trailerNote} · 此处将在接入播放内核（HLS / DASH）后渲染真实画面，当前可完整体验播放器交互与进度记录。
        </p>
      </div>

      {/* 点击画面切换播放状态 */}
      <button
        type="button"
        aria-label={player.isPlaying ? '暂停' : '播放'}
        className="absolute inset-0 z-0 cursor-default"
        onClick={() => {
          dispatch(togglePlay())
          wake()
        }}
      />

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
            <Button className="bg-white text-black hover:bg-white/85" onClick={() => dispatch(togglePlay())}>
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
            min={0}
            max={player.duration || 1}
            step={1}
            aria-label="播放进度"
            onValueChange={(value) => dispatch(seek(value[0] ?? 0))}
            className="[&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-brand [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/30"
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
              dispatch(togglePlay())
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
            onClick={() => dispatch(seekBy(-10))}
          >
            <RotateCcw className="size-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="前进 10 秒"
            className={controlClass}
            onClick={() => dispatch(seekBy(10))}
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
                  onValueChange={(value) => dispatch(setQuality(value as Quality))}
                >
                  {QUALITY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="cursor-pointer">
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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
