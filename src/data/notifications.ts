export interface NotificationItem {
  id: string
  titleId: string
  headline: string
  detail: string
  time: string
  art: string
}

export const notifications: NotificationItem[] = [
  {
    id: 'n-1',
    titleId: 'crimson-tide',
    headline: '《赤色潮汐》全集上线',
    detail: '你关注的原创剧集《赤色潮汐》已更新第 1 季全 8 集。',
    time: '2 小时前',
    art: '黄昏的东海渔港，锈迹斑斑的货轮压着血红晚霞靠岸',
  },
  {
    id: 'n-2',
    titleId: 'neon-detective',
    headline: '《霓虹侦探》新增第 8 集',
    detail: '第 1 季已完结，结局将在本周末解锁幕后特辑。',
    time: '昨天',
    art: '赛博朋克雨夜高楼间的狭窄巷道，全息广告的青色光照亮积水',
  },
  {
    id: 'n-3',
    titleId: 'deep-current',
    headline: '为你推荐《暗流》',
    detail: '因为你观看过《暗影之城》，我们猜你会喜欢这部沿海罪案剧。',
    time: '3 天前',
    art: '跨海大桥桥墩下的湍急水流，救生艇灯柱扫过水面漂浮的黑色行李箱',
  },
  {
    id: 'n-4',
    titleId: 'blue-whale',
    headline: '《蓝鲸计划》获得年度自然影像奖',
    detail: '由 vidday 出品的自然纪录片获得年度最佳摄影。',
    time: '上周',
    art: '深海幽蓝中蓝鲸巨大的尾鳍缓缓划过，阳光穿透水面形成光柱落在鲸背',
  },
]
