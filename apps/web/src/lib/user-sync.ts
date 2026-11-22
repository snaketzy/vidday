/**
 * 用户侧数据（观看进度 / 我的片单）与服务端的双向同步。
 *
 * 方向与时机：
 *  - 启动水合：拉取服务端数据 → 合并进 Redux。catalog 不持久化，故需先用卡片摘要
 *    `upsertTitles` 重建目录条目，否则「继续观看」的 join 会全部落空。
 *    本地独有 / 较新的记录一并回推（覆盖后端不可达期间产生的本地增量）。
 *  - 运行期：本地写入即时上报 —— 进度由播放器节流上报，片单 / 移除操作由
 *    {@link userSyncMiddleware} 统一挂钩，避免散落在各 UI 调用点漏报。
 *
 * 冲突判定：进度按 `updatedAt` 取新（与服务端 upsert 的幂等口径一致）；片单以并集为准。
 * 回推若被服务端以 404 拒绝，说明目标已下架/已删除，就地删除本地条目，
 * 否则已下架内容会因本地残留而长期留在「继续收看」/「我的片单」。
 */
import type { Middleware, PayloadAction } from '@reduxjs/toolkit'

import {
  addToMyList,
  deleteProgress,
  fetchMyList,
  fetchProgress,
  PublicApiError,
  putProgress,
  removeFromMyList,
  type PublicProgressUpsert,
  type PublicWatchProgress,
} from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'
import type { AppDispatch, RootState } from '@/store'
import { upsertTitles } from '@/store/slices/catalog-slice'
import { addTitle, removeTitle } from '@/store/slices/my-list-slice'
import { recordProgress, removeProgress } from '@/store/slices/watch-slice'
import type { WatchProgress } from '@/types'

/** 前台的 titleId 为字符串；后端为整数，非法值（历史脏数据）直接忽略。 */
function toTitleId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function timeOf(updatedAt: string): number {
  const time = new Date(updatedAt).getTime()
  return Number.isFinite(time) ? time : 0
}

/** 服务端进度 → 本地进度。 */
function toLocalProgress(item: PublicWatchProgress): WatchProgress {
  return {
    titleId: String(item.targetId),
    episodeId: item.episodeId === null ? undefined : String(item.episodeId),
    percent: item.percent,
    position: item.position,
    duration: item.duration,
    updatedAt: item.updatedAt,
  }
}

/**
 * 播放器进度上报：本地字段 → 服务端 upsert 负载，即发即忘。
 * 用于播放中每 15s、暂停与离开页面的即时落库。
 */
export function reportProgress(input: {
  titleId: string
  episodeId?: string | null
  position: number
  duration: number
  percent: number
  updatedAt?: string
}): void {
  const titleId = toTitleId(input.titleId)
  if (titleId === null || !(input.duration > 0)) return

  const payload: PublicProgressUpsert = {
    titleId,
    episodeId: input.episodeId ? toTitleId(input.episodeId) : null,
    position: Math.max(0, Math.floor(input.position)),
    duration: Math.max(0, Math.round(input.duration)),
    percent: Math.min(100, Math.max(0, Math.round(input.percent))),
    updatedAt: input.updatedAt,
  }
  void putProgress(payload).catch(() => undefined)
}

/**
 * 启动水合：服务端 → 本地合并，并把本地增量回推服务端。
 * 任一方向失败均静默降级（后端不可达时前台仍以 localStorage 为准）。
 */
export async function hydrateUserData(
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<void> {
  const [progressResult, listResult] = await Promise.allSettled([fetchProgress(), fetchMyList()])

  if (progressResult.status === 'fulfilled') {
    const serverItems = progressResult.value
    if (serverItems.length) dispatch(upsertTitles(serverItems.map(cardToTitle)))

    const serverById = new Map(serverItems.map((item) => [String(item.targetId), item]))
    const localById = new Map(getState().watch.progress.map((entry) => [entry.titleId, entry]))

    // 服务端较新 → 覆盖本地；本地较新 / 独有 → 保留本地的候选项，稍后回推
    for (const item of serverItems) {
      const incoming = toLocalProgress(item)
      const existing = localById.get(incoming.titleId)
      if (!existing || timeOf(incoming.updatedAt) > timeOf(existing.updatedAt)) {
        dispatch(recordProgress(incoming))
      }
    }

    const pushes: Promise<void>[] = []
    for (const entry of localById.values()) {
      const remote = serverById.get(entry.titleId)
      if (remote && timeOf(entry.updatedAt) <= timeOf(remote.updatedAt)) continue
      const titleId = toTitleId(entry.titleId)
      if (titleId === null) continue
      pushes.push(
        putProgress({
          titleId,
          episodeId: entry.episodeId ? toTitleId(entry.episodeId) : null,
          position: Math.floor(entry.position),
          duration: Math.round(entry.duration),
          percent: Math.min(100, Math.max(0, Math.round(entry.percent))),
          updatedAt: entry.updatedAt,
        }).catch((error: unknown) => {
          // 服务端 404 = 目标已下架/已删除：本地残留不会再被服务端接受，就地清除
          if (error instanceof PublicApiError && error.status === 404) {
            dispatch(removeProgress(entry.titleId))
          }
        }),
      )
    }
    await Promise.all(pushes)
  }

  if (listResult.status === 'fulfilled') {
    const cards = listResult.value
    if (cards.length) dispatch(upsertTitles(cards.map(cardToTitle)))

    const serverIds = new Set(cards.map((card) => String(card.targetId)))
    for (const id of serverIds) {
      if (!getState().myList.ids.includes(id)) dispatch(addTitle(id))
    }
    const pushes: Promise<void>[] = []
    for (const id of getState().myList.ids) {
      if (serverIds.has(id)) continue
      const titleId = toTitleId(id)
      if (titleId === null) continue
      pushes.push(
        addToMyList(titleId).catch((error: unknown) => {
          // 服务端 404 = 目标已下架/已删除：本地残留不会再被服务端接受，就地清除
          if (error instanceof PublicApiError && error.status === 404) {
            dispatch(removeTitle(id))
          }
        }),
      )
    }
    await Promise.all(pushes)
  }
}

/**
 * 用户侧写入挂钩：片单增删与「继续观看」移除在本地状态变更后即时回写服务端。
 * 进度写入走 {@link reportProgress}，此处不拦截 `watch/recordProgress`。
 */
export const userSyncMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  const type = (action as PayloadAction<unknown>).type

  if (type === 'myList/toggleTitle') {
    const id = (action as PayloadAction<string>).payload
    const titleId = toTitleId(id)
    if (titleId === null) return result
    // 变更后仍在片单内 → 本次为加入；否则为移除
    const stillListed = (api.getState() as RootState).myList.ids.includes(id)
    void (stillListed ? addToMyList(titleId) : removeFromMyList(titleId)).catch(() => undefined)
  } else if (type === 'myList/addTitle') {
    const titleId = toTitleId((action as PayloadAction<string>).payload)
    if (titleId !== null) void addToMyList(titleId).catch(() => undefined)
  } else if (type === 'myList/removeTitle') {
    const titleId = toTitleId((action as PayloadAction<string>).payload)
    if (titleId !== null) void removeFromMyList(titleId).catch(() => undefined)
  } else if (type === 'watch/removeProgress') {
    const titleId = toTitleId((action as PayloadAction<string>).payload)
    if (titleId !== null) void deleteProgress(titleId).catch(() => undefined)
  }

  return result
}
