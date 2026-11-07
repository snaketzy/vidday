import { CarouselHero } from '@/components/carousel/carousel-hero'
import { CarouselRail } from '@/components/carousel/carousel-rail'
import type { PublicCarousel } from '@/lib/public-api'

/** 后台一个轮播的渲染入口：按 variant 分派到首屏或横向轨。 */
export function CarouselBlock({ carousel, eager }: { carousel: PublicCarousel; eager?: boolean }) {
  if (carousel.variant === 'hero') return <CarouselHero carousel={carousel} />
  return <CarouselRail carousel={carousel} eager={eager} />
}
