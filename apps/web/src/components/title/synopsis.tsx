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
  /** 电影详情使用两行预览，并在截断处内联显示 MORE。 */
  moviePreview?: boolean
}

const movieMoreClass = 'inline-block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.15em]'
const moviePreviewLines = 2

function fitMoviePreview(paragraph: HTMLParagraphElement, text: string) {
  const maxHeight = moviePreviewLines * Number.parseFloat(getComputedStyle(paragraph).lineHeight) + 0.5
  const content = document.createTextNode(text)
  paragraph.replaceChildren(content)
  if (paragraph.getBoundingClientRect().height <= maxHeight) return null

  // 用实际排版为不可拆分的「… MORE」留位，不按字符数估算行宽。
  const suffix = document.createElement('span')
  const more = document.createElement('span')
  suffix.className = 'whitespace-nowrap'
  more.className = movieMoreClass
  more.textContent = 'More'
  suffix.append('… ', more)
  paragraph.append(suffix)

  const ends = [0]
  for (const { index, segment } of new Intl.Segmenter().segment(text)) {
    ends.push(index + segment.length)
  }
  let low = 0
  let high = ends.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    content.data = text.slice(0, ends[mid]).trimEnd()
    if (paragraph.getBoundingClientRect().height <= maxHeight) low = mid
    else high = mid - 1
  }
  return text.slice(0, ends[low]).trimEnd()
}

/**
 * 默认保留三行预览；电影详情用两行内联预览。两者共用全文弹层。
 */
export function Synopsis({ name, text, className, moviePreview = false }: SynopsisProps) {
  const textId = useId()
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const measureRef = useRef<HTMLParagraphElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [movieFit, setMovieFit] = useState<{ text: string; excerpt: string | null }>()
  const excerpt = movieFit?.text === text ? movieFit.excerpt : null
  const hasMore = moviePreview ? excerpt !== null : truncated
  const movieBodyClass = `text-base leading-6 whitespace-pre-line wrap-break-word ${className ?? ''}`

  useEffect(() => {
    const paragraph = paragraphRef.current
    if (!paragraph || moviePreview) return
    const measure = () => setTruncated(paragraph.scrollHeight > paragraph.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paragraph)
    return () => observer.disconnect()
  }, [moviePreview, text])

  useEffect(() => {
    const paragraph = measureRef.current
    const visible = paragraphRef.current
    if (!moviePreview || !paragraph || !visible) return
    const measure = () => {
      if (paragraph.clientWidth === 0) return
      const next = fitMoviePreview(paragraph, text)
      setMovieFit((previous) => previous?.text === text && previous.excerpt === next
        ? previous
        : { text, excerpt: next })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(visible)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [className, moviePreview, text])

  return (
    <Dialog>
      <div className="relative">
        {moviePreview ? (
          <>
            <p id={textId} ref={paragraphRef} className={`${movieBodyClass}${hasMore ? '' : ' line-clamp-2'}`}>
              {excerpt ?? text}
              {hasMore ? (
                <span className="whitespace-nowrap">
                  {'… '}
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`阅读《${name}》完整简介`}
                      className={`${movieMoreClass} text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
                    >
                      More
                    </button>
                  </DialogTrigger>
                </span>
              ) : null}
            </p>
            <p ref={measureRef} aria-hidden="true" className={`invisible absolute inset-x-0 top-0 ${movieBodyClass}`} />
          </>
        ) : (
          <p
            id={textId}
            ref={paragraphRef}
            className={`line-clamp-3 text-sm leading-relaxed break-words whitespace-pre-line ${className ?? ''}`}
          >
            {text}
          </p>
        )}
        {!moviePreview && truncated ? (
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
        ) : null}
      </div>
      {hasMore ? (
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
      ) : null}
    </Dialog>
  )
}
