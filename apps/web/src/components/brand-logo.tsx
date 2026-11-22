import { cn } from 'cn'
import { Link } from 'react-router'

interface BrandLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  asLink?: boolean
}

const SIZES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'text-xl',
  md: 'text-2xl md:text-[26px]',
  lg: 'text-4xl',
}

export function BrandLogo({ className, size = 'md', asLink = true }: BrandLogoProps) {
  const content = (
    <span
      className={cn(
        'text-brand font-black uppercase leading-none tracking-[-0.03em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
        SIZES[size],
      )}
    >
      vidday
    </span>
  )

  if (!asLink) return <span className={className}>{content}</span>

  return (
    <Link
      to="/"
      aria-label="vidday 首页"
      className={cn('inline-flex select-none items-center', className)}
    >
      {content}
    </Link>
  )
}
