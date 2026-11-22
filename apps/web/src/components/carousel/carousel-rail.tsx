import { CollectionCard } from '@/components/carousel/collection-card'
import { RailScroller } from '@/components/title/rail-scroller'
import { TitleCard } from '@/components/title/title-card'
import type { PublicCarousel } from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'

/** 轮播轨：影片渲染为影片卡片，专题渲染为专题拼贴卡片。 */
export function CarouselRail({ carousel, eager }: { carousel: PublicCarousel; eager?: boolean }) {
  if (!carousel.items.length) return null

  return (
    <section className="py-4">
      <h2 className="mb-3 px-4 text-base font-semibold text-white/90 md:px-12 md:text-lg">
        {carousel.title}
      </h2>
      <RailScroller>
        {carousel.items.map((item, index) =>
          item.targetType === 'collection' ? (
            <CollectionCard key={item.id} card={item} eager={eager && index < 4} />
          ) : (
            <TitleCard key={item.id} title={cardToTitle(item)} eager={eager && index < 4} />
          ),
        )}
      </RailScroller>
    </section>
  )
}
