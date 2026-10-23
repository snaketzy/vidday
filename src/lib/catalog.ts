import { KIDS_GENRES } from '@/data/genres'
import type { RailConfig, Title } from '@/types'

export type SortBy = 'match' | 'newest' | 'name'

export interface CatalogFilters {
  type: 'all' | 'movie' | 'series'
  genreId: string | null
  sortBy: SortBy
}

export const defaultFilters: CatalogFilters = {
  type: 'all',
  genreId: null,
  sortBy: 'match',
}

export function isKidsTitle(title: Title) {
  return title.genres.some((genre) => KIDS_GENRES.includes(genre))
}

export function matchesKeyword(title: Title, keyword: string) {
  const query = keyword.trim().toLowerCase()
  if (!query) return true
  const haystack = [
    title.name,
    title.originalName,
    title.logline,
    title.synopsis,
    title.director,
    ...title.cast,
    ...title.tags,
    ...title.genres,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function sortTitles(list: Title[], sortBy: SortBy) {
  const sorted = [...list]
  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => b.year - a.year || b.match - a.match)
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    default:
      return sorted.sort((a, b) => b.match - a.match)
  }
}

export function filterTitles(
  list: Title[],
  filters: CatalogFilters,
  keyword = '',
  kidsOnly = false,
) {
  const result = list.filter((title) => {
    if (kidsOnly && !isKidsTitle(title)) return false
    if (filters.type !== 'all' && title.type !== filters.type) return false
    if (filters.genreId && !title.genres.includes(filters.genreId)) return false
    return matchesKeyword(title, keyword)
  })
  return sortTitles(result, filters.sortBy)
}

export function lookupTitles(ids: string[], list: Title[]) {
  const byId = new Map(list.map((title) => [title.id, title]))
  return ids.map((id) => byId.get(id)).filter((title): title is Title => Boolean(title))
}

export function resolveRail(rail: RailConfig, list: Title[]) {
  if (rail.titleIds?.length) return lookupTitles(rail.titleIds, list)
  if (rail.genreId) return filterTitles(list, { ...defaultFilters, genreId: rail.genreId }).filter((title) => (rail.id.startsWith('kids-') ? isKidsTitle(title) : true))
  return []
}

export function similarTitles(title: Title, list: Title[], limit = 9) {
  return list
    .filter((candidate) => candidate.id !== title.id)
    .map((candidate) => {
      const sharedGenres = candidate.genres.filter((genre) => title.genres.includes(genre)).length
      const sameType = candidate.type === title.type ? 1 : 0
      return { candidate, score: sharedGenres * 3 + sameType + candidate.match / 100 }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate)
}

/** 今日榜单排序后的作品 */
export function topTen(list: Title[]) {
  return list
    .filter((title) => typeof title.top10 === 'number')
    .sort((a, b) => (a.top10 ?? 99) - (b.top10 ?? 99))
}
