/**
 * 图片资源（影片海报 / 剧照、影人头像）在 R2 上的统一路径约定。
 *
 * 目录：{assetsBaseUrl}/{dirId}/，dirId 取实体 IMDb ID；影片用 `tt…`、影人用 `nm…`，
 * 影人 / 剧集缺少 IMDb ID 时退化为 `lbz{tmdbId}`。
 * 文件名带尺寸后缀，同一张图保留「列表小图 + 详情大图」两套。
 *
 * 与内容管理端 `apps/api/src/services/assets.ts` 保持同一套推导规则，
 * 无法推导目录 ID 时返回 null，由调用方回退到库中保存的原始地址。
 */
import { env } from '../env.ts'

export type AssetKind = 'avatar' | 'poster' | 'backdrop'
/** small = 列表缩略图，large = 详情大图。 */
export type AssetScale = 'small' | 'large'

/**
 * 资产 URL 的缓存版本号。
 * Cloudflare 自定义域会负面缓存 404：图片首次被请求时若尚未上传到 R2，
 * 之后即使对象就位，边缘节点仍会持续返回缓存的 404。
 * 追加版本参数可让 CDN 视作新的缓存键回源，从而绕过历史错误缓存。
 */
const ASSET_CACHE_VERSION = '2'

/** 各用途下小图 / 大图对应的 TMDB 尺寸后缀。 */
const ASSET_SIZES: Record<AssetKind, Record<AssetScale, string>> = {
  avatar: { small: 'w185', large: 'h632' },
  poster: { small: 'w500', large: 'w780' },
  backdrop: { small: 'w780', large: 'w1280' },
}

/** 实体目录 ID：IMDb ID 优先，缺失时用 lbz{tmdbId}。 */
export function assetDirId(
  imdbId: string | null | undefined,
  tmdbId: number | null | undefined
): string | null {
  const imdb = imdbId?.trim()
  if (imdb) return imdb
  return typeof tmdbId === 'number' && Number.isFinite(tmdbId) ? `lbz${tmdbId}` : null
}

/** 公开访问地址。 */
export function assetUrl(dirId: string, kind: AssetKind, scale: AssetScale): string {
  const url = `${env.assetsBaseUrl}/${dirId}/${kind}-${ASSET_SIZES[kind][scale]}.jpg`
  return ASSET_CACHE_VERSION ? `${url}?v=${ASSET_CACHE_VERSION}` : url
}

/** 影片海报：R2 派生图优先，回退入库时抓取的地址（影片仅按 IMDb ID 建目录）。 */
export function moviePoster(movie: {
  imdb_id: string | null
  poster_url: string | null
}): string | null {
  const dirId = assetDirId(movie.imdb_id, null)
  return (dirId ? assetUrl(dirId, 'poster', 'small') : null) ?? movie.poster_url
}

/** 影片横版主视觉：剧照优先，回退海报。 */
export function movieBackdrop(movie: {
  imdb_id: string | null
  poster_url: string | null
  backdrop_url: string | null
}): string | null {
  const dirId = assetDirId(movie.imdb_id, null)
  const backdrop = dirId ? assetUrl(dirId, 'backdrop', 'small') : null
  return backdrop ?? movie.backdrop_url ?? moviePoster(movie)
}

/** 剧集海报：R2 派生图优先，回退入库时抓取的地址。 */
export function seriesPoster(series: {
  imdb_id: string | null
  tmdb_id: number | null
  poster_url: string | null
}): string | null {
  const dirId = assetDirId(series.imdb_id, series.tmdb_id)
  return (dirId ? assetUrl(dirId, 'poster', 'small') : null) ?? series.poster_url
}

/** 剧集横版主视觉：剧照优先，回退海报。 */
export function seriesBackdrop(series: {
  imdb_id: string | null
  tmdb_id: number | null
  poster_url: string | null
  backdrop_url: string | null
}): string | null {
  const dirId = assetDirId(series.imdb_id, series.tmdb_id)
  const backdrop = dirId ? assetUrl(dirId, 'backdrop', 'small') : null
  return backdrop ?? series.backdrop_url ?? seriesPoster(series)
}

/** 影人头像：R2 派生图优先，回退入库时抓取的地址。 */
export function personAvatar(person: {
  imdb_id: string | null
  tmdb_id: number | null
  profile_url: string | null
}): string | null {
  const dirId = assetDirId(person.imdb_id, person.tmdb_id)
  return (dirId ? assetUrl(dirId, 'avatar', 'small') : null) ?? person.profile_url
}
