import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface SynopsisProps {
  /** 作品名，用作弹层标题与可访问名称。 */
  name: string
  text: string
  /** 简介正文的附加类，由调用方决定配色与间距。 */
  className?: string
}

/**
 * 超长简介：正文内联截断到三行，末行末尾接 `MORE`，点击打开居中弹层读全文。
 * 对齐 Infuse 影片详情页的处理。
 */
export function Synopsis({ name, text, className }: SynopsisProps) {
  const textId = useId()
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    const paragraph = paragraphRef.current
    if (!paragraph) return
    const measure = () => setTruncated(paragraph.scrollHeight > paragraph.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paragraph)
    return () => observer.disconnect()
  }, [text])

  return (
    <div className="relative">
      <p
        id={textId}
        ref={paragraphRef}
        className={`line-clamp-3 text-sm leading-relaxed break-words whitespace-pre-line ${className ?? ''}`}
      >
        {text}
      </p>
      {truncated ? (
        <Dialog>
          <DialogTrigger asChild>
            {/* 覆盖在末行右侧的入口，用同底色渐变遮住被截断的文字尾部。 */}
            <button
              type="button"
              aria-label={`阅读《${name}》完整简介`}
              className="absolute right-0 bottom-0 inline-flex items-center bg-gradient-to-l from-background from-55% to-transparent pl-6 text-xs font-semibold uppercase tracking-[0.15em] text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              More
            </button>
          </DialogTrigger>
          <DialogContent
            data-synopsis-dialog=""
            showCloseButton={false}
            className="gap-0 border-white/10 bg-[#181818] p-0 text-white sm:max-w-lg"
          >
            {/* 根元素已保留 stable gutter，只抵消当前弹窗重复的滚动条补偿。 */}
            <style>{`
              @supports (scrollbar-gutter: stable) {
                body[data-scroll-locked]:has(> [data-synopsis-dialog]) {
                  margin-right: 0 !important;
                }
              }
            `}</style>
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="关闭"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="size-5" />
                </button>
              </DialogClose>
              <DialogTitle className="min-w-0 flex-1 truncate text-center text-base font-semibold">
                {name}
              </DialogTitle>
              {/* 与左侧关闭按钮等宽的占位，保证标题居中。 */}
              <span aria-hidden className="size-9 shrink-0" />
            </div>
            <DialogDescription className="sr-only">《{name}》的完整简介</DialogDescription>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/90">{text}</p>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
