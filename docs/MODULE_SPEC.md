# 模块职责与共享文件

下列为维护责任，不等于写入许可。实际修改以任务卡白名单为准；未分配文件默认由主 Agent 持有。依赖仅按表中方向，不跨端 import 运行时代码。

| 模块 / 责任方 | 职责和边界 | 依赖 |
|---|---|---|
| SVC-EDGE / 服务边界 | `server/src/index.ts`、`env.ts`、`http.ts`、`config.ts`、`routes/*`、`contract.ts`，启动、鉴权钩子、错误、输入和 DTO | SVC-CONTENT、SVC-DATA；契约镜像由主 Agent 协调 |
| SVC-CONTENT / 服务目录 | `db/queries.ts`、`db/assets.ts`、`cache.ts`，只读目录、人物、图片地址和缓存 | 共享内容库、连接池；不 import 路由 |
| SVC-DATA / 服务数据 | `db/pool.ts`、`db/user-data.ts`、`db/qoe.ts`，MySQL 连接及设备/遥测持久化 | MySQL、契约类型；不能改内容库 |
| WEB-UI / Web UI | `src/pages`（不含 watch 页）、布局、片单浏览、详情与目录 hooks | 公共 API、Web 状态、播放导航，不接管媒体对象 |
| WEB-PLAY / Web 播放 | `watch-page.tsx`、`video-player.tsx`、`use-play-target.ts`、`player-slice.ts`、`lib/qoe.ts` | 目录适配、用户数据、媒体源、桌面能力可选 |
| WEB-CORE / 主 Agent | `main.tsx`、`App.tsx`、`store/index.ts`、`lib/public-api.ts`、`user-sync.ts`、`device-id.ts`、`title-adapter.ts`、`types/index.ts`、其他共享 slice 与全局样式 | API / 本地存储，供 UI 与播放器共享 |
| DESKTOP / 桌面 | `electron/*`、桌面脚本、包配置；系统网络和 Mihomo 生命周期 | `preload` / IPC / renderer；触及 `network-panel.tsx` 等 UI 适配先协调 |
| AND-UI / Android UI 轮值 | `lib/main.dart`、`lib/ui`（不含 `player_page.dart`）、`core/catalog.dart` | `ApiClient` 和 models；手机与 TV 共享 UI，不因分支名复制文件 |
| AND-PLAY / Android 播放轮值 | `player_page.dart`、`core/native_player.dart`、`core/qoe.dart`、Kotlin 播放器与播放布局 | 通道协议、Flutter 生命周期、Media3、API；手机与 TV 共用实现 |
| AND-CORE / 主 Agent | `core/api_client.dart`、`models.dart`、`config.dart`、`device_id.dart`、Manifest、Gradle、pubspec | 公共接口、SharedPreferences 与 Android 构建 |
| RELEASE / 发布 | `deploy/`、各端构建和发布配置 | 工具链、API/健康接口；发布只由主 Agent 或指定负责人授权 |

## 冲突规则

- `routes/public.ts` 同时挂目录、设备和 QoE；`index.ts` 涉及鉴权、预检与启动 DDL。涉及同一文件的任务串行，数据 Agent 通过已批准的函数接口交接。
- `video-player.tsx` 与 `watch-page.tsx` 同时承载生命周期、广告、进度和 QoE。Android 的 `NativePlayerView.kt` / `PlayerPlugin.kt` / Dart 桥接 / `player_page.dart` 属同一个跨层播放维护窗口。两个平台分支不得重复改同一实现。
- API 镜像、设备键、缓存键、依赖与 lockfile、路由入口、共享组件和部署配置视为共享资源。临时交接写明文件、独占窗口、负责人、交接提交；没有交接记录不得修改。
