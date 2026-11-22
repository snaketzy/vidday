/**
 * Web 端影片详情页的「下载客户端」入口。
 *
 * 浏览器不直接提供观看与片单操作，故以 Windows / macOS / Android 三个系统图标
 * 取代「播放」「加入片单」，引导用户安装对应客户端。
 * 下载地址经 .env 的 VITE_DOWNLOAD_* 注入；未配置时图标仅作展示、不产生跳转。
 */
import type { ComponentType } from 'react'

/** Windows 四格窗徽标 */
function WindowsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M0 3.449 9.75 2.1v9.451H0m10.5-9.752L24 0v11.55H10.5M0 12.45h9.75v9.451L0 20.551m10.5-8.101H24V24l-13.5-2.1" />
    </svg>
  )
}

/** Apple 徽标 */
function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09Zm3.379-3.066c.843-1.012 1.399-2.427 1.244-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.561-1.702" />
    </svg>
  )
}

/** Android 机器人徽标 */
function AndroidGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02 1.9973-3.4592a.416.416 0 0 0-.1521-.5676.416.416 0 0 0-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 0 0-.5677-.1521.4157.4157 0 0 0-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
    </svg>
  )
}

interface DownloadTarget {
  label: string
  href: string
  Glyph: ComponentType<{ className?: string }>
}

const TARGETS: DownloadTarget[] = [
  { label: 'Windows', href: import.meta.env.VITE_DOWNLOAD_WINDOWS_URL ?? '', Glyph: WindowsGlyph },
  { label: 'macOS', href: import.meta.env.VITE_DOWNLOAD_MACOS_URL ?? '', Glyph: AppleGlyph },
  { label: 'Android', href: import.meta.env.VITE_DOWNLOAD_ANDROID_URL ?? '', Glyph: AndroidGlyph },
]

const CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:border-white/50 hover:bg-white/20'

/** 三系统客户端下载图标组；直接嵌在详情页按钮行里，故不额外包一层容器。 */
export function ClientDownloadCta() {
  return (
    <>
      {TARGETS.map(({ label, href, Glyph }) =>
        href ? (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={CHIP_CLASS}
            aria-label={`下载 ${label} 客户端`}
          >
            <Glyph className="size-5" />
            {label}
          </a>
        ) : (
          <span key={label} className={CHIP_CLASS}>
            <Glyph className="size-5" />
            {label}
          </span>
        ),
      )}
    </>
  )
}
