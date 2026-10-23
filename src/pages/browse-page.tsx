import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { TitleGrid } from '@/components/title/title-grid'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { genreName, genres } from '@/data/genres'
import { filterTitles, isKidsTitle, type CatalogFilters, type SortBy } from '@/lib/catalog'
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

  const typeParam = searchParams.get('type')
  const sortParam = searchParams.get('sort')
  const genreParam = searchParams.get('genre')

  const filters: CatalogFilters = useMemo(
    () => ({
      type: typeParam === 'movie' || typeParam === 'series' ? typeParam : 'all',
      genreId: genreParam && genres.some((genre) => genre.id === genreParam) ? genreParam : null,
      sortBy: sortParam === 'newest' || sortParam === 'name' ? sortParam : 'match',
    }),
    [typeParam, sortParam, genreParam],
  )

  const results = useMemo(
    () => filterTitles(kidsOnly ? titles.filter(isKidsTitle) : titles, filters),
    [titles, filters, kidsOnly],
  )

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const hasFilters = Boolean(genreParam || typeParam || sortParam)

  return (
    <div className="min-h-[70vh] pb-12 pt-24 md:pt-28">
      <div className="px-4 md:px-12">
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
          {filters.genreId ? genreName(filters.genreId) : '浏览全部作品'}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          共 {results.length} 部作品
          {filters.genreId ? ` · ${genreName(filters.genreId)}` : ''}
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
        {results.length ? (
          <TitleGrid titles={results} />
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
