import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

import { TitleCard, type TitleCardVariant } from '@/components/title/title-card'
import { RailScroller } from '@/components/title/rail-scroller'
import type { Title } from '@/types'

interface TitleRailProps {
  heading: string
  titles: Title[]
  variant?: TitleCardVariant | 'standard'
  moreHref?: string
  eager?: boolean
}

export function TitleRail({ heading, titles, variant = 'standard', moreHref, eager }: TitleRailProps) {
  if (!titles.length) return null
  const cardVariant: TitleCardVariant = variant === 'standard' ? 'landscape' : variant

  return (
    <section className="group/rail-section py-4">
      <div className="mb-3 flex items-baseline gap-2 px-4 md:px-12">
        <h2 className="text-base font-semibold text-white/90 md:text-lg">{heading}</h2>
        {moreHref ? (
          <Link
            to={moreHref}
            className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-white/55 transition hover:text-white md:opacity-0 md:group-hover/rail-section:opacity-100"
          >
            查看全部
            <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
      <RailScroller>
        {titles.map((title, index) => (
          <TitleCard
            key={title.id}
            title={title}
            variant={cardVariant}
            rank={cardVariant === 'top10' ? title.top10 : undefined}
            eager={eager && index < 3}
          />
        ))}
      </RailScroller>
    </section>
  )
}
