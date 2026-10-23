import { useEffect, useState } from 'react'
import { cn } from 'cn'
import { Check, Info, Play, Plus } from 'lucide-react'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import { usePlayTarget } from '@/hooks/use-play-target'
import { backdrop } from '@/lib/art'
import { episodeCount, formatRuntime } from '@/lib/format'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectMyListIds, toggleTitle } from '@/store/slices/my-list-slice'
import { openPreview } from '@/store/slices/ui-slice'
import type { Title } from '@/types'

interface HeroBannerProps {
  titles: Title[]
  intervalMs?: number
}

export function HeroBanner({ titles, intervalMs = 12000 }: HeroBannerProps) {
  const dispatch = useAppDispatch()
  const play = usePlayTarget()
  const listIds = useAppSelector(selectMyListIds)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (titles.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % titles.length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [titles.length, intervalMs])

  useEffect(() => {
    if (index >= titles.length) setIndex(0)
  }, [index, titles.length])

  const title = titles[index]
  if (!title) return null

  const inList = listIds.includes(title.id)

  return (
    <section className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
      <ArtImage
        key={title.id}
        src={backdrop(title.art)}
        alt={title.name}
        paletteId={title.id}
        eager
        className="absolute inset-0 h-full w-full animate-fade-in"
      />

      {/* 渐隐遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/85 to-transparent" />

      <div className="relative flex h-full flex-col justify-end pb-16 pl-4 pr-4 md:pb-24 md:pl-12 md:pr-[38%]">
        <div className="animate-fade-in">
          {title.isOriginal ? (
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">
              vidday 原创
            </p>
          ) : (
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">本周必看</p>
          )}

          <h1 className="text-4xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-5xl lg:text-6xl">
            {title.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
            <span className="font-semibold text-emerald-400">{title.match}% 匹配</span>
            <span>{title.year}</span>
            <span className="rounded border border-white/35 px-1.5 text-xs">{title.maturity}</span>
            <span>
              {title.type === 'movie' && title.runtime
                ? formatRuntime(title.runtime)
                : `${title.seasons.length} 季 · ${episodeCount(title.seasons)} 集`}
            </span>
            {title.top10 ? (
              <span className="flex items-center gap-1 font-semibold text-white">
                <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[11px] font-bold">TOP 10</span>
                今日第 {title.top10} 名
              </span>
            ) : null}
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
            {title.logline}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/85"
              onClick={() => play(title)}
            >
              <Play className="size-5 fill-current" />
              播放
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="bg-white/25 text-white backdrop-blur hover:bg-white/35"
              onClick={() => dispatch(openPreview(title.id))}
            >
              <Info className="size-5" />
              更多信息
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={inList ? '从我的片单移除' : '加入我的片单'}
              className={cn(
                'size-11 rounded-full border-white/40 bg-black/40 text-white hover:border-white hover:bg-black/70',
                inList && 'border-white/80',
              )}
              onClick={() => dispatch(toggleTitle(title.id))}
            >
              {inList ? <Check className="size-5" /> : <Plus className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-4 z-10 hidden items-center gap-2 md:flex md:right-12">
        {titles.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={`切换到 ${item.name}`}
            onClick={() => setIndex(itemIndex)}
            className={cn(
              'h-[3px] rounded-full transition-all',
              itemIndex === index ? 'w-8 bg-brand' : 'w-4 bg-white/35 hover:bg-white/70',
            )}
          />
        ))}
      </div>
    </section>
  )
}
