import { TitleCard } from '@/components/title/title-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Title } from '@/types'

/** 浏览 / 搜索 / 片单页共用的自适应卡片网格 */
export function TitleGrid({ titles }: { titles: Title[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-6 px-4 md:px-12">
      {titles.map((title, index) => (
        <TitleCard key={title.id} title={title} eager={index < 5} />
      ))}
    </div>
  )
}

/** 网格加载占位：与 TitleGrid 同布局，避免加载期出现「假空态」。 */
export function TitleGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-6 px-4 md:px-12" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          className="aspect-video w-[224px] shrink-0 rounded-md bg-white/10 sm:w-[252px] lg:w-[286px]"
        />
      ))}
    </div>
  )
}
