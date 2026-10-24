import { LogOut, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { avatarArt } from '@/lib/art'
import { formatDate } from '@/lib/format'
import { clearState } from '@/lib/storage'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  logout,
  selectAccount,
  selectActiveProfile,
  selectProfiles,
} from '@/store/slices/auth-slice'
import {
  selectPlayer,
  setAudio,
  setAutoplayNext,
  setQuality,
  setSubtitle,
  type AudioTrack,
  type Quality,
  type SubtitleTrack,
} from '@/store/slices/player-slice'

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'auto', label: '自动（推荐）' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
]

const SUBTITLE_OPTIONS: { value: SubtitleTrack; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: '简体中文', label: '简体中文' },
  { value: 'English', label: 'English' },
]

const AUDIO_OPTIONS: { value: AudioTrack; label: string }[] = [
  { value: '国语配音', label: '国语配音' },
  { value: '原声', label: '原声' },
]

const selectTriggerClass = 'w-44 border-white/15 bg-[#181818] text-white'

export function AccountPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const account = useAppSelector(selectAccount)
  const profiles = useAppSelector(selectProfiles)
  const activeProfile = useAppSelector(selectActiveProfile)
  const player = useAppSelector(selectPlayer)

  if (!account) return null

  const planRows = [
    { label: '会员邮箱', value: account.email },
    { label: '会员方案', value: `${account.planName} · ${account.planQuality}` },
    { label: '会员费用', value: account.planPrice },
    { label: '加入时间', value: formatDate(account.memberSince) },
    { label: '下次扣费', value: formatDate(account.nextBillingDate) },
    { label: '支付方式', value: account.paymentMethod },
  ]

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="flex h-[68px] items-center px-4 md:px-12">
        <BrandLogo />
        <Button
          variant="ghost"
          className="ml-auto text-sm text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => navigate('/')}
        >
          返回首页
        </Button>
      </header>

      <div className="mx-auto max-w-4xl px-4 md:px-12">
        <h1 className="text-3xl font-bold tracking-tight text-white">账户与设置</h1>
        <p className="mt-2 text-sm text-white/50">
          这是演示环境的账户页，所有订单与支付信息均为 mock 数据。
        </p>

        {/* 当前观众 */}
        <section className="mt-8 rounded-md border border-white/10 bg-[#181818] p-6">
          <h2 className="text-base font-semibold text-white/90">当前观众</h2>
          <div className="mt-4 flex items-center gap-4">
            <ArtImage
              src={avatarArt(activeProfile?.avatarArt ?? '扁平插画风格的人物头像，正面微笑，纯色背景')}
              alt={activeProfile?.name ?? '未选择'}
              paletteId={activeProfile?.id ?? 'guest'}
              className="size-14 rounded-md"
            />
            <div>
              <p className="text-sm font-medium text-white">{activeProfile?.name ?? '未选择观众'}</p>
              <p className="text-xs text-white/50">
                {activeProfile?.isKids ? '儿童模式 · 仅显示动画与家庭题材' : '标准模式 · 全部题材可见'}
              </p>
            </div>
            <Button
              variant="outline"
              className="ml-auto border-white/25 bg-transparent text-white/75 hover:border-white hover:bg-white/10 hover:text-white"
              onClick={() => navigate('/profiles')}
            >
              切换观众
            </Button>
          </div>

          <ul className="mt-5 grid gap-2 text-xs sm:grid-cols-2">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className="flex items-center gap-2 rounded-md border border-white/5 bg-black/30 px-3 py-2"
              >
                <span className="text-white/80">{profile.name}</span>
                {profile.isKids ? <span className="text-white/40">儿童</span> : null}
                {profile.id === activeProfile?.id ? (
                  <span className="ml-auto text-[11px] text-brand">使用中</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* 会员信息 */}
        <section className="mt-6 rounded-md border border-white/10 bg-[#181818] p-6">
          <h2 className="text-base font-semibold text-white/90">会员信息</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {planRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4 border-b border-white/5 pb-2">
                <dt className="text-white/45">{row.label}</dt>
                <dd className="text-right text-white/85">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 播放偏好 */}
        <section className="mt-6 rounded-md border border-white/10 bg-[#181818] p-6">
          <h2 className="text-base font-semibold text-white/90">播放偏好</h2>
          <p className="mt-1 text-xs text-white/45">这些设置会应用到所有作品的播放页，并保存在本机。</p>

          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">自动播放下一集</p>
                <p className="text-xs text-white/45">剧集播放结束后自动进入下一集</p>
              </div>
              <Switch
                checked={player.autoplayNext}
                onCheckedChange={(checked) => dispatch(setAutoplayNext(checked))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">偏好画质</p>
                <p className="text-xs text-white/45">网络波动时会自动降级以保证流畅</p>
              </div>
              <Select value={player.quality} onValueChange={(value) => dispatch(setQuality(value as Quality))}>
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-white">
                  {QUALITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">默认字幕</p>
                <p className="text-xs text-white/45">进入播放页时自动启用</p>
              </div>
              <Select
                value={player.subtitle}
                onValueChange={(value) => dispatch(setSubtitle(value as SubtitleTrack))}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-white">
                  {SUBTITLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">默认音轨</p>
                <p className="text-xs text-white/45">支持国语配音与原声切换</p>
              </div>
              <Select value={player.audio} onValueChange={(value) => dispatch(setAudio(value as AudioTrack))}>
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-white">
                  {AUDIO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* 数据与退出 */}
        <section className="mt-6 rounded-md border border-white/10 bg-[#181818] p-6">
          <h2 className="text-base font-semibold text-white/90">数据与账号</h2>
          <p className="mt-1 text-xs text-white/45">
            片单、观看进度与播放偏好都保存在本机浏览器（localStorage），不会上传到任何服务器。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="gap-2 border-white/25 bg-transparent text-white/80 hover:border-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                dispatch(logout())
                navigate('/login')
              }}
            >
              <LogOut className="size-4" />
              退出登录
            </Button>
            <Button
              variant="ghost"
              className="gap-2 text-brand hover:bg-brand/10 hover:text-brand"
              onClick={() => {
                clearState('state')
                window.location.assign('/login')
              }}
            >
              <Trash2 className="size-4" />
              清除本机数据
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
