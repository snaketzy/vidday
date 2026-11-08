import { cn } from 'cn'
import { Link } from 'react-router'

import { PersonAvatar } from '@/components/title/person-avatar'
import { creditRoleLabel } from '@/lib/credits'
import type { PublicCreditEntry } from '@/lib/public-api'

function CreditTile({ entry }: { entry: PublicCreditEntry }) {
  const body = (
    <div className="flex w-[104px] flex-col items-center text-center">
      <PersonAvatar
        src={entry.avatarUrl}
        name={entry.name}
        paletteId={entry.englishName ?? entry.name}
        className="size-[84px] border border-white/10 transition group-hover/credit:border-white/50"
      />
      {/* 英文在上、中文在下 */}
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight text-white/90">
        {entry.englishName ?? entry.name}
      </p>
      {entry.englishName ? (
        <p className="line-clamp-1 text-[11px] text-white/60">{entry.name}</p>
      ) : null}
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/45">
        {creditRoleLabel(entry)}
      </p>
    </div>
  )

  if (entry.personId === null) {
    return <div className="shrink-0 cursor-default">{body}</div>
  }

  return (
    <Link
      to={`/person/${entry.personId}`}
      className={cn(
        'group/credit shrink-0 rounded-md opacity-95 transition hover:opacity-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      )}
    >
      {body}
    </Link>
  )
}

/** 演职员横向轨：圆头像 + 中英姓名 + 角色/职位，点击进入影人页。 */
export function CreditRail({ entries }: { entries: PublicCreditEntry[] }) {
  return (
    <div className="row-scrollbar flex gap-4 overflow-x-auto pb-3">
      {entries.map((entry, index) => (
        <CreditTile key={`${entry.personId ?? entry.name}-${index}`} entry={entry} />
      ))}
    </div>
  )
}
