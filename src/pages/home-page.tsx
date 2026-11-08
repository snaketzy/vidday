import { Fragment, useMemo } from 'react'

import { CarouselBlock } from '@/components/carousel/carousel-block'
import { ContinueRail } from '@/components/title/continue-rail'
import { HeroBanner } from '@/components/title/hero-banner'
import { LatestRail } from '@/components/title/latest-rail'
import { TitleRail } from '@/components/title/title-rail'
import { HOME_RAILS, KIDS_RAILS } from '@/data/rails'
import { FEATURED_IDS } from '@/data/titles'
import { useCarousels } from '@/hooks/use-carousels'
import { isKidsTitle, lookupTitles, resolveRail } from '@/lib/catalog'
import { useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'

export function HomePage() {
  const titles = useAppSelector(selectAllTitles)
  const kidsOnly = useAppSelector(selectKidsMode)
  const { status, carousels } = useCarousels('home')

  const { featured, rails } = useMemo(() => {
    const pool = kidsOnly ? titles.filter(isKidsTitle) : titles
    const picks = lookupTitles(FEATURED_IDS, pool)
    const fallback = [...pool].sort((a, b) => b.match - a.match).slice(0, 4)
    const railList = (kidsOnly ? KIDS_RAILS : HOME_RAILS)
      .map((rail) => ({ rail, list: resolveRail(rail, pool) }))
      .filter((entry) => entry.rail.variant === 'continue' || entry.list.length > 0)
    return { featured: picks.length ? picks : fallback, rails: railList }
  }, [titles, kidsOnly])

  // 后台配置了轮播：完全以配置驱动（首屏 + 各轨）；「最新上架」紧跟首屏，其后是「继续观看」
  if (status === 'ready' && carousels.length) {
    const heroFirst = carousels[0]?.variant === 'hero'
    return (
      <div className="pb-6">
        {heroFirst ? null : (
          <>
            <LatestRail />
            <ContinueRail />
          </>
        )}
        {carousels.map((carousel, index) => (
          <Fragment key={carousel.id}>
            <CarouselBlock carousel={carousel} eager={index === 0} />
            {heroFirst && index === 0 ? (
              <>
                <LatestRail />
                <ContinueRail />
              </>
            ) : null}
          </Fragment>
        ))}
      </div>
    )
  }

  // 未配置 / 后端不可用：回退到内置演示片单，保证播放器链路可用
  return (
    <div className="pb-6">
      <HeroBanner titles={featured} />
      <LatestRail />

      <div className="relative z-10 -mt-2 md:-mt-4">
        {rails.map(({ rail, list }, index) =>
          rail.variant === 'continue' ? (
            <ContinueRail key={rail.id} heading={rail.title} />
          ) : (
            <TitleRail
              key={rail.id}
              heading={rail.title}
              titles={list}
              variant={rail.variant === 'top10' ? 'top10' : rail.variant === 'poster' ? 'poster' : 'standard'}
              moreHref={rail.genreId ? `/browse?genre=${rail.genreId}` : '/browse'}
              eager={index === 0}
            />
          ),
        )}
      </div>
    </div>
  )
}
