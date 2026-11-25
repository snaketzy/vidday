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
    <section className="relative isolate z-30 w-full bg-background text-foreground">
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

      <div className="fixed inset-x-0 top-[68px] z-30 flex h-16 items-center gap-3 bg-background px-4 py-2.5 md:px-12">
        <Button ref={backRef} type="button" variant="ghost" size="icon" className="size-11" aria-label="返回" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title.name}</span>
      </div>
      {/* 返回条已固定脱离文档流，补等高占位以保持下方内容几何不变。 */}
      <div aria-hidden className="h-16" />

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
                    {/* TMDB 品牌图标，路径取自 Simple Icons（themoviedatabase）。 */}
                    <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-auto fill-[#01B4E4]">
                      <path d="M6.62 12a2.291 2.291 0 0 1 2.292-2.295h-.013A2.291 2.291 0 0 1 11.189 12a2.291 2.291 0 0 1-2.29 2.291h.013A2.291 2.291 0 0 1 6.62 12zm10.72-4.062h4.266a2.291 2.291 0 0 0 2.29-2.291 2.291 2.291 0 0 0-2.29-2.296H17.34a2.291 2.291 0 0 0-2.291 2.296 2.291 2.291 0 0 0 2.29 2.29zM2.688 20.645h8.285a2.291 2.291 0 0 0 2.291-2.292 2.291 2.291 0 0 0-2.29-2.295H2.687a2.291 2.291 0 0 0-2.291 2.295 2.291 2.291 0 0 0 2.29 2.292zm10.881-6.354h.81l1.894-4.586H15.19l-1.154 3.008h-.013l-1.135-3.008h-1.154zm4.208 0h1.011V9.705h-1.011zm2.878 0h3.235v-.93h-2.223v-.933h1.99v-.934h-1.99v-.855h2.107v-.934h-3.112zM1.31 7.941h1.01V4.247h1.31v-.895H0v.895h1.31zm3.747 0h1.011V5.959h1.958v1.984h1.011v-4.59h-1.01v1.711H6.061V3.351H5.057zm5.348 0h3.242v-.933H11.41v-.934h1.99v-.933h-1.99v-.856h2.107v-.934h-3.112zM.162 14.296h1.005v-3.52h.013l1.167 3.52h.765l1.206-3.52h.013v3.52h1.011v-4.59H3.82L2.755 12.7h-.013L1.686 9.705H.156zm14.534 6.353h1.641a3.188 3.188 0 0 0 .98-.149 2.531 2.531 0 0 0 .824-.437 2.123 2.123 0 0 0 .567-.713 2.193 2.193 0 0 0 .223-.983 2.399 2.399 0 0 0-.218-1.07 1.958 1.958 0 0 0-.586-.716 2.405 2.405 0 0 0-.873-.392 4.349 4.349 0 0 0-1.046-.13h-1.519zm1.013-3.656h.596a2.26 2.26 0 0 1 .606.08 1.514 1.514 0 0 1 .503.244 1.167 1.167 0 0 1 .34.412 1.28 1.28 0 0 1 .13.587 1.546 1.546 0 0 1-.13.658 1.127 1.127 0 0 1-.347.433 1.41 1.41 0 0 1-.518.238 2.797 2.797 0 0 1-.649.07h-.538zm4.686 3.656h1.88a2.997 2.997 0 0 0 .613-.064 1.735 1.735 0 0 0 .554-.214 1.221 1.221 0 0 0 .402-.39 1.105 1.105 0 0 0 .155-.606 1.188 1.188 0 0 0-.071-.415 1.01 1.01 0 0 0-.204-.34 1.087 1.087 0 0 0-.317-.24 1.297 1.297 0 0 0-.413-.13v-.012a1.203 1.203 0 0 0 .575-.366.962.962 0 0 0 .216-.648 1.081 1.081 0 0 0-.149-.603 1.022 1.022 0 0 0-.389-.354 1.673 1.673 0 0 0-.54-.169 4.463 4.463 0 0 0-.6-.041h-1.712zm1.011-3.734h.687a1.4 1.4 0 0 1 .24.022.748.748 0 0 1 .22.075.432.432 0 0 1 .16.147.418.418 0 0 1 .061.236.47.47 0 0 1-.055.233.433.433 0 0 1-.146.156.62.62 0 0 1-.204.084 1.058 1.058 0 0 1-.23.026h-.745zm0 1.835h.765a1.96 1.96 0 0 1 .266.02 1.015 1.015 0 0 1 .26.07.519.519 0 0 1 .204.152.406.406 0 0 1 .08.26.481.481 0 0 1-.06.253.519.519 0 0 1-.16.168.62.62 0 0 1-.217.09 1.155 1.155 0 0 1-.237.027H21.4z" />
                    </svg>
                    {tmdb.toFixed(1)}
                  </li>
                ) : null}
                {imdb !== undefined ? (
                  <li className="inline-flex items-center gap-2">
                    <span className="sr-only">IMDb (Internet Movie Database): </span>
                    {/* IMDb 品牌图标，路径取自 Simple Icons（imdb）。 */}
                    <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-auto fill-[#F5C518]">
                      <path d="M22.3781 0H1.6218C.7411.0583.0587.7437.0018 1.5953l-.001 20.783c.0585.8761.7125 1.543 1.5559 1.6191A.337.337 0 0 0 1.6016 24h20.7971a.4579.4579 0 0 0 .0437-.002c.8727-.0768 1.5568-.8271 1.5568-1.7085V1.7098c0-.8914-.696-1.6416-1.584-1.7078A.3294.3294 0 0 0 22.3781 0zm0 .496a1.2144 1.2144 0 0 1 1.1252 1.2139v20.5797c0 .6377-.4875 1.1602-1.1045 1.2145H1.6016c-.5967-.0543-1.0645-.5297-1.1053-1.1258V1.6284C.5371 1.0185 1.0184.5364 1.6217.496h20.7564zM4.7954 8.2603v7.3636H2.8899V8.2603h1.9055zm6.5367 0v7.3636H9.6707v-4.9704l-.6711 4.9704H7.813l-.6986-4.8618-.0066 4.8618h-1.668V8.2603h2.468c.0748.4476.1492.9694.2307 1.5734l.2712 1.8713.4407-3.4447h2.4817zm2.9772 1.3289c.0742.0404.122.108.1417.2034.0279.0953.0345.3118.0345.6442v2.8548c0 .4881-.0345.7867-.0955.8954-.0609.1152-.2304.1695-.5018.1695V9.5211c.204 0 .3457.0205.4211.0681zm-.0211 6.0347c.4543 0 .8006-.0265 1.0245-.0742.2304-.0477.4204-.1357.5694-.2648.1556-.1218.2642-.298.3251-.5219.0611-.2238.1021-.6648.1021-1.3224v-2.5832c0-.6986-.0271-1.1668-.0742-1.4039-.041-.237-.1431-.4543-.3126-.6437-.1695-.1973-.4198-.3324-.7456-.421-.3191-.0808-.8542-.1285-1.7694-.1285h-1.4244v7.3636h2.3051zm5.14-1.7827c0 .3523-.0199.5762-.0544.6708-.033.0947-.1894.1424-.3046.1424-.1086 0-.19-.0477-.2238-.1351-.041-.0887-.0609-.2986-.0609-.6238v-1.9469c0-.3324.0199-.5423.0543-.6237.0338-.0808.1086-.122.2171-.122.1153 0 .2709.0412.3114.1425.041.0947.0609.2986.0609.6032v1.8926zm-2.4747-5.5809v7.3636h1.7157l.1152-.4675c.1556.1894.3251.3324.5152.4271.1828.0881.4608.1357.678.1357.3047 0 .5629-.0748.7802-.237.2165-.1562.3589-.3462.4198-.5628.0543-.2173.0887-.543.0887-.9841v-2.0675c0-.4409-.0139-.7324-.0344-.8681-.0199-.1357-.0742-.2781-.1695-.4204-.1021-.1425-.2437-.251-.4272-.3325-.1834-.0742-.3999-.1152-.6576-.1152-.2172 0-.4952.0477-.6846.1285-.1835.0887-.353.2238-.5086.4007V8.2603h-1.8309z" />
                    </svg>
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
