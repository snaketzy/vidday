/** 对外接口的 HTTP 错误与入参校验工具。 */

/** 带状态码的接口错误；由 fastify 错误处理器统一转换为 JSON 响应。 */
export class HttpError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, message: string, code = 'BAD_REQUEST') {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST'): HttpError {
  return new HttpError(400, message, code)
}

export function unauthorized(message: string, code = 'UNAUTHORIZED'): HttpError {
  return new HttpError(401, message, code)
}

export function notFound(message: string, code = 'NOT_FOUND'): HttpError {
  return new HttpError(404, message, code)
}

/** 解析路径 / 查询串里的正整数 ID。 */
export function toIdParam(value: unknown): number {
  return requirePositiveInt(value, 'id')
}

/** 解析并校验正整数入参。 */
export function requirePositiveInt(value: unknown, field: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${field} 应为正整数`)
  return n
}

/** 解析非零整数（可为负），用于分页等场景。 */
export function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
