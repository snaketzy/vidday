# 界面与交互任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### WEB-01｜更正账户数据说明
- **负责人 / 分支 / 模块：** Web UI Agent，`feature/web-ui`，WEB-UI。
- **目标 / 功能：** 说明本地偏好、设备侧同步及清理本机数据的边界，保持账户按钮行为。
- **输入 / 依赖 / 数据：** `vidday:state`、`vidday:device-id`、`GET/PUT /progress`、`GET/PUT /list`；只读参考同步与存储代码，无其他任务依赖。
- **写入 / 禁区：** `apps/web/src/pages/account-page.tsx`；禁改 `user-sync.ts`、Redux、导航。
- **输出 / 验收 / 交付：** 类型检查、Web 构建与账户页冒烟通过；文案不再宣称进度不上传或清理本机即删远端，附页面证据。

### WEB-02｜Web 影片详情页对齐 Infuse
- **负责人 / 分支 / 模块：** Web UI Agent，`feature/web-ui`，WEB-UI；与 `WP-02` 文件独占范围不重叠。
- **目标 / 功能：** 用全宽背景和底部渐变、宽屏左右分区及窄屏纵排组织详情；主按钮区分「播放」和「继续观看 00:13:59」；简介可展开；演职员横向排列，已看进度位于主视觉与演职员之间。
- **输入 / 依赖 / 数据：** [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `DETAIL-01` 至 `DETAIL-07`；复用已有详情、演职员 API、片单、`usePlayTarget` 和 Redux 观看记录。继续观看按钮、只读进度条与播放器用同一条记录；无记录时不显示进度，无源时给出提示。有真实观看数据才显示观看区，不把推荐混入其中。
- **写入 / 禁区：** `apps/web/src/pages/title-detail-page.tsx`；仅可另增 `apps/web/src/components/title/movie-detail-hero.tsx`。禁改播放层、共享路由、播放器状态、API、数据库、剧集契约和其他平台。
- **验收 / 交付：** 在 `apps/web/` 运行 `npm run typecheck` 与 `npm run build`；用宽窄窗口分别检查有/无记录、无源、缺图、长简介、键盘操作，并保留截图。与 `WP-02` 合测从 `13:59` 续播，返回同一详情后时间与进度同步更新，焦点回到播放入口。

### AU-01｜Android TV 遥控器选中与返回焦点
- **负责人 / 分支 / 模块：** Android TV UI Agent，`feature/android-tv-ui`，AND-UI。
- **目标 / 功能：** 为浏览导航和卡片补确认键激活、隐藏页签焦点隔离和返回焦点恢复。
- **输入 / 依赖 / 数据：** `QA-01`；`ShellPage`、共享卡片与 `PublicCarouselCard` 的目标映射，不改接口。
- **写入 / 禁区：** `apps/tv-android/lib/ui/shell_page.dart`、`apps/tv-android/lib/ui/widgets.dart`、新增 `apps/tv-android/test/tv_focus_test.dart`；禁改播放页、Kotlin、API 和其他页面。
- **输出 / 验收 / 交付：** Widget 测试覆盖方向键、确认键、返回；真机可进入详情、返回定位且无重复触发，触屏冒烟通过，附设备与操作记录。

### AU-02｜Android 目录加载生命周期
- **负责人 / 分支 / 模块：** Android UI Agent，`feature/android-ui`，AND-UI 的目录子模块。
- **目标 / 功能：** 确保重复进入合并请求、分页失败可重试、销毁后不通知；不改搜索产品语义。
- **输入 / 依赖 / 数据：** `QA-01`；`GET /titles?limit=200&offset=…`、目录 DTO、假多页响应。
- **写入 / 禁区：** `apps/tv-android/lib/core/catalog.dart`、新增 `apps/tv-android/test/catalog_test.dart`；禁改 `shell_page.dart`、UI、`ApiClient` 和服务端。
- **输出 / 验收 / 交付：** `flutter analyze/test`，用例覆盖多页 offset、排除专题、失败重试、合并请求和销毁后无通知；附调用序列。

## Apple 端调研（仅文档）

### IOS-UI-01｜iOS 浏览与触屏交互方案
- **负责人 / 分支 / 模块：** iOS UI Agent，`feature/ios-ui`，Apple 端 UI 立项调研。
- **目标 / 功能：** 梳理首页、搜索、详情与播放入口；定义触屏交互、动态字体和 VoiceOver 的验收流程，区分首版与后续能力。
- **输入 / 依赖 / 数据：** [产品范围](../docs/PROJECT.md)、[UI / UX 规范](../docs/UI_UX_GUIDELINES.md)、v2 目录卡片与详情 DTO；与 `IOS-PLAY-01` 核对播放入口假设，可并行。
- **写入 / 禁区：** 仅新增 `docs/rfc-ios-ui.md`；禁止创建工程、修改其他端 UI 或公开接口。
- **输出 / 测试 / 验收：** 交付页面流程、空/错/重试和可访问性检查清单，每项写明操作与预期，标记未实测项；供 `RFC-05` 汇总。

### TVOS-UI-01｜tvOS 遥控器与焦点方案
- **负责人 / 分支 / 模块：** tvOS UI Agent，`feature/tvos-ui`，Apple TV UI 立项调研。
- **目标 / 功能：** 定义首页到详情、播放、返回的焦点顺序和恢复规则，覆盖遥控确认键、空状态和错误重试。
- **输入 / 依赖 / 数据：** [产品范围](../docs/PROJECT.md)、[UI / UX 规范](../docs/UI_UX_GUIDELINES.md)、v2 目录卡片与详情 DTO；与 `TVOS-PLAY-01` 核对播放器控制入口，可并行。
- **写入 / 禁区：** 仅新增 `docs/rfc-tvos-ui.md`；禁止创建工程、修改 Android TV 实现或公开接口。
- **输出 / 测试 / 验收：** 交付焦点流程和 Siri Remote 验收矩阵，含横向列表、打开详情及退播后焦点恢复的预期；注明模拟器与真机待验项，供 `RFC-05` 汇总。
