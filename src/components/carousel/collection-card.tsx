import { useNavigate } from 'react-router'
import { cn } from 'cn'

import { ArtImage } from '@/components/art-image'
import { artwork } from '@/lib/art'
import { toCollectionHref } from '@/lib/links'
import type { PublicCarouselCard } from '@/lib/public-api'

interface CollectionCardProps {
  card: PublicCarouselCard
  className?: string
  eager?: boolean
}

/**
 * 专题卡片：用专题内影片的剧照拼贴成封面（与后台 `coverStrip` 同源），
 * 无剧照时回退到生成式画面。点击进入专题页。
 */
export function CollectionCard({ card, className, eager }: CollectionCardProps) {
  const navigate = useNavigate()
  const href = toCollectionHref(card.targetId)
  const covers = card.covers.slice(0, 4)
  const fallbackArt = artwork(`${card.title}，影视专题合集`, 'landscape_16_9')

  const open = () => navigate(href)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter') open()
      }}
      className={cn(
        'group/card relative aspect-video w-[224px] shrink-0 cursor-pointer overflow-hidden rounded-md bg-neutral-900 transition duration-300 sm:w-[252px] lg:w-[286px]',
        'hover:z-20 hover:ring-2 hover:ring-white/25',
        className,
      )}
    >
      {covers.length ? (
        <div className={cn('grid h-full w-full gap-0.5', covers.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {covers.map((cover, index) => (
            <ArtImage
              key={`${cover}-${index}`}
              src={cover}
              alt={card.title}
              paletteId={`${card.targetId}-${index}`}
              eager={eager}
              className="h-full w-full"
              imageClassName="transition duration-500 group-hover/card:scale-[1.06] group-hover/card:opacity-80"
            />
          ))}
        </div>
      ) : (
        <ArtImage
          src={fallbackArt}
          alt={card.title}
          paletteId={String(card.targetId)}
          eager={eager}
          className="h-full w-full"
          imageClassName="transition duration-500 group-hover/card:scale-[1.06] group-hover/card:opacity-80"
        />
      )}

      <span className="absolute left-0 top-0 rounded-br-sm bg-black/65 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand">
        专题
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-3">
        <p className="line-clamp-1 text-sm font-semibold text-white">{card.title}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">
          {card.subtitle ?? (covers.length ? `${covers.length} 部影片` : '专题合集')}
        </p>
      </div>
    </div>
  )
}
