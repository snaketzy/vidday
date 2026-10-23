import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { TitleCard } from '@/components/title/title-card'
import { TitleGrid } from '@/components/title/title-grid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { genres } from '@/data/genres'
import { defaultFilters, filterTitles, isKidsTitle, topTen } from '@/lib/catalog'
import { useAppSelector } from '@/store/hooks'
import { selectKidsMode } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const titles = useAppSelector(selectAllTitles)
  const kidsOnly = useAppSelector(selectKidsMode)
  const query = (searchParams.get('q') ?? '').trim()
  const [keyword, setKeyword] = useState(query)

  useEffect(() => {
    setKeyword(query)
  }, [query])

  const pool = useMemo(() => (kidsOnly ? titles.filter(isKidsTitle) : titles), [titles, kidsOnly])

  const results = useMemo(
    () => (query ? filterTitles(pool, defaultFilters, query) : []),
    [pool, query],
  )

  const suggestions = useMemo(() => topTen(pool).slice(0, 10), [pool])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = keyword.trim()
    if (!value) return
    setSearchParams({ q: value }, { replace: true })
  }

  return (
    <div className="min-h-[70vh] pb-12 pt-24 md:pt-28">
      <div className="px-4 md:px-12">
        <form onSubmit={submit} className="relative max-w-xl">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索片名、演员、题材、标签"
            className="h-11 border-white/20 bg-[#181818] pl-10 text-sm text-white placeholder:text-white/40"
          />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
        </form>

        {query ? (
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white md:text-3xl">
            搜索「{query}」
          </h1>
        ) : null}
        <p className="mt-1 text-sm text-white/50">
          {query ? `找到 ${results.length} 部与「${query}」相关的作品` : '输入关键词开始搜索'}
        </p>
      </div>

      <div className="mt-8">
        {query ? (
          results.length ? (
            <TitleGrid titles={results} />
          ) : (
            <div className="px-4 md:px-12">
              <p className="text-sm text-white/60">
                没有找到与「{query}」匹配的作品。可以试试片名、演员姓名，或从下面的热门作品中挑选。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {genres.slice(0, 8).map((genre) => (
                  <Link
                    key={genre.id}
                    to={`/browse?genre=${genre.id}`}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white hover:text-white"
                  >
                    {genre.name}
                  </Link>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="px-4 text-center md:px-12">
            <p className="text-sm text-white/55">试着搜索《暗影之城》、「悬疑」或主演姓名。</p>
          </div>
        )}
      </div>

      {!results.length ? (
        <section className="mt-12">
          <div className="mb-3 flex items-baseline gap-2 px-4 md:px-12">
            <h2 className="text-base font-semibold text-white/90 md:text-lg">今日热门榜</h2>
            <Button
              asChild
              variant="link"
              className="ml-auto h-auto p-0 text-xs text-white/55 hover:text-white"
            >
              <Link to="/browse">查看全部</Link>
            </Button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 md:px-12">
            {suggestions.map((title) => (
              <TitleCard key={title.id} title={title} variant="poster" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
