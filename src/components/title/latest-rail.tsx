import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

import { RailScroller } from '@/components/title/rail-scroller'
import { TitleCard } from '@/components/title/title-card'
import { Skeleton } from '@/components/ui/skeleton'
import { LATEST_WINDOW_DAYS, useLatestTitles } from '@/hooks/use-latest-titles'
import { toLatestHref } from '@/lib/links'

/** 首页一屏展示的条数：只取前 10，其余走末位箭头卡。 */
const RAIL_LIMIT = 10

/** 骨架占位条数：铺满一屏即可。 */
const SKELETON_COUNT = 6

function RailHeading() {
  return (
    <div className="mb-3 flex items-baseline gap-2 px-4 md:px-12">
      <h2 className="text-base font-semibold text-white/90 md:text-lg">最新上架</h2>
      <span className="text-xs text-white/45">近 {LATEST_WINDOW_DAYS} 天</span>
    </div>
  )
}

/**
 * 首页「最新上架」轨：后台近 7 天「已上架」内容的前 10 条（影片 + 剧集）。
 * 轨道最右端的箭头卡跳 `/browse?addedWithin=7`，查看窗口内全部。
 */
export function LatestRail() {
  const { status, titles } = useLatestTitles(LATEST_WINDOW_DAYS, RAIL_LIMIT)

  // 加载中：先占位，避免整轨消失造成首页「空了一块」
  if (status === 'loading') {
    return (
      <section className="py-4" aria-busy="true">
        <RailHeading />
        <div className="flex gap-2 overflow-hidden px-4 md:px-12">
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <Skeleton
              key={index}
              className="aspect-video w-[224px] shrink-0 rounded-md bg-white/10 sm:w-[252px] lg:w-[286px]"
            />
          ))}
        </div>
      </section>
    )
  }

  // 窗口内没有已上架内容 / 加载失败时整轨不出现（与站内其他空轨一致）
  if (!titles.length) return null

  return (
    <section className="group/rail-section py-4">
      <RailHeading />

      <RailScroller>
        {titles.map((title, index) => (
          <TitleCard key={title.id} title={title} eager={index < 3} />
        ))}

        <Link
          to={toLatestHref(LATEST_WINDOW_DAYS)}
          aria-label={`查看近 ${LATEST_WINDOW_DAYS} 天全部上架作品`}
          className="group/more flex w-[100px] shrink-0 flex-col items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
        >
          <ChevronRight className="size-7 transition group-hover/more:translate-x-0.5" />
          <span className="text-xs font-medium">查看全部</span>
        </Link>
      </RailScroller>
    </section>
  )
}
