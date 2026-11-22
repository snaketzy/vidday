export type ArtSize =
  | 'landscape_16_9'
  | 'portrait_16_9'
  | 'portrait_4_3'
  | 'landscape_4_3'
  | 'square'
  | 'square_hd'

const ENDPOINT = 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image'

const SIZE_HINT: Record<ArtSize, string> = {
  landscape_16_9: '宽银幕 16:9 影视剧照构图',
  portrait_16_9: '竖版 9:16 电影海报构图',
  portrait_4_3: '竖版海报构图',
  landscape_4_3: '横向剧照构图',
  square: '正方形头像构图',
  square_hd: '正方形头像构图',
}

export function artwork(prompt: string, size: ArtSize = 'landscape_16_9') {
  const full = `${prompt}，${SIZE_HINT[size]}，电影级布光，高对比度电影感，画面中不出现任何文字`
  return `${ENDPOINT}?prompt=${encodeURIComponent(full)}&image_size=${size}`
}

/** 横版剧照（片单卡片 / 首屏 / 详情页大图） */
export function backdrop(art: string) {
  return artwork(art, 'landscape_16_9')
}

/** 竖版海报（Top 10 榜 / 详情页海报） */
export function poster(art: string) {
  return artwork(art, 'portrait_16_9')
}

export function avatarArt(art: string) {
  return artwork(art, 'square')
}

const PALETTES: [string, string][] = [
  ['#3a0d10', '#120507'],
  ['#0d1f2d', '#050b12'],
  ['#2b1a34', '#0d0712'],
  ['#1d2b1a', '#080f07'],
  ['#332312', '#120b05'],
  ['#12262b', '#040d10'],
  ['#2f2f33', '#101012'],
  ['#20263d', '#080a14'],
]

/** 由 id 稳定推导占位渐变色，避免图片加载期间出现空洞 */
export function paletteFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000
  }
  return PALETTES[hash % PALETTES.length]
}
