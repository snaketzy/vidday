/** 将秒数格式化为 `1:23:45` / `12:05` */
export function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 将分钟数格式化为 `2 小时 15 分钟` / `47 分钟` */
export function formatRuntime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分钟`
}

export function episodeCount(seasons: { episodes: unknown[] }[]) {
  return seasons.reduce((total, season) => total + season.episodes.length, 0)
}

export function plural(label: string, count: number) {
  return `${count} ${label}`
}

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatDate(value: string | number | Date) {
  return DATE_FORMATTER.format(new Date(value)).replace(/\//g, '-')
}

export function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDate(value)
}
