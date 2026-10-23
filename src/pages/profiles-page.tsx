import { useState } from 'react'
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
import { addProfile, removeProfile, renameProfile, selectProfile, selectProfiles } from '@/store/slices/auth-slice'
import type { Profile } from '@/types'

const MAX_PROFILES = 5

export function ProfilesPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const profiles = useAppSelector(selectProfiles)
  const activeId = useAppSelector((state) => state.auth.activeProfileId)
  const [editing, setEditing] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [draft, setDraft] = useState('')

  const choose = (profile: Profile) => {
    if (editing) {
      setRenameTarget(profile)
      setDraft(profile.name)
      return
    }
    dispatch(selectProfile(profile.id))
    navigate('/')
  }

  const saveRename = () => {
    if (!renameTarget) return
    dispatch(renameProfile({ id: renameTarget.id, name: draft }))
    setRenameTarget(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-[68px] items-center px-4 md:px-12">
        <BrandLogo />
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
    </div>
  )
}
