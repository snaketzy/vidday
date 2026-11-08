/**
 * 对外只读内容接口 + 设备归属的用户侧数据接口。
 *
 * 内容侧只读；观看进度 / 我的片单以 `X-Device-Id` 标识设备，可写。
 * 响应一律附带 schemaVersion，消费方据此做运行时校验 / 版本拒绝，
 * 避免后端字段漂移直接泄漏到前台 UI。
 */
import type { FastifyPluginAsync } from 'fastify'

import {
  PUBLIC_SCHEMA_VERSION,
  type PublicCarouselCard,
  type PublicCarouselResponse,
  type PublicCollectionResponse,
  type PublicGenreResponse,
  type PublicLatestResponse,
  type PublicListResponse,
  type PublicProgressResponse,
  type PublicProgressUpsert,
  type PublicTitleCreditsResponse,
  type PublicTitleResponse,
  type PublicWatchProgress,
} from '../contract.ts'
import {
  DEFAULT_LATEST_DAYS,
  cardForTitleId,
  cardsForTitleIds,
  getCollectionDetail,
  getTitleCredits,
  getTitleDetail,
  listGenres,
  listLatest,
  listPublicCarousels,
} from '../db/queries.ts'
import {
  addToMyList,
  deleteProgress,
  listMyList,
  listProgress,
  removeFromMyList,
  upsertProgress,
} from '../db/user-data.ts'
import { badRequest, notFound, requirePositiveInt, toIdParam } from '../http.ts'

/** 请求头：设备标识（前台首次启动生成 UUID 并持久化，作为用户侧数据的归属键）。 */
const DEVICE_ID_HEADER = 'x-device-id'
/** 设备标识允许的字符集与长度（兼容 UUID 与自定义 ID）。 */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/

/** 「最新上架」窗口与条数上限。 */
const MAX_LATEST_DAYS = 90
const MAX_LATEST_LIMIT = 200

/** 取并校验设备标识；缺失或非法直接 400。 */
function requireDeviceId(headers: Record<string, unknown>): string {
  const raw = headers[DEVICE_ID_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !DEVICE_ID_PATTERN.test(value)) {
    throw badRequest(`缺少或非法的 ${DEVICE_ID_HEADER} 请求头`, 'INVALID_DEVICE_ID')
  }
  return value
}

export const publicRoutes: FastifyPluginAsync = async (app) => {
  /**
   * 页面轮播：首页 `?placement=home`；专题页 `?placement=collection&pageId=N`。
   * 仅返回启用中的轮播，且会剔除目标已删除的项；空轮播不下发。
   */
  app.get<{ Querystring: Record<string, unknown> }>('/carousels', async (request) => {
    const raw = String(request.query.placement ?? 'home')
    if (raw !== 'home' && raw !== 'collection') {
      throw badRequest(`placement 取值非法：${raw}`)
    }

    let pageId: number | null = null
    if (raw === 'collection') {
      const value = Number(request.query.pageId)
      if (!Number.isInteger(value) || value <= 0) {
        throw badRequest('placement=collection 时必须提供正整数 pageId')
      }
      pageId = value
    }

    const carousels = await listPublicCarousels({ placement: raw, pageId })
    const body: PublicCarouselResponse = {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      placement: raw,
      pageId,
      carousels,
    }
    return body
  })

  /** 影片 / 剧集详情：供前台详情页与播放页取真实元数据。 */
  app.get<{ Params: { id: string } }>('/titles/:id', async (request) => {
    const id = toIdParam(request.params.id)
    const title = await getTitleDetail(id)
    if (!title) throw notFound(`影片 / 剧集不存在：#${id}`)
    const body: PublicTitleResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, title }
    return body
  })

  /** 影片 / 剧集完整演职员表（演员与职员分组）。 */
  app.get<{ Params: { id: string } }>('/titles/:id/credits', async (request) => {
    const id = toIdParam(request.params.id)
    const credits = await getTitleCredits(id)
    if (!credits) throw notFound(`影片 / 剧集不存在：#${id}`)
    const body: PublicTitleCreditsResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, credits }
    return body
  })

  /** 专题详情：名称 / 简介 / 封面包 + 按序影片卡片。 */
  app.get<{ Params: { id: string } }>('/collections/:id', async (request) => {
    const id = toIdParam(request.params.id)
    const collection = await getCollectionDetail(id)
    if (!collection) throw notFound(`专题不存在：#${id}`)
    const body: PublicCollectionResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, collection }
    return body
  })

  /** 题材清单：与后台影片库题材过滤器同源，供前台「浏览」菜单构建筛选项。 */
  app.get('/genres', async () => {
    const body: PublicGenreResponse = {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      genres: await listGenres(),
    }
    return body
  })

  /**
   * 近 N 天上架：仅「已上架」状态的影片与剧集，按入库时间倒序。
   * 首页「最新上架」轨取前 10（`?days=7&limit=10`）；`/browse?addedWithin=7` 取窗口内全部。
   */
  app.get<{ Querystring: Record<string, unknown> }>('/latest', async (request) => {
    const days = Number(request.query.days ?? DEFAULT_LATEST_DAYS)
    if (!Number.isInteger(days) || days <= 0 || days > MAX_LATEST_DAYS) {
      throw badRequest(`days 取值非法：应为 1~${MAX_LATEST_DAYS} 的整数`)
    }

    let limit: number | undefined
    if (request.query.limit !== undefined) {
      const value = Number(request.query.limit)
      if (!Number.isInteger(value) || value <= 0 || value > MAX_LATEST_LIMIT) {
        throw badRequest(`limit 取值非法：应为 1~${MAX_LATEST_LIMIT} 的整数`)
      }
      limit = value
    }

    const { items, total } = await listLatest({ days, limit })
    const body: PublicLatestResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, days, total, items }
    return body
  })

  /* ---------------------------------------------------------------- *
   * 观看进度 / 我的片单：以 X-Device-Id 归属的用户侧数据。
   * 响应一律带回卡片摘要，前台可据此在启动时重建目录条目。
   * ---------------------------------------------------------------- */

  /** 本人全部观看进度（含卡片摘要），按最近更新倒序。 */
  app.get('/progress', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    const records = await listProgress(deviceId)
    const cards = await cardsForTitleIds(records.map((record) => record.titleId))

    const items: PublicWatchProgress[] = []
    for (const record of records) {
      const card = cards.get(record.titleId)
      if (!card) continue
      items.push({
        ...card,
        episodeId: record.episodeId,
        position: record.position,
        duration: record.duration,
        percent: record.percent,
        updatedAt: record.updatedAt,
      })
    }
    const body: PublicProgressResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, items }
    return body
  })

  /** 写入单条进度（幂等 upsert，仅在不早于库内 updatedAt 时覆盖）。 */
  app.put<{ Body: PublicProgressUpsert }>('/progress', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    const body = request.body ?? ({} as PublicProgressUpsert)
    const titleId = requirePositiveInt(body.titleId, 'titleId')
    if (!(await cardForTitleId(titleId))) throw notFound(`影片 / 剧集不存在：#${titleId}`)

    const rawEpisode = body.episodeId
    const episodeId =
      rawEpisode === undefined || rawEpisode === null ? null : requirePositiveInt(rawEpisode, 'episodeId')

    const position = Number(body.position ?? 0)
    const duration = Number(body.duration ?? 0)
    const percent = Number(body.percent ?? 0)
    for (const [field, value] of [
      ['position', position],
      ['duration', duration],
      ['percent', percent],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) throw badRequest(`${field} 应为非负数`)
    }

    await upsertProgress(deviceId, {
      titleId,
      episodeId,
      position,
      duration,
      percent,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
    })
    return { ok: true }
  })

  /** 删除单条进度（前台「继续观看」的移除操作）。 */
  app.delete<{ Params: { titleId: string } }>('/progress/:titleId', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    await deleteProgress(deviceId, toIdParam(request.params.titleId))
    return { ok: true }
  })

  /** 我的片单（含卡片摘要），按加入时间倒序。 */
  app.get('/list', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    const titleIds = await listMyList(deviceId)
    const cards = await cardsForTitleIds(titleIds)
    const items: PublicCarouselCard[] = []
    for (const titleId of titleIds) {
      const card = cards.get(titleId)
      if (card) items.push(card)
    }
    const body: PublicListResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, items }
    return body
  })

  /** 加入片单（重复加入幂等）。 */
  app.put<{ Body: { titleId?: number } }>('/list', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    const titleId = requirePositiveInt(request.body?.titleId, 'titleId')
    if (!(await cardForTitleId(titleId))) throw notFound(`影片 / 剧集不存在：#${titleId}`)
    await addToMyList(deviceId, titleId)
    return { ok: true }
  })

  /** 移出片单。 */
  app.delete<{ Params: { titleId: string } }>('/list/:titleId', async (request) => {
    const deviceId = requireDeviceId(request.headers as Record<string, unknown>)
    await removeFromMyList(deviceId, toIdParam(request.params.titleId))
    return { ok: true }
  })
}
