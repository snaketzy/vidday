import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { matchPath, useLocation } from 'react-router'

import { VideoPlayer } from '@/components/title/video-player'
import { useResolvedTitle } from '@/hooks/use-resolved-title'
import { NotFoundPage } from '@/pages/not-found-page'
import { useAppSelector } from '@/store/hooks'

/** 播放路由（按顺序匹配，先匹配更具体的带集数路由） */
const WATCH_ROUTES = ['/watch/:id/:episodeId', '/watch/:id']

/** 播放页只铺一层黑底：播放器由常驻播放层承载，以便跨路由存活 */
export function WatchPage() {
  return <div className="h-screen w-screen bg-black" />
}

/**
 * 常驻播放层：把 `<video>` 提升到路由之上，切换页面时不卸载 —— 原生画中画窗口
 * 依赖 `<video>` 留在文档里，一旦卸载浏览器会强制关闭画中画。
 * 规则：处于播放页、或画中画播放中才保留播放器；关闭小窗即结束会话、不跳转，原生小窗的
 * 「返回标签页」由播放器按焦点自行判定跳回播放页，页内右下角另有「关闭画中画」入口。
 */
export function PersistentPlayer() {
  const location = useLocation()
  const pipActive = useAppSelector((state) => state.player.pictureInPicture)
  /** 「关闭画中画」入口的触发信号：递增即请求播放器退出原生小窗（不改动路由） */
  const [closePipToken, setClosePipToken] = useState(0)
  const matched = WATCH_ROUTES.map((pattern) => matchPath(pattern, location.pathname)).find(Boolean)
  const routeId = matched?.params.id
  const routeEpisodeId = matched?.params.episodeId
  /** 记住最近一次播放目标：离开播放页后（画中画期间）继续沿用同一部影片 / 同一集 */
  const [lastTarget, setLastTarget] = useState<{ id: string; episodeId?: string } | null>(null)

  useEffect(() => {
    if (routeId) setLastTarget({ id: routeId, episodeId: routeEpisodeId })
  }, [routeId, routeEpisodeId])

  /** 播放页以 URL 为准，其余情况沿用上一次的播放目标 */
  const target = matched && routeId ? { id: routeId, episodeId: routeEpisodeId } : lastTarget
  const { title, status } = useResolvedTitle(target?.id)
  const episode = useMemo(
    () =>
      target?.episodeId
        ? title?.seasons.flatMap((season) => season.episodes).find((item) => item.id === target.episodeId)
        : undefined,
    [title, target?.episodeId],
  )

  // 非播放页且未处于画中画：卸载播放器，停止播放并写回观看进度
  if (!target || (!matched && !pipActive)) return null

  if (!title) {
    // 画中画播放中遇到解析异常时不切断播放，只在播放页给出反馈
    if (!matched) return null
    return status === 'error' ? <NotFoundPage /> : <div className="fixed inset-0 z-200 bg-black" />
  }
  if (target.episodeId && !episode) return matched ? <NotFoundPage /> : null

  return (
    <>
      <div
        className={
          matched
            ? 'fixed inset-0 z-200 bg-black'
            : // 隐藏态：保留在文档中（尺寸与透明度归零、不接收事件），使原生画中画继续播放
              'pointer-events-none fixed top-0 left-0 z-200 h-px w-px overflow-hidden opacity-0'
        }
      >
        <VideoPlayer title={title} episode={episode} dormant={!matched} closePipToken={closePipToken} />
      </div>

      {/* 画中画期间浏览其他页面时，提供关闭原生小窗的站内入口（小窗本体在系统窗口里，页内点不到） */}
      {pipActive && !matched ? (
        <button
          type="button"
          onClick={() => setClosePipToken((token) => token + 1)}
          className="fixed right-6 bottom-[9px] z-300 flex items-center gap-2 rounded-full bg-black/80 py-2.5 pr-4 pl-3 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/95"
        >
          <X className="size-4" />
          关闭画中画
        </button>
      ) : null}
    </>
  )
}
