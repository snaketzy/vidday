import { useEffect, useState } from 'react'

import { fetchTitleCredits, type PublicTitleCredits } from '@/lib/public-api'

export type TitleCreditsStatus = 'idle' | 'loading' | 'error'

/**
 * 拉取影片 / 剧集的完整演职员表（演员与职员分组）。
 * 路由非法或后端 404 时进入 error，由调用方决定渲染兜底还是整页 404。
 */
export function useTitleCredits(titleId: string | undefined): {
  credits: PublicTitleCredits | null
  status: TitleCreditsStatus
} {
  const [credits, setCredits] = useState<PublicTitleCredits | null>(null)
  const [status, setStatus] = useState<TitleCreditsStatus>('idle')

  useEffect(() => {
    const numericId = titleId !== undefined ? Number(titleId) : NaN
    if (!Number.isInteger(numericId)) {
      setCredits(null)
      setStatus('error')
      return
    }

    const controller = new AbortController()
    setCredits(null)
    setStatus('loading')

    fetchTitleCredits(numericId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setCredits(data)
        setStatus('idle')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setCredits(null)
        setStatus('error')
      })

    return () => controller.abort()
  }, [titleId])

  return { credits, status }
}
