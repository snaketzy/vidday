import { GENRE_LABEL_TO_ID } from '@/data/genres'
import type { PublicCarouselCard, PublicTitleDetail } from '@/lib/public-api'
import type { Title } from '@/types'

/**
 * 后端题材为 TMDB 中文标签，前台题材体系用英文 slug（映射表与内置题材清单同源）。
 * 能对上的落进 `genres`（筛选 / 相似推荐可用），对不上的落进 `tags`（仍然展示）。
 */
function splitGenres(labels: string[]) {
  const genres: string[] = []
  const tags: string[] = []
  for (const label of labels) {
    const id = GENRE_LABEL_TO_ID[label]
    if (id) {
      if (!genres.includes(id)) genres.push(id)
    } else if (!tags.includes(label)) {
      tags.push(label)
    }
  }
  return { genres, tags }
}

/** 无自定义画面时，用标题与题材拼一条可读的绘图提示词作兜底。 */
function artFallback(name: string, genreLabels: string[]) {
  return [name, genreLabels.slice(0, 3).join('、'), '电影剧照'].filter(Boolean).join('，')
}

/** 后端未给评分时匹配度记 0，不做伪造。 */
function matchFromRating(rating: number | null) {
  return rating ? Math.round(rating * 10) : 0
}

function baseFields(params: {
  id: number
  type?: 'movie' | 'series'
  name: string
  englishTitle: string | null
  originalTitle?: string | null
  year: number | null
  runtime: number | null
  maturity: string | null
  rating: number | null
  genres: string[]
  tags: string[]
  backdropUrl: string | null
  posterUrl: string | null
  playUrl: string | null
  logline: string
  synopsis: string
  director: string
  cast: string[]
}): Title {
  return {
    id: String(params.id),
    name: params.name,
    originalName: params.englishTitle ?? params.originalTitle ?? '',
    type: params.type ?? 'movie',
    year: params.year ?? 0,
    maturity: params.maturity ?? '未分级',
    runtime: params.runtime ?? undefined,
    seasons: [],
    genres: params.genres,
    tags: params.tags,
    logline: params.logline,
    synopsis: params.synopsis,
    cast: params.cast,
    director: params.director,
    match: matchFromRating(params.rating),
    isNew: false,
    isOriginal: false,
    art: artFallback(params.name, params.tags),
    trailerNote: '演示环境暂未提供预告片。',
    englishTitle: params.englishTitle,
    backdropUrl: params.backdropUrl,
    posterUrl: params.posterUrl,
    playUrl: params.playUrl,
    source: 'api',
  }
}

/** 轮播卡片 → 前台 Title（卡片只有轻量字段，明细由详情接口补齐）。 */
export function cardToTitle(card: PublicCarouselCard): Title {
  const name = card.chineseTitle ?? card.englishTitle ?? card.title
  const { genres, tags } = splitGenres(card.genres)
  const summary = card.subtitle ?? ''

  return baseFields({
    id: card.targetId,
    type: card.targetType === 'series' ? 'series' : 'movie',
    name,
    englishTitle: card.englishTitle,
    year: card.releaseYear,
    runtime: card.runtime,
    maturity: card.maturity,
    rating: card.rating,
    genres,
    tags,
    backdropUrl: card.backdropUrl,
    posterUrl: card.posterUrl,
    playUrl: card.playUrl,
    logline: summary,
    synopsis: summary,
    director: '',
    cast: [],
  })
}

/** 影片详情 → 前台 Title。 */
export function detailToTitle(detail: PublicTitleDetail): Title {
  const name = detail.chineseTitle ?? detail.englishTitle ?? detail.title
  const { genres, tags } = splitGenres(detail.genres)
  const summary = detail.synopsis ?? ''

  return baseFields({
    id: detail.id,
    name,
    englishTitle: detail.englishTitle,
    originalTitle: detail.originalTitle,
    year: detail.year,
    runtime: detail.runtime,
    maturity: detail.maturity,
    rating: detail.rating,
    genres,
    tags,
    backdropUrl: detail.backdropUrl,
    posterUrl: detail.posterUrl,
    playUrl: detail.playUrl,
    logline: detail.logline ?? summary,
    synopsis: summary,
    director: detail.director ?? '',
    cast: detail.cast,
  })
}
