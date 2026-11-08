import { Fragment, useMemo } from 'react'

import { CarouselBlock } from '@/components/carousel/carousel-block'
import { ContinueRail } from '@/components/title/continue-rail'
import { HeroBanner } from '@/components/title/hero-banner'
import { LatestRail } from '@/components/title/latest-rail'
import { useCarousels } from '@/hooks/use-carousels'
import { isKidsTitle } from '@/lib/catalog'
import { useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'

export function HomePage() {
  const titles = useAppSelector(selectAllTitles)
  const kidsOnly = useAppSelector(selectKidsMode)
  const { status, carousels } = useCarousels('home')

  /** 首屏候选：来自接口已并入 catalog 的影片，按热度取前 4 部 */
  const featured = useMemo(() => {
    const pool = kidsOnly ? titles.filter(isKidsTitle) : titles
    return [...pool].sort((a, b) => b.match - a.match).slice(0, 4)
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

  // 未配置 / 后端不可用：仅渲染首屏、最新上架与本地观看记录
  return (
    <div className="pb-6">
      <HeroBanner titles={featured} />
      <LatestRail />
      <ContinueRail />
    </div>
  )
}
