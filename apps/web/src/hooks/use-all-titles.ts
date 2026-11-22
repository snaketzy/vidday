import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchAllTitles } from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'
import { useAppDispatch } from '@/store/hooks'
import { upsertTitles } from '@/store/slices/catalog-slice'

/** 「浏览全部作品」每批拉取条数。 */
export const BROWSE_PAGE_SIZE = 25

export type AllTitlesStatus = 'loading' | 'ready' | 'error'

export interface AllTitlesResult {
  status: AllTitlesStatus
  /** 已并入 catalog 的条数，用于前端分批渲染 */
  loaded: number
  /** 后端全库总数 */
  total: number
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

/**
 * 全量目录分页加载：每批 {@link BROWSE_PAGE_SIZE} 条，结果并入 catalog。
 * `enabled` 为 false 时不发请求（「最新上架」数据源接管时）。
 */
export function useAllTitles(enabled: boolean): AllTitlesResult {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<AllTitlesStatus>('loading')
  const [loaded, setLoaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const offsetRef = useRef(0)
  /** 请求序号：响应回来时若已过期（重新进入页面 / 参数切换）则整批丢弃 */
  const requestIdRef = useRef(0)
  /** 同步请求闸门：防止触底观察与筛选补齐在同一帧重复拉取同一批 */
  const busyRef = useRef(false)

  const load = useCallback(
    (from: number) => {
      const requestId = ++requestIdRef.current
      busyRef.current = true
      setLoadingMore(true)

      fetchAllTitles({ limit: BROWSE_PAGE_SIZE, offset: from })
        .then((page) => {
          if (requestId !== requestIdRef.current) return
          const titles = page.items
            .filter((card) => card.targetType !== 'collection')
            .map(cardToTitle)
          if (titles.length) dispatch(upsertTitles(titles))
          offsetRef.current = from + page.items.length
          setLoaded(offsetRef.current)
          setTotal(page.total)
          setStatus('ready')
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setStatus('error')
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return
          busyRef.current = false
          setLoadingMore(false)
        })
    },
    [dispatch],
  )

  // 进入页面（或数据源切换回来）时从第一批重新开始
  useEffect(() => {
    if (!enabled) return
    offsetRef.current = 0
    busyRef.current = false
    setLoaded(0)
    setTotal(0)
    setStatus('loading')
    load(0)
    return () => {
      requestIdRef.current += 1
    }
  }, [enabled, load])

  const hasMore = loaded < total

  const loadMore = useCallback(() => {
    if (!enabled || !hasMore || busyRef.current) return
    load(offsetRef.current)
  }, [enabled, hasMore, load])

  return { status, loaded, total, hasMore, loadingMore, loadMore }
}
