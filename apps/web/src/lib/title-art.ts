import { backdrop, poster } from '@/lib/art'
import type { Title } from '@/types'

/**
 * 画面取址：后端有真实素材（R2）时直接用，否则回退到 `art` 提示词生成的占位画面。
 * 所有需要影片画面的组件都应走这两个函数，不要在组件里直接调 `backdrop` / `poster`。
 */
export function titleBackdrop(title: Title) {
  return title.backdropUrl || backdrop(title.art)
}

export function titlePoster(title: Title) {
  return title.posterUrl || poster(title.art)
}
