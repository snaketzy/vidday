import { useState } from 'react'
import { cn } from 'cn'

import { paletteFor } from '@/lib/art'

interface PersonAvatarProps {
  src: string | null
  name: string
  /** 决定兜底渐变色的稳定 id（影人英文名或 ID） */
  paletteId: string
  className?: string
}

/** 影人头像：圆形，加载失败或缺失时用姓名首字 + 稳定渐变兜底。尺寸由调用方用 className 控制。 */
export function PersonAvatar({ src, name, paletteId, className }: PersonAvatarProps) {
  const [failed, setFailed] = useState(false)
  const [from, to] = paletteFor(paletteId)

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-full', className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-semibold text-white/85">
          {name.slice(0, 1)}
        </span>
      )}
    </div>
  )
}
