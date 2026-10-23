import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'

import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { TitlePreviewDialog } from '@/components/title/title-preview-dialog'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

/** 站点主框架：固定顶栏 + 页面内容 + 页脚 + 全局详情弹窗 */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <TitlePreviewDialog />
    </div>
  )
}
