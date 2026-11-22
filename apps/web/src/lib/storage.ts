const PREFIX = 'vidday:'

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveState<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* 隐私模式下静默失败 */
  }
}

export function clearState(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* noop */
  }
}
