import { Check, Play, Plus, Volume2, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePlayTarget } from '@/hooks/use-play-target'
import { backdrop } from '@/lib/art'
import { episodeCount, formatRuntime } from '@/lib/format'
import { genreNames } from '@/data/genres'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsInMyList, toggleTitle } from '@/store/slices/my-list-slice'
import { selectSimilar, selectTitleById } from '@/store/slices/catalog-slice'
import { closePreview, selectPreviewTitleId } from '@/store/slices/ui-slice'

export function TitlePreviewDialog() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const play = usePlayTarget()
  const previewId = useAppSelector(selectPreviewTitleId)
  const title = useAppSelector((state) => selectTitleById(state, previewId ?? undefined))
  const inList = useAppSelector((state) => selectIsInMyList(state, previewId ?? ''))
  const similar = useAppSelector((state) => (title ? selectSimilar(state, title, 6) : []))

  const open = Boolean(previewId && title)

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dispatch(closePreview()) : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-y-auto border-white/10 bg-[#181818] p-0 text-white sm:max-w-3xl"
      >
        {title ? (
          <>
            <div className="relative">
              <ArtImage
                src={backdrop(title.art)}
                alt={title.name}
                paletteId={title.id}
                className="aspect-video w-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-black/30" />
              <div className="absolute bottom-5 left-6 right-6">
                <DialogTitle className="text-3xl font-black tracking-tight text-white drop-shadow">
                  {title.name}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {title.name} 的简介与播放选项
                </DialogDescription>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button className="bg-white text-black hover:bg-white/85" onClick={() => { play(title); dispatch(closePreview()) }}>
                    <Play className="size-4 fill-current" />
                    {title.type === 'series' ? '播放第 1 季' : '播放'}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={inList ? '从我的片单移除' : '加入我的片单'}
                    className="size-9 rounded-full border-white/50 bg-black/40 text-white hover:border-white hover:bg-black/70"
                    onClick={() => dispatch(toggleTitle(title.id))}
                  >
                    {inList ? <Check className="size-4" /> : <Plus className="size-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="静音"
                    className="size-9 rounded-full border-white/50 bg-black/40 text-white hover:border-white hover:bg-black/70"
                  >
                    <Volume2 className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="关闭"
                    className="ml-auto size-9 rounded-full bg-black/50 text-white hover:bg-black/80"
                    onClick={() => dispatch(closePreview())}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-[2fr_1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-emerald-400">{title.match}% 匹配</span>
                  <span className="text-white/70">{title.year}</span>
                  <span className="rounded border border-white/35 px-1.5 text-xs text-white/80">{title.maturity}</span>
                  <span className="text-white/70">
                    {title.type === 'movie' && title.runtime
                      ? formatRuntime(title.runtime)
                      : `${title.seasons.length} 季 · ${episodeCount(title.seasons)} 集`}
                  </span>
                  {title.isOriginal ? (
                    <span className="text-[11px] font-bold uppercase tracking-widest text-brand">vidday 原创</span>
                  ) : null}
                </div>

                <p className="mt-4 text-sm leading-relaxed text-white/85">{title.synopsis}</p>

                {title.top10 ? (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-sm bg-brand/15 px-2 py-1 text-xs font-medium text-brand">
                    <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">TOP 10</span>
                    今日排名第 {title.top10} 位
                  </p>
                ) : null}
              </div>

              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-white/45">导演</dt>
                  <dd className="mt-0.5 text-white/85">{title.director}</dd>
                </div>
                <div>
                  <dt className="text-white/45">主演</dt>
                  <dd className="mt-0.5 text-white/85">{title.cast.join('、')}</dd>
                </div>
                <div>
                  <dt className="text-white/45">题材</dt>
                  <dd className="mt-0.5 text-white/85">{genreNames(title.genres).join('、')}</dd>
                </div>
                <div>
                  <dt className="text-white/45">标签</dt>
                  <dd className="mt-0.5 text-white/85">{title.tags.join('、') || '—'}</dd>
                </div>
              </dl>
            </div>

            {title.seasons.length ? (
              <div className="border-t border-white/10 p-6">
                <h3 className="text-sm font-semibold text-white/90">剧集</h3>
                <ul className="mt-3 divide-y divide-white/5">
                  {title.seasons[0].episodes.slice(0, 4).map((episode) => (
                    <li key={episode.id}>
                      <button
                        type="button"
                        onClick={() => {
                          play(title, episode.id)
                          dispatch(closePreview())
                        }}
                        className="flex w-full items-center gap-4 py-3 text-left transition hover:bg-white/5"
                      >
                        <span className="w-5 text-center text-sm text-white/50">{episode.number}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white/90">{episode.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-white/50">{episode.synopsis}</span>
                        </span>
                        <span className="shrink-0 text-xs text-white/45">{episode.duration} 分钟</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {similar.length ? (
              <div className="border-t border-white/10 p-6">
                <h3 className="text-sm font-semibold text-white/90">更多类似作品</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {similar.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(`/title/${item.id}`)}
                      className="group text-left"
                    >
                      <ArtImage
                        src={backdrop(item.art)}
                        alt={item.name}
                        paletteId={item.id}
                        className="aspect-video w-full rounded-md transition group-hover:ring-2 group-hover:ring-white/25"
                      />
                      <span className="mt-2 block truncate text-xs text-white/80">{item.name}</span>
                      <span className="text-[11px] text-white/45">{item.match}% 匹配</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-white/10 px-6 py-4">
              <Button
                variant="link"
                className="px-0 text-white/70 hover:text-white"
                onClick={() => navigate(`/title/${title.id}`)}
              >
                查看作品详情页 →
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
