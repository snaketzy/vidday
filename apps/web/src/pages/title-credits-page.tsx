import { useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { PersonAvatar } from '@/components/title/person-avatar'
import { useResolvedTitle } from '@/hooks/use-resolved-title'
import { useTitleCredits } from '@/hooks/use-title-credits'
import { creditRoleLabel, departmentLabel } from '@/lib/credits'
import type { PublicCreditEntry } from '@/lib/public-api'
import { NotFoundPage } from '@/pages/not-found-page'

/** 名单行：头像 + 中英姓名 + 角色/职位，点击进入影人页。 */
function CreditRow({ entry }: { entry: PublicCreditEntry }) {
  const body = (
    <div className="flex items-center gap-3">
      <PersonAvatar
        src={entry.avatarUrl}
        name={entry.name}
        paletteId={entry.englishName ?? entry.name}
        className="size-12 border border-white/10"
      />
      <div className="min-w-0">
        {/* 英文在上、中文在下 */}
        <p className="truncate text-sm font-medium text-white/90">
          {entry.englishName ?? entry.name}
        </p>
        {entry.englishName ? (
          <p className="truncate text-xs text-white/55">{entry.name}</p>
        ) : null}
        <p className="mt-0.5 truncate text-xs text-white/45">{creditRoleLabel(entry)}</p>
      </div>
    </div>
  )

  if (entry.personId === null) return <div className="p-1">{body}</div>

  return (
    <Link
      to={`/person/${entry.personId}`}
      className="rounded-md p-1 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {body}
    </Link>
  )
}

/** 演职人员全名单：演员 + 按部门分组的制作团队。 */
export function TitleCreditsPage() {
  const { id } = useParams()
  const { title } = useResolvedTitle(id)
  const { credits, status } = useTitleCredits(id)

  /** 按部门分组并保留首次出现顺序（署名表已按 sort_order 排好）。 */
  const crewGroups = useMemo(() => {
    if (!credits) return [] as [string, PublicCreditEntry[]][]
    const groups = new Map<string, PublicCreditEntry[]>()
    for (const entry of credits.crew) {
      const list = groups.get(entry.department)
      if (list) list.push(entry)
      else groups.set(entry.department, [entry])
    }
    return [...groups.entries()]
  }, [credits])

  if (status === 'error') return <NotFoundPage />
  if (!credits) return <div className="min-h-[70vh] animate-pulse bg-white/5" />

  const total = credits.cast.length + credits.crew.length

  return (
    <div className="px-4 pb-16 pt-8 md:px-12">
      <Link
        to={`/title/${id}`}
        className="inline-flex items-center gap-1 text-sm text-white/55 transition hover:text-white"
      >
        <ChevronLeft className="size-4" />
        返回详情
      </Link>

      <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">演职人员</h1>
      {title ? (
        <p className="mt-1 text-sm text-white/50">
          {title.name}
          <span className="text-white/35"> · 共 {total} 人</span>
        </p>
      ) : null}

      {credits.cast.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white/90">
            演员<span className="ml-2 text-sm font-normal text-white/40">{credits.cast.length}</span>
          </h2>
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {credits.cast.map((entry, index) => (
              <CreditRow key={`cast-${entry.personId ?? entry.name}-${index}`} entry={entry} />
            ))}
          </div>
        </section>
      ) : null}

      {crewGroups.map(([department, members]) => (
        <section key={department} className="mt-10">
          <h2 className="text-lg font-semibold text-white/90">
            {departmentLabel(department)}
            <span className="ml-2 text-sm font-normal text-white/40">{members.length}</span>
          </h2>
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((entry, index) => (
              <CreditRow key={`${department}-${entry.personId ?? entry.name}-${index}`} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
