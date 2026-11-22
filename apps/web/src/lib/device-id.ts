import { loadState, saveState } from '@/lib/storage'

const DEVICE_ID_KEY = 'device-id'

/** 生成设备标识（UUID v4）；`randomUUID` 不可用时退回 getRandomValues 手工拼装。 */
function createDeviceId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let cached: string | null = null

/**
 * 本机设备标识：首次访问生成并持久化，作为观看进度 / 我的片单的归属键。
 *
 * 隐私模式等 localStorage 不可写场景下只能退化为「每次启动新 ID」，
 * 此时服务端旧数据无法归位，但不影响本次会话内的记录与播放。
 */
export function getDeviceId(): string {
  if (cached) return cached
  const stored = loadState<string>(DEVICE_ID_KEY, '')
  if (stored) {
    cached = stored
    return cached
  }
  cached = createDeviceId()
  saveState(DEVICE_ID_KEY, cached)
  return cached
}
