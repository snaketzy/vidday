import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { PersonAvatar } from '@/components/title/person-avatar'
import { jobLabel } from '@/lib/credits'
import {
  fetchPersonCollaborators,
  fetchPersonDetail,
  type PublicCollaborator,
  type PublicPersonCredit,
  type PublicPersonDetail,
} from '@/lib/public-api'
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

/** 合作影人卡：圆头像 + 中英姓名 + 共同作品数，点击进入影人页。宽度由外层栅格决定。 */
function CollaboratorTile({ item }: { item: PublicCollaborator }) {
  return (
    <Link
      to={`/person/${item.personId}`}
      className="group/credit flex w-full flex-col items-center text-center focus-visible:outline-none"
    >
      <PersonAvatar
        src={item.avatarUrl}
        name={item.name}
        paletteId={item.englishName ?? item.name}
        className="size-[76px] border border-white/10 transition group-hover/credit:border-white/50"
      />
      {/* 英文在上、中文在下 */}
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight text-white/90">
        {item.englishName ?? item.name}
      </p>
      {item.englishName ? (
        <p className="line-clamp-1 text-[11px] text-white/60">{item.name}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-white/45">合作 {item.sharedCount} 部</p>
    </Link>
  )
}

/** 影人页：基础资料 + 参演作品 + 合作影人。 */
export function PersonPage() {
  const { id } = useParams()
  const personId = id !== undefined && Number.isInteger(Number(id)) ? Number(id) : undefined

  const [status, setStatus] = useState<Status>(personId === undefined ? 'invalid' : 'loading')
  const [person, setPerson] = useState<PublicPersonDetail | null>(null)
  const [collaborators, setCollaborators] = useState<PublicCollaborator[]>([])

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

  // 合作影人是详情页的补充信息，失败时静默隐藏，不影响主体展示
  useEffect(() => {
    if (personId === undefined) return
    const controller = new AbortController()
    setCollaborators([])

    fetchPersonCollaborators(personId, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return
        setCollaborators(list)
      })
      .catch(() => undefined)

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
      {/* 影人圆形头像 + 基础资料：头像恒在姓名左侧 */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand/15 via-background to-background" />
        {/* 顶部留白避开固定顶栏（68px）并预留 32px 间距 */}
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-8 pt-[100px] md:px-12 md:pt-[112px]">
          <div className="flex items-center gap-5">
            <PersonAvatar
              src={person.avatarUrl}
              name={person.name}
              paletteId={person.englishName ?? person.name}
              className="size-24 border border-white/10 text-3xl"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">影人</p>
              <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                {person.englishName ?? person.name}
              </h1>
              {person.englishName ? (
                <p className="mt-1 text-lg text-white/60">{person.name}</p>
              ) : null}
            </div>
          </div>

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
      </section>

      {/* 参演作品 + 合作影人：与头部同宽居中 */}
      <div className="mx-auto w-full max-w-7xl px-4 md:px-12">
        <section className="mt-10">
          <div className="mb-4 flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-white/90 md:text-lg">参演作品</h2>
            <span className="text-xs text-white/45">{person.credits.length} 部</span>
          </div>
          {person.credits.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-6">
              {person.credits.map((credit) => (
                <WorkCard key={`${credit.titleId}-${credit.job}-${credit.character ?? ''}`} credit={credit} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/45">暂无收录作品。</p>
          )}
        </section>

        {/* 合作影人：与该影人出现在同一部作品里的其他影人 */}
        {collaborators.length ? (
          <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-white/90 md:text-lg">合作过的演职人员</h2>
              <span className="text-xs text-white/45">{collaborators.length} 位</span>
            </div>
            {/* flex 换行排列：宽屏每行 5 位，窄屏按可用宽度递减 */}
            <div className="flex flex-wrap gap-y-6">
              {collaborators.map((item) => (
                <div key={item.personId} className="w-1/3 px-2 md:w-1/4 lg:w-1/5">
                  <CollaboratorTile item={item} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
