import { Check, Info, Play, Plus } from 'lucide-react'
import { cn } from 'cn'
import { useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import { backdrop, poster } from '@/lib/art'
import { episodeCount, formatRuntime } from '@/lib/format'
import { usePlayTarget } from '@/hooks/use-play-target'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsInMyList, toggleTitle } from '@/store/slices/my-list-slice'
import { openPreview } from '@/store/slices/ui-slice'
import type { Title } from '@/types'

export type TitleCardVariant = 'landscape' | 'poster' | 'top10'

interface TitleCardProps {
  title: Title
  variant?: TitleCardVariant
  rank?: number
  progressPercent?: number
  episodeLabel?: string
  className?: string
  eager?: boolean
}

export function TitleCard({
  title,
  variant = 'landscape',
  rank,
  progressPercent,
  episodeLabel,
  className,
  eager,
}: TitleCardProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const play = usePlayTarget()
  const inList = useAppSelector((state) => selectIsInMyList(state, title.id))

  const isPoster = variant !== 'landscape'
  const meta = [
    `${title.match}% 匹配`,
    title.maturity,
    title.type === 'movie' && title.runtime ? formatRuntime(title.runtime) : `${episodeCount(title.seasons)} 集`,
  ]

  const handlePlay = () => play(title)

  const card = (
    <div
      className={cn(
        'group/card relative shrink-0 cursor-pointer overflow-hidden rounded-md transition duration-300',
        isPoster ? 'aspect-[9/16] w-[140px] sm:w-[158px] lg:w-[172px]' : 'aspect-video w-[224px] sm:w-[252px] lg:w-[286px]',
        'hover:z-20 hover:ring-2 hover:ring-white/25',
        className,
      )}
      onClick={() => navigate(`/title/${title.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/title/${title.id}`)
      }}
    >
      <ArtImage
        src={isPoster ? poster(title.art) : backdrop(title.art)}
        alt={title.name}
        paletteId={title.id}
        eager={eager}
        className="h-full w-full"
        imageClassName="transition duration-500 group-hover/card:scale-[1.06] group-hover/card:opacity-80"
      />

      {/* 常驻角标 */}
      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-1 p-2">
        {title.isOriginal ? (
          <span className="rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand">
            vidday
          </span>
        ) : null}
        {title.isNew ? (
          <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">新上线</span>
        ) : null}
      </div>

      {episodeLabel ? (
        <span className="absolute right-2 top-2 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/85">
          {episodeLabel}
        </span>
      ) : null}

      {/* 悬停信息层 */}
      <div className="absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-black via-black/85 to-transparent p-3 opacity-0 transition duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{title.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/70">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="icon"
            className="size-7 rounded-full bg-white text-black hover:bg-white/85"
            aria-label={`播放 ${title.name}`}
            onClick={(event) => {
              event.stopPropagation()
              handlePlay()
            }}
          >
            <Play className="size-3.5 fill-current" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-7 rounded-full border-white/55 bg-black/40 text-white hover:border-white hover:bg-black/70"
            aria-label={inList ? '从我的片单移除' : '加入我的片单'}
            onClick={(event) => {
              event.stopPropagation()
              dispatch(toggleTitle(title.id))
            }}
          >
            {inList ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-7 rounded-full border-white/55 bg-black/40 text-white hover:border-white hover:bg-black/70"
            aria-label={`查看 ${title.name} 详情`}
            onClick={(event) => {
              event.stopPropagation()
              dispatch(openPreview(title.id))
            }}
          >
            <Info className="size-3.5" />
          </Button>
          <span className="ml-auto hidden truncate text-[11px] text-white/60 lg:block">
            {title.genres.length ? title.tags[0] ?? title.logline : ''}
          </span>
        </div>
      </div>

      {typeof progressPercent === 'number' ? (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
          <div className="h-full bg-brand" style={{ width: `${Math.min(100, progressPercent)}%` }} />
        </div>
      ) : null}
    </div>
  )

  if (variant === 'top10' && rank) {
    return (
      <div className="flex shrink-0 items-end">
        <span
          className="-mr-3 select-none text-[92px] font-black leading-[0.78] text-transparent sm:text-[104px] lg:text-[116px]"
          style={{ WebkitTextStroke: '3px rgb(255 255 255 / 0.45)' }}
        >
          {rank}
        </span>
        {card}
      </div>
    )
  }

  return card
}
