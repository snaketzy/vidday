import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { useAppSelector } from '@/store/hooks'
import type { Title } from '@/types'

/**
 * 统一的播放入口：剧集续播到上次观看的集数，电影直接进入播放页。
 */
export function usePlayTarget() {
  const navigate = useNavigate()
  const progressList = useAppSelector((state) => state.watch.progress)

  return useCallback(
    (title: Title, episodeId?: string) => {
      if (episodeId) {
        navigate(`/watch/${title.id}/${episodeId}`)
        return
      }
      if (title.type === 'series') {
        const record = progressList.find((item) => item.titleId === title.id)
        if (record?.episodeId) {
          navigate(`/watch/${title.id}/${record.episodeId}`)
          return
        }
        const firstEpisode = title.seasons[0]?.episodes[0]
        navigate(firstEpisode ? `/watch/${title.id}/${firstEpisode.id}` : `/watch/${title.id}`)
        return
      }
      navigate(`/watch/${title.id}`)
    },
    [navigate, progressList],
  )
}
