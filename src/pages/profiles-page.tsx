import { useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { avatarArt } from '@/lib/art'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  addProfile,
  removeProfile,
  renameProfile,
  selectProfile,
  selectProfileAccessLockedUntil,
  selectProfiles,
  setProfileAccessLockedUntil,
} from '@/store/slices/auth-slice'
import type { Profile } from '@/types'

const MAX_PROFILES = 5
const PROFILE_ACCESS_CODE = (import.meta.env.VITE_PROFILE_ACCESS_CODE ?? '2611').replace(/\D/g, '').slice(0, 4) || '2611'
const PROFILE_ACCESS_COOLDOWN_MS = 60_000

export function ProfilesPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const profiles = useAppSelector(selectProfiles)
  const activeId = useAppSelector((state) => state.auth.activeProfileId)
  const lockedUntil = useAppSelector(selectProfileAccessLockedUntil)
  const [editing, setEditing] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [draft, setDraft] = useState('')
  const [unlockTarget, setUnlockTarget] = useState<Profile | null>(null)
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const remainingSeconds = useMemo(() => {
    if (!lockedUntil) return 0
    return Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  }, [lockedUntil, now])

  const isLocked = remainingSeconds > 0

  useEffect(() => {
    if (!lockedUntil) return
    if (lockedUntil <= Date.now()) {
      dispatch(setProfileAccessLockedUntil(null))
      return
    }

    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 250)

    return () => window.clearInterval(timer)
  }, [dispatch, lockedUntil])

  useEffect(() => {
    if (lockedUntil && lockedUntil <= now) {
      dispatch(setProfileAccessLockedUntil(null))
      setPasscodeError(null)
    }
  }, [dispatch, lockedUntil, now])

  const choose = (profile: Profile) => {
    if (editing) {
      setRenameTarget(profile)
      setDraft(profile.name)
      return
    }
    setUnlockTarget(profile)
    setPasscode('')
    if (!isLocked) setPasscodeError(null)
  }

  const saveRename = () => {
    if (!renameTarget) return
    dispatch(renameProfile({ id: renameTarget.id, name: draft }))
    setRenameTarget(null)
  }

  const submitPasscode = () => {
    if (!unlockTarget || isLocked) return

    if (passcode === PROFILE_ACCESS_CODE) {
      dispatch(selectProfile(unlockTarget.id))
      dispatch(setProfileAccessLockedUntil(null))
      setPasscode('')
      setPasscodeError(null)
      setUnlockTarget(null)
      navigate('/')
      return
    }

    dispatch(setProfileAccessLockedUntil(Date.now() + PROFILE_ACCESS_COOLDOWN_MS))
    setPasscode('')
    setPasscodeError('密码错误，请在 60 秒后重试。')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="app-window-drag flex h-[68px] items-center px-4 md:px-12">
        <BrandLogo className="app-window-no-drag" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <h1 className="text-3xl font-semibold text-white md:text-4xl">
          {editing ? '管理观众' : '谁在观看？'}
        </h1>

        <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex flex-col items-center gap-3">
              <button
                type="button"
                aria-label={editing ? `重命名 ${profile.name}` : `以 ${profile.name} 身份观看`}
                onClick={() => choose(profile)}
                className="group w-full"
              >
                <ArtImage
                  src={avatarArt(profile.avatarArt)}
                  alt={profile.name}
                  paletteId={profile.id}
                  className={cn(
                    'aspect-square w-full rounded-md border transition',
                    profile.id === activeId ? 'border-white' : 'border-transparent',
                  )}
                  imageClassName="transition group-hover:opacity-70"
                />
                <span className="mt-3 block text-sm text-white/60 transition group-hover:text-white">
                  {profile.name}
                </span>
              </button>

              {profile.isKids ? (
                <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] tracking-wide text-white/60">
                  儿童模式
                </span>
              ) : null}

              {editing ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    className="gap-1 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => {
                      setRenameTarget(profile)
                      setDraft(profile.name)
                    }}
                  >
                    <Pencil className="size-3" />
                    重命名
                  </Button>
                  {profiles.length > 1 ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`删除 ${profile.name}`}
                      className="text-white/60 hover:bg-white/10 hover:text-white"
                      onClick={() => dispatch(removeProfile(profile.id))}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}

          {profiles.length < MAX_PROFILES ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => dispatch(addProfile('新观众'))}
                className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-white/25 text-white/50 transition hover:border-white/70 hover:text-white"
              >
                <Plus className="size-8" />
                <span className="text-sm">添加观众</span>
              </button>
            </div>
          ) : null}
        </div>

        <Button
          variant="outline"
          className="mt-12 border-white/35 bg-transparent text-white/70 hover:border-white hover:bg-white/10 hover:text-white"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? '完成' : '管理观众'}
        </Button>
      </main>

      <footer className="px-4 py-8 text-center text-xs text-white/30 md:px-12">
        观众档案仅保存在本机浏览器中，切换观众将影响推荐内容与可见题材。
      </footer>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => (!open ? setRenameTarget(null) : undefined)}>
        <DialogContent className="max-w-sm border-white/10 bg-[#181818] text-white">
          <DialogHeader>
            <DialogTitle>重命名观众</DialogTitle>
            <DialogDescription className="text-white/50">
              名称仅在本机生效，可用于区分家庭成员。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveRename()
            }}
            className="border-white/20 bg-black/40 text-white"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setRenameTarget(null)}
            >
              取消
            </Button>
            <Button className="bg-brand text-white hover:bg-brand-hover" onClick={saveRename}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(unlockTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setUnlockTarget(null)
            setPasscode('')
            if (!isLocked) setPasscodeError(null)
          }
        }}
      >
        <DialogContent className="max-w-sm border-white/10 bg-[#181818] text-white">
          <DialogHeader>
            <DialogTitle>输入 4 位密码</DialogTitle>
            <DialogDescription className="text-white/50">
              选择 {unlockTarget?.name ?? '观众'} 后，需要输入密码才可进入。
              {isLocked ? ` 当前已锁定，还需等待 ${remainingSeconds} 秒。` : ' 请输入已配置的 4 位密码。'}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="请输入 4 位密码"
            value={passcode}
            disabled={isLocked}
            onChange={(event) => {
              setPasscode(event.target.value.replace(/\D/g, '').slice(0, 4))
              if (!isLocked && passcodeError) setPasscodeError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && passcode.length === 4 && !isLocked) submitPasscode()
            }}
            className="border-white/20 bg-black/40 text-center text-lg tracking-[0.4em] text-white"
          />
          <p className={cn('text-sm', isLocked ? 'text-amber-300' : 'text-white/50')}>
            {isLocked
              ? `已进入冷却，请在 ${remainingSeconds} 秒后再次输入。`
              : passcodeError ?? '密码为 4 位数字。'}
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setUnlockTarget(null)
                setPasscode('')
                if (!isLocked) setPasscodeError(null)
              }}
            >
              取消
            </Button>
            <Button
              className="bg-brand text-white hover:bg-brand-hover disabled:bg-white/20 disabled:text-white/50"
              disabled={passcode.length !== 4 || isLocked}
              onClick={submitPasscode}
            >
              进入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
