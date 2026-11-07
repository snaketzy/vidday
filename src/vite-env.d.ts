/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** moive-database-op 只读接口基址，如 http://127.0.0.1:8790；留空则用同源 */
  readonly VITE_API_BASE_URL?: string
  /** 中插广告总开关，仅显式 'false' 时关闭 */
  readonly VITE_ENABLE_ADS?: string
}
