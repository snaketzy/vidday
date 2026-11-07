import { useMemo } from 'react'
import { useParams } from 'react-router'

import { VideoPlayer } from '@/components/title/video-player'
import { useResolvedTitle } from '@/hooks/use-resolved-title'
import { NotFoundPage } from '@/pages/not-found-page'

export function WatchPage() {
  const { id, episodeId } = useParams()
  const { title, status } = useResolvedTitle(id)

  const episode = useMemo(
    () =>
      episodeId
        ? title?.seasons.flatMap((season) => season.episodes).find((item) => item.id === episodeId)
        : undefined,
    [title, episodeId],
  )

  if (!title) return status === 'error' ? <NotFoundPage /> : <div className="h-screen w-screen bg-black" />
  if (episodeId && !episode) return <NotFoundPage />

  return <VideoPlayer title={title} episode={episode} />
}
