import { useEffect, useState } from 'react'

import { fetchTitleDetail } from '@/lib/public-api'
import { detailToTitle } from '@/lib/title-adapter'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectTitleById, upsertTitles } from '@/store/slices/catalog-slice'
import type { Title } from '@/types'

export type ResolvedTitleStatus = 'idle' | 'loading' | 'error'

/**
 * 解析路由中的影片：优先取 catalog（含 mock 与已并入的后端影片）；
 * catalog 未命中时（例如直接访问 `/title/9124`）再按 id 拉一次后端详情。
 */
export function useResolvedTitle(id: string | undefined): {
  title: Title | undefined
  status: ResolvedTitleStatus
} {
  const dispatch = useAppDispatch()
  const catalogTitle = useAppSelector((state) => selectTitleById(state, id))
  const [remote, setRemote] = useState<Title | null>(null)
  const [status, setStatus] = useState<ResolvedTitleStatus>('idle')

  useEffect(() => {
    if (!id || catalogTitle) return
    const numericId = Number(id)
    if (!Number.isInteger(numericId)) {
      // 既不在 catalog、又不是后端数字 id：判为不存在
      setStatus('error')
      return
    }

    const controller = new AbortController()
    // 切换路由时先清掉上一部影片，避免用旧数据渲染新路由
    setRemote(null)
    setStatus('loading')

    fetchTitleDetail(numericId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        const title = detailToTitle(detail)
        dispatch(upsertTitles([title]))
        setRemote(title)
        setStatus('idle')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [id, catalogTitle, dispatch])

  return { title: catalogTitle ?? remote ?? undefined, status }
}
