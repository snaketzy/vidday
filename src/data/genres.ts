import type { Genre } from '@/types'

export const genres: Genre[] = [
  { id: 'suspense', name: '悬疑', description: '谜团层层剥开的烧脑叙事' },
  { id: 'crime', name: '犯罪', description: '游走于罪案与人性的灰色地带' },
  { id: 'scifi', name: '科幻', description: '把想象力推向宇宙尽头' },
  { id: 'drama', name: '剧情', description: '专注人物命运的长篇叙事' },
  { id: 'comedy', name: '喜剧', description: '让人笑出声的轻松时刻' },
  { id: 'action', name: '动作', description: '高密度冲突与感官冲击' },
  { id: 'doc', name: '纪录片', description: '真实世界的锋利切片' },
  { id: 'romance', name: '爱情', description: '关于靠近与错过的故事' },
  { id: 'horror', name: '恐怖', description: '黑暗里最原始的恐惧' },
  { id: 'animation', name: '动画', description: '手绘与三维构建的异世界' },
  { id: 'fantasy', name: '奇幻', description: '规则之外的想象力' },
  { id: 'history', name: '历史', description: '从旧日阴影里看今天' },
  { id: 'thriller', name: '惊悚', description: '全程屏住呼吸的紧张感' },
  { id: 'family', name: '家庭', description: '适合全家一起观看' },
]

const genresById = new Map(genres.map((genre) => [genre.id, genre]))

export function getGenre(id: string) {
  return genresById.get(id)
}

export function genreName(id: string) {
  return genresById.get(id)?.name ?? id
}

export function genreNames(ids: string[]) {
  return ids.map(genreName).filter(Boolean)
}

/** 儿童观众可见的题材 */
export const KIDS_GENRES = ['animation', 'family']
