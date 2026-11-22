/**
 * 前台内部跳转地址集中在此，避免各处硬编码路由字符串。
 * 后端下发的 href（`/watch/:id`、`/collection/:id`）与此保持一致。
 */
export function toTitleHref(id: string | number) {
  return `/title/${id}`
}

export function toWatchHref(id: string | number) {
  return `/watch/${id}`
}

export function toCollectionHref(id: string | number) {
  return `/collection/${id}`
}

/**
 * 近 N 天上架的全部作品：复用 `/browse` 网格，
 * `addedWithin` 触发该页切换到后端「最新上架」数据源。
 */
export function toLatestHref(days: number) {
  return `/browse?addedWithin=${days}`
}
