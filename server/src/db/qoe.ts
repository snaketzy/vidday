/**
 * QoE 体验监测落库：播放会话聚合（qoe_session）+ 原始事件明细（qoe_event）。
 *
 * 与用户侧数据（user-data.ts）同策略：直连读写、不并入内容侧内存模型。
 * 表结构与 moive-database-op 的 schema.sql 保持镜像（两仓库共用同一 MySQL 库），
 * 这里额外在启动时幂等建表，保证 vidday server 单独部署时上报链路也能直接可用。
 *
 * 写入口径：
 *  - 会话：按 session_id 幂等 upsert；客户端上报的是累计值，直接覆盖计数列，
 *    ttff / ended_at 取「首次有值 / 非空即写」，started_at 保持首次落库值。
 *  - 事件：增量追加（客户端只上报上次成功上报之后产生的新事件）。
 */
import type { ResultSetHeader } from 'mysql2/promise'

import type { PublicQoeEventInput, PublicQoeSessionUpsert } from '../contract.ts'
import { getPool } from './pool.ts'

/** ISO 字符串 → MySQL DATETIME(3) 字面量（UTC）。 */
function toDbDateTime(iso: string): string {
  const t = new Date(iso).toISOString()
  return `${t.slice(0, 10)} ${t.slice(11, 23)}`
}

/** 归一客户端时间：非法值回落到服务端当前时间。 */
function resolveTime(raw: string | undefined): string {
  if (!raw) return new Date().toISOString()
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

/** 非负整数归一；非法 / 负数一律归 0。 */
function toCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 可空非负整数：null / 非法 → null。 */
function toOptionalCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/** 可空正整数（id 类）：非法 → null。 */
function toOptionalId(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

const SCHEMA_DDL = [
  'CREATE TABLE IF NOT EXISTS `qoe_session` (' +
    '`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,' +
    '`session_id` VARCHAR(64) NOT NULL,' +
    '`device_id` VARCHAR(64) DEFAULT NULL,' +
    '`client` VARCHAR(16) NOT NULL DEFAULT \'web\',' +
    '`title_id` INT UNSIGNED DEFAULT NULL,' +
    '`episode_id` INT UNSIGNED DEFAULT NULL,' +
    '`content_type` VARCHAR(16) DEFAULT NULL,' +
    '`title_name` VARCHAR(255) DEFAULT NULL,' +
    '`play_url` VARCHAR(1024) DEFAULT NULL,' +
    '`ttff_ms` INT UNSIGNED DEFAULT NULL,' +
    '`duration_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,' +
    '`watched_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,' +
    '`rebuffer_count` INT UNSIGNED NOT NULL DEFAULT 0,' +
    '`rebuffer_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,' +
    '`avg_bitrate_kbps` INT UNSIGNED DEFAULT NULL,' +
    '`peak_bitrate_kbps` INT UNSIGNED DEFAULT NULL,' +
    '`switch_count` INT UNSIGNED NOT NULL DEFAULT 0,' +
    '`error_count` INT UNSIGNED NOT NULL DEFAULT 0,' +
    '`dropped_frames` INT UNSIGNED NOT NULL DEFAULT 0,' +
    '`total_frames` BIGINT UNSIGNED NOT NULL DEFAULT 0,' +
    '`started_at` DATETIME(3) NOT NULL,' +
    '`ended_at` DATETIME(3) DEFAULT NULL,' +
    '`created_at` DATETIME(3) NOT NULL,' +
    '`updated_at` DATETIME(3) NOT NULL,' +
    'PRIMARY KEY (`id`),' +
    'UNIQUE KEY `uk_qoe_session` (`session_id`),' +
    'KEY `idx_qoe_session_started` (`started_at`),' +
    'KEY `idx_qoe_session_client` (`client`, `started_at`),' +
    'KEY `idx_qoe_session_title` (`title_id`, `started_at`),' +
    'KEY `idx_qoe_session_device` (`device_id`)' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC',
  'CREATE TABLE IF NOT EXISTS `qoe_event` (' +
    '`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,' +
    '`session_id` VARCHAR(64) NOT NULL,' +
    '`device_id` VARCHAR(64) DEFAULT NULL,' +
    '`client` VARCHAR(16) NOT NULL DEFAULT \'web\',' +
    '`title_id` INT UNSIGNED DEFAULT NULL,' +
    '`episode_id` INT UNSIGNED DEFAULT NULL,' +
    '`type` VARCHAR(32) NOT NULL,' +
    '`event_at` DATETIME(3) NOT NULL,' +
    '`position_ms` BIGINT UNSIGNED DEFAULT NULL,' +
    '`value_ms` INT UNSIGNED DEFAULT NULL,' +
    '`value_num` INT UNSIGNED DEFAULT NULL,' +
    '`severity` VARCHAR(16) DEFAULT NULL,' +
    '`message` VARCHAR(512) DEFAULT NULL,' +
    '`payload` JSON DEFAULT NULL,' +
    '`created_at` DATETIME(3) NOT NULL,' +
    'PRIMARY KEY (`id`),' +
    'KEY `idx_qoe_event_session` (`session_id`, `event_at`),' +
    'KEY `idx_qoe_event_type` (`type`, `event_at`),' +
    'KEY `idx_qoe_event_at` (`event_at`)' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC',
]

/** 幂等建表：vidday server 独立部署时也能直接接收上报。 */
export async function ensureQoeTables(): Promise<void> {
  for (const ddl of SCHEMA_DDL) await getPool().query(ddl)
}

/** 幂等写入会话聚合：客户端上报累计值，直接覆盖计数列。 */
export async function upsertQoeSession(
  deviceId: string,
  session: PublicQoeSessionUpsert
): Promise<void> {
  const now = toDbDateTime(new Date().toISOString())
  const startedAt = toDbDateTime(resolveTime(session.startedAt))
  const endedAt = session.endedAt ? toDbDateTime(resolveTime(session.endedAt)) : null
  const playUrl = session.playUrl ? session.playUrl.slice(0, 1024) : null
  const titleName = session.titleName ? session.titleName.slice(0, 255) : null
  const contentType = session.contentType ? session.contentType.slice(0, 16) : null

  await getPool().query(
    'INSERT INTO `qoe_session` (' +
      '`session_id`, `device_id`, `client`, `title_id`, `episode_id`, `content_type`, `title_name`, `play_url`,' +
      '`ttff_ms`, `duration_ms`, `watched_ms`, `rebuffer_count`, `rebuffer_ms`, `avg_bitrate_kbps`, `peak_bitrate_kbps`,' +
      '`switch_count`, `error_count`, `dropped_frames`, `total_frames`, `started_at`, `ended_at`, `created_at`, `updated_at`' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE ' +
      '`device_id` = VALUES(`device_id`),' +
      '`client` = VALUES(`client`),' +
      '`title_id` = VALUES(`title_id`),' +
      '`episode_id` = VALUES(`episode_id`),' +
      '`content_type` = VALUES(`content_type`),' +
      '`title_name` = COALESCE(VALUES(`title_name`), `title_name`),' +
      '`play_url` = COALESCE(VALUES(`play_url`), `play_url`),' +
      '`ttff_ms` = COALESCE(VALUES(`ttff_ms`), `ttff_ms`),' +
      '`duration_ms` = VALUES(`duration_ms`),' +
      '`watched_ms` = VALUES(`watched_ms`),' +
      '`rebuffer_count` = VALUES(`rebuffer_count`),' +
      '`rebuffer_ms` = VALUES(`rebuffer_ms`),' +
      '`avg_bitrate_kbps` = COALESCE(VALUES(`avg_bitrate_kbps`), `avg_bitrate_kbps`),' +
      '`peak_bitrate_kbps` = COALESCE(VALUES(`peak_bitrate_kbps`), `peak_bitrate_kbps`),' +
      '`switch_count` = VALUES(`switch_count`),' +
      '`error_count` = VALUES(`error_count`),' +
      '`dropped_frames` = VALUES(`dropped_frames`),' +
      '`total_frames` = VALUES(`total_frames`),' +
      '`ended_at` = COALESCE(VALUES(`ended_at`), `ended_at`),' +
      '`updated_at` = VALUES(`updated_at`)',
    [
      session.sessionId,
      deviceId,
      session.client === 'android' ? 'android' : 'web',
      toOptionalId(session.titleId),
      toOptionalId(session.episodeId),
      contentType,
      titleName,
      playUrl,
      toOptionalCount(session.ttffMs),
      toCount(session.durationMs),
      toCount(session.watchedMs),
      toCount(session.rebufferCount),
      toCount(session.rebufferMs),
      toOptionalCount(session.avgBitrateKbps),
      toOptionalCount(session.peakBitrateKbps),
      toCount(session.switchCount),
      toCount(session.errorCount),
      toCount(session.droppedFrames),
      toCount(session.totalFrames),
      startedAt,
      endedAt,
      now,
      now,
    ]
  )
}

/** 批量追加原始事件；返回实际写入条数。 */
export async function insertQoeEvents(
  deviceId: string,
  session: PublicQoeSessionUpsert,
  events: PublicQoeEventInput[]
): Promise<number> {
  if (!events.length) return 0

  const client = session.client === 'android' ? 'android' : 'web'
  const titleId = toOptionalId(session.titleId)
  const episodeId = toOptionalId(session.episodeId)
  const now = toDbDateTime(new Date().toISOString())

  const rows = events.map((event) => [
    session.sessionId,
    deviceId,
    client,
    titleId,
    episodeId,
    String(event.type).slice(0, 32),
    toDbDateTime(resolveTime(event.eventAt)),
    toOptionalCount(event.positionMs),
    toOptionalCount(event.valueMs),
    toOptionalCount(event.valueNum),
    event.severity ? String(event.severity).slice(0, 16) : null,
    event.message ? String(event.message).slice(0, 512) : null,
    event.payload === null || event.payload === undefined ? null : JSON.stringify(event.payload),
    now,
  ])

  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
  const result = await getPool().query<ResultSetHeader>(
    'INSERT INTO `qoe_event` (' +
      '`session_id`, `device_id`, `client`, `title_id`, `episode_id`, `type`, `event_at`,' +
      '`position_ms`, `value_ms`, `value_num`, `severity`, `message`, `payload`, `created_at`' +
      `) VALUES ${placeholders}`,
    rows.flat()
  )
  return result[0].affectedRows ?? 0
}
