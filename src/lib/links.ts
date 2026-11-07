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
