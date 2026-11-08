/**
 * Vidday 自有后台服务（`server/`）对外接口客户端。
 *
 * 契约面刻意收窄：前端只消费轻量卡片 / 详情 DTO，不感知后端内部模型。
 * 前端与 server 各自镜像一份契约类型并做窄校验（schemaVersion + 逐字段归一），
 * 后端字段漂移时宁可丢弃单项、也不让错误数据流进 UI。
 *
 * 所有请求需携带 App 级密钥（`x-app-key`，取自 `VITE_APP_API_KEY`）；
 * 内容侧为只读；观看进度 / 我的片单为设备归属的可写端点，
 * 以 `X-Device-Id` 标识设备（见 `@/lib/device-id`）。
 */
import { getDeviceId } from '@/lib/device-id'

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
  contentType: 'movie' | 'series'
  /** 演员（department = Acting），按署名顺序 */
  cast: PublicCreditEntry[]
  /** 职员（导演 / 编剧 / 制片等），按署名顺序 */
  crew: PublicCreditEntry[]
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
  contentType: 'movie' | 'series'
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

/**
 * 观看进度条目：卡片摘要叠加进度字段。
 * 后端随进度一并下发卡片，前台启动时可据此重建目录条目（catalog 不持久化）。
 */
export interface PublicWatchProgress extends PublicCarouselCard {
  /** 剧集单集 id；影片为 null */
  episodeId: number | null
  /** 已观看秒数 */
  position: number
  /** 总时长（秒） */
  duration: number
  /** 进度百分比 0-100 */
  percent: number
  updatedAt: string
}

/** 写入进度的请求体：幂等 upsert，按 updatedAt 判定是否覆盖。 */
export interface PublicProgressUpsert {
  titleId: number
  episodeId?: number | null
  position: number
  duration: number
  percent: number
  /** 客户端记录时间（ISO）；缺省时以服务端时间为准 */
  updatedAt?: string
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

/** 演职员署名：姓名缺失即视为脏数据丢弃。 */
function normalizeCreditEntry(raw: Json): PublicCreditEntry | null {
  if (!isRecord(raw)) return null
  const name = text(raw.name)
  if (!name) return null
  return {
    personId: num(raw.personId),
    name,
    englishName: text(raw.englishName),
    avatarUrl: text(raw.avatarUrl),
    department: text(raw.department) ?? '',
    job: text(raw.job) ?? '',
    character: text(raw.character),
  }
}

function normalizeCreditEntries(raw: Json): PublicCreditEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeCreditEntry)
    .filter((entry): entry is PublicCreditEntry => entry !== null)
}

/** 进度条目：卡片摘要必须合法，进度字段缺失即视为脏数据丢弃。 */
function normalizeProgress(raw: Json): PublicWatchProgress | null {
  if (!isRecord(raw)) return null
  const card = normalizeCard(raw)
  const position = num(raw.position)
  const duration = num(raw.duration)
  const percent = num(raw.percent)
  const updatedAt = text(raw.updatedAt)
  if (!card || position === null || duration === null || percent === null || !updatedAt) return null
  return {
    ...card,
    episodeId: num(raw.episodeId),
    position,
    duration,
    percent,
    updatedAt,
  }
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

/** App 级密钥；与 `server/.env` 的 APP_API_KEY 一致，经 `x-app-key` 头携带。 */
const APP_API_KEY = import.meta.env.VITE_APP_API_KEY ?? ''

interface RequestOptions {
  method?: 'GET' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** 用户侧数据端点需携带 `X-Device-Id` 标识归属设备 */
  device?: boolean
}

async function requestJson(path: string, options: RequestOptions = {}): Promise<Json> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (APP_API_KEY) headers['x-app-key'] = APP_API_KEY
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.device) headers['x-device-id'] = getDeviceId()

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
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

function getJson(path: string, signal?: AbortSignal): Promise<Json> {
  return requestJson(path, { signal })
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

/** 影片 / 剧集完整演职员表（演员与职员分组）。 */
export async function fetchTitleCredits(
  id: number,
  signal?: AbortSignal,
): Promise<PublicTitleCredits> {
  const body = unwrap(await getJson(`/public/titles/${id}/credits`, signal))
  if (!isRecord(body.credits)) throw new PublicApiError('响应缺少 credits 字段', 'contract')
  const raw = body.credits

  const creditsId = num(raw.id)
  if (creditsId === null) throw new PublicApiError('credits 字段结构非法', 'contract')

  return {
    id: creditsId,
    contentType: raw.contentType === 'series' ? 'series' : 'movie',
    cast: normalizeCreditEntries(raw.cast),
    crew: normalizeCreditEntries(raw.crew),
  }
}

/** 影人资料 + 参演作品（按年份倒序）。 */
export async function fetchPersonDetail(
  id: number,
  signal?: AbortSignal,
): Promise<PublicPersonDetail> {
  const body = unwrap(await getJson(`/public/people/${id}`, signal))
  if (!isRecord(body.person)) throw new PublicApiError('响应缺少 person 字段', 'contract')
  const raw = body.person

  const personId = num(raw.id)
  const name = text(raw.name)
  if (personId === null || !name) throw new PublicApiError('person 字段结构非法', 'contract')

  return {
    id: personId,
    name,
    englishName: text(raw.englishName),
    gender: text(raw.gender) ?? 'unknown',
    avatarUrl: text(raw.avatarUrl),
    birthday: text(raw.birthday),
    deathday: text(raw.deathday),
    placeOfBirth: text(raw.placeOfBirth),
    nationality: text(raw.nationality),
    school: text(raw.school),
    knownFor: text(raw.knownFor) ?? '',
    biography: text(raw.biography),
    credits: Array.isArray(raw.credits)
      ? raw.credits.filter(isRecord).flatMap((entry) => {
          const titleId = num(entry.titleId)
          const titleName = text(entry.title)
          if (titleId === null || !titleName) return []
          return [
            {
              titleId,
              contentType: entry.contentType === 'series' ? ('series' as const) : ('movie' as const),
              title: titleName,
              chineseTitle: text(entry.chineseTitle),
              englishTitle: text(entry.englishTitle),
              releaseYear: num(entry.releaseYear),
              posterUrl: text(entry.posterUrl),
              playUrl: text(entry.playUrl),
              rating: num(entry.rating),
              job: text(entry.job) ?? '',
              department: text(entry.department) ?? '',
              character: text(entry.character),
            },
          ]
        })
      : [],
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

/* ------------------------------------------------------------------ *
 * 用户侧数据：观看进度 / 我的片单（以 `X-Device-Id` 归属，可写）
 * ------------------------------------------------------------------ */

/** 本人全部观看进度（含卡片摘要），按最近更新倒序。 */
export async function fetchProgress(signal?: AbortSignal): Promise<PublicWatchProgress[]> {
  const body = unwrap(await requestJson('/public/progress', { device: true, signal }))
  if (!Array.isArray(body.items)) return []
  return body.items
    .map(normalizeProgress)
    .filter((item): item is PublicWatchProgress => item !== null)
}

/** 写入单条进度（幂等 upsert，仅在不早于库内 updatedAt 时覆盖）。 */
export async function putProgress(input: PublicProgressUpsert): Promise<void> {
  await requestJson('/public/progress', { method: 'PUT', device: true, body: input })
}

/** 删除单条进度（「继续观看」的移除操作）。 */
export async function deleteProgress(titleId: number): Promise<void> {
  await requestJson(`/public/progress/${titleId}`, { method: 'DELETE', device: true })
}

/** 我的片单（含卡片摘要），按加入时间倒序。 */
export async function fetchMyList(signal?: AbortSignal): Promise<PublicCarouselCard[]> {
  const body = unwrap(await requestJson('/public/list', { device: true, signal }))
  return normalizeCards(body.items)
}

/** 加入片单（重复加入幂等）。 */
export async function addToMyList(titleId: number): Promise<void> {
  await requestJson('/public/list', { method: 'PUT', device: true, body: { titleId } })
}

/** 移出片单。 */
export async function removeFromMyList(titleId: number): Promise<void> {
  await requestJson(`/public/list/${titleId}`, { method: 'DELETE', device: true })
}
