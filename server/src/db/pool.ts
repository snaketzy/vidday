import { createPool, type Pool } from 'mysql2/promise'
import { env } from '../env.ts'

let pool: Pool | null = null

/** 惰性创建连接池：内容侧只读、用户侧轻量写入，10 条连接足够。 */
export function getPool(): Pool {
  if (!pool) {
    pool = createPool({
      host: env.mysql.host,
      port: env.mysql.port,
      user: env.mysql.user,
      password: env.mysql.password,
      database: env.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4_unicode_ci',
      // 日期一律以字符串往返，避免 Date 对象做时区换算导致时间漂移
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
    })
  }
  return pool
}

/** 探活：启动时校验数据库可达，失败即拒绝对外提供服务。 */
export async function pingMysql(): Promise<{ version: string; database: string }> {
  const [rows] = await getPool().query<import('mysql2/promise').RowDataPacket[]>(
    'SELECT VERSION() AS version, DATABASE() AS db'
  )
  const row = rows[0] ?? {}
  return { version: String(row.version ?? ''), database: String(row.db ?? '') }
}

export async function closePool(): Promise<void> {
  if (!pool) return
  const current = pool
  pool = null
  await current.end()
}
