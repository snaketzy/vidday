import { useMemo, useState } from 'react'
import { Check, Clock, Play, Plus, Star, ThumbsUp } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitleCard } from '@/components/title/title-card'
import { genreName, genreNames } from '@/data/genres'
import { usePlayTarget } from '@/hooks/use-play-target'
import { backdrop, poster } from '@/lib/art'
import { episodeCount, formatRuntime } from '@/lib/format'
import { similarTitles } from '@/lib/catalog'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsInMyList, toggleTitle } from '@/store/slices/my-list-slice'
import { selectAllTitles, selectTitleById } from '@/store/slices/catalog-slice'
import { selectProgressForTitle } from '@/store/slices/watch-slice'
import { NotFoundPage } from '@/pages/not-found-page'

export function TitleDetailPage() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const play = usePlayTarget()
  const title = useAppSelector((state) => selectTitleById(state, id))
  const allTitles = useAppSelector(selectAllTitles)
  const inList = useAppSelector((state) => selectIsInMyList(state, id ?? ''))
  const record = useAppSelector((state) => selectProgressForTitle(state, id ?? ''))
  const [season, setSeason] = useState('1')

  const similar = useMemo(
    () => (title ? similarTitles(title, allTitles, 12) : []),
    [title, allTitles],
  )

  if (!title) return <NotFoundPage />

  const activeSeason = title.seasons.find((item) => String(item.number) === season) ?? title.seasons[0]
  const resumeEpisode =
    record?.episodeId && title.type === 'series'
      ? title.seasons.flatMap((item) => item.episodes).find((item) => item.id === record.episodeId)
      : undefined

  return (
    <div className="pb-12">
      {/* 首屏 */}
      <section className="relative h-[62vh] min-h-[440px] w-full overflow-hidden">
        <ArtImage
          src={backdrop(title.art)}
          alt={title.name}
          paletteId={title.id}
          eager
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-background via-background/90 to-transparent" />

        <div className="relative flex h-full flex-col justify-end pb-12 pl-4 pr-4 md:pl-12 md:pr-[42%]">
          <div className="flex items-start gap-6">
            <ArtImage
              src={poster(title.art)}
              alt={title.name}
              paletteId={`${title.id}-poster`}
              className="hidden aspect-[9/16] w-[150px] shrink-0 rounded-md shadow-2xl lg:block"
            />
            <div>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand">
                {title.isOriginal ? 'vidday 原创' : 'vidday 精选'}
                {title.isNew ? (
                  <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[10px] tracking-normal text-white">
                    新上线
                  </span>
                ) : null}
              </p>
              <h1 className="text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
                {title.name}
              </h1>
              <p className="mt-1 text-sm text-white/45">{title.originalName}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
                <span className="font-semibold text-emerald-400">{title.match}% 匹配</span>
                <span>{title.year}</span>
                <span className="rounded border border-white/35 px-1.5 text-xs">{title.maturity}</span>
                <span>
                  {title.type === 'movie' && title.runtime
                    ? formatRuntime(title.runtime)
                    : `${title.seasons.length} 季 · ${episodeCount(title.seasons)} 集`}
                </span>
                <span className="hidden sm:inline">{genreNames(title.genres).slice(0, 3).join(' · ')}</span>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85">{title.logline}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" className="bg-white text-black hover:bg-white/85" onClick={() => play(title)}>
                  <Play className="size-5 fill-current" />
                  {resumeEpisode ? '继续观看' : '播放'}
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-white/25 text-white backdrop-blur hover:bg-white/35"
                  onClick={() => dispatch(toggleTitle(title.id))}
                >
                  {inList ? <Check className="size-5" /> : <Plus className="size-5" />}
                  {inList ? '已加入片单' : '加入片单'}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="标记喜欢"
                  className="size-11 rounded-full border-white/40 bg-black/40 text-white hover:border-white hover:bg-black/70"
                >
                  <ThumbsUp className="size-5" />
                </Button>
              </div>

              {resumeEpisode ? (
                <p className="mt-4 text-xs text-white/55">
                  上次观看到 第 {resumeEpisode.season} 季 第 {resumeEpisode.number} 集 · {resumeEpisode.title}（已完成 {record?.percent ?? 0}%）
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-10 px-4 pt-8 md:px-12 lg:grid-cols-[2fr_1fr]">
        <div>
          {/* 剧集 */}
          {title.seasons.length ? (
            <section>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-white/90">剧集</h2>
                {record ? (
                  <Button
                    variant="ghost"
                    className="text-xs text-white/60 hover:bg-white/10 hover:text-white"
                    onClick={() => play(title)}
                  >
                    继续观看第 {resumeEpisode?.number ?? 1} 集
                  </Button>
                ) : null}
              </div>

              <Tabs value={String(activeSeason?.number ?? 1)} onValueChange={setSeason} className="mt-4">
                {title.seasons.length > 1 ? (
                  <TabsList className="bg-white/5">
                    {title.seasons.map((item) => (
                      <TabsTrigger
                        key={item.number}
                        value={String(item.number)}
                        className="data-[state=active]:bg-white/15 data-[state=active]:text-white"
                      >
                        第 {item.number} 季
                      </TabsTrigger>
                    ))}
                  </TabsList>
                ) : null}

                {title.seasons.map((item) => (
                  <TabsContent key={item.number} value={String(item.number)} className="mt-4">
                    <ul className="divide-y divide-white/5">
                      {item.episodes.map((episode) => (
                        <li key={episode.id}>
                          <button
                            type="button"
                            onClick={() => play(title, episode.id)}
                            className="flex w-full items-start gap-4 rounded-md px-2 py-4 text-left transition hover:bg-white/5"
                          >
                            <span className="w-5 shrink-0 pt-0.5 text-center text-sm text-white/45">
                              {episode.number}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-white/90">
                                {episode.title}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-white/50">
                                {episode.synopsis}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs text-white/45">
                              <Clock className="size-3.5" />
                              {episode.duration} 分钟
                            </span>
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/35 text-white transition hover:border-white">
                              <Play className="size-3.5 fill-current" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>
                ))}
              </Tabs>
            </section>
          ) : null}

          {/* 关于 */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-white/90">关于《{title.name}》</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{title.synopsis}</p>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
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
                <dt className="text-white/45">分级</dt>
                <dd className="mt-0.5 text-white/85">{title.maturity}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              {title.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/search?q=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition hover:border-white/50 hover:text-white"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* 侧栏 */}
        <aside className="space-y-6">
          <div className="rounded-md border border-white/10 bg-[#181818] p-5">
            <h3 className="text-sm font-semibold text-white/90">预告片与更多</h3>
            <p className="mt-2 text-xs leading-relaxed text-white/55">{title.trailerNote}</p>
            <p className="mt-3 text-xs leading-relaxed text-white/35">
              视频播放能力暂为占位，接入播放内核后可在此观看预告。
            </p>
            <Button
              className="mt-4 w-full bg-white/15 text-white hover:bg-white/25"
              onClick={() => play(title)}
            >
              <Play className="size-4 fill-current" />
              播放预告片
            </Button>
          </div>

          <div className="rounded-md border border-white/10 bg-[#181818] p-5 text-sm">
            <h3 className="text-sm font-semibold text-white/90">作品信息</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">上映年份</dt>
                <dd className="text-white/85">{title.year}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">类型</dt>
                <dd className="text-white/85">{title.type === 'movie' ? '电影' : '剧集'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">时长</dt>
                <dd className="text-white/85">
                  {title.type === 'movie' && title.runtime
                    ? formatRuntime(title.runtime)
                    : `${episodeCount(title.seasons)} 集`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">首选题材</dt>
                <dd className="text-white/85">{title.genres[0] ? genreName(title.genres[0]) : '—'}</dd>
              </div>
            </dl>
          </div>

          {title.top10 ? (
            <div className="flex items-center gap-3 rounded-md border border-brand/40 bg-brand/10 p-5">
              <Star className="size-5 text-brand" />
              <div>
                <p className="text-sm font-semibold text-white">今日热门榜第 {title.top10} 名</p>
                <p className="text-xs text-white/55">根据 24 小时内的播放热度实时计算</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {similar.length ? (
        <section className="mt-12">
          <div className="mb-3 flex items-baseline gap-2 px-4 md:px-12">
            <h2 className="text-base font-semibold text-white/90 md:text-lg">相似的影片与剧集</h2>
            <Link
              to="/browse"
              className="ml-auto text-xs font-medium text-white/55 transition hover:text-white"
            >
              查看全部
            </Link>
          </div>
          <div className="row-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 md:px-12">
            {similar.map((item) => (
              <TitleCard key={item.id} title={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
