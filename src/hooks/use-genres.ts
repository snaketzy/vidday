import { useEffect, useState } from 'react'

import { genres as fallbackGenres, getGenre, resolveGenreId } from '@/data/genres'
import { fetchGenres } from '@/lib/public-api'
import type { Genre } from '@/types'

/**
 * 后台影片库题材过滤器（`GET /api/public/genres`）→ 前台题材项。
 * 缺描述时用内置题材的描述补；接口不可用时整份回退到内置清单。
 */
function toGenreList(list: { code: string; name: string }[]): Genre[] {
  const seen = new Set<string>()
  const result: Genre[] = []
  for (const item of list) {
    const id = resolveGenreId(item.name, item.code)
    if (seen.has(id)) continue
    seen.add(id)
    result.push({ id, name: item.name, description: getGenre(id)?.description ?? '' })
  }
  return result
}

/** 全局只请求一次：多个组件共用同一份结果。 */
let cache: Genre[] | null = null
let inflight: Promise<Genre[]> | null = null

function load(): Promise<Genre[]> {
  if (cache) return Promise.resolve(cache)
  inflight ??= fetchGenres()
    .then((list) => {
      cache = list.length ? toGenreList(list) : fallbackGenres
      return cache
    })
    .catch(() => {
      // 失败不写缓存，下次挂载时重试；本次用内置清单兜底
      inflight = null
      return fallbackGenres
    })
  return inflight
}

export function useGenres(): Genre[] {
  const [list, setList] = useState<Genre[]>(() => cache ?? fallbackGenres)

  useEffect(() => {
    let alive = true
    load().then((items) => {
      if (alive) setList(items)
    })
    return () => {
      alive = false
    }
  }, [])

  return list
}
