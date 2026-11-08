/**
 * Vidday 自有后台服务入口。
 *
 * 直连 MySQL（isee_videos_db）提供两类接口：
 *  - 内容侧只读：轮播 / 影片详情 / 剧集详情 / 专题 / 题材 / 最新上架 / 演职员 / 影人
 *  - 用户侧读写：观看进度 / 我的片单（按 X-Device-Id 归属）
 *
 * 对外仅暴露 /api/public/*，请求需携带 App 级密钥（x-app-key）。
 * 启动流程：注册钩子与路由 → 探活数据库 → 监听端口；任一步失败即拒绝对外服务。
 */
import { timingSafeEqual } from 'node:crypto'

import Fastify, { type FastifyInstance } from 'fastify'

import { closePool, pingMysql } from './db/pool.ts'
import { warmContentCache } from './db/queries.ts'
import { env } from './env.ts'
import { HttpError, unauthorized } from './http.ts'
import { peopleRoutes } from './routes/people.ts'
import { publicRoutes } from './routes/public.ts'

/** 恒定时间比较，避免通过响应时间侧信道推断密钥。 */
function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** 解析实际放行的 CORS 来源；配置含 `*` 时对所有来源放行。 */
function corsOriginFor(origin: string | undefined): string {
  const list = env.corsOrigins
  if (list.length === 0 || list.includes('*')) return '*'
  if (origin && list.includes(origin)) return origin
  return list[0]
}

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true })

  // 跨域与 App 密钥校验：onRequest 阶段最早执行
  app.addHook('onRequest', async (request, reply) => {
    reply.header('access-control-allow-origin', corsOriginFor(request.headers.origin))
    reply.header('vary', 'origin')
    reply.header('access-control-allow-methods', 'GET,PUT,DELETE,OPTIONS')
    reply.header('access-control-allow-headers', 'content-type,accept,x-app-key,x-device-id')

    if (request.method === 'OPTIONS') {
      reply.code(204).send()
      return
    }

    // 健康检查放行，便于探活与监控
    if (request.url.startsWith('/health')) return

    const raw = request.headers['x-app-key']
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value !== 'string' || !constantTimeEqual(value, env.appKey)) {
      throw unauthorized('缺少或非法的 x-app-key 请求头')
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
      return
    }
    const known = error as { statusCode?: number; message?: string }
    const status = typeof known.statusCode === 'number' ? known.statusCode : 500
    if (status >= 500) {
      request.log.error(error)
      reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务内部错误' } })
      return
    }
    reply.code(status).send({ error: { code: 'BAD_REQUEST', message: known.message ?? '请求有误' } })
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
  })

  app.get('/health', async () => {
    const db = await pingMysql()
    return { ok: true, database: db.database, mysql: db.version }
  })

  return app
}

async function main(): Promise<void> {
  const app = buildApp()

  await app.register(publicRoutes, { prefix: '/api/public' })
  await app.register(peopleRoutes, { prefix: '/api/public' })

  const db = await pingMysql()
  app.log.info(`MySQL 已连接：${db.database}（${db.version}）`)

  await app.listen({ host: '0.0.0.0', port: env.port })
  app.log.info(`Vidday 后台服务已就绪：http://127.0.0.1:${env.port}`)

  // 后台预热热点缓存：不阻塞启动，失败仅告警（下次请求回源即可）
  void warmContentCache().catch((error: unknown) => {
    app.log.warn({ err: error }, '内容缓存预热失败')
  })

  let closing = false
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return
    closing = true
    app.log.info(`收到 ${signal}，正在关闭服务……`)
    try {
      await app.close()
      await closePool()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  console.error('[vidday-server] 启动失败：', error)
  process.exit(1)
})
