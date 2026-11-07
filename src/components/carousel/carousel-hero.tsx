import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { cn } from 'cn'
import { Check, Info, Play, Plus } from 'lucide-react'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import { artwork } from '@/lib/art'
import { formatRuntime } from '@/lib/format'
import { toCollectionHref, toTitleHref, toWatchHref } from '@/lib/links'
import type { PublicCarousel } from '@/lib/public-api'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectMyListIds, toggleTitle } from '@/store/slices/my-list-slice'

/**
 * 轮播首屏：同一形态同时承载影片与专题。
 * 影片提供「播放 / 更多信息 / 片单」，专题提供「浏览专题」。
 */
export function CarouselHero({ carousel }: { carousel: PublicCarousel }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const listIds = useAppSelector(selectMyListIds)
  const items = carousel.items
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!carousel.autoplay || items.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length)
    }, carousel.intervalMs)
    return () => window.clearInterval(timer)
  }, [carousel.autoplay, carousel.intervalMs, items.length])

  useEffect(() => {
    if (index >= items.length) setIndex(0)
  }, [index, items.length])

  const item = items[index]
  if (!item) return null

  const isCollection = item.targetType === 'collection'
  const name = item.chineseTitle ?? item.englishTitle ?? item.title
  const english = item.chineseTitle && item.englishTitle ? item.englishTitle : null
  const image = item.backdropUrl ?? item.covers[0] ?? artwork(`${name}，影视剧照`, 'landscape_16_9')
  const inList = !isCollection && listIds.includes(String(item.targetId))

  const meta: string[] = []
  if (!isCollection) {
    meta.push(`${item.rating ? Math.round(item.rating * 10) : 0}% 匹配`)
    if (item.releaseYear) meta.push(String(item.releaseYear))
    if (item.runtime) meta.push(formatRuntime(item.runtime))
  }

  return (
    <section className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
      <ArtImage
        key={item.id}
        src={image}
        alt={name}
        paletteId={String(item.targetId)}
        eager
        className="absolute inset-0 h-full w-full animate-fade-in"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/85 to-transparent" />

      <div className="relative flex h-full flex-col justify-end pb-16 pl-4 pr-4 md:pb-24 md:pl-12 md:pr-[38%]">
        <div className="animate-fade-in">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">
            {isCollection ? '专题精选' : '本周必看'}
          </p>

          <h1 className="text-4xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-5xl lg:text-6xl">
            {name}
          </h1>
          {english ? <p className="mt-1 text-sm text-white/45">{english}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
            {meta.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
            {!isCollection && item.maturity ? (
              <span className="rounded border border-white/35 px-1.5 text-xs">{item.maturity}</span>
            ) : null}
          </div>

          {item.subtitle ? (
            <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
              {item.subtitle}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isCollection ? (
              <Button
                size="lg"
                className="bg-white text-black hover:bg-white/85"
                onClick={() => navigate(toCollectionHref(item.targetId))}
              >
                <Play className="size-5 fill-current" />
                浏览专题
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-white/85"
                  onClick={() => navigate(toWatchHref(item.targetId))}
                >
                  <Play className="size-5 fill-current" />
                  播放
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-white/25 text-white backdrop-blur hover:bg-white/35"
                  onClick={() => navigate(toTitleHref(item.targetId))}
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
                  onClick={() => dispatch(toggleTitle(String(item.targetId)))}
                >
                  {inList ? <Check className="size-5" /> : <Plus className="size-5" />}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {items.length > 1 ? (
        <div className="absolute bottom-8 right-4 z-10 hidden items-center gap-2 md:flex md:right-12">
          {items.map((entry, entryIndex) => (
            <button
              key={entry.id}
              type="button"
              aria-label={`切换到 ${entry.title}`}
              onClick={() => setIndex(entryIndex)}
              className={cn(
                'h-[3px] rounded-full transition-all',
                entryIndex === index ? 'w-8 bg-brand' : 'w-4 bg-white/35 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
