import type { Account, Profile } from '@/types'

export const profiles: Profile[] = [
  {
    id: 'p-jerry',
    name: 'Jerry',
    avatarArt: '扁平插画风格的成年男性头像，深色短发，眉骨硬朗，戴黑色方形眼镜，深灰纯色背景',
    color: '#e50914',
    isKids: false,
  },
  {
    id: 'p-lin',
    name: '林小满',
    avatarArt: '扁平插画风格的年轻女性头像，黑色中长发，安静微笑，暖米色纯色背景',
    color: '#2f80ed',
    isKids: false,
  },
  {
    id: 'p-kai',
    name: '阿凯',
    avatarArt: '扁平插画风格的男性头像，卷发与胡茬，戴棒球帽，墨绿色纯色背景',
    color: '#27ae60',
    isKids: false,
  },
  {
    id: 'p-kids',
    name: '儿童',
    avatarArt: '扁平插画风格的卡通儿童头像，圆圆的脸与明亮眼睛，头顶有小熊耳朵发箍，明黄色纯色背景',
    color: '#f5c518',
    isKids: true,
  },
]

export const account: Account = {
  id: 'acc-demo-0001',
  email: 'demo@vidday.tv',
  planName: '高级会员',
  planQuality: '4K + HDR',
  planPrice: '¥68 / 月',
  memberSince: '2024-03-18',
  nextBillingDate: '2026-11-18',
  paymentMethod: '支付宝 · 尾号 8836',
  profiles,
}

/** 用于登录页提示的演示账号 */
export const DEMO_CREDENTIALS = {
  email: 'demo@vidday.tv',
  password: 'vidday',
}
