import { useMemo } from 'react'

import { ContinueRail } from '@/components/title/continue-rail'
import { HeroBanner } from '@/components/title/hero-banner'
import { TitleRail } from '@/components/title/title-rail'
import { HOME_RAILS, KIDS_RAILS } from '@/data/rails'
import { FEATURED_IDS } from '@/data/titles'
import { isKidsTitle, lookupTitles, resolveRail } from '@/lib/catalog'
import { useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'

export function HomePage() {
  const titles = useAppSelector(selectAllTitles)
  const kidsOnly = useAppSelector(selectKidsMode)

  const { featured, rails } = useMemo(() => {
    const pool = kidsOnly ? titles.filter(isKidsTitle) : titles
    const picks = lookupTitles(FEATURED_IDS, pool)
    const fallback = [...pool].sort((a, b) => b.match - a.match).slice(0, 4)
    const railList = (kidsOnly ? KIDS_RAILS : HOME_RAILS)
      .map((rail) => ({ rail, list: resolveRail(rail, pool) }))
      .filter((entry) => entry.rail.variant === 'continue' || entry.list.length > 0)
    return { featured: picks.length ? picks : fallback, rails: railList }
  }, [titles, kidsOnly])

  return (
    <div className="pb-6">
      <HeroBanner titles={featured} />

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
