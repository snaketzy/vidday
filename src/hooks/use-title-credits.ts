import { useEffect, useState } from 'react'

import { fetchTitleCredits, type PublicTitleCredits } from '@/lib/public-api'

/**
 * 拉取影片 / 剧集的完整演职员表（演员与职员分组）。
 * 拉取失败或路由非法时返回 null，由调用方决定是否渲染该区块。
 */
export function useTitleCredits(titleId: string | undefined): PublicTitleCredits | null {
  const [credits, setCredits] = useState<PublicTitleCredits | null>(null)

  useEffect(() => {
    const numericId = titleId !== undefined ? Number(titleId) : NaN
    if (!Number.isInteger(numericId)) {
      setCredits(null)
      return
    }

    const controller = new AbortController()
    setCredits(null)

    fetchTitleCredits(numericId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setCredits(data)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setCredits(null)
      })

    return () => controller.abort()
  }, [titleId])

  return credits
}
