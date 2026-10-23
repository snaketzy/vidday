import { X } from 'lucide-react'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import { RailScroller } from '@/components/title/rail-scroller'
import { usePlayTarget } from '@/hooks/use-play-target'
import { backdrop } from '@/lib/art'
import { formatTime } from '@/lib/format'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { removeProgress, selectContinueWatching } from '@/store/slices/watch-slice'

export function ContinueRail({ heading = '继续观看' }: { heading?: string }) {
  const dispatch = useAppDispatch()
  const play = usePlayTarget()
  const kidsOnly = useAppSelector(selectKidsMode)
  const items = useAppSelector((state) => selectContinueWatching(state, kidsOnly))

  if (!items.length) return null

  return (
    <section className="py-4">
      <h2 className="mb-3 px-4 text-base font-semibold text-white/90 md:px-12 md:text-lg">{heading}</h2>
      <RailScroller>
        {items.map(({ title, progress }) => {
          const episode = progress.episodeId
            ? title.seasons.flatMap((season) => season.episodes).find((item) => item.id === progress.episodeId)
            : undefined
          const remaining = Math.max(0, progress.duration - progress.position)

          return (
            <article
              key={title.id}
              className="group/continue relative aspect-video w-[224px] shrink-0 overflow-hidden rounded-md transition duration-300 hover:z-20 hover:ring-2 hover:ring-white/25 sm:w-[252px] lg:w-[286px]"
            >
              <button
                type="button"
                className="h-full w-full text-left"
                onClick={() => play(title, progress.episodeId)}
              >
                <ArtImage
                  src={backdrop(title.art)}
                  alt={title.name}
                  paletteId={title.id}
                  className="h-full w-full"
                  imageClassName="transition duration-500 group-hover/continue:scale-[1.06] group-hover/continue:opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover/continue:opacity-100">
                  <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black">
                    <svg viewBox="0 0 24 24" className="size-5 fill-current">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{title.name}</p>
                    {episode ? (
                      <span className="shrink-0 text-[11px] text-white/65">
                        S{episode.season}:E{episode.number}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-white/60">
                    {episode ? episode.title : '电影'} · 剩余 {formatTime(remaining)}
                  </p>
                </div>
              </button>

              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
                <div className="h-full bg-brand" style={{ width: `${progress.percent}%` }} />
              </div>

              <Button
                size="icon"
                variant="ghost"
                aria-label={`从继续观看中移除 ${title.name}`}
                className="absolute right-1.5 top-1.5 size-7 rounded-full bg-black/60 text-white opacity-0 transition hover:bg-black/90 group-hover/continue:opacity-100"
                onClick={() => dispatch(removeProgress(title.id))}
              >
                <X className="size-3.5" />
              </Button>
            </article>
          )
        })}
      </RailScroller>
    </section>
  )
}
