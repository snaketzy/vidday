import { useMemo } from 'react'
import { useParams } from 'react-router'

import { VideoPlayer } from '@/components/title/video-player'
import { NotFoundPage } from '@/pages/not-found-page'
import { useAppSelector } from '@/store/hooks'
import { selectTitleById } from '@/store/slices/catalog-slice'

export function WatchPage() {
  const { id, episodeId } = useParams()
  const title = useAppSelector((state) => selectTitleById(state, id))

  const episode = useMemo(
    () =>
      episodeId
        ? title?.seasons.flatMap((season) => season.episodes).find((item) => item.id === episodeId)
        : undefined,
    [title, episodeId],
  )

  if (!title) return <NotFoundPage />
  if (episodeId && !episode) return <NotFoundPage />

  return <VideoPlayer title={title} episode={episode} />
}
