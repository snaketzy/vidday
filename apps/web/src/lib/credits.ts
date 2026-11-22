/**
 * 演职员职位的中英对照。
 *
 * 数据库 `job` / `department` 存的是 TMDB 英文枚举，这里映射为观众可读的中文，
 * 未覆盖的职位原样回退英文，避免出现空白标签。
 */
import type { PublicCreditEntry } from '@/lib/public-api'

const JOB_LABELS: Record<string, string> = {
  Director: '导演',
  Writer: '编剧',
  Screenplay: '编剧',
  Story: '故事',
  Characters: '角色',
  Novel: '原著',
  Book: '原著',
  Producer: '制片人',
  'Executive Producer': '执行制片',
  'Co-Producer': '联合制片',
  'Line Producer': '制片主任',
  Casting: '选角',
  'Director of Photography': '摄影指导',
  Camera: '摄影',
  'Original Music Composer': '原创音乐',
  Music: '音乐',
  Editor: '剪辑',
  'Production Design': '艺术指导',
  'Art Direction': '美术指导',
  'Set Decoration': '布景',
  'Costume Design': '服装设计',
  Makeup: '化妆',
  Hairstyling: '发型',
  Sound: '音效',
  'Sound Designer': '音效设计',
  'Visual Effects': '视觉特效',
  'Special Effects': '特效',
  Stunts: '特技',
  Animation: '动画',
  Lighting: '灯光',
}

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: '演员',
  Directing: '导演',
  Writing: '编剧',
  Production: '制片',
  Camera: '摄影',
  Editing: '剪辑',
  Art: '美术',
  'Costume & Make-Up': '服装化妆',
  Sound: '音效',
  'Visual Effects': '视觉特效',
  Lighting: '灯光',
  Music: '音乐',
  Crew: '制作',
}

/** 职位中文名，未覆盖时回退英文原文。 */
export function jobLabel(job: string): string {
  return JOB_LABELS[job] ?? job
}

/** 部门中文名，未覆盖时回退英文原文。 */
export function departmentLabel(department: string): string {
  return DEPARTMENT_LABELS[department] ?? department
}

/**
 * 署名角色：演员优先展示饰演角色（饰 xxx），其余展示职位（导演 / 编剧……）。
 */
export function creditRoleLabel(entry: { job: string; character: string | null }): string {
  return entry.character ? `饰 ${entry.character}` : jobLabel(entry.job)
}

/** 详情页首屏的一张署名卡：带角色定位标签（导演 / 男主角……）。 */
export interface CreditHighlight {
  label: string
  entry: PublicCreditEntry
}

/**
 * 参与主要角色判定的演员窗口。
 * `sort_order` 是署名总序（含职员），演员按序前 10 位足以覆盖主角与主要配角，
 * 再往后多为次要角色，取之会把龙套当成配角。
 */
const HIGHLIGHT_CAST_WINDOW = 10

/**
 * 详情页只展示「导演 + 男女主角 + 男女配角」。
 *
 * 判定方式：演员沿用署名顺序（越靠前越主要），按性别各取前两位——
 * 第 1 位为主角、第 2 位为配角；缺女性角色的影片（如纯男性阵容）自动省略对应槽位。
 */
export function pickCreditHighlights(
  cast: PublicCreditEntry[],
  crew: PublicCreditEntry[],
): CreditHighlight[] {
  const highlights: CreditHighlight[] = []

  for (const member of crew) {
    if (member.job === 'Director') highlights.push({ label: '导演', entry: member })
  }

  const candidates = cast.slice(0, HIGHLIGHT_CAST_WINDOW)
  const males = candidates.filter((entry) => entry.gender === 'male')
  const females = candidates.filter((entry) => entry.gender === 'female')

  if (males[0]) highlights.push({ label: '男主角', entry: males[0] })
  if (females[0]) highlights.push({ label: '女主角', entry: females[0] })
  if (males[1]) highlights.push({ label: '男配角', entry: males[1] })
  if (females[1]) highlights.push({ label: '女配角', entry: females[1] })

  return highlights
}
