import { Check, Settings } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { cn } from 'cn'
import { DropdownMenu as Menu } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatTime } from '@/lib/format'

interface Option {
  key: string
  label: string
}

interface SettingsGroup {
  label: string
  value: string
  options: Option[]
  externalOptions?: Option[]
  emptyLabel?: string
  onChange: (value: string) => void
}

export function PlaybackSettings({
  groups,
  portalContainer,
  autoplayNext,
  onAutoplayNext,
  onOpenChange,
}: {
  groups: SettingsGroup[]
  portalContainer: HTMLElement | null
  autoplayNext: boolean
  onAutoplayNext: (checked: boolean) => void
  onOpenChange: (open: boolean) => void
}) {
  const menuClass = 'z-100 max-w-[calc(100vw-1rem)] border-white/10 bg-black/45 backdrop-blur-xl backdrop-saturate-150 text-white'

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="播放设置" className="size-7 text-white hover:bg-white/15 focus-visible:ring-white/40 sm:size-9">
          <Settings className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className={menuClass}
        portalContainer={portalContainer}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {groups.map(({ label, value, options, externalOptions, emptyLabel, onChange }) => {
          const current = [...options, ...(externalOptions ?? [])].find((option) => option.key === value)
          const renderOption = (option: Option) => (
            <Menu.RadioItem
              key={option.key}
              value={option.key}
              className="relative flex cursor-pointer items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-none focus:bg-white/20"
            >
              <Menu.ItemIndicator className="absolute left-2">
                <Check className="size-4" />
              </Menu.ItemIndicator>
              {option.label}
            </Menu.RadioItem>
          )
          return (
            <DropdownMenuSub key={label}>
              <DropdownMenuSubTrigger className="cursor-pointer gap-3 focus:bg-white/20 data-[state=open]:bg-white/20">
                <span className="shrink-0">{label}</span>
                {current ? (
                  <span className="max-w-28 truncate text-xs text-white/75" title={current.label}>
                    {current.label}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <Menu.Portal container={portalContainer ?? undefined}>
                <DropdownMenuSubContent className={cn(menuClass, 'max-h-(--radix-dropdown-menu-content-available-height) w-max max-w-[min(15rem,calc(100vw-1rem))] overflow-y-auto')}>
                  <Menu.RadioGroup aria-label={label} value={value} onValueChange={onChange}>
                    {options.map(renderOption)}
                    {externalOptions?.length ? (
                      <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <Menu.Label className="px-2 py-1 text-xs text-white/75">外挂字幕（PGS）</Menu.Label>
                        {externalOptions.map(renderOption)}
                      </>
                    ) : null}
                  </Menu.RadioGroup>
                  {emptyLabel ? <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem> : null}
                </DropdownMenuSubContent>
              </Menu.Portal>
            </DropdownMenuSub>
          )
        })}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuCheckboxItem
          checked={autoplayNext}
          onCheckedChange={(checked) => onAutoplayNext(Boolean(checked))}
          onSelect={(event) => event.preventDefault()}
          className="cursor-pointer"
        >
          自动播放下一集
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface ThumbnailIndex {
  width: number
  height: number
  columns: number
  rows: number
  count: number
  duration: number
  files: string[]
  indexUrl: string
}

interface PreviewTarget {
  seconds: number
  width: number
  top: number
}

function SpritePreview({ index, target }: { index: ThumbnailIndex; target: PreviewTarget }) {
  const { count, duration, columns, rows, width, height, files, indexUrl } = index
  const tile = Math.min(count - 1, Math.floor((target.seconds / duration) * count))
  const tilesPerSheet = columns * rows
  const file = files[Math.min(files.length - 1, Math.floor(tile / tilesPerSheet))]
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!file) return null
  let url: string
  try {
    url = new URL(file, indexUrl).href
  } catch {
    return null
  }
  if (url === failedUrl) return null
  const scale = Math.min(1, target.width / width, Math.max(0, target.top - 48) / height)
  if (scale <= 0) return null
  const tileWidth = width * scale
  const tileHeight = height * scale
  const offset = tile % tilesPerSheet
  return (
    <div className="relative overflow-hidden rounded-sm" style={{ width: tileWidth, height: tileHeight }}>
      <img
        src={url}
        alt=""
        draggable={false}
        onError={() => setFailedUrl(url)}
        className="absolute max-w-none"
        style={{
          width: columns * tileWidth,
          height: rows * tileHeight,
          left: -(offset % columns) * tileWidth,
          top: -Math.floor(offset / columns) * tileHeight,
        }}
      />
    </div>
  )
}

export function PlaybackTimeline({
  position,
  duration,
  buffered,
  thumbnails,
  onSeek,
  onDragChange,
}: {
  position: number
  duration: number
  buffered: number
  thumbnails: ThumbnailIndex | null
  onSeek: (seconds: number) => void
  onDragChange: (dragging: boolean) => void
}) {
  const pointer = useRef<number | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [dragging, setDragging] = useState(false)
  const canSeek = Number.isFinite(duration) && duration > 0
  const shownSeconds = dragging && preview ? preview.seconds : position
  const percent = (seconds: number) => canSeek ? Math.min(100, Math.max(0, seconds / duration * 100)) : 0

  const getTarget = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width, top } = event.currentTarget.getBoundingClientRect()
    if (!canSeek || !width) return null
    const ratio = Math.min(1, Math.max(0, (event.clientX - left) / width))
    return { seconds: ratio * duration, width, top }
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    setDragging(false)
    setPreview(null)
    onDragChange(false)
    const target = commit ? getTarget(event) : null
    if (target) onSeek(target.seconds)
  }

  // Use a half-width inset to clamp the bubble, independent of playback position.
  const previewWidth = preview
    ? Math.min(preview.width, Math.max(64, thumbnails?.width ?? 0))
    : 0

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="min-w-10 shrink-0 text-right text-xs tabular-nums text-white/85">{formatTime(shownSeconds)}</span>
      <div
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-disabled={!canSeek}
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={canSeek ? duration : 0}
        aria-valuenow={canSeek ? Math.min(duration, Math.max(0, shownSeconds)) : 0}
        aria-valuetext={formatTime(shownSeconds)}
        className="group relative flex h-6 min-w-0 flex-1 touch-none items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current !== null) return
          const target = getTarget(event)
          if (!target) return
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          pointer.current = event.pointerId
          setDragging(true)
          setPreview(target)
          onDragChange(true)
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId || (pointer.current === null && event.pointerType === 'mouse')) {
            setPreview(getTarget(event))
          }
        }}
        onPointerLeave={() => {
          if (pointer.current === null) setPreview(null)
        }}
        onPointerUp={(event) => finishDrag(event, true)}
        onPointerCancel={(event) => finishDrag(event, false)}
        onLostPointerCapture={(event) => finishDrag(event, false)}
        onKeyDown={(event) => {
          if (pointer.current !== null) {
            if (event.key === 'Tab') return
            event.preventDefault()
            if (event.key === 'Escape') {
              const pointerId = pointer.current
              pointer.current = null
              setDragging(false)
              setPreview(null)
              onDragChange(false)
              event.currentTarget.releasePointerCapture(pointerId)
            }
            return
          }
          if (!canSeek || (event.key !== 'Home' && event.key !== 'End')) return
          event.preventDefault()
          onSeek(event.key === 'Home' ? 0 : duration)
        }}
      >
        <div aria-hidden="true" className="pointer-events-none relative h-1 w-full rounded-full bg-white/25 transition-all group-hover:h-2">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${percent(buffered)}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${percent(shownSeconds)}%` }} />
          <div className="absolute top-1/2 size-3 -translate-1/2 rounded-full bg-brand" style={{ left: `${percent(shownSeconds)}%` }} />
        </div>
        {preview && canSeek ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full z-10 mb-2 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: Math.min(preview.width - previewWidth / 2, Math.max(previewWidth / 2, percent(preview.seconds) * preview.width / 100)) }}
          >
            {thumbnails ? <SpritePreview index={thumbnails} target={preview} /> : null}
            <span className="rounded bg-black/90 px-1.5 py-0.5 text-xs tabular-nums text-white">{formatTime(preview.seconds)}</span>
          </div>
        ) : null}
      </div>
      <span className="min-w-10 shrink-0 text-xs tabular-nums text-white/70">{formatTime(duration)}</span>
    </div>
  )
}
