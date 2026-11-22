import { useState } from 'react'
import { cn } from 'cn'

import { paletteFor } from '@/lib/art'

interface ArtImageProps {
  src: string
  alt: string
  /** 用于生成占位渐变的稳定标识，默认取 alt */
  paletteId?: string
  className?: string
  imageClassName?: string
  eager?: boolean
}

/**
 * 影视画面容器：生成式画面加载较慢，先用稳定渐变色占位，加载完成后淡入。
 */
export function ArtImage({ src, alt, paletteId, className, imageClassName, eager }: ArtImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const [from, to] = paletteFor(paletteId ?? alt)

  return (
    <div
      className={cn('relative overflow-hidden bg-neutral-900', className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {state === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-white/5" aria-hidden />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-700',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
          imageClassName,
        )}
      />
      {state === 'failed' && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/50">
          画面待生成
        </div>
      )}
    </div>
  )
}
