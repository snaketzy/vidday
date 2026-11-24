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
- **目标 / 功能：** 用全宽背景和底部渐变、宽屏左右分区及窄屏纵排组织详情；主按钮区分「播放」和「继续观看 00:13:59」；简介可展开；演职员横向排列，已看进度位于主视觉与演职员之间。**CR-010：** 元数据行在评分 / 时长 / 年份 / 分级之后渲染媒体规格「可靠子集」徽章——`isUhd`→`4K`、`hasHevc`→`HEVC`、`audioTrackCount≥2`→`音轨 n`、`subtitleTrackCount≥1`→`字幕 n`；仅影片、字段缺失即不渲染。
- **输入 / 依赖 / 数据：** [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `DETAIL-01` 至 `DETAIL-07`；CR-010（[决策](../decisions/DECISIONS.md)）；复用已有详情、演职员 API、片单、`usePlayTarget` 和 Redux 观看记录。继续观看按钮、只读进度条与播放器用同一条记录；无记录时不显示进度，无源时给出提示。有真实观看数据才显示观看区，不把推荐混入其中。
- **写入 / 禁区：** `apps/web/src/pages/title-detail-page.tsx`、`apps/web/src/components/title/movie-detail-hero.tsx`、`apps/web/src/lib/public-api.ts`、`apps/web/src/lib/title-adapter.ts`、`apps/web/src/types/index.ts`。禁改播放层、共享路由、播放器状态、服务端、数据库、剧集契约和其他平台。
- **验收 / 交付：** 在 `apps/web/` 运行 `npm run typecheck` 与 `npm run build`；用宽窄窗口分别检查有/无记录、无源、缺图、长简介、键盘操作，并保留截图；缺媒体规格字段时元数据行不出现徽章。与 `WP-02` 合测从 `13:59` 续播，返回同一详情后时间与进度同步更新，焦点回到播放入口。

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

### AU-03｜Android 影片详情页对齐 Infuse（含演职员、观看进度与 Watching）
- **负责人 / 工作树 / 分支 / 模块：** 新 Android UI 子 Agent，`viddy-android-ui` / `feature/android-ui`，AND-UI 详情页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树已含未提交的 `AP-03` 改动（`player_page.dart`、`detail_page.dart`、`api_client.dart`、`models.dart` 与新增测试），本卡必须在其之上开发并保留续播逻辑，不得回退。
- **目标 / 功能：** 按 [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `DETAIL-01` 至 `DETAIL-07` 对齐 Android 电影详情页：顶栏返回与片名、右侧次级动作；全宽背景图加底部渐变；窄屏按信息层级纵向排布（片名、显著主播放按钮、次级动作行、评分／年份／分级／时长／类型、简介内联截断并在末行显示 `MORE`，点击打开居中弹层读全文，顶部居中片名、左上角关闭）；主按钮区分「播放」与「继续观看 HH:MM:SS」；`DETAIL-06` 只读进度条位于主视觉与演职员之间（左起填充已看比例、标注已看时长与总时长，与续播位置同源）；演职员横向列表数据取 `GET /titles/:id/credits`，人物卡显示姓名与可用角色或职务；`DETAIL-03` `Watching` 区用 `GET /progress` 的真实记录，无数据不显示、不用推荐或重复海报凑数。
- **次级动作（用户确认「全部按截图占位」）：** 按参考图渲染整排次级动作；「加入 / 移出我的片单」用 `GET/PUT/DELETE /list` 实现为可操作项；无后端能力的动作（已看／下载／收藏／评分）一律置灰不可点并带提示文案，不发起网络请求、不伪造状态与结果。
- **输入 / 依赖 / 数据：** `GET /titles/:id`（`PublicTitleDetail`：`year`、`runtime`、`rating`、`maturity`、`genres`、`synopsis`／`logline`、`backdropUrl`、`posterUrl`、`playUrl`）；`GET /titles/:id/credits`（`PublicTitleCredits`，演员与职员分列，含角色或职务）；`GET/PUT/DELETE /list`（需 `x-device-id`）；`GET /progress`；现有 `TitleDetail`、`WatchProgress`、`ApiClient`（含 `x-device-id` 机制）、`RemoteImage`、`widgets.dart` 现有组件与 `AP-03` 续播交接契约。剧集详情不适用范围，保持现状，等待 `RFC-04`。
- **写入 / 禁区：** `apps/tv-android/lib/ui/detail_page.dart`、`apps/tv-android/lib/core/api_client.dart`、`apps/tv-android/lib/core/models.dart`；可新增 `apps/tv-android/test/detail_page_test.dart`。禁改 Kotlin 原生层、`player_page.dart`（只读复用其 `WatchProgress` 返回契约）、`widgets.dart`（与 `AU-01` 共享，不得触碰）、`qoe.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec`、服务端、Web、其他工作树及公开契约；详情页专用小组件以 `detail_page.dart` 内私有类实现，不入 `widgets.dart`。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；真机或模拟器用「完整数据、缺背景、长简介、无源、有／无续播记录」五类核对 `DETAIL-01` 至 `DETAIL-07`，提交首屏、演职员区、`MORE` 弹层、进度条与 `Watching` 区截图，及退播回详情后的续播与滚动状态记录；附设备／系统版本、样本、步骤与未验证项。无设备不得宣称通过。

#### AU-03-V｜手机竖屏视觉返工
- 用户最新参考图为本卡手机竖屏视觉验收基线；浅色内容区、顶部仅返回和更多、元数据位于播放按钮上方，覆盖 AU-03 原卡在此布局上的相反描述。不改全局文档或其他端规范。以 `feature/android-ui` 的 `f89eeb9c042901c53161ab496b9bfda291078e69` 加现有未提交 AU-03/AP-03 为交接基线；共享详情文件串行独占，不与其他任务同时写，保留现有交互。
- 竖屏顺序：全宽主图并渐隐到浅底、主图底部居中片名、居中时长／年份／描边分级／真实画质（如有）、纯文本类型、居中橙色播放按钮、五个等间距灰色图标、三行简介与同行 `MORE`、真实评分、横滑演职员。对照参考图按页面可用宽度匹配比例与留白。系统栏保持 Android 原生；无标题图用真实片名、未知画质或评分不伪造。保留片单、续播、只读进度及真实 Watching，有记录时按原规范出现。横屏、TV 和剧集布局不做本次视觉变更。
- 白名单仅 `apps/tv-android/lib/ui/detail_page.dart`、`apps/tv-android/test/detail_page_test.dart`；禁止改 API、播放器、共享主题或 Kotlin。单跑详情与播放器回归测试，补首屏位置断言；必须用竖屏实际渲染截图对照参考图，记录样本、差异与未验证项。禁止使用生产密钥、提交、推送或合入。

### AU-04｜电影详情页：片名中英分层、横屏播放按钮收窄、返回组件归位
- **负责人 / 工作树 / 分支 / 模块：** Android UI 子 Agent，`viddy-android-ui` / `feature/android-ui`，AND-UI 详情页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-08`、`AU-03` 改动，须在其之上开发，不得回退。
- **目标 / 功能（三项，缺一不可）：**
  1. **片名分层：** 电影片名改为**英语在上、中文在下，且中文字号比英文小一号**。
     - 数据取自 `TitleDetail.englishTitle` / `chineseTitle` / `title`。
     - 规则：两者都有 → 英文在上（大字号）、中文在下（小一号）；**只有其中一条 → 只显示该条并用大字号**；两条都缺 → 回退到 `title`。
     - 字号：宽屏布局英文沿用现字号 30sp、中文取 24sp；竖屏布局英文沿用 `(46*unit).clamp(28,52)`、中文取 `(36*unit).clamp(22,42)`。
     - 位置：竖屏仍居中且落在主视觉的渐隐区内；宽屏仍在左列顶部。**顶栏里的片名保持单行不变**（本卡不动它）。
  2. **横屏播放按钮收窄：** **仅当横屏**（`MediaQuery.size.width > size.height`）时，左列的主播放按钮宽度缩短到与**下方 5 个次级动作图标行的两侧对齐**（图标行宽度 = 5×48dp 图标 + 4×4dp 间距 = **256dp**，取不到时回退为可用宽度）；按钮与图标行**左右边界一致**。竖屏、以及宽屏但非横屏的情形**保持原全宽**，不得改动。
     - 实现建议：在 `_buildMovie` 用已算出的 `size` 判定 landscape，透传给 `_MovieBody` → `_PlayBlock`；图标尺寸/间距请复用同一组常量，避免写死后与图标行脱节。
  3. **返回组件归位（缺陷修复）：** 宽屏分支的顶栏当前是 `Stack(fit: StackFit.expand)` 的**非定位**子节点，被拉伸到整屏高度，`Row` 的 `crossAxisAlignment.center` 于是把返回按钮、片名、右侧按钮**垂直居中到了屏幕中部**。真机实测（横屏 1440 高）：返回按钮 bounds `[115,647][295,827]`，中心 y≈**737**，即屏幕竖直正中。
     - 修法：把顶栏改为 `Positioned(top: 0, left: 0, right: 0)` 包裹（`SafeArea` 继续负责系统栏与挖孔内边距），使其贴顶，返回按钮回到左上角。
- **保留（不得回退）：** 竖屏详情页形态、`GET /progress` 续播与只读进度条、片单切换、`MORE` 全文弹层、演职员与 `Watching` 区、缺背景/缺头像/长简介/无源等退化行为。
- **写入 / 禁区：** `apps/tv-android/lib/ui/detail_page.dart`；可扩展 `apps/tv-android/test/detail_page_test.dart`。禁改 `ui/widgets.dart`、`ui/player_page.dart`、`core/api_client.dart`、`core/models.dart`、`ui/shell_page.dart`、`core/catalog.dart`、`main.dart`、`pubspec`、Kotlin 原生层、服务端、Web、其他工作树及公开契约。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；测试至少覆盖：英文在上、中文在下且中文字号小于英文（断言两段文本的存在、先后与 `fontSize`）；只有英文 / 只有中文 / 两者皆无时的回退；**横屏**下返回按钮贴顶（其 `top` 落在安全区顶部附近，明显远离屏幕竖直中线）；**横屏**下播放按钮宽度等于 5 个动作图标行整体宽度（±1dp）且左右边界一致；**非横屏**下播放按钮仍为全宽；竖屏片名仍居中。附变更文件清单、真机复核说明与未验证项；真机与截图由主 Agent 负责。

### AU-05｜电影详情页：旋转到竖屏后出现遮罩、整页不可点击（缺陷修复）
- **负责人 / 工作树 / 分支 / 模块：** Android UI 子 Agent，`viddy-android-ui` / `feature/android-ui`，AND-UI 详情页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-08`、`AU-03`、`AU-04` 改动，须在其之上开发，不得回退。
- **缺陷现象（真机复现，SM-S9180，`com.vidday.tv` 1.0.16/19）：** 电影详情页**从横屏旋转回竖屏**后，页面上出现一层灰色遮罩，整页无法点击、也无法滚动；再旋转或转回竖屏都不恢复，直到重启 App。竖屏→横屏不受影响；播放页任何方向旋转均正常（已排除原生层与播放页）。
- **根因（logcat 已定位到行）：**
  ```
  I flutter : Bad state: Too many elements
  I flutter : #0  List.single (dart:core-patch/growable_array.dart:363)
  I flutter : #1  ScrollController.position (package:flutter/src/widgets/scroll_controller.dart:173)
  I flutter : #2  ScrollController.offset (package:flutter/src/widgets/scroll_controller.dart:179)
  I flutter : #3  _DetailPageState._buildPortraitMovie.<anonymous closure>.<anonymous closure> (package:vidday_tv/ui/detail_page.dart:461)
  ```
  `apps/tv-android/lib/ui/detail_page.dart` 里**同一个 `_scrollController`**（第 48 行）被「宽屏（横屏）分支」（第 236 行）与「窄竖屏分支」（第 297 行）的两个 `SingleChildScrollView` 共用。横屏→竖屏时两支是结构不同的子树，旧子树要到本帧 `finalizeTree()`（在 layout 之后）才 `unmount`，其 `ScrollPosition` 此时仍在控制器上；而新竖屏子树在 **layout 阶段**首次挂载，第 461 行的 `_scrollController.offset`（→ `position` → `_positions.single`）读到 2 个 position，抛 `Bad state: Too many elements`。该异常发生在顶栏 `AnimatedBuilder` 的 build 内，而它位于 `Positioned(top:0,left:0,right:0)` 中、高度不受限，release 版 ErrorWidget（灰块）因此被撑满整屏 —— 既遮住页面，又吞掉全部触摸。
- **目标 / 功能（只修根因，不重做设计）：**
  1. 让会读取 `offset` 的**竖屏分支**改用**独立**的 `ScrollController`（新增 `_portraitScrollController`，并在 `dispose` 中释放）：竖屏的 `SingleChildScrollView` 与顶栏 `AnimatedBuilder` 都用它。两端继续保留现有 `PageStorageKey('movie-detail-scroll')`，滚动位置恢复行为不变。宽屏分支与 `_buildSeries` 继续使用原 `_scrollController`。
  2. 读取 `offset` 前把守卫收紧为「**有且仅有一个** `ScrollPosition`」——`hasClients` 在有两个 position 时同样为真，不足以防护；按 `controller.positions.length == 1 ? controller.offset : 0` 取值。
  - 不得改动任何尺寸、间距、字号、颜色等视觉参数；不得改动宽屏分支与剧集分支的布局结构。
- **保留（不得回退）：** `AU-03`/`AU-04` 全部视觉与交互（片名中英分层、横屏播放按钮与图标行两侧对齐、返回按钮贴顶、续播与只读进度条、`MORE` 全文弹层、演职员、`Watching`、片单切换），以及 `AP-04`~`AP-08` 的播放页改动。
- **写入 / 禁区：** `apps/tv-android/lib/ui/detail_page.dart`；可扩展 `apps/tv-android/test/detail_page_test.dart`。禁改 `ui/widgets.dart`、`ui/player_page.dart`、`core/api_client.dart`、`core/models.dart`、`ui/shell_page.dart`、`core/catalog.dart`、`main.dart`、`pubspec`、Kotlin 原生层、服务端、Web、其他工作树及公开契约。
- **输出 / 验收 / 交付：**
  - 回归用例（**先证伪、再修**）：在 `test/detail_page_test.dart` 用注入式 `_FakeApi` 挂载电影详情页，先以横屏尺寸（如 `900×420`，命中宽屏分支）`pumpWidget`，再把尺寸改成竖屏（如 `420×900`，命中竖屏分支）并在**同一元素树内** `pump`，断言该帧无异常（`tester.takeException()` 为 `null`）。先在未修改代码时运行，确认报出 `Bad state: Too many elements`，再修代码使其通过，并把两次输出都记进完成报告。
  - 运行 `flutter test test/detail_page_test.dart`（既有用例与新增用例全过），并对改动文件确认无新增分析告警。`test/widget_test.dart` 的既有编译错误不在白名单内，如实登记即可，不作为本卡阻塞项。
  - 交付 Git Commit、变更文件清单、测试输出与真机复核说明；release 包与真机复验由主 Agent 负责。

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
