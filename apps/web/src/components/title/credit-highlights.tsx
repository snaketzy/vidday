import { cn } from 'cn'
import { Link } from 'react-router'

import { PersonAvatar } from '@/components/title/person-avatar'
import type { CreditHighlight } from '@/lib/credits'

function HighlightTile({ highlight }: { highlight: CreditHighlight }) {
  const { label, entry } = highlight

  const body = (
    <div className="flex w-[112px] flex-col items-center text-center">
      <p className="text-[11px] font-semibold tracking-wide text-white/45">{label}</p>
      <PersonAvatar
        src={entry.avatarUrl}
        name={entry.name}
        paletteId={entry.englishName ?? entry.name}
        className="mt-2 size-[76px] border border-white/10 transition group-hover/credit:border-white/50"
      />
      {/* 英文在上、中文在下 */}
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-tight text-white/90">
        {entry.englishName ?? entry.name}
      </p>
      {entry.englishName ? (
        <p className="line-clamp-1 text-[11px] text-white/60">{entry.name}</p>
      ) : null}
    </div>
  )

  if (entry.personId === null) return <div className="shrink-0">{body}</div>

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

/** 详情页首屏署名：导演 + 男女主角 + 男女配角，点击进入影人页。 */
export function CreditHighlights({ items }: { items: CreditHighlight[] }) {
  return (
    <div className="row-scrollbar flex gap-6 overflow-x-auto pb-3">
      {items.map((item, index) => (
        <HighlightTile key={`${item.label}-${item.entry.personId ?? item.entry.name}-${index}`} highlight={item} />
      ))}
    </div>
  )
}
