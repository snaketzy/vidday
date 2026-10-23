import { useState, type FormEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'

import { ArtImage } from '@/components/art-image'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEMO_CREDENTIALS } from '@/data/profiles'
import { backdrop } from '@/lib/art'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearError,
  login,
  selectAuthError,
  selectAuthStatus,
  selectIsAuthenticated,
} from '@/store/slices/auth-slice'

export function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const status = useAppSelector(selectAuthStatus)
  const error = useAppSelector(selectAuthError)
  const authenticated = useAppSelector(selectIsAuthenticated)
  const [email, setEmail] = useState(DEMO_CREDENTIALS.email)
  const [password, setPassword] = useState(DEMO_CREDENTIALS.password)

  if (authenticated) return <Navigate to="/profiles" replace />

  const pending = status === 'pending'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void dispatch(login({ email, password }))
      .unwrap()
      .then(() => navigate('/profiles', { replace: true }))
      .catch(() => undefined)
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-black">
      <ArtImage
        src={backdrop('深夜城市天际线，远处高楼的灯光在雨幕中晕成一片暖色光晕')}
        alt="vidday"
        paletteId="vidday-login"
        eager
        className="absolute inset-0 h-full w-full"
        imageClassName="opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/70 to-black/90" />

      <header className="relative z-10 px-4 py-6 md:px-12">
        <BrandLogo size="lg" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[420px] rounded-md bg-black/75 p-8 backdrop-blur-md sm:p-12">
          <h1 className="text-2xl font-bold text-white">登录</h1>

          {error ? (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-brand/40 bg-brand/10 px-3 py-2.5 text-xs leading-relaxed text-white/85">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>{error}</span>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-white/70">
                邮箱
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) dispatch(clearError())
                }}
                placeholder="you@example.com"
                className="h-11 border-white/20 bg-[#181818] text-white placeholder:text-white/35"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-white/70">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) dispatch(clearError())
                }}
                placeholder="请输入密码"
                className="h-11 border-white/20 bg-[#181818] text-white placeholder:text-white/35"
              />
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full bg-brand text-base font-semibold text-white hover:bg-brand-hover"
            >
              {pending ? '正在登录…' : '登录 vidday'}
            </Button>
          </form>

          <p className="mt-4 text-xs text-white/45">
            首次使用？演示环境不提供注册，直接使用下方的演示账号即可体验完整流程。
          </p>

          <div className="mt-7 rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-white/55">
            <p className="font-medium text-white/75">演示账号</p>
            <p className="mt-1">
              邮箱：{DEMO_CREDENTIALS.email} · 密码：{DEMO_CREDENTIALS.password}
            </p>
            <Button
              type="button"
              variant="link"
              className="mt-1 h-auto p-0 text-xs text-brand hover:text-brand-hover"
              onClick={() => {
                setEmail(DEMO_CREDENTIALS.email)
                setPassword(DEMO_CREDENTIALS.password)
                dispatch(clearError())
              }}
            >
              重新填入演示账号
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-4 py-6 text-xs text-white/40 md:px-12">
        有疑问？请联系演示环境维护者 · vidday 为前端演示项目，全部数据均为 mock 内容。
      </footer>
    </div>
  )
}
