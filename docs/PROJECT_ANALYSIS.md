# 项目现状与技术债

基线 `f89eeb9`；三个只读调查并行核对 Web/Electron、Android Flutter/Kotlin、Fastify/MySQL，主 Agent 核对部署、历史资料、Git 工作树及本地验证。未连线上库，未在真实设备或生产网络复测。未跟踪构建产物不作为现状依据。

## 代码地图

| 范围 | 入口与实际链路 |
|---|---|
| `apps/web` | `main.tsx` → `App.tsx`/Redux → pages/hooks → `public-api.ts`；`title-adapter.ts` 合并后端摘要和详情；`watch-page.tsx` / `video-player.tsx` 管 HLS 和媒体生命周期；`user-sync.ts` 管本地与设备数据水合，`qoe.ts` 独立上报。浏览器 `vidday:state` 存账户、档案、进度、片单、播放偏好，`vidday:device-id` 独立保存。 |
| 桌面 | `apps/web/electron/main.ts` / `preload.ts` / `proxy.ts` / `shared.ts`；`scripts/dev.mjs` 可拉起后端，`scripts/build-electron.mjs` 打包主进程与 preload，`electron-builder.yml` 负责 macOS 包。线路资源与 Mihomo 二进制不入库。 |
| `apps/tv-android` | `lib/main.dart` → Shell/五个页签 → `ApiClient` / `CatalogStore` → 详情 / Player；`MainActivity.kt` 注册 `PlayerPlugin.kt`，`NativePlayerView.kt` 管 Media3，`PgsSubtitleTrack.kt` 和 `PgsOverlayView.kt` 管外挂位图。`SharedPreferences` 存 `vidday.deviceId`，目录和 QoE 队列在内存，SUP 在临时缓存。 |
| `server` | `index.ts` → `routes/{public,people}.ts` → `db/{queries,user-data,qoe,assets}.ts`；`cache.ts` 管内容 SWR，`db/pool.ts` 管 MySQL，`env.ts` / `config.ts` 管启动与热配置，`http.ts` 统一错误，`contract.ts` 定义 DTO。18 个显式公共路由，另有 `/health`。 |
| `deploy` / `docs` | Nginx、PM2、裸机与宝塔脚本；旧 API 清单、Android PGS 查新和历史 HLS 卡顿记录保留为背景，不替代可执行规范。 |

## 技术债及顺序

| 优先级 | 证据与影响 | 去向 |
|---|---|---|
| P0 | Flutter 唯一测试还实例化不存在的 `MyApp`；Web、服务端无已跟踪测试入口，仓库无已跟踪 CI。 | `QA-01`、`SVC-01` |
| P1 | `routes/public.ts` 读进度时异步删不可见记录；临时下架或并发新写入可能丢数据。`db/queries.ts` 的人物作品、合作统计和专题封面可见性与主目录不同。 | `RFC-01`（ADR-005） |
| P1 | `db/qoe.ts` 会话覆盖、事件追加分开且事件无去重；Android 上报可能并发重叠；旧请求晚到可能覆盖累计数据。 | `AP-01`、`RFC-03` |
| P1 | `NativePlayerView.kt` 等外挂字幕清单后才 `prepare()`；桥接保留单实例，退播重进需验证释放和迟到回调。 | `AP-02` |
| P1 | Android TV 焦点和点击激活不等同；方向键、确认键、返回存在待验点。 | `AU-01` |
| P1 | Web 账户文案与上报不符；离线片单删除失败后按并集合并可能回流；演示账户非正式认证。 | `WEB-01`、`RFC-02` |
| P2 | `cache.ts` 无容量上限；目录冷分页先取全量 ID、同时间缺稳定 tie-break；Web 内容摘要可能覆盖详情，搜索只查本地；Android 全量拉完才搜。 | `SVC-01` 的缓存覆盖、`AU-02`、后续目录立项 |
| P2 | Web 播放器单文件耦合媒体、广告、PGS、PiP 和 QoE；真实剧集契约不全，存在演示源兜底。 | `WP-01`、`RFC-04` |
| P2 | 根 README 的 Mock/默认 720p 描述落后；旧 API 盘点缺 QoE；`.env` 后备路径与注释不符，生产示例和代码默认端口不同；APK release 用 debug 签名。 | [接口](API_SPEC.md)、[架构](ARCHITECTURE.md)、`REL-01` |

## 已执行的基线验证

| 验证 | 结果 |
|---|---|
| `server/`、`apps/web/` 各自 `npm run typecheck`（Node 22.22.0） | 通过 |
| `apps/web/` `npm run build` | 通过，Vite 提示主包超过 500 kB |
| `apps/tv-android/` `flutter analyze --no-pub` | 分析器 LSP JSON 截断，退出 255，非通过 |
| `apps/tv-android/` `flutter test --no-pub` | 失败，`test/widget_test.dart:16` 无 `MyApp` 构造函数 |
| App 打包、真机、MySQL 在线 DDL、生产冒烟 | 未执行 |
