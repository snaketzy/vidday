import { useEffect, useState } from 'react'

import {
  fetchCarousels,
  type CarouselPlacement,
  type PublicCarousel,
} from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'
import { useAppDispatch } from '@/store/hooks'
import { upsertTitles } from '@/store/slices/catalog-slice'

export type CarouselsStatus = 'loading' | 'ready' | 'error'

export interface CarouselsResult {
  status: CarouselsStatus
  carousels: PublicCarousel[]
  error?: string
}

/**
 * 拉取指定位置的轮播，并把其中的影片项并入 catalog，
 * 使卡片点击进入 `/title/:id` 时详情页能直接命中。
 */
export function useCarousels(placement: CarouselPlacement, pageId?: number): CarouselsResult {
  const dispatch = useAppDispatch()
  const [result, setResult] = useState<CarouselsResult>({ status: 'loading', carousels: [] })

  useEffect(() => {
    // 专题页轮播必须绑定 pageId，缺省时说明专题未解析出来，直接跳过
    if (placement === 'collection' && pageId === undefined) {
      setResult({ status: 'ready', carousels: [] })
      return
    }

    const controller = new AbortController()
    setResult({ status: 'loading', carousels: [] })

    fetchCarousels({ placement, pageId }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        const movies = page.carousels
          .flatMap((carousel) => carousel.items)
          .filter((item) => item.targetType !== 'collection')
          .map(cardToTitle)
        if (movies.length) dispatch(upsertTitles(movies))
        setResult({ status: 'ready', carousels: page.carousels })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setResult({
          status: 'error',
          carousels: [],
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return () => controller.abort()
  }, [dispatch, placement, pageId])

  return result
}
