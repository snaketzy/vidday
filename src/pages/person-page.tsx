import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { jobLabel } from '@/lib/credits'
import { fetchPersonDetail, type PublicPersonCredit, type PublicPersonDetail } from '@/lib/public-api'
import { NotFoundPage } from '@/pages/not-found-page'

type Status = 'loading' | 'ready' | 'error' | 'invalid'

/** 作品海报卡：无海报时用稳定渐变占位。 */
function WorkCard({ credit }: { credit: PublicPersonCredit }) {
  const role = credit.character ? `饰 ${credit.character}` : jobLabel(credit.job)

  return (
    <Link
      to={`/title/${credit.titleId}`}
      className="group/work w-[136px] shrink-0 focus-visible:outline-none sm:w-[148px]"
    >
      <div className="relative overflow-hidden rounded-md">
        {credit.posterUrl ? (
          <ArtImage
            src={credit.posterUrl}
            alt={credit.title}
            paletteId={`${credit.titleId}`}
            className="aspect-[2/3] w-full"
            imageClassName="transition duration-500 group-hover/work:scale-[1.05] group-hover/work:opacity-80"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-neutral-900 px-2 text-center text-[11px] text-white/40">
            {credit.title}
          </div>
        )}
        {credit.rating ? (
          <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            {credit.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      {/* 英文在上、中文在下 */}
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight text-white/90">
        {credit.englishTitle ?? credit.title}
      </p>
      {credit.chineseTitle ? (
        <p className="line-clamp-1 text-[11px] text-white/60">{credit.chineseTitle}</p>
      ) : null}
      <p className="mt-1 line-clamp-1 text-[11px] text-white/45">
        {[credit.releaseYear ?? undefined, role].filter(Boolean).join(' · ')}
      </p>
    </Link>
  )
}

/** 影人页：基础资料 + 参演作品。 */
export function PersonPage() {
  const { id } = useParams()
  const personId = id !== undefined && Number.isInteger(Number(id)) ? Number(id) : undefined

  const [status, setStatus] = useState<Status>(personId === undefined ? 'invalid' : 'loading')
  const [person, setPerson] = useState<PublicPersonDetail | null>(null)

  useEffect(() => {
    if (personId === undefined) return
    const controller = new AbortController()
    setStatus('loading')

    fetchPersonDetail(personId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        setPerson(detail)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [personId])

  const meta = useMemo(() => {
    if (!person) return []
    return [
      { label: '生日', value: person.birthday },
      { label: '逝世', value: person.deathday },
      { label: '出生地', value: person.placeOfBirth },
      { label: '国籍', value: person.nationality },
      { label: '毕业院校', value: person.school },
      { label: '职业', value: person.knownFor },
    ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  }, [person])

  if (status === 'invalid' || status === 'error') return <NotFoundPage />
  if (status === 'loading' || !person) {
    return <div className="min-h-[70vh] animate-pulse bg-white/5" />
  }

  return (
    <div className="pb-12">
      {/* 影人头像 + 基础资料 */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand/15 via-background to-background" />
        <div className="relative flex flex-col gap-6 px-4 pb-8 pt-10 md:flex-row md:gap-10 md:px-12 md:pt-14">
          <div className="w-[160px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-neutral-900 md:w-[200px]">
            {person.avatarUrl ? (
              <img
                src={person.avatarUrl}
                alt={person.name}
                decoding="async"
                className="aspect-[2/3] h-full w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/3] w-full items-center justify-center text-4xl font-bold text-white/60">
                {person.name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">影人</p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              {person.englishName ?? person.name}
            </h1>
            {person.englishName ? (
              <p className="mt-1 text-lg text-white/60">{person.name}</p>
            ) : null}

            {meta.length ? (
              <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                {meta.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-white/40">{item.label}</dt>
                    <dd className="mt-0.5 text-white/85">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {person.biography ? (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-white/90">简介</h2>
                <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-white/70">
                  {person.biography}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 参演作品 */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline gap-2 px-4 md:px-12">
          <h2 className="text-base font-semibold text-white/90 md:text-lg">参演作品</h2>
          <span className="text-xs text-white/45">{person.credits.length} 部</span>
        </div>
        {person.credits.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-6 px-4 md:px-12">
            {person.credits.map((credit) => (
              <WorkCard key={`${credit.titleId}-${credit.job}-${credit.character ?? ''}`} credit={credit} />
            ))}
          </div>
        ) : (
          <p className="px-4 text-sm text-white/45 md:px-12">暂无收录作品。</p>
        )}
      </section>
    </div>
  )
}
