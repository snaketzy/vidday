import type { RailConfig } from '@/types'

import { COLLECTION_IDS, NEW_TITLE_IDS, TOP_TEN_IDS } from './titles'

export const TOP_TEN_RAIL_ID = 'top10'

export const HOME_RAILS: RailConfig[] = [
  { id: 'continue', title: '继续观看', variant: 'continue' },
  { id: TOP_TEN_RAIL_ID, title: '今日 vidday 热门榜', variant: 'top10', titleIds: TOP_TEN_IDS },
  { id: 'originals', title: 'vidday 原创作品', titleIds: COLLECTION_IDS.originals },
  { id: 'new', title: '本季新上线', titleIds: NEW_TITLE_IDS },
  { id: 'suspense', title: '悬疑烧脑精选', genreId: 'suspense' },
  { id: 'because-shadow-city', title: '因为你看过《暗影之城》', variant: 'poster', titleIds: COLLECTION_IDS.becauseShadowCity },
  { id: 'scifi', title: '科幻宇宙', genreId: 'scifi' },
  { id: 'acclaimed', title: '口碑佳作', titleIds: COLLECTION_IDS.acclaimed },
  { id: 'crime', title: '罪案现场', genreId: 'crime' },
  { id: 'comedy', title: '轻松一刻', genreId: 'comedy' },
  { id: 'weekend', title: '周末动作大片', titleIds: COLLECTION_IDS.weekend },
  { id: 'doc', title: '高分纪录片', genreId: 'doc' },
  { id: 'animation', title: '动画番剧', genreId: 'animation' },
  { id: 'romance', title: '心动爱情', genreId: 'romance' },
  { id: 'history', title: '历史与年代', genreId: 'history' },
  { id: 'family', title: '适合全家一起看', titleIds: COLLECTION_IDS.familyTime },
]

export const KIDS_RAILS: RailConfig[] = [
  { id: 'continue', title: '继续观看', variant: 'continue' },
  { id: 'kids-animation', title: '热门动画', genreId: 'animation' },
  { id: 'kids-family', title: '全家一起看', genreId: 'family' },
  { id: 'kids-picks', title: '儿童精选', titleIds: ['panda-patrol', 'star-cubs', 'dragon-keeper'] },
]
