export type ContentType = 'movie' | 'series'

export interface Episode {
  id: string
  season: number
  number: number
  title: string
  synopsis: string
  /** 时长（分钟） */
  duration: number
}

export interface Season {
  number: number
  title: string
  episodes: Episode[]
}

export interface Title {
  id: string
  name: string
  originalName: string
  type: ContentType
  year: number
  /** 分级标识 */
  maturity: string
  /** 电影时长（分钟），剧集为 undefined */
  runtime?: number
  seasons: Season[]
  genres: string[]
  tags: string[]
  logline: string
  synopsis: string
  cast: string[]
  director: string
  /** 匹配度 0-100 */
  match: number
  isNew: boolean
  isOriginal: boolean
  /** 今日榜单排名，未上榜为 undefined */
  top10?: number
  /** 竖版海报/横版剧照的绘画提示词基础描述 */
  art: string
  /** 预告片文案（播放占位） */
  trailerNote: string
}

export interface Profile {
  id: string
  name: string
  /** 头像绘画提示词 */
  avatarArt: string
  /** 主题色，用于头像底色 */
  color: string
  isKids: boolean
}

export interface Account {
  id: string
  email: string
  planName: string
  planQuality: string
  planPrice: string
  memberSince: string
  nextBillingDate: string
  paymentMethod: string
  profiles: Profile[]
}

export interface WatchProgress {
  titleId: string
  episodeId?: string
  /** 观看进度百分比 0-100 */
  percent: number
  /** 已观看秒数 */
  position: number
  /** 总时长（秒） */
  duration: number
  updatedAt: string
}

export interface Genre {
  id: string
  name: string
  description: string
}

export interface RailConfig {
  id: string
  title: string
  variant?: 'standard' | 'top10' | 'continue' | 'poster'
  genreId?: string
  /** 显式指定片单，优先级高于 genreId */
  titleIds?: string[]
}
