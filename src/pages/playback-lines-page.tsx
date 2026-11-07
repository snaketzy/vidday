import { NetworkPanel } from '@/components/network-panel'

export function PlaybackLinesPage() {
  return (
    <main className="min-h-[70vh] pb-12 pt-24 md:pt-28">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">播放线路</h1>
        <p className="mt-2 text-sm text-white/50">
          管理播放代理组、切换线路并测试延迟。设置仅影响 Vidday，不修改系统代理。
        </p>
        <NetworkPanel />
      </div>
    </main>
  )
}
