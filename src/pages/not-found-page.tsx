import { Link } from 'react-router'

import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { genreName } from '@/data/genres'
import { HOME_RAILS } from '@/data/rails'

const HOT_GENRES = ['suspense', 'scifi', 'crime', 'comedy', 'animation', 'doc']

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-24 text-center">
      <BrandLogo size="lg" />
      <p className="mt-6 text-6xl font-black tracking-tight text-white/90">404</p>
      <h1 className="mt-4 text-xl font-semibold text-white/85">这个页面似乎迷路了</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50">
        你想要访问的页面不存在，或对应的作品已下架。可以回到首页继续浏览，或从下面这些分类里挑一部片子。
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="bg-white text-black hover:bg-white/85">
          <Link to="/">返回首页</Link>
        </Button>
        <Button asChild variant="secondary" className="bg-white/15 text-white hover:bg-white/25">
          <Link to="/browse">浏览全部作品</Link>
        </Button>
      </div>

      <div className="mt-10 w-full max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-white/35">热门分类</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {HOT_GENRES.map((genreId) => (
            <Link
              key={genreId}
              to={`/browse?genre=${genreId}`}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition hover:border-white/50 hover:text-white"
            >
              {genreName(genreId)}
            </Link>
          ))}
        </div>
        <p className="mt-8 text-xs text-white/25">
          首页共有 {HOME_RAILS.length} 个推荐片单，包含原创、新上线与各题材精选。
        </p>
      </div>
    </div>
  )
}
