import { useEffect, useMemo, useState } from 'react'
import { Library } from 'lucide-react'
import { useParams } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { CarouselBlock } from '@/components/carousel/carousel-block'
import { TitleGrid } from '@/components/title/title-grid'
import { useCarousels } from '@/hooks/use-carousels'
import { fetchCollectionDetail, type PublicCollectionDetail } from '@/lib/public-api'
import { cardToTitle } from '@/lib/title-adapter'
import { NotFoundPage } from '@/pages/not-found-page'
import { useAppDispatch } from '@/store/hooks'
import { upsertTitles } from '@/store/slices/catalog-slice'

type Status = 'loading' | 'ready' | 'error' | 'invalid'

/** 专题页：拉取专题详情，渲染专题自身信息 + 该专题可单独配置的轮播。 */
export function CollectionPage() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const collectionId =
    id !== undefined && Number.isInteger(Number(id)) ? Number(id) : undefined

  const [status, setStatus] = useState<Status>(collectionId === undefined ? 'invalid' : 'loading')
  const [collection, setCollection] = useState<PublicCollectionDetail | null>(null)
  const { carousels } = useCarousels('collection', collectionId)

  useEffect(() => {
    if (collectionId === undefined) return
    const controller = new AbortController()
    setStatus('loading')

    fetchCollectionDetail(collectionId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        const movies = detail.items
          .filter((item) => item.targetType !== 'collection')
          .map(cardToTitle)
        if (movies.length) dispatch(upsertTitles(movies))
        setCollection(detail)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [collectionId, dispatch])

  const titles = useMemo(
    () =>
      collection
        ? collection.items
            .filter((item) => item.targetType !== 'collection')
            .map(cardToTitle)
        : [],
    [collection],
  )

  if (status === 'invalid' || status === 'error') return <NotFoundPage />
  if (status === 'loading' || !collection) {
    return <div className="min-h-[70vh] animate-pulse bg-white/5" />
  }

  const covers = collection.covers.length
    ? collection.covers
    : collection.coverUrl
      ? [collection.coverUrl]
      : []

  return (
    <div className="pb-12">
      {/* 专题头图：用专题内影片剧照拼贴，无剧照时退化为纯色 */}
      <section className="relative h-[52vh] min-h-[360px] w-full overflow-hidden bg-neutral-900">
        {covers.length ? (
          <div className="absolute inset-0 flex">
            {covers.slice(0, 5).map((cover, index) => (
              <ArtImage
                key={`${cover}-${index}`}
                src={cover}
                alt={collection.name}
                paletteId={`${collection.id}-${index}`}
                eager
                className="h-full min-w-0 flex-1"
              />
            ))}
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-background/35" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/85 to-transparent" />

        <div className="relative flex h-full flex-col justify-end pb-10 pl-4 pr-4 md:pl-12 md:pr-[38%]">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">
            <Library className="size-4" />
            专题
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
              {collection.description}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-white/45">{titles.length} 部影片</p>
        </div>
      </section>

      {/* 该专题可单独配置的轮播 */}
      {carousels.length ? (
        <div className="relative z-10 -mt-2 md:-mt-4">
          {carousels.map((carousel, index) => (
            <CarouselBlock key={carousel.id} carousel={carousel} eager={index === 0} />
          ))}
        </div>
      ) : null}

      <section className="pt-6">
        <h2 className="mb-4 px-4 text-base font-semibold text-white/90 md:px-12 md:text-lg">专题内影片</h2>
        {titles.length ? (
          <TitleGrid titles={titles} />
        ) : (
          <p className="px-4 text-sm text-white/45 md:px-12">该专题暂无影片。</p>
        )}
      </section>
    </div>
  )
}
