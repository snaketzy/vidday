/**
 * moive-database-op 对外只读接口客户端。
 *
 * 契约面刻意收窄：前端只消费轻量卡片 / 详情 DTO，不感知后端内部模型。
 * 由于两个项目不同仓库、无法共享类型，这里镜像一份契约类型，
 * 并对响应做窄校验（schemaVersion + 逐字段归一），
 * 后端字段漂移时宁可丢弃单项、也不让错误数据流进 UI。
 */

/**
 * 与后端 `PUBLIC_SCHEMA_VERSION` 必须一致，不一致直接拒绝响应。
 * v2 变更：轮播项新增 `targetType: 'series'`（剧集）。
 */
export const PUBLIC_SCHEMA_VERSION = 2

export type CarouselPlacement = 'home' | 'collection'
export type CarouselVariant = 'hero' | 'rail'
export type CarouselTargetType = 'movie' | 'series' | 'collection'

export interface PublicCarouselCard {
  id: number
  targetType: CarouselTargetType
  targetId: number
  /** 跳转地址：影片 /watch/{id}，专题 /collection/{id} */
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

export interface PublicCarouselPage {
  placement: CarouselPlacement
  pageId: number | null
  carousels: PublicCarousel[]
}

export interface PublicTitleDetail {
  id: number
  contentType: 'movie' | 'series'
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

export interface PublicCollectionDetail {
  id: number
  name: string
  description: string | null
  coverUrl: string | null
  covers: string[]
  items: PublicCarouselCard[]
}

/** 题材项：与后台影片库题材过滤器同源。 */
export interface PublicGenre {
  /** 英文 code，如 Action / Science Fiction */
  code: string
  /** 中文名，如 动作 */
  name: string
}

/** 近 N 天上架内容：仅后台「已上架」状态，按入库时间倒序。 */
export interface PublicLatest {
  days: number
  /** 窗口内总数（不受 limit 影响） */
  total: number
  items: PublicCarouselCard[]
}

export type PublicApiErrorKind = 'network' | 'http' | 'contract'

export class PublicApiError extends Error {
  kind: PublicApiErrorKind

  constructor(message: string, kind: PublicApiErrorKind) {
    super(message)
    this.name = 'PublicApiError'
    this.kind = kind
  }
}

/* ------------------------------------------------------------------ *
 * 窄校验：只认字段级结构，缺失字段一律归一到 null / 空数组
 * ------------------------------------------------------------------ */

type Json = unknown

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: Json): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function num(value: Json): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bool(value: Json, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function textList(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeCard(raw: Json): PublicCarouselCard | null {
  if (!isRecord(raw)) return null
  const targetType: CarouselTargetType | null =
    raw.targetType === 'movie'
      ? 'movie'
      : raw.targetType === 'series'
        ? 'series'
        : raw.targetType === 'collection'
          ? 'collection'
          : null
  const targetId = num(raw.targetId)
  const title = text(raw.title)
  if (!targetType || targetId === null || !title) return null

  // 影片 / 剧集起播走 /watch，专题走 /collection
  const fallbackHref =
    targetType === 'collection' ? `/collection/${targetId}` : `/watch/${targetId}`
  return {
    id: num(raw.id) ?? targetId,
    targetType,
    targetId,
    href: text(raw.href) ?? fallbackHref,
    title,
    chineseTitle: text(raw.chineseTitle),
    englishTitle: text(raw.englishTitle),
    subtitle: text(raw.subtitle),
    backdropUrl: text(raw.backdropUrl),
    posterUrl: text(raw.posterUrl),
    playUrl: text(raw.playUrl),
    covers: textList(raw.covers),
    releaseYear: num(raw.releaseYear),
    runtime: num(raw.runtime),
    maturity: text(raw.maturity),
    rating: num(raw.rating),
    genres: textList(raw.genres),
  }
}

function normalizeCards(raw: Json): PublicCarouselCard[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeCard)
    .filter((card): card is PublicCarouselCard => card !== null)
}

/** 校验根对象并取出 schemaVersion 一致的响应体。 */
function unwrap(payload: Json): Record<string, Json> {
  if (!isRecord(payload)) {
    throw new PublicApiError('响应不是合法对象', 'contract')
  }
  const version = num(payload.schemaVersion)
  if (version !== PUBLIC_SCHEMA_VERSION) {
    throw new PublicApiError(
      `契约版本不匹配：期望 ${PUBLIC_SCHEMA_VERSION}，收到 ${String(payload.schemaVersion)}`,
      'contract',
    )
  }
  return payload
}

/* ------------------------------------------------------------------ *
 * 请求
 * ------------------------------------------------------------------ */

/** 后端地址；开发期由 .env 的 VITE_API_BASE_URL 指定（如 http://127.0.0.1:8790） */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

async function getJson(path: string, signal?: AbortSignal): Promise<Json> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      headers: { accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new PublicApiError('无法连接内容服务，请确认后端已启动', 'network')
  }

  if (!response.ok) {
    throw new PublicApiError(`内容服务返回 ${response.status}`, 'http')
  }

  try {
    return (await response.json()) as Json
  } catch {
    throw new PublicApiError('响应不是合法 JSON', 'contract')
  }
}

/** 页面轮播：首页 `home`；专题页 `collection` + pageId。 */
export async function fetchCarousels(
  params: { placement: CarouselPlacement; pageId?: number },
  signal?: AbortSignal,
): Promise<PublicCarouselPage> {
  const search = new URLSearchParams({ placement: params.placement })
  if (params.pageId !== undefined) search.set('pageId', String(params.pageId))

  const body = unwrap(await getJson(`/public/carousels?${search.toString()}`, signal))
  const carousels = Array.isArray(body.carousels) ? body.carousels : []

  return {
    placement: params.placement,
    pageId: params.pageId ?? null,
    carousels: carousels
      .filter(isRecord)
      .map((raw) => ({
        id: num(raw.id) ?? 0,
        title: text(raw.title) ?? '',
        variant: raw.variant === 'hero' ? ('hero' as const) : ('rail' as const),
        autoplay: bool(raw.autoplay, true),
        intervalMs: num(raw.intervalMs) ?? 6000,
        items: normalizeCards(raw.items),
      }))
      .filter((carousel) => carousel.items.length > 0),
  }
}

/** 影片详情。 */
export async function fetchTitleDetail(
  id: number,
  signal?: AbortSignal,
): Promise<PublicTitleDetail> {
  const body = unwrap(await getJson(`/public/titles/${id}`, signal))
  if (!isRecord(body.title)) throw new PublicApiError('响应缺少 title 字段', 'contract')
  const raw = body.title

  const titleId = num(raw.id)
  const name = text(raw.title)
  if (titleId === null || !name) throw new PublicApiError('title 字段结构非法', 'contract')

  return {
    id: titleId,
    contentType: raw.contentType === 'series' ? 'series' : 'movie',
    title: name,
    chineseTitle: text(raw.chineseTitle),
    englishTitle: text(raw.englishTitle),
    originalTitle: text(raw.originalTitle),
    year: num(raw.year),
    runtime: num(raw.runtime),
    rating: num(raw.rating),
    maturity: text(raw.maturity),
    genres: textList(raw.genres),
    logline: text(raw.logline),
    synopsis: text(raw.synopsis),
    director: text(raw.director),
    cast: textList(raw.cast),
    backdropUrl: text(raw.backdropUrl),
    posterUrl: text(raw.posterUrl),
    playUrl: text(raw.playUrl),
    collections: Array.isArray(raw.collections)
      ? raw.collections.filter(isRecord).flatMap((entry) => {
          const collectId = num(entry.id)
          const collectName = text(entry.name)
          return collectId !== null && collectName ? [{ id: collectId, name: collectName }] : []
        })
      : [],
    updatedAt: text(raw.updatedAt) ?? '',
  }
}

/** 专题详情。 */
export async function fetchCollectionDetail(
  id: number,
  signal?: AbortSignal,
): Promise<PublicCollectionDetail> {
  const body = unwrap(await getJson(`/public/collections/${id}`, signal))
  if (!isRecord(body.collection)) throw new PublicApiError('响应缺少 collection 字段', 'contract')
  const raw = body.collection

  const collectionId = num(raw.id)
  const name = text(raw.name)
  if (collectionId === null || !name) throw new PublicApiError('collection 字段结构非法', 'contract')

  return {
    id: collectionId,
    name,
    description: text(raw.description),
    coverUrl: text(raw.coverUrl),
    covers: textList(raw.covers),
    items: normalizeCards(raw.items),
  }
}

/**
 * 影片库题材清单：与后台「电影库 → 题材过滤器」同源，
 * 供前台「浏览」菜单构建筛选项；后端新增题材会自动出现。
 */
export async function fetchGenres(signal?: AbortSignal): Promise<PublicGenre[]> {
  const body = unwrap(await getJson('/public/genres', signal))
  if (!Array.isArray(body.genres)) return []

  return body.genres.filter(isRecord).flatMap((raw) => {
    const code = text(raw.code)
    const name = text(raw.name)
    return code && name ? [{ code, name }] : []
  })
}

/**
 * 近 N 天上架内容（影片 + 剧集，仅后台「已上架」状态），按入库时间倒序。
 * 首页「最新上架」轨取前 10；`limit` 缺省返回窗口内全部，供 `/browse?addedWithin=N`。
 */
export async function fetchLatest(
  params: { days: number; limit?: number },
  signal?: AbortSignal,
): Promise<PublicLatest> {
  const search = new URLSearchParams({ days: String(params.days) })
  if (params.limit !== undefined) search.set('limit', String(params.limit))

  const body = unwrap(await getJson(`/public/latest?${search.toString()}`, signal))
  return {
    days: num(body.days) ?? params.days,
    total: num(body.total) ?? 0,
    items: normalizeCards(body.items),
  }
}
