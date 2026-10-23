import { TitleCard } from '@/components/title/title-card'
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
