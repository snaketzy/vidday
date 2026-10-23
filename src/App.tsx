import { Navigate, Outlet, Route, Routes } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { AccountPage } from '@/pages/account-page'
import { BrowsePage } from '@/pages/browse-page'
import { HomePage } from '@/pages/home-page'
import { LoginPage } from '@/pages/login-page'
import { MyListPage } from '@/pages/my-list-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ProfilesPage } from '@/pages/profiles-page'
import { SearchPage } from '@/pages/search-page'
import { TitleDetailPage } from '@/pages/title-detail-page'
import { WatchPage } from '@/pages/watch-page'
import { useAppSelector } from '@/store/hooks'
import { selectIsAuthenticated } from '@/store/slices/auth-slice'

/** 需要登录 */
function RequireAuth() {
  const authenticated = useAppSelector(selectIsAuthenticated)
  if (!authenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

/** 需要先选定观众档案 */
function RequireProfile() {
  const activeProfileId = useAppSelector((state) => state.auth.activeProfileId)
  if (!activeProfileId) return <Navigate to="/profiles" replace />
  return <Outlet />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/account" element={<AccountPage />} />

        <Route element={<RequireProfile />}>
          {/* 播放页独占全屏，不带站点顶栏与页脚 */}
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="/watch/:id/:episodeId" element={<WatchPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/title/:id" element={<TitleDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/my-list" element={<MyListPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
