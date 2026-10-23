import { useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, Users } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'

import { BrandLogo } from '@/components/brand-logo'
import { ArtImage } from '@/components/art-image'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { genres } from '@/data/genres'
import { notifications } from '@/data/notifications'
import { matchesKeyword } from '@/lib/catalog'
import { avatarArt } from '@/lib/art'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { logout, selectActiveProfile } from '@/store/slices/auth-slice'
import { selectAllTitles } from '@/store/slices/catalog-slice'
import { selectHeaderScrolled, setHeaderScrolled, setSearchOpen, selectSearchOpen } from '@/store/slices/ui-slice'

const NAV_ITEMS = [
  { label: '首页', to: '/' },
  { label: '剧集', to: '/browse?type=series&sort=newest' },
  { label: '电影', to: '/browse?type=movie' },
  { label: '新上线', to: '/browse?sort=newest' },
  { label: '我的片单', to: '/my-list' },
]

export function SiteHeader() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const scrolled = useAppSelector(selectHeaderScrolled)
  const searchOpen = useAppSelector(selectSearchOpen)
  const profile = useAppSelector(selectActiveProfile)
  const titles = useAppSelector(selectAllTitles)
  const [keyword, setKeyword] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => dispatch(setHeaderScrolled(window.scrollY > 24))
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [dispatch])

  useEffect(() => {
    if (!searchOpen) setKeyword('')
  }, [searchOpen])

  const suggestions = useMemo(() => {
    const query = keyword.trim()
    if (!query) return []
    return titles.filter((title) => matchesKeyword(title, query)).slice(0, 6)
  }, [keyword, titles])

  const submitSearch = (value: string) => {
    const query = value.trim()
    if (!query) return
    dispatch(setSearchOpen(false))
    setMobileOpen(false)
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const currentType = searchParams.get('type')
  const currentGenre = searchParams.get('genre')
  const isBrowseActive = location.pathname === '/browse'

  const navLinkClass = (active: boolean) =>
    cn(
      'text-sm transition-colors',
      active ? 'font-semibold text-white' : 'text-white/70 hover:text-white',
    )

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        scrolled || searchOpen
          ? 'border-b border-white/5 bg-background/95 backdrop-blur'
          : 'bg-gradient-to-b from-black/85 via-black/40 to-transparent',
      )}
    >
      <div className="flex h-[68px] items-center gap-3 px-4 md:gap-6 md:px-12">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white md:hidden" aria-label="打开导航">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-white/10 bg-background p-0 text-white">
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <div className="flex h-[68px] items-center px-6">
              <BrandLogo size="sm" />
            </div>
            <nav className="flex flex-col px-3 py-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <p className="px-3 pb-1 pt-4 text-xs uppercase tracking-widest text-white/40">按类型浏览</p>
              {genres.map((genre) => (
                <Link
                  key={genre.id}
                  to={`/browse?genre=${genre.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {genre.name}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <BrandLogo className="mr-2" />

        <nav className="hidden items-center gap-5 md:flex">
          {NAV_ITEMS.map((item) => {
            const [path, query] = item.to.split('?')
            const params = new URLSearchParams(query ?? '')
            const itemType = params.get('type')
            const hasSort = params.has('sort')
            const active =
              location.pathname === path &&
              (itemType ? currentType === itemType && !currentGenre : hasSort ? Boolean(searchParams.has('sort')) && !currentType && !currentGenre : !currentType && !currentGenre && !searchParams.has('sort'))
            return (
              <NavLink key={item.to} to={item.to} className={navLinkClass(active)}>
                {item.label}
              </NavLink>
            )
          })}

          <DropdownMenu>
            <DropdownMenuTrigger className={navLinkClass(isBrowseActive)}>
              <span className="inline-flex items-center gap-1">
                浏览
                <ChevronDown className="size-3.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="grid w-64 grid-cols-2 border-white/10 bg-[#181818] text-white">
              {genres.map((genre) => (
                <DropdownMenuItem key={genre.id} asChild>
                  <Link
                    to={`/browse?genre=${genre.id}`}
                    className={cn('cursor-pointer text-sm', currentGenre === genre.id && 'text-brand')}
                  >
                    {genre.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-1 md:gap-3">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label={searchOpen ? '收起搜索' : '展开搜索'}
              className="text-white hover:bg-white/10"
              onClick={() => dispatch(setSearchOpen(!searchOpen))}
            >
              <Search className="size-5" />
            </Button>
            <div
              className={cn(
                'relative transition-all duration-300',
                searchOpen ? 'w-44 opacity-100 sm:w-64' : 'w-0 overflow-hidden opacity-0',
              )}
            >
              <Input
                autoFocus={searchOpen}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitSearch(keyword)
                  if (event.key === 'Escape') dispatch(setSearchOpen(false))
                }}
                placeholder="搜索片名、演员、题材"
                className="h-8 border-white/25 bg-black/60 pl-8 text-sm text-white placeholder:text-white/40"
              />
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />

              {suggestions.length ? (
                <div className="absolute left-0 right-0 top-10 overflow-hidden rounded-md border border-white/10 bg-[#181818] shadow-xl">
                  {suggestions.map((title) => (
                    <button
                      key={title.id}
                      type="button"
                      onClick={() => {
                        dispatch(setSearchOpen(false))
                        navigate(`/title/${title.id}`)
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/10"
                    >
                      <ArtImage
                        src={avatarArt(title.art)}
                        alt={title.name}
                        paletteId={title.id}
                        className="size-10 shrink-0 rounded-sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{title.name}</span>
                        <span className="block truncate text-[11px] text-white/45">
                          {title.year} · {title.type === 'series' ? '剧集' : '电影'}
                        </span>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => submitSearch(keyword)}
                    className="w-full border-t border-white/10 px-3 py-2 text-left text-xs text-brand transition hover:bg-white/10"
                  >
                    查看「{keyword}」的全部结果
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="通知"
                className="relative text-white hover:bg-white/10"
              >
                <Bell className="size-5" />
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-80 border-white/10 bg-[#181818] text-white"
            >
              <DropdownMenuLabel className="text-xs uppercase tracking-widest text-white/45">
                通知
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              {notifications.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link to={`/title/${item.titleId}`} className="flex cursor-pointer items-start gap-3 py-2">
                    <ArtImage
                      src={avatarArt(item.art)}
                      alt={item.headline}
                      paletteId={item.id}
                      className="size-12 shrink-0 rounded-sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white/90">{item.headline}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/50">{item.detail}</span>
                      <span className="mt-1 block text-[10px] text-white/35">{item.time}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="账户菜单"
                className="flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <ArtImage
                  src={avatarArt(profile?.avatarArt ?? '扁平插画风格的人物头像，正面微笑，纯色背景')}
                  alt={profile?.name ?? '观众'}
                  paletteId={profile?.id ?? 'guest'}
                  className="size-8 rounded-sm"
                />
                <ChevronDown className="hidden size-3.5 text-white md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#181818] text-white">
              <DropdownMenuLabel className="text-xs text-white/45">
                当前观众：{profile?.name ?? '未选择'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem asChild>
                <Link to="/profiles" className="cursor-pointer gap-2">
                  <Users className="size-4" />
                  切换观众
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/account" className="cursor-pointer gap-2">
                  <Settings className="size-4" />
                  账户与设置
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => {
                  dispatch(logout())
                  navigate('/login')
                }}
              >
                <LogOut className="size-4" />
                退出 vidday
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
