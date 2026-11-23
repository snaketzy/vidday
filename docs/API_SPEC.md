# 统一接口契约

字段定义以 [`server/src/contract.ts`](../server/src/contract.ts) 为准，校验和边界行为以 [`public.ts`](../server/src/routes/public.ts)、[`people.ts`](../server/src/routes/people.ts)、[`index.ts`](../server/src/index.ts) 为准；[旧接口盘点](api-inventory.md) 提供展开示例但缺 QoE 等更新。新改动须同步本文件、服务端、Web 镜像和实际使用该字段的 Dart 消费者。

## HTTP 基线

Web 在 `VITE_API_BASE_URL` 后拼 `/api/public`，留空走同源；Android 的 `API_BASE_URL` 已含 `/api`，再拼 `/public`。公共请求携带 `x-app-key`；进度、片单、QoE 另带 `x-device-id`（8–64 个 `[A-Za-z0-9._-]` 字符）。JSON 写入使用 `Content-Type: application/json`。预检为 204；当前不支持 `x-client-platform`。错误壳为 `{"error":{"code":"…","message":"…"}}`：400 `BAD_REQUEST`/`INVALID_DEVICE_ID`、401 `UNAUTHORIZED`、404 `NOT_FOUND`、500 `INTERNAL_ERROR`；框架其他 4xx 可保留状态并用 `BAD_REQUEST`。客户端按状态和 code 分支，不解析 message。

下表除 `/health` 外路径均相对 `/api/public`。成功对象默认为 HTTP 200 加 `schemaVersion: 2`；标记“不带版本”的除外。

| 方法与路径 | 输入与成功响应 |
|---|---|
| GET `/health` | 无需 Key；查询 MySQL，`{ok:true,database,mysql}`，不带版本。 |
| GET `/carousels` | `placement=home` 默认，`collection` 必须带正整数 `pageId`；`{placement,pageId,carousels:PublicCarousel[]}`。 |
| GET `/titles/:id` | 正整数作品 ID；`{title:PublicTitleDetail}`，公开作品不存在为 404。 |
| GET `/titles/:id/credits` | 正整数作品 ID；`{credits:PublicTitleCredits}`，演员和职员分列。 |
| GET `/collections/:id` | `{collection:PublicCollectionDetail}`，不存在为 404；当前 `items` 只列影片。 |
| GET `/genres` | `{genres:[{code,name}]}`；当前从影片题材取得。 |
| GET `/proxy-config` | `{subscriptionUrl:string}`，空字符串表示保留现有配置；用于桌面端。 |
| GET `/latest` | `days` 默认 7，范围 1–90，`limit` 可选 1–200；`{days,total,items:PublicCarouselCard[]}`；以入库时间计。 |
| GET `/titles` | `limit` 可选 1–200，省略返回剩余全量；`offset` 默认 0、非负整数；`{total,items:PublicCarouselCard[]}`；不支持筛选。 |
| GET `/titles/count` | `type=movie/series`、`genres` 逗号分隔中文标签且为 OR、`kids=1/true`；`{total}`。 |
| GET `/people/:id` | `{person:PublicPersonDetail}`，含署名；不存在为 404。 |
| GET `/people/:id/collaborators` | `{personId,collaborators:PublicCollaborator[]}`，最多 20，主体不存在不单独报 404。 |
| GET `/progress` | `{items:PublicWatchProgress[]}`；读取隐藏并异步尝试清理不可见作品进度。 |
| PUT `/progress` | `{titleId,episodeId?,position,duration,percent,updatedAt?}`，秒、秒、0–100、UTC ISO；实现兼容三个数值缺省为 0、非负取整、百分比封顶；不可见作品为 404。`{ok:true}`，不带版本。 |
| DELETE `/progress/:titleId` | 按设备/作品删除，空操作也返回 `{ok:true}`，不带版本。 |
| GET `/list` | `{items:PublicCarouselCard[]}`，隐藏不可见作品，不清理。 |
| PUT `/list` | `{titleId}`；不可见作品为 404，重复加入成功；`{ok:true}`，不带版本。 |
| DELETE `/list/:titleId` | 按设备/作品删除，返回 `{ok:true}`，不带版本。 |
| POST `/qoe` | `{schemaVersion,session:PublicQoeSessionUpsert,events?:PublicQoeEventInput[]}`；需合法会话 ID、`client=web/android`、可解析 `startedAt`，分别对应 `INVALID_QOE_SESSION`、`INVALID_SESSION_ID`、`INVALID_QOE_CLIENT`、`INVALID_QOE_STARTED_AT`（缺 session 单独报错）；至多取前 100 条，不校验请求版本。响应 `{schemaVersion:2,ok:true,accepted}`，非原子、事件不能当作可无害重放。 |

`PublicCarouselCard.id` 不总是作品 ID，导航/查询用 `targetType`、`targetId`；`playUrl`、图像及部分元数据可以为 null。合集 ID 与作品 ID 不混用。客户端容忍新增可选字段；现有字段删改、单位/状态码/归属语义变更须经审批并设兼容窗口。契约测试至少覆盖成功、空数组、null、错误壳、版本不兼容及旧客户端。

## 平台内部契约

- Flutter PlatformView `vidday/player`（`url,pgsIndexUrl,autoplay`）；同名 MethodChannel 含 `play,pause,retry,seekTo(position),seekBy(delta),setVolume(volume),setSpeed(speed),selectAudio(id),selectSubtitle(id),selectVideo(id),enterPip`；`vidday/player/events` 发快照，精确键以 [`native_player.dart`](../apps/tv-android/lib/core/native_player.dart) / [`NativePlayerView.kt`](../apps/tv-android/android/app/src/main/kotlin/com/vidday/vidday_tv/NativePlayerView.kt) 为准。进度毫秒、音量 0–1、原生轨道 `groupIndex:trackIndex`、外挂 `pgs:<file>`；字幕 null 关闭，画质 null/auto 恢复 ABR。
- Electron 暴露 `window.vidday.{platform,versions,proxy}`；代理方法和类型见 [`preload.ts`](../apps/web/electron/preload.ts) / [`shared.ts`](../apps/web/electron/shared.ts)。Mihomo 回环 Controller 使用 Bearer，路由明细见[旧盘点 §5](api-inventory.md#52-mihomo-controller-api)。禁止透传任意 IPC，普通浏览器没有 `window.vidday` 也应可用。
