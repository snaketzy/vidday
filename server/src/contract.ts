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
  /** 平台评分（仅影片详情下发；无有效评分时省略）。 */
  ratings?: { tmdb?: number; imdb?: number }
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
  /** 媒体规格（仅影片下发；可靠子集，缺失表示未知）。是否 UHD（4K）。 */
  isUhd?: boolean | null
  /** 是否有 HEVC 封装。 */
  hasHevc?: boolean | null
  /** 音轨条数。 */
  audioTrackCount?: number | null
  /** 字幕轨条数。 */
  subtitleTrackCount?: number | null
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
  /** 'male' | 'female' | 'unknown'；供前台区分男女主角/配角 */
  gender: string
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

/** 全量目录：全部「已上架」状态的内容，按入库时间倒序。 */
export interface PublicTitlesResponse {
  schemaVersion: number
  total: number
  items: PublicCarouselCard[]
}

/** 全量目录按筛选条件统计的作品总数（仅「已上架」影片 + 剧集）。 */
export interface PublicTitlesCountResponse {
  schemaVersion: number
  total: number
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

/* ------------------------------------------------------------------ *
 * QoE 体验监测上报（前台播放器 → 服务端 → 共享库，管理后台聚合展示）
 *
 * 采集端（Web hls.js / Android TV media3）生成一次播放会话的标识，
 * 周期性与结束时上报：会话级聚合 + 增量原始事件。服务端按 session_id
 * 幂等 upsert 会话（客户端给的是累计值，直接覆盖），事件增量追加落库。
 * ------------------------------------------------------------------ */

/** QoE 采集端类型。 */
export type QoeClient = 'web' | 'android'

/** 会话级聚合：一次播放会话一行，客户端上报的为累计值。 */
export interface PublicQoeSessionUpsert {
  /** 客户端生成的会话标识（满足 ^[A-Za-z0-9._-]{8,64}$） */
  sessionId: string
  client: QoeClient
  titleId?: number | null
  episodeId?: number | null
  contentType?: string | null
  /** 片名快照，便于后台直接展示 */
  titleName?: string | null
  playUrl?: string | null
  /** 起播耗时：点击播放 → 首帧（毫秒） */
  ttffMs?: number | null
  durationMs?: number
  watchedMs?: number
  rebufferCount?: number
  rebufferMs?: number
  avgBitrateKbps?: number | null
  peakBitrateKbps?: number | null
  switchCount?: number
  errorCount?: number
  droppedFrames?: number
  totalFrames?: number
  /** 会话开始时间（ISO） */
  startedAt: string
  /** 会话结束时间（ISO）；未结束为 null */
  endedAt?: string | null
}

/** 原始事件明细：增量上报，服务端按上报顺序追加。 */
export interface PublicQoeEventInput {
  /** 事件类型：ttff / stall / level_switch / error / end 等 */
  type: string
  /** 事件发生时间（ISO） */
  eventAt: string
  /** 事件发生时的播放位置（毫秒） */
  positionMs?: number | null
  /** 时长类数值（毫秒） */
  valueMs?: number | null
  /** 数值类（码率 kbps / 分辨率高度等） */
  valueNum?: number | null
  severity?: 'info' | 'warn' | 'error' | null
  message?: string | null
  payload?: Record<string, unknown> | null
}

/** POST /api/public/qoe 请求体。 */
export interface PublicQoeReport {
  schemaVersion: number
  session: PublicQoeSessionUpsert
  events?: PublicQoeEventInput[]
}

/** POST /api/public/qoe 响应体：accepted 为本批落库的事件条数。 */
export interface PublicQoeReportResponse {
  schemaVersion: number
  ok: true
  accepted: number
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

/** 合作影人：与该影人出现在同一部作品里的另一位影人。 */
export interface PublicCollaborator {
  personId: number
  name: string
  englishName: string | null
  /** 'male' | 'female' | 'unknown' */
  gender: string
  avatarUrl: string | null
  /** 共同参演 / 参与制作的作品数，用于排序与展示 */
  sharedCount: number
}

export interface PublicCollaboratorsResponse {
  schemaVersion: number
  personId: number
  collaborators: PublicCollaborator[]
}

/**
 * 客户端内置代理的远端配置。
 * 订阅地址改由服务端下发，客户端启动时拉取并在变更时热替换，
 * 从而订阅地址失效 / 更换时无需发版、用户无感知。
 */
export interface PublicProxyConfigResponse {
  schemaVersion: number
  /** Clash 格式订阅地址；留空表示不下发，客户端保持现有配置 */
  subscriptionUrl: string
}
