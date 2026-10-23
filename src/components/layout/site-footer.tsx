import { BrandLogo } from '@/components/brand-logo'

const FOOTER_LINKS = [
  '常见问题',
  '帮助中心',
  '账户与会员',
  '媒体中心',
  '投资者关系',
  '观看方式',
  '隐私声明',
  '联系我们',
  '服务条款',
  '仅限成人',
  '速度测试',
  '法律公告',
]

const BRANCH_LINKS = ['简介', '加入我们', '会员专区', '礼品卡', '招聘信息', '企业合作', '视频规范']

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-white/10 px-4 py-12 text-sm text-white/45 md:px-12">
      <div className="mx-auto max-w-5xl">
        <BrandLogo size="sm" asLink={false} />

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {FOOTER_LINKS.map((item) => (
            <span key={item} className="cursor-default transition-colors hover:text-white/75">
              {item}
            </span>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {BRANCH_LINKS.map((item) => (
            <span key={item} className="cursor-default transition-colors hover:text-white/75">
              {item}
            </span>
          ))}
        </div>

        <p className="mt-10 text-xs leading-relaxed text-white/30">
          vidday 是一个高保真前端演示项目：全部影片信息、观众档案与播放数据均为 mock 内容，
          视频播放能力暂以占位呈现，未接入真实播放内核，也不提供任何影视内容的观看或下载服务。
        </p>
      </div>
    </footer>
  )
}
