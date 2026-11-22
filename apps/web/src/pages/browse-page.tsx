import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { TitleGrid, TitleGridSkeleton } from '@/components/title/title-grid'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { genreLabelsForId, genreName } from '@/data/genres'
import { useAllTitles } from '@/hooks/use-all-titles'
import { useGenres } from '@/hooks/use-genres'
import { useLatestTitles } from '@/hooks/use-latest-titles'
import { filterTitles, isKidsTitle, type CatalogFilters, type SortBy } from '@/lib/catalog'
import { fetchAllTitlesCount } from '@/lib/public-api'
import { useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'

const TYPE_OPTIONS: { value: CatalogFilters['type']; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'movie', label: '电影' },
  { value: 'series', label: '剧集' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'match', label: '按推荐度排序' },
  { value: 'newest', label: '按最新上线排序' },
  { value: 'name', label: '按名称排序' },
]

export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const titles = useAppSelector(selectAllTitles)
  const kidsOnly = useAppSelector(selectKidsMode)
  /** 题材筛选项与页头「浏览」菜单同源：后台影片库题材过滤器 */
  const genres = useGenres()

  const typeParam = searchParams.get('type')
  const sortParam = searchParams.get('sort')
  const genreParam = searchParams.get('genre')
  const addedWithinParam = searchParams.get('addedWithin')

  /** `?addedWithin=N`：切到后端「最新上架」数据源（近 N 天已上架） */
  const latestDays = Number(addedWithinParam)
  const latestOnly = Number.isInteger(latestDays) && latestDays > 0
  const { status: latestStatus, titles: latestTitles } = useLatestTitles(latestOnly ? latestDays : null)

  /**
   * catalog 不持久化，默认只含首页轮播 / 最新上架等已访问过的子集。
   * 本页是「全库」入口，故向服务端分页拉取（每批 25 条），滚动到底自动续下一批。
   */
  const {
    status: allStatus,
    loaded,
    total,
    hasMore,
    loadingMore,
    loadMore,
  } = useAllTitles(!latestOnly)

  /** 触底哨兵：提前 600px 预取下一批，滚动不出现空窗 */
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  /** 「最新上架」数据源尚未返回时展示占位，避免短暂显示「共 0 部作品」 */
  const loading = latestOnly ? latestStatus === 'loading' : allStatus === 'loading'

  const filters: CatalogFilters = useMemo(
    () => ({
      type: typeParam === 'movie' || typeParam === 'series' ? typeParam : 'all',
      genreId: genreParam && genres.some((genre) => genre.id === genreParam) ? genreParam : null,
      sortBy: sortParam === 'newest' || sortParam === 'name' ? sortParam : 'match',
    }),
    [typeParam, sortParam, genreParam, genres],
  )

  const activeGenreName = filters.genreId
    ? (genres.find((genre) => genre.id === filters.genreId)?.name ?? genreName(filters.genreId))
    : null

  const pool = latestOnly ? latestTitles : titles

  const results = useMemo(
    () =>
      filterTitles(
        kidsOnly ? pool.filter(isKidsTitle) : pool,
        filters,
        '',
        false,
        latestOnly,
      ),
    [pool, filters, kidsOnly, latestOnly],
  )

  /** 分批渲染：只渲染已拉取的批次，其余随滚动追加（`latestOnly` 数据量已受限，不切） */
  const visible = latestOnly ? results : results.slice(0, loaded)

  /**
   * 页头计数：带筛选时按当前条件向服务端查库计数（仅「已上架」影片 + 剧集），
   * 不再用已加载条数累计，保证数字与筛选一致且不随滚动变化。
   * 「最新上架」窗口内一次全量返回，直接用本地条数即可。
   */
  const filteredType = filters.type === 'all' ? undefined : filters.type
  const countScoped = Boolean(filteredType || filters.genreId || kidsOnly)
  const [serverCount, setServerCount] = useState<number | null>(null)

  useEffect(() => {
    if (latestOnly || !countScoped) {
      setServerCount(null)
      return
    }
    let alive = true
    fetchAllTitlesCount({
      type: filteredType,
      genres: filters.genreId ? genreLabelsForId(filters.genreId) : undefined,
      kids: kidsOnly || undefined,
    })
      .then((value) => {
        if (alive) setServerCount(value)
      })
      .catch(() => {
        if (alive) setServerCount(null)
      })
    return () => {
      alive = false
    }
  }, [latestOnly, countScoped, filteredType, filters.genreId, kidsOnly])

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const hasFilters = Boolean(genreParam || typeParam || sortParam || addedWithinParam)
  /** 无筛选取后端全库总数；有筛选取服务端查库计数；查库未回时先沿用全库总数 */
  const shownCount = latestOnly ? results.length : (serverCount ?? total)

  return (
    <div className="min-h-[70vh] pb-12 pt-24 md:pt-28">
      <div className="px-4 md:px-12">
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
          {activeGenreName ?? (latestOnly ? '最新上架' : '浏览全部作品')}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          {loading ? '正在加载…' : `共 ${shownCount} 部作品`}
          {latestOnly ? ` · 近 ${latestDays} 天内上架` : ''}
          {activeGenreName ? ` · ${activeGenreName}` : ''}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 px-4 md:px-12">
        <Select
          value={filters.type}
          onValueChange={(value) => update('type', value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-40 border-white/15 bg-[#181818] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#181818] text-white">
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.genreId ?? 'all'}
          onValueChange={(value) => update('genre', value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-40 border-white/15 bg-[#181818] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#181818] text-white">
            <SelectItem value="all" className="cursor-pointer">
              全部题材
            </SelectItem>
            {genres.map((genre) => (
              <SelectItem key={genre.id} value={genre.id} className="cursor-pointer">
                {genre.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sortBy} onValueChange={(value) => update('sort', value)}>
          <SelectTrigger className="w-44 border-white/15 bg-[#181818] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#181818] text-white">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button
            variant="ghost"
            className="gap-2 text-white/65 hover:bg-white/10 hover:text-white"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            <RotateCcw className="size-4" />
            清除筛选
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        {loading ? (
          <TitleGridSkeleton />
        ) : visible.length ? (
          <>
            <TitleGrid titles={visible} />
            {/* 触底哨兵 + 下一批占位：滚到这里自动续拉 25 条 */}
            {hasMore ? (
              <>
                <div ref={sentinelRef} aria-hidden className="h-px" />
                {loadingMore ? <TitleGridSkeleton count={5} /> : null}
              </>
            ) : null}
          </>
        ) : (
          <div className="px-4 py-20 text-center md:px-12">
            <p className="text-sm text-white/60">没有符合条件的作品，试试放宽筛选条件。</p>
            <Button
              variant="secondary"
              className="mt-4 bg-white/15 text-white hover:bg-white/25"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              重置筛选
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
