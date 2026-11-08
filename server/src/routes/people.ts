/**
 * 影人接口：基础资料 + 参演 / 参与制作的影片与剧集。
 *
 * 与影片详情页的演职员表（`/titles/:id/credits`）配合：
 * 前者按作品列出全部演职人员，后者按影人反查其全部作品。
 */
import type { FastifyPluginAsync } from 'fastify'

import { PUBLIC_SCHEMA_VERSION, type PublicPersonResponse } from '../contract.ts'
import { getPersonDetail } from '../db/queries.ts'
import { notFound, toIdParam } from '../http.ts'

export const peopleRoutes: FastifyPluginAsync = async (app) => {
  /** 影人详情：基础资料 + 参演 / 参与制作的影片与剧集（按年份倒序）。 */
  app.get<{ Params: { id: string } }>('/people/:id', async (request) => {
    const id = toIdParam(request.params.id)
    const person = await getPersonDetail(id)
    if (!person) throw notFound(`影人不存在：#${id}`)
    const body: PublicPersonResponse = { schemaVersion: PUBLIC_SCHEMA_VERSION, person }
    return body
  })
}
