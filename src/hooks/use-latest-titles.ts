import { useEffect, useState } from 'react'

import { fetchLatest } from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'
import { useAppDispatch } from '@/store/hooks'
import { upsertTitles } from '@/store/slices/catalog-slice'
import type { Title } from '@/types'

/** 「最新上架」统计窗口（天），与后端 `/api/public/latest` 默认窗口一致。 */
export const LATEST_WINDOW_DAYS = 7

export type LatestStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LatestResult {
  status: LatestStatus
  titles: Title[]
  /** 窗口内总数（不受 limit 影响） */
  total: number
}

const IDLE: LatestResult = { status: 'idle', titles: [], total: 0 }

/**
 * 后台近 N 天「已上架」内容（影片 + 剧集），按入库时间倒序。
 * `days` 传 null 表示当前入口不需要这份数据，不发请求。
 * 结果并入 catalog，卡片点击进 `/title/:id` 时详情页可直接命中。
 */
export function useLatestTitles(days: number | null = LATEST_WINDOW_DAYS, limit?: number): LatestResult {
  const dispatch = useAppDispatch()
  const [result, setResult] = useState<LatestResult>(() =>
    days === null ? IDLE : { status: 'loading', titles: [], total: 0 },
  )

  useEffect(() => {
    if (days === null) {
      setResult(IDLE)
      return
    }

    const controller = new AbortController()
    setResult({ status: 'loading', titles: [], total: 0 })

    fetchLatest({ days, limit }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        const titles = page.items
          .filter((card) => card.targetType !== 'collection')
          .map(cardToTitle)
        if (titles.length) dispatch(upsertTitles(titles))
        setResult({ status: 'ready', titles, total: page.total })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResult({ status: 'error', titles: [], total: 0 })
      })

    return () => controller.abort()
  }, [dispatch, days, limit])

  return result
}
