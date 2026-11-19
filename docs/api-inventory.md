# Vidday 接口梳理

本文按“前端/桌面端实际用到的接口”整理，分为三类：

1. 自有后端公开接口：`server/src/routes/public.ts` + `server/src/routes/people.ts`
2. 自有后端健康检查接口：`/health`
3. Electron 代理模块依赖的本地 Mihomo Controller API

不包含播放器直接请求的 HLS/图片静态资源，也不展开第三方订阅源本身的私有协议。

## 1. 公共约定

### 1.1 Base URL

- Web / 渲染层公共接口前缀：`{VITE_API_BASE_URL}/api/public`
- 本地开发健康检查：`http://127.0.0.1:{BACKEND_PORT}/health`
- Electron 本地代理控制接口：`http://127.0.0.1:{controllerPort}`

### 1.2 通用请求头

所有 `/api/public/*` 请求默认都带：

- `accept: application/json`
- `x-app-key: {VITE_APP_API_KEY}`，必填；只有 `/health` 例外

设备归属型接口额外要求：

- `x-device-id: {8-64位[A-Za-z0-9._-]}`，用于 `progress` / `list`

### 1.3 通用成功响应

除 `/health`、`PUT/DELETE` 的 `{ ok: true }` 以及 Mihomo Controller 外，`/api/public/*` 成功响应都带：

```json
{
  "schemaVersion": 2,
  "...": "payload"
}
```

### 1.4 通用错误响应

后端统一错误包结构：

```json
{
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | NOT_FOUND | INTERNAL_ERROR | INVALID_DEVICE_ID",
    "message": "错误描述"
  }
}
```

常见状态码：

- `400`：入参非法
- `401`：缺少或错误的 `x-app-key`
- `404`：目标资源不存在/已下架
- `500`：服务内部错误

## 2. 公共 DTO

以下结构会在多个接口复用。

### 2.1 `PublicCarouselCard`

```ts
{
  id: number
  targetType: 'movie' | 'series' | 'collection'
  targetId: number
  href: string
  title: string
  chineseTitle: string | null
  englishTitle: string | null
  subtitle: string | null
  backdropUrl: string | null
  posterUrl: string | null
  playUrl: string | null
  covers: string[]
  releaseYear: number | null
  runtime: number | null
  maturity: string | null
  rating: number | null
  genres: string[]
}
```

### 2.2 `PublicTitleDetail`

```ts
{
  id: number
  contentType: 'movie' | 'series'
  title: string
  chineseTitle: string | null
  englishTitle: string | null
  originalTitle: string | null
  year: number | null
  runtime: number | null
  rating: number | null
  maturity: string | null
  genres: string[]
  logline: string | null
  synopsis: string | null
  director: string | null
  cast: string[]
  backdropUrl: string | null
  posterUrl: string | null
  playUrl: string | null
  collections: { id: number; name: string }[]
  updatedAt: string
}
```

### 2.3 `PublicCreditEntry`

```ts
{
  personId: number | null
  name: string
  englishName: string | null
  gender: string
  avatarUrl: string | null
  department: string
  job: string
  character: string | null
}
```

### 2.4 `PublicWatchProgress`

```ts
PublicCarouselCard & {
  episodeId: number | null
  position: number
  duration: number
  percent: number
  updatedAt: string
}
```

## 3. 自有后端公开接口

## 3.1 轮播

### `GET /api/public/carousels`

用途：

- 首页 Shelf / Hero：`useCarousels('home')`
- 专题页轮播：`useCarousels('collection', pageId)`

Query 入参：

```ts
{
  placement?: 'home' | 'collection' // 默认 home
  pageId?: number // placement=collection 时必填，正整数
}
```

返回：

```ts
{
  schemaVersion: 2
  placement: 'home' | 'collection'
  pageId: number | null
  carousels: {
    id: number
    title: string
    variant: 'hero' | 'rail'
    autoplay: boolean
    intervalMs: number
    items: PublicCarouselCard[]
  }[]
}
```

校验规则：

- `placement` 只能是 `home | collection`
- `placement=collection` 时必须提供正整数 `pageId`

## 3.2 标题详情

### `GET /api/public/titles/:id`

用途：

- 详情页、播放页补拉完整元数据：`useResolvedTitle`

Path 入参：

```ts
{ id: number } // 正整数
```

返回：

```ts
{
  schemaVersion: 2
  title: PublicTitleDetail
}
```

失败：

- `404`：标题不存在或已下架

## 3.3 演职员表

### `GET /api/public/titles/:id/credits`

用途：

- 作品完整演职员页：`useTitleCredits`

Path 入参：

```ts
{ id: number }
```

返回：

```ts
{
  schemaVersion: 2
  credits: {
    id: number
    contentType: 'movie' | 'series'
    cast: PublicCreditEntry[]
    crew: PublicCreditEntry[]
  }
}
```

## 3.4 专题详情

### `GET /api/public/collections/:id`

用途：

- 专题页主体：`CollectionPage`

Path 入参：

```ts
{ id: number }
```

返回：

```ts
{
  schemaVersion: 2
  collection: {
    id: number
    name: string
    description: string | null
    coverUrl: string | null
    covers: string[]
    items: PublicCarouselCard[]
  }
}
```

## 3.5 题材列表

### `GET /api/public/genres`

用途：

- Browse 页题材筛选
- Header 浏览菜单的题材来源

入参：

- 无

返回：

```ts
{
  schemaVersion: 2
  genres: {
    code: string
    name: string
  }[]
}
```

说明：

- `code` 为英文 code，如 `Action`
- `name` 为中文名，如 `动作`
- 前端会再映射成本地 `Genre { id, name, description }`

## 3.6 远端代理配置

### `GET /api/public/proxy-config`

用途：

- Electron 主进程拉取代理订阅地址热更新

入参：

- 无

返回：

```ts
{
  schemaVersion: 2
  subscriptionUrl: string
}
```

说明：

- 空字符串表示“本次不下发新订阅地址”
- 仅桌面端代理模块使用，Web 前台不直接消费

## 3.7 最新上架

### `GET /api/public/latest`

用途：

- 首页“最新上架” Rail：`useLatestTitles`
- Browse 页 `?addedWithin=N`

Query 入参：

```ts
{
  days?: number // 1~90，默认 DEFAULT_LATEST_DAYS=7
  limit?: number // 1~200，可选
}
```

返回：

```ts
{
  schemaVersion: 2
  days: number
  total: number
  items: PublicCarouselCard[]
}
```

说明：

- `total` 是窗口内总数，不受 `limit` 影响

## 3.8 浏览全部作品总数

### `GET /api/public/titles/count`

用途：

- Browse 页头部作品数统计：`BrowsePage`

Query 入参：

```ts
{
  type?: 'movie' | 'series'
  genres?: string // 逗号分隔的中文题材名，如 "动作,科幻"
  kids?: '1' | 'true'
}
```

返回：

```ts
{
  schemaVersion: 2
  total: number
}
```

关键说明：

- `genres` 不是 genre id，也不是英文 code，而是中文题材名
- 多个 `genres` 走“或”关系
- 当前只做“计数”，不返回列表

## 3.9 浏览全部作品列表

### `GET /api/public/titles`

用途：

- Browse 页瀑布流分页：`useAllTitles`

Query 入参：

```ts
{
  limit?: number // 1~200
  offset?: number // >= 0
}
```

返回：

```ts
{
  schemaVersion: 2
  total: number
  items: PublicCarouselCard[]
}
```

关键说明：

- 只返回“已上架”内容
- 当前接口不支持服务端筛选，Browse 页类型/题材排序主要在前端做
- `total` 是全库总数，不随 `offset/limit` 变化

## 3.10 观看进度列表

### `GET /api/public/progress`

用途：

- 启动水合：`hydrateUserData`

请求头：

```ts
{
  'x-app-key': string
  'x-device-id': string
}
```

返回：

```ts
{
  schemaVersion: 2
  items: PublicWatchProgress[]
}
```

说明：

- 返回项自带卡片摘要，前端可直接重建 catalog
- 若进度对应标题已下架/删除，后端会异步清理脏记录

## 3.11 写入观看进度

### `PUT /api/public/progress`

用途：

- 播放中每 15 秒
- 暂停 / 结束 / 离开页面即时上报

请求头：

```ts
{
  'x-app-key': string
  'x-device-id': string
  'content-type': 'application/json'
}
```

Body：

```ts
{
  titleId: number
  episodeId?: number | null
  position: number
  duration: number
  percent: number
  updatedAt?: string // ISO
}
```

校验规则：

- `titleId` 必须为正整数，且目标标题必须存在
- `episodeId` 如传入则必须为正整数或 `null`
- `position/duration/percent` 必须是非负数

成功返回：

```ts
{ ok: true }
```

失败补充：

- `404`：标题不存在/已下架，前端会把本地残留记录删掉

## 3.12 删除观看进度

### `DELETE /api/public/progress/:titleId`

用途：

- “继续观看”移除

Path 入参：

```ts
{ titleId: number }
```

成功返回：

```ts
{ ok: true }
```

## 3.13 我的片单列表

### `GET /api/public/list`

用途：

- 启动水合：`hydrateUserData`

请求头：

```ts
{
  'x-app-key': string
  'x-device-id': string
}
```

返回：

```ts
{
  schemaVersion: 2
  items: PublicCarouselCard[]
}
```

## 3.14 加入片单

### `PUT /api/public/list`

用途：

- “加入我的片单”

请求头：

```ts
{
  'x-app-key': string
  'x-device-id': string
  'content-type': 'application/json'
}
```

Body：

```ts
{
  titleId: number
}
```

成功返回：

```ts
{ ok: true }
```

说明：

- 重复加入是幂等操作
- 标题不存在或已下架会返回 `404`

## 3.15 移出片单

### `DELETE /api/public/list/:titleId`

用途：

- “移出我的片单”

Path 入参：

```ts
{ titleId: number }
```

成功返回：

```ts
{ ok: true }
```

## 3.16 影人详情

### `GET /api/public/people/:id`

用途：

- 影人页主体：`PersonPage`

Path 入参：

```ts
{ id: number }
```

返回：

```ts
{
  schemaVersion: 2
  person: {
    id: number
    name: string
    englishName: string | null
    gender: string
    avatarUrl: string | null
    birthday: string | null
    deathday: string | null
    placeOfBirth: string | null
    nationality: string | null
    school: string | null
    knownFor: string
    biography: string | null
    credits: {
      titleId: number
      contentType: 'movie' | 'series'
      title: string
      chineseTitle: string | null
      englishTitle: string | null
      releaseYear: number | null
      posterUrl: string | null
      playUrl: string | null
      rating: number | null
      job: string
      department: string
      character: string | null
    }[]
  }
}
```

## 3.17 合作影人

### `GET /api/public/people/:id/collaborators`

用途：

- 影人页补充信息：`PersonPage`

Path 入参：

```ts
{ id: number }
```

返回：

```ts
{
  schemaVersion: 2
  personId: number
  collaborators: {
    personId: number
    name: string
    englishName: string | null
    gender: string
    avatarUrl: string | null
    sharedCount: number
  }[]
}
```

说明：

- 即使合作关系为空，也返回 `200 + []`
- 是否存在该影人由 `/people/:id` 判定

## 4. 健康检查接口

### `GET /health`

用途：

- `scripts/dev.mjs` 用于判断后端是否已启动并健康

请求头：

- 无需 `x-app-key`

返回：

```ts
{
  ok: true
  database: string
  mysql: string
}
```

说明：

- 该接口会顺带探测 MySQL 连通性

## 5. Electron 代理模块依赖接口

这部分不是对外业务 API，但项目里确实“在用”，主要在 `electron/proxy.ts`。

## 5.1 自有后端接口（主进程调用）

### `GET {base}/api/public/proxy-config`

用途：

- 主进程走系统网络拉取最新订阅地址

请求头：

```ts
{
  accept: 'application/json'
  'x-app-key'?: string
}
```

返回：

```ts
{
  schemaVersion: 2
  subscriptionUrl: string
}
```

## 5.2 Mihomo Controller API

Base URL：

```txt
http://127.0.0.1:{controllerPort}
Authorization: Bearer {CONTROLLER_SECRET}
```

### `GET /version`

用途：

- 轮询内核是否就绪

返回：

- 只要求 `response.ok === true`，代码里未消费具体 JSON 字段

### `GET /proxies`

用途：

- 读取所有选择器分组和当前节点，供代理面板展示

代码期待的最小返回结构：

```ts
{
  proxies?: Record<string, {
    type?: string
    now?: string
    all?: string[]
  }>
}
```

### `GET /proxies/{name}`

用途：

- 读取某个 selector 分组的节点列表，例如手动组

代码期待的最小返回结构：

```ts
{
  all?: string[]
}
```

### `PUT /proxies/{name}`

用途：

- 切换 selector 当前节点
- 将测试组临时指向某个节点

Body：

```ts
{
  name: string
}
```

返回：

- 代码不依赖具体 body，`204/205` 也视为成功

### `GET /proxies/{name}/delay?timeout={ms}&url={testUrl}`

用途：

- 单节点测速

返回：

```ts
{
  delay: number
}
```

### `GET /providers/proxies/{provider}`

用途：

- 读取订阅 provider 解析出的节点数

代码期待的最小返回结构：

```ts
{
  proxies?: { name: string }[]
}
```

### `PUT /providers/proxies/{provider}`

用途：

- 订阅文件更新后触发 provider 热重载

返回：

- 代码不依赖具体 body

## 6. 前端接口调用关系速查

| 页面/模块 | 调用接口 |
| --- | --- |
| `useCarousels` / 首页 / 专题页轮播 | `GET /api/public/carousels` |
| `useResolvedTitle` / 详情页 / 播放页 | `GET /api/public/titles/:id` |
| `useTitleCredits` / 演职员页 | `GET /api/public/titles/:id/credits` |
| `CollectionPage` | `GET /api/public/collections/:id` |
| `useGenres` / Browse 筛选 | `GET /api/public/genres` |
| `useLatestTitles` | `GET /api/public/latest` |
| `useAllTitles` | `GET /api/public/titles` |
| `BrowsePage` 作品数 | `GET /api/public/titles/count` |
| `hydrateUserData` | `GET /api/public/progress` + `GET /api/public/list` |
| `reportProgress` | `PUT /api/public/progress` |
| 移除继续观看 | `DELETE /api/public/progress/:titleId` |
| 片单增删 | `PUT /api/public/list` / `DELETE /api/public/list/:titleId` |
| `PersonPage` | `GET /api/public/people/:id` + `GET /api/public/people/:id/collaborators` |
| `scripts/dev.mjs` | `GET /health` |
| `electron/proxy.ts` | `GET /api/public/proxy-config` + Mihomo Controller API |

## 7. 源码位置

- 后端路由定义：`server/src/routes/public.ts`、`server/src/routes/people.ts`
- 后端契约类型：`server/src/contract.ts`
- 前端 API 客户端：`src/lib/public-api.ts`
- 用户数据同步：`src/lib/user-sync.ts`
- 代理模块：`electron/proxy.ts`
