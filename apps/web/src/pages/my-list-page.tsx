import { useMemo } from 'react'
import { Link } from 'react-router'

import { TitleGrid } from '@/components/title/title-grid'
import { Button } from '@/components/ui/button'
import { lookupTitles } from '@/lib/catalog'
import { useAppSelector } from '@/store/hooks'
import { selectAllTitles } from '@/store/slices/catalog-slice'
import { selectMyListIds } from '@/store/slices/my-list-slice'

export function MyListPage() {
  const ids = useAppSelector(selectMyListIds)
  const allTitles = useAppSelector(selectAllTitles)

  const titles = useMemo(() => lookupTitles(ids, allTitles), [ids, allTitles])

  return (
    <div className="min-h-[70vh] pb-12 pt-24 md:pt-28">
      <div className="px-4 md:px-12">
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">我的片单</h1>
        <p className="mt-1 text-sm text-white/50">共 {titles.length} 部作品</p>
      </div>

      <div className="mt-8">
        {titles.length ? (
          <TitleGrid titles={titles} />
        ) : (
          <div className="px-4 py-16 text-center md:px-12">
            <p className="text-sm text-white/60">
              你的片单还是空的。把想看的影片或剧集加入片单，之后就能在这里快速找到它们。
            </p>
            <Button asChild className="mt-5 bg-white text-black hover:bg-white/85">
              <Link to="/browse">去浏览作品</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
