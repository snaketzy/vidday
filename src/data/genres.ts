import type { Genre } from '@/types'

/**
 * 前台题材清单。
 *
 * 这是**内置兜底**：真正的清单由 Vidday 后台服务的影片库题材过滤器下发
 * （`GET /api/public/genres`），运行时以接口返回为准；接口不可用时用这份兜底。
 * 每项的 id 是前台稳定标识，需与后端题材中文名一一对应。
 */
export const genres: Genre[] = [
  { id: 'action', name: '动作', description: '高密度冲突与感官冲击' },
  { id: 'adventure', name: '冒险', description: '踏出舒适区的远行与探寻' },
  { id: 'animation', name: '动画', description: '手绘与三维构建的异世界' },
  { id: 'comedy', name: '喜剧', description: '让人笑出声的轻松时刻' },
  { id: 'crime', name: '犯罪', description: '游走于罪案与人性的灰色地带' },
  { id: 'drama', name: '剧情', description: '专注人物命运的长篇叙事' },
  { id: 'family', name: '家庭', description: '适合全家一起观看' },
  { id: 'fantasy', name: '奇幻', description: '规则之外的想象力' },
  { id: 'history', name: '历史', description: '从旧日阴影里看今天' },
  { id: 'horror', name: '恐怖', description: '黑暗里最原始的恐惧' },
  { id: 'music', name: '音乐', description: '旋律推动的故事与人生' },
  { id: 'suspense', name: '悬疑', description: '谜团层层剥开的烧脑叙事' },
  { id: 'romance', name: '爱情', description: '关于靠近与错过的故事' },
  { id: 'scifi', name: '科幻', description: '把想象力推向宇宙尽头' },
  { id: 'thriller', name: '惊悚', description: '全程屏住呼吸的紧张感' },
  { id: 'war', name: '战争', description: '炮火之下的人性切面' },
  { id: 'western', name: '西部', description: '荒野、枪手与秩序的边界' },
  { id: 'doc', name: '纪录片', description: '真实世界的锋利切片' },
]

/**
 * 后端题材中文名（`DictEntry.labelZh`）→ 前台主题材 id。
 * 后端新增题材而此处未覆盖时，`resolveGenreId` 会用英文 code 兜底，不会丢项。
 */
export const GENRE_LABEL_TO_ID: Record<string, string> = {
  动作: 'action',
  冒险: 'adventure',
  动画: 'animation',
  喜剧: 'comedy',
  犯罪: 'crime',
  剧情: 'drama',
  家庭: 'family',
  奇幻: 'fantasy',
  历史: 'history',
  恐怖: 'horror',
  音乐: 'music',
  悬疑: 'suspense',
  爱情: 'romance',
  科幻: 'scifi',
  惊悚: 'thriller',
  战争: 'war',
  西部: 'western',
  纪录: 'doc',
  纪录片: 'doc',
}

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

/** 英文 code → 前端可用的 slug，如 "Science Fiction" → "science-fiction"。 */
function kebab(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 由后端下发题材解析出前台题材 id：
 * 已知中文名走映射表（与内置题材、mock 数据共用一套 slug），否则回退英文 code。
 */
export function resolveGenreId(labelZh: string, code = '') {
  const mapped = GENRE_LABEL_TO_ID[labelZh]
  if (mapped) return mapped
  return kebab(code) || labelZh
}

/** 儿童观众可见的题材 */
export const KIDS_GENRES = ['animation', 'family']
