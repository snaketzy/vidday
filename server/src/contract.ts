/**
 * 对外接口契约（前端 `src/lib/public-api.ts` 镜像同一份定义）。
 *
 * 契约面刻意收窄为轻量卡片 / 详情 DTO，并随响应附带 schemaVersion；
 * 消费方据此做运行时校验 / 版本拒绝，后端字段漂移时宁可丢弃单项。
 */

/**
 * 与前端 `PUBLIC_SCHEMA_VERSION` 必须一致，不一致前端直接拒绝响应。
 * v2 变更：轮播项新增 `targetType: 'series'`（剧集）。
 */
export const PUBLIC_SCHEMA_VERSION = 2

export type CarouselPlacement = 'home' | 'collection'
export type CarouselVariant = 'hero' | 'rail'
export type CarouselTargetType = 'movie' | 'series' | 'collection'
export type ContentType = 'movie' | 'series'

export interface PublicCarouselCard {
  id: number
  targetType: CarouselTargetType
  targetId: number
  /** 跳转地址：影片 /watch/{id}，剧集 /title/{id}，专题 /collection/{id} */
  href: string
  title: string
  chineseTitle: string | null
  englishTitle: string | null
  subtitle: string | null
  backdropUrl: string | null
  posterUrl: string | null
  playUrl: string | null
  covers: string[]
  releaseYear: number | null
  runtime: number | null
  maturity: string | null
  rating: number | null
  genres: string[]
}

export interface PublicCarousel {
  id: number
  title: string
  variant: CarouselVariant
  autoplay: boolean
  intervalMs: number
  items: PublicCarouselCard[]
}

export interface PublicCarouselResponse {
  schemaVersion: number
  placement: CarouselPlacement
  pageId: number | null
  carousels: PublicCarousel[]
}

export interface PublicTitleDetail {
  id: number
  contentType: ContentType
  title: string
  chineseTitle: string | null
  englishTitle: string | null
  originalTitle: string | null
  year: number | null
  runtime: number | null
  rating: number | null
  maturity: string | null
  genres: string[]
  logline: string | null
  synopsis: string | null
  director: string | null
  cast: string[]
  backdropUrl: string | null
  posterUrl: string | null
  playUrl: string | null
  collections: { id: number; name: string }[]
  updatedAt: string
}

export interface PublicTitleResponse {
  schemaVersion: number
  title: PublicTitleDetail
}

/** 单条演职员署名。 */
export interface PublicCreditEntry {
  /** 影人 ID；影人已删除时为 null（仅保留冗余姓名） */
  personId: number | null
  name: string
  englishName: string | null
  avatarUrl: string | null
  department: string
  job: string
  /** 饰演角色；非演员为 null */
  character: string | null
}

/** 单部作品的完整演职员表：演员与职员分开，便于前台分组展示。 */
export interface PublicTitleCredits {
  id: number
  contentType: ContentType
  /** 演员（department = Acting），按署名顺序 */
  cast: PublicCreditEntry[]
  /** 职员（导演 / 编剧 / 制片等），按署名顺序 */
  crew: PublicCreditEntry[]
}

export interface PublicTitleCreditsResponse {
  schemaVersion: number
  credits: PublicTitleCredits
}

export interface PublicCollectionDetail {
  id: number
  name: string
  description: string | null
  coverUrl: string | null
  covers: string[]
  items: PublicCarouselCard[]
}

export interface PublicCollectionResponse {
  schemaVersion: number
  collection: PublicCollectionDetail
}

/** 题材项：与后台影片库题材过滤器同源。 */
export interface PublicGenre {
  /** 英文 code，如 Action / Science Fiction */
  code: string
  /** 中文名，如 动作 */
  name: string
}

export interface PublicGenreResponse {
  schemaVersion: number
  genres: PublicGenre[]
}

/** 近 N 天上架内容：仅「已上架」状态，按入库时间倒序。 */
export interface PublicLatestResponse {
  schemaVersion: number
  days: number
  /** 窗口内总数（不受 limit 影响） */
  total: number
  items: PublicCarouselCard[]
}

/** 观看进度条目：卡片摘要叠加进度字段。 */
export interface PublicWatchProgress extends PublicCarouselCard {
  /** 剧集单集 id；影片为 null */
  episodeId: number | null
  position: number
  duration: number
  percent: number
  updatedAt: string
}

export interface PublicProgressResponse {
  schemaVersion: number
  items: PublicWatchProgress[]
}

export interface PublicProgressUpsert {
  titleId: number
  episodeId?: number | null
  position: number
  duration: number
  percent: number
  /** 客户端记录时间（ISO）；缺省时以服务端时间为准 */
  updatedAt?: string
}

export interface PublicListResponse {
  schemaVersion: number
  items: PublicCarouselCard[]
}

/** 影人基础资料。 */
export interface PublicPerson {
  id: number
  name: string
  englishName: string | null
  gender: string
  avatarUrl: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  nationality: string | null
  school: string | null
  knownFor: string
  /** 简介：中文优先，缺失回退英文 */
  biography: string | null
}

/** 影人参演 / 参与制作的一部作品。 */
export interface PublicPersonCredit {
  titleId: number
  contentType: ContentType
  title: string
  chineseTitle: string | null
  englishTitle: string | null
  releaseYear: number | null
  posterUrl: string | null
  playUrl: string | null
  rating: number | null
  job: string
  department: string
  character: string | null
}

export interface PublicPersonDetail extends PublicPerson {
  credits: PublicPersonCredit[]
}

export interface PublicPersonResponse {
  schemaVersion: number
  person: PublicPersonDetail
}
