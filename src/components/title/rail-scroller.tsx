import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface RailScrollerProps {
  children: ReactNode
  className?: string
  /** 每屏滚动比例 */
  ratio?: number
}

export function RailScroller({ children, className, ratio = 0.92 }: RailScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [pagination, setPagination] = useState({ pages: 1, page: 0 })

  const sync = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const pages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth))
    setEdges({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    })
    setPagination({ pages, page: Math.round(el.scrollLeft / el.clientWidth) })
  }, [])

  useEffect(() => {
    sync()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * ratio, behavior: 'smooth' })
  }

  const jumpToPage = (page: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className={cn('group/rail relative', className)}>
      <div ref={scrollerRef} className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 md:px-12">
        {children}
      </div>

      {edges.left ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-12 items-center justify-center bg-gradient-to-r from-background to-transparent opacity-0 transition group-hover/rail:opacity-100 md:flex">
          <Button
            size="icon"
            variant="ghost"
            aria-label="向前滚动"
            className="pointer-events-auto size-9 rounded-full bg-black/50 text-white hover:bg-black/80"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft className="size-5" />
          </Button>
        </div>
      ) : null}

      {edges.right ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-30 hidden w-12 items-center justify-center bg-gradient-to-l from-background to-transparent opacity-0 transition group-hover/rail:opacity-100 md:flex">
          <Button
            size="icon"
            variant="ghost"
            aria-label="向后滚动"
            className="pointer-events-auto size-9 rounded-full bg-black/50 text-white hover:bg-black/80"
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      ) : null}

      {pagination.pages > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: pagination.pages }).map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`第 ${index + 1} 屏`}
              onClick={() => jumpToPage(index)}
              className={cn(
                'h-[2px] rounded-full transition-all',
                index === pagination.page ? 'w-6 bg-white/85' : 'w-3 bg-white/30 hover:bg-white/55',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
