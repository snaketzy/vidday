import { useId, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { ArrowLeft, Bookmark, CopyPlus, Eye, EyeOff, Film, Play, Star } from 'lucide-react'

import { Synopsis } from '@/components/title/synopsis'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { genreNames } from '@/data/genres'
import { formatRuntime, formatTime } from '@/lib/format'
import type { Title, WatchProgress } from '@/types'

/** 操作行图标按钮：对齐 Infuse 的深色圆角方块。 */
const actionButtonClass = 'size-12 rounded-xl bg-foreground/10 text-foreground hover:bg-foreground/20 focus-visible:ring-brand'

function ComingSoonAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* 禁用按钮不接收指针事件，用 span 承载悬停以显示「即将支持」提示。 */}
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={actionButtonClass}
            aria-label={`${label}（即将支持）`}
            disabled
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>即将支持</TooltipContent>
    </Tooltip>
  )
}

interface MovieDetailHeroProps {
  title: Title
  rating: number | null
  inList: boolean
  watched: boolean
  canToggleWatched: boolean
  hasSource: boolean
  progress?: WatchProgress
  playRef: Ref<HTMLButtonElement>
  backRef: Ref<HTMLButtonElement>
  onBack: () => void
  onPlay: () => void
  onToggleList: () => void
  onToggleWatched: () => void
}

export function MovieDetailHero({
  title, rating, inList, watched, canToggleWatched, hasSource, progress,
  playRef, backRef, onBack, onPlay, onToggleList, onToggleWatched,
}: MovieDetailHeroProps) {
  const sourceHintId = useId()
  const [failedBackdrop, setFailedBackdrop] = useState<string>()
  const description = title.synopsis.trim() || title.logline.trim()
  const genres = [...new Set([...genreNames(title.genres), ...title.tags].map((genre) => genre.trim()).filter(Boolean))].join('，')
  const watchedTime = progress ? formatTime(progress.position) : ''
  const resumeTime = watchedTime.split(':').length === 2
    ? `00:${watchedTime.padStart(5, '0')}`
    : watchedTime.padStart(8, '0')
  const runtime = title.runtime && title.runtime > 0 ? formatRuntime(title.runtime) : null
  const maturity = title.maturity.trim()
  const hasMaturity = maturity !== '' && maturity !== '未分级'
  const isMovie = title.type === 'movie'
  const { tmdb, imdb } = (isMovie ? title.ratings : undefined) ?? {}
  const isUhd = isMovie && title.isUhd === true
  const hasHevc = isMovie && title.hasHevc === true
  const audioTrackCount = isMovie && title.audioTrackCount != null && title.audioTrackCount >= 2 ? title.audioTrackCount : null
  const subtitleTrackCount = isMovie && title.subtitleTrackCount != null && title.subtitleTrackCount >= 1 ? title.subtitleTrackCount : null
  const hasMediaSpecs = isUhd || hasHevc || audioTrackCount !== null || subtitleTrackCount !== null

  return (
    <section className="relative isolate w-full bg-background text-foreground">
      {title.backdropUrl && failedBackdrop !== title.backdropUrl ? (
        <img
          src={title.backdropUrl}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_30%]"
          onError={() => setFailedBackdrop(title.backdropUrl ?? undefined)}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/80 via-transparent to-background" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-4/5 bg-gradient-to-t from-background from-10% via-background/85 to-transparent" />

      <div className="flex items-center gap-3 bg-background/80 px-4 py-2.5 backdrop-blur-sm md:px-12">
        <Button ref={backRef} type="button" variant="ghost" size="icon" className="size-11" aria-label="返回" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title.name}</span>
      </div>

      <div className="px-4 pt-[clamp(9rem,37vw,27rem)] pb-6 sm:px-8 md:px-12 lg:pt-[clamp(18rem,42vh,29rem)]">
        <h1 className="text-3xl font-black leading-tight tracking-tight break-words sm:text-5xl xl:text-6xl">
          {title.name}
        </h1>
        {title.originalName && title.originalName !== title.name ? (
          <p className="mt-2 text-sm break-words text-foreground/75 sm:text-base">{title.originalName}</p>
        ) : null}

        {/* 右列从播放按钮顶缘开始排列，简介紧跟元数据。 */}
        <div className="mt-5 grid items-stretch gap-6 [--hero-actions-width:17rem] lg:grid-cols-[var(--hero-actions-width)_minmax(0,1fr)] lg:gap-x-8">
          <div className="flex min-w-0 max-w-[var(--hero-actions-width)] flex-col justify-between gap-3">
            <Button
              ref={playRef}
              type="button"
              size="lg"
              disabled={!hasSource}
              aria-describedby={hasSource ? undefined : sourceHintId}
              className="h-12 w-full bg-white text-black hover:bg-white/85 focus-visible:ring-brand"
              onClick={onPlay}
            >
              <Play className="size-5 fill-current" />
              {progress ? `继续观看 ${resumeTime}` : '播放'}
            </Button>
            {!hasSource ? <p id={sourceHintId} className="text-sm text-foreground/80">当前影片暂无可用片源。</p> : null}
            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={actionButtonClass}
                  aria-label={watched ? '标记为未看' : '标记为已看'}
                  aria-pressed={watched}
                  disabled={!canToggleWatched}
                  onClick={onToggleWatched}
                >
                  {watched ? <Eye /> : <EyeOff />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={actionButtonClass}
                  aria-label={inList ? '取消收藏' : '收藏'}
                  aria-pressed={inList}
                  onClick={onToggleList}
                >
                  <Bookmark className={inList ? 'fill-current' : undefined} />
                </Button>
                <ComingSoonAction label="预告片"><Film /></ComingSoonAction>
                <ComingSoonAction label="评级"><Star /></ComingSoonAction>
                <ComingSoonAction label="加入专辑"><CopyPlus /></ComingSoonAction>
              </div>
            </TooltipProvider>
          </div>

          <div className="flex min-w-0 flex-col gap-2.5">
            {rating || runtime || title.year > 0 || hasMaturity || hasMediaSpecs || genres ? (
              <ul aria-label="影片信息" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-foreground/75 sm:gap-x-7">
                {rating ? (
                  <li className="flex items-center gap-1.5">
                    <Star className="size-3.5 shrink-0 fill-current" aria-hidden />
                    <span className="sr-only">评分</span>{rating.toFixed(1)}
                  </li>
                ) : null}
                {runtime ? <li>{runtime}</li> : null}
                {title.year > 0 ? <li>{title.year}</li> : null}
                {hasMaturity ? <li className="max-w-full rounded-sm border border-current/65 px-1.5 text-xs/4 wrap-anywhere">{maturity}</li> : null}
                {isUhd ? <li className="max-w-full rounded-sm border border-current/65 px-1.5 text-xs/4">4K</li> : null}
                {hasHevc ? <li className="max-w-full rounded-sm border border-current/65 px-1.5 text-xs/4">HEVC</li> : null}
                {audioTrackCount !== null ? <li className="max-w-full rounded-sm border border-current/65 px-1.5 text-xs/4">音轨 {audioTrackCount}</li> : null}
                {subtitleTrackCount !== null ? <li className="max-w-full rounded-sm border border-current/65 px-1.5 text-xs/4">字幕 {subtitleTrackCount}</li> : null}
                {genres ? <li className="max-w-full wrap-anywhere">{genres}</li> : null}
              </ul>
            ) : null}
            {description ? (
              <div className="max-w-[30rem]">
                <Synopsis name={title.name} text={description} moviePreview className="text-foreground/95" />
              </div>
            ) : null}
            {tmdb !== undefined || imdb !== undefined ? (
              <ul aria-label="平台评分" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold tabular-nums">
                {tmdb !== undefined ? (
                  <li className="inline-flex items-center gap-2">
                    <span className="sr-only">TMDB (The Movie Database): </span>
                    <span aria-hidden className="rounded-sm bg-teal-200 px-1.5 text-xs/5 font-bold tracking-wide text-teal-950">TMDB</span>
                    {tmdb.toFixed(1)}
                  </li>
                ) : null}
                {imdb !== undefined ? (
                  <li className="inline-flex items-center gap-2">
                    <span className="sr-only">IMDb (Internet Movie Database): </span>
                    <span aria-hidden className="rounded-sm bg-amber-300 px-1.5 text-xs/5 font-black text-black">IMDb</span>
                    {imdb.toFixed(1)}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

export function MovieDetailProgress({ progress }: { progress: WatchProgress }) {
  const percent = progress.position / progress.duration * 100
  const watchedTime = formatTime(progress.position)
  const totalTime = formatTime(progress.duration)

  return (
    <div className="px-4 pt-2 pb-5 sm:px-8 md:px-12">
      <div
        role="progressbar"
        aria-label="影片观看进度"
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`已观看 ${watchedTime}，总时长 ${totalTime}`}
        className="h-1 overflow-hidden rounded-full bg-foreground/20"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <div aria-hidden className="relative mt-2 h-5 text-right text-xs tabular-nums text-foreground/80">
        <span className="absolute -translate-x-1/2" style={{ left: `clamp(1.75rem, ${percent}%, 100% - 5.75rem)` }}>
          {watchedTime}
        </span>
        <span>{totalTime}</span>
      </div>
    </div>
  )
}
