/**
 * 用户侧数据（观看进度 / 我的片单）：按设备标识归属，直连读写。
 *
 * 刻意不并入内容侧内存模型：这类数据高频写入、按设备无限增长，
 * 且内容整库导入 / 重置不应波及用户数据，故独立走 watch_progress / my_list 两张表。
 * 时间口径与内容侧一致：DATETIME(3) ↔ UTC ISO 字符串。
 */
import type { RowDataPacket } from 'mysql2/promise'

import { getPool } from './pool.ts'

/** 单条观看进度（不含卡片摘要，摘要由路由层补全）。 */
export interface ProgressRecord {
  titleId: number
  episodeId: number | null
  /** 已观看秒数 */
  position: number
  /** 总时长（秒） */
  duration: number
  /** 进度百分比 0-100 */
  percent: number
  updatedAt: string
}

/** 进度 upsert 入参。 */
export interface ProgressInput {
  titleId: number
  episodeId?: number | null
  position: number
  duration: number
  percent: number
  /** 客户端记录时间（ISO）；缺省时取服务端当前时间 */
  updatedAt?: string
}

/** ISO 字符串 → MySQL DATETIME(3) 字面量（UTC）。 */
function toDbDateTime(iso: string): string {
  const t = new Date(iso).toISOString()
  return `${t.slice(0, 10)} ${t.slice(11, 23)}`
}

/** MySQL DATETIME(3) → UTC ISO 字符串。 */
function fromDbDateTime(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (!s) return new Date(0).toISOString()
  if (s.includes('T')) return s
  return `${s.slice(0, 10)}T${s.slice(11, 23).padEnd(12, '0')}Z`
}

/** 归一客户端时间：非法值回落到服务端当前时间。 */
function resolveUpdatedAt(raw: string | undefined): string {
  if (!raw) return new Date().toISOString()
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/* ------------------------------------------------------------------ *
 * 观看进度
 * ------------------------------------------------------------------ */

/** 某设备的全部进度，按最近更新倒序。 */
export async function listProgress(deviceId: string): Promise<ProgressRecord[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    'SELECT `title_id`, `episode_id`, `position`, `duration`, `percent`, `updated_at` ' +
      'FROM `watch_progress` WHERE `device_id` = ? ORDER BY `updated_at` DESC',
    [deviceId]
  )
  return rows.map((row) => ({
    titleId: toInt(row.title_id),
    episodeId: row.episode_id === null ? null : toInt(row.episode_id),
    position: toInt(row.position),
    duration: toInt(row.duration),
    percent: Math.min(100, toInt(row.percent)),
    updatedAt: fromDbDateTime(row.updated_at),
  }))
}

/**
 * 幂等写入进度：同设备同影片唯一，仅当入参 updatedAt 不早于库内值才覆盖。
 *
 * 列赋值顺序刻意把 `updated_at` 放在最后——MySQL 自左向右求值，
 * 前面的 IF 比较仍读到旧值，从而整行按同一判据决定是否更新。
 */
export async function upsertProgress(deviceId: string, input: ProgressInput): Promise<void> {
  const updatedAt = resolveUpdatedAt(input.updatedAt)
  const episodeId = input.episodeId ? toInt(input.episodeId) : null
  const position = toInt(input.position)
  const duration = toInt(input.duration)
  const percent = Math.min(100, toInt(input.percent))
  const stamp = toDbDateTime(updatedAt)

  await getPool().query(
    'INSERT INTO `watch_progress` ' +
      '(`device_id`, `title_id`, `episode_id`, `position`, `duration`, `percent`, `created_at`, `updated_at`) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE ' +
      '`episode_id` = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(`episode_id`), `episode_id`), ' +
      '`position`   = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(`position`), `position`), ' +
      '`duration`   = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(`duration`), `duration`), ' +
      '`percent`    = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(`percent`), `percent`), ' +
      '`updated_at` = GREATEST(`updated_at`, VALUES(`updated_at`))',
    [deviceId, input.titleId, episodeId, position, duration, percent, stamp, stamp]
  )
}

/** 删除某设备的单条进度。 */
export async function deleteProgress(deviceId: string, titleId: number): Promise<void> {
  await getPool().query(
    'DELETE FROM `watch_progress` WHERE `device_id` = ? AND `title_id` = ?',
    [deviceId, titleId]
  )
}

/* ------------------------------------------------------------------ *
 * 我的片单
 * ------------------------------------------------------------------ */

/** 某设备的片单，按加入时间倒序。 */
export async function listMyList(deviceId: string): Promise<number[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    'SELECT `title_id` FROM `my_list` WHERE `device_id` = ? ORDER BY `created_at` DESC',
    [deviceId]
  )
  return rows.map((row) => toInt(row.title_id))
}

/** 加入片单：重复加入为幂等空操作。 */
export async function addToMyList(deviceId: string, titleId: number): Promise<void> {
  await getPool().query(
    'INSERT IGNORE INTO `my_list` (`device_id`, `title_id`, `created_at`) VALUES (?, ?, ?)',
    [deviceId, titleId, toDbDateTime(new Date().toISOString())]
  )
}

/** 从片单移除。 */
export async function removeFromMyList(deviceId: string, titleId: number): Promise<void> {
  await getPool().query('DELETE FROM `my_list` WHERE `device_id` = ? AND `title_id` = ?', [
    deviceId,
    titleId,
  ])
}
