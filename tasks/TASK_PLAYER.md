# 播放器任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### AP-01｜Android QoE 批次串行
- **负责人 / 分支 / 模块：** Android 播放 Agent，`feature/android-tv-player`，AND-PLAY 遥测。
- **目标 / 功能：** 串行周期与终止 flush，成功只移除该批，失败保留待重试；终止报告含 `endedAt`。
- **输入 / 依赖 / 数据：** `QA-01`；`POST /qoe` v2 的累计 session、增量 events 和 `accepted`；不可宣称服务端事件去重。
- **写入 / 禁区：** `apps/tv-android/lib/core/qoe.dart`、新增 `apps/tv-android/test/qoe_test.dart`；禁改 UI、通道、服务端和表。
- **输出 / 验收 / 交付：** `flutter analyze/test`，假时钟覆盖慢请求、退出竞态、失败重试和批次边界；附请求时序样本。

### AP-03｜Android 播放器交互对齐 Infuse（含观看进度保存与续播）
- **负责人 / 工作树 / 分支 / 模块：** 新 Android UI 子 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页与详情页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。
- **目标 / 功能：** 按 [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `PLAY-01` 至 `PLAY-04` 对齐 Android 播放页；`PLAY-05` 桌面双层控制条不适用于 Android，不实施。接入 `GET/PUT /progress`：详情页显示「继续观看 HH:MM:SS」并从此位置起播；暂停、退播、退后台时上报；达到 98% 或记录无效时从头播放；退播回详情刷新续播状态。仅电影接入，剧集等待 `RFC-04`。
- **输入 / 依赖 / 数据：** `GET /progress`、`PUT /progress`（`titleId,episodeId?,position,duration,percent,updatedAt?`，秒/秒/0–100/UTC ISO）；`PublicWatchProgress`；现有 `PlayerSnapshot`、`NativePlayerController`、HLS 与外挂 PGS；`QA-01` 恢复 Flutter 测试。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`、`apps/tv-android/lib/ui/detail_page.dart`、`apps/tv-android/lib/core/api_client.dart`、`apps/tv-android/lib/core/models.dart`，可新增 `apps/tv-android/test/player_progress_test.dart`；禁改 Kotlin 原生层、`PlayerPlugin.kt`、PGS 解码器、`qoe.dart`、其他 UI 页面、`main.dart`、`pubspec`、服务端、Web 和公开契约。
- **输出 / 验收 / 交付：** `flutter analyze`、`flutter test`、`flutter build apk --debug`（环境缺 SDK 时记录阻塞）；真机或模拟器验证 `PLAY-01` 至 `PLAY-04`、进度保存与续播、98% 从头播放、退播刷新；附设备/系统版本、样本、步骤、截图或录屏和未验证项。无设备不得宣称通过。

### AP-04｜Android 播放页对齐 Web 端（视觉与布局）
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`、`AU-03` 改动（`player_page.dart` 等），须在其之上开发，保留续播与进度上报逻辑，不得回退。
- **目标 / 功能：** 以已交付的 Web 播放器为唯一视觉基准，对齐 Android 播放页的**视觉与布局**，竖屏与全屏（横屏）使用同一套布局，只按可用宽度自适应。基准文件：[video-player.tsx](../apps/web/src/components/title/video-player.tsx)、[playback-controls.tsx](../apps/web/src/components/title/playback-controls.tsx)。**本轮不改交互模型**：设置与音量沿用现有弹出方式。
- **对齐要点（按 Web 实测值折算）：**
  - 底部控制面板：由现在的通栏渐变条改为**底部居中悬浮面板**——距底 12dp（宽屏 24dp）、宽度 `calc(100% - 16dp)` 且不超过 768dp、圆角 12dp、1dp `white/15` 描边、背景 `black/85`、投影、毛玻璃；内边距 8dp（宽屏 16dp），行间距 6dp（宽屏 8dp）。
  - 面板第一行三栏：**左**音量入口；**中**「后退 10 秒 / 播放暂停 / 前进 10 秒」，其中播放暂停为**白底黑图标圆形**（直径 32dp，宽屏 40dp），前后跳转为 ghost 图标按钮；**右**设置齿轮、画中画（设备支持时）、全屏（支持时）。
  - 面板第二行时间轴：**左**当前时间（右对齐、等宽数字、12sp、`white/85`）→ **中**进度条（视觉轨道高 4dp，已缓冲 `white/35`，已播放用品牌色，滑块 12dp 圆形品牌色）→ **右**总时长（12sp、`white/70`）。拖动时在进度条上方显示目标时间气泡（`black/90`、小圆角、小号等宽数字）。
  - 顶部信息栏：顶部渐变 `black/85` → 透明，内边距 16dp；返回按钮 + 片名（单行省略）；右侧「关闭 / 返回详情」入口。
  - **移除现有的画面中央大按钮簇**（Web 无此结构，播放暂停已收进控制面板）；点击画面仍切换控制条显隐。
- **保留（不得回退或删减）：** 外挂 PGS 加载提示、缓冲与首帧加载指示、字幕 / 音轨 / 画质选择、画中画、全屏切换、`GET/PUT /progress` 进度上报与退播回传、QoE 上报、`PLAY-01` 至 `PLAY-04` 既有行为（不自动全屏、一次点击只进一次播放）。
- **规范冲突处理：** 触摸目标须保持 ≥48dp（[UI / UX 规范](../docs/UI_UX_GUIDELINES.md)），故图标**视觉尺寸向 Web 靠拢（约 20–22dp），命中区维持 ≥48dp**，不得为对齐而缩小可点区域。**已知色差：** Web 品牌色为 `#e50914`，Android 现用 `kAccent = #A31621`，且 `kAccent` 定义在禁改的 `widgets.dart`；本卡沿用 `kAccent`，把该色差作为待主 Agent 决策项登记，不擅自改共享常量。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；可新增或扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 Kotlin 原生层（`NativePlayerView.kt`、`PlayerPlugin.kt`、PGS 解码器）、`widgets.dart`、`core/native_player.dart`、`qoe.dart`、`detail_page.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；Widget 测试至少覆盖控件顺序与三栏分布、播放暂停为白底黑图标、时间轴两侧时间文本与拖动气泡、面板在窄屏与宽屏（含全屏横屏）走同一套布局；附 Web 基准对照说明、变更文件清单与未验证项。真机与录屏由主 Agent 负责，无设备不得宣称通过。

### AP-05｜Android 音量控制对齐 Web（含静音切换）
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`、`AU-03`、`AP-04` 改动，须在其之上开发，不得回退。
- **目标 / 功能：** 把音量入口按 Web 端对齐，**补上静音切换**。基准是 [video-player.tsx](../apps/web/src/components/title/video-player.tsx) 的音量 Popover（约 2102–2134 行），其内容自上而下为：①「静音 / 取消静音」切换按钮（带音量图标）；② 一行「音量」标签 + 百分比读数（静音时为 `0%`）；③ 音量滑块。Android 现有弹层只有一个「图标 + 滑块 + 百分比」的横排，缺 ① 与 ② 的标签结构。
- **实现约束（重要）：**
  - **不得新增或修改原生通道方法。** `vidday/player`（`setVolume` 等）属公开契约；本轮只改 Dart 层。
  - 原生已把静音定义为「音量为 0」：[NativePlayerView.kt](../apps/tv-android/android/app/src/main/kotlin/com/vidday/vidday_tv/NativePlayerView.kt) 的 `setVolume` 内 `muted = (clamped == 0f)`，并把 `muted` 随快照下发。因此**静音 = `setVolume(0)`**；**取消静音 = 恢复静音前的非零音量**（在页面状态里记 `_lastVolume`，初值 1.0；用户把音量拖到 0 以外的值时同步更新它）。
  - **状态以快照为唯一来源**：`snapshot.muted` / `snapshot.volume` 决定图标、按钮文案与百分比，不要另建一个与快照冲突的本地布尔。注意弹层是独立路由，页面 `setState` 不会重建它——需在弹层内部用 `ValueListenableBuilder<PlayerSnapshot>`（监听 `_controller.snapshot`）或等价方式让弹层跟随真实状态刷新。
  - **保留现有弹出方式**（bottom sheet），不改成交互模型；用户已确认设置与音量沿用现有弹层。
  - 面板上的音量按钮图标继续随状态变化（`volume_off` / `volume_down` / `volume_up`），沿用现有实现。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；可扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 Kotlin 原生层（`NativePlayerView.kt`、`PlayerPlugin.kt`、PGS 解码器）、`core/native_player.dart`（通道封装）、`widgets.dart`、`qoe.dart`、`detail_page.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；Widget 测试至少覆盖：静音按钮存在且文案随状态在「静音 / 取消静音」间切换；点击静音后调用 `setVolume(0)`；点击取消静音后恢复到静音前的音量（含「静音前为 0 时回落到 1.0」）；滑块拖动改变音量且百分比读数与快照一致；静音时百分比显示 `0%`。附变更文件清单、Web 基准对照与未验证项。真机与录屏由主 Agent 负责。

### AP-06｜Android 播放页收尾：品牌色、去毛玻璃、横屏面板与轨道按钮拆分
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页 + AND-UI 品牌色；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`、`AU-03`、`AP-04`、`AP-05` 改动，须在其之上开发，不得回退。
- **授权说明：** 本卡经**用户当面批准**，把品牌色常量统一为 Web 的 `#e50914`，并因此**放开 `apps/tv-android/lib/ui/widgets.dart` 的写入**（原 AP-04/AP-05 禁改该项）。该授权仅覆盖 `kAccent` 常量本身，不改变该文件的其它内容；`widgets.dart` 与 `AU-01`（`feature/android-tv-ui` 工作树）共享，本轮只此一位 Agent 写入。
- **目标 / 功能（四项，缺一不可）：**
  1. **品牌色统一：** `apps/tv-android/lib/ui/widgets.dart` 的 `kAccent` 由 `Color(0xFFA31621)` 改为 `Color(0xFFE50914)`，与 Web `--brand`（`apps/web/src/styles/globals.css`）一致；保留常量名与用法不变，注释更新为「与 Web 端 `--brand` 同色」。该常量被详情页、播放页、首页卡片等复用，颜色会整体变化，属预期。
  2. **毛玻璃退化为纯半透明：** 移除 `player_page.dart` 控制面板里的 `BackdropFilter` 与 `ImageFilter.blur`，面板背景保持纯半透明（现为 `black` 85%）；同时清理因此不再需要的 `ClipRRect` 与 `dart:ui` 导入（若仍被其它地方使用则保留）。外层投影保留。
  3. **横屏面板形态：** 横屏（`MediaQuery.orientation == Orientation.landscape`）下控制面板宽度为屏幕宽度的 **3/4**、**水平居中**，且位置在现有基础上**略微上浮**（竖屏保持距底 12dp；横屏由 24dp 上浮到 36dp 左右，可在 32–40dp 内取整）。现有 `maxWidth 768` 作为上限保留；竖屏形态不变。
  4. **轨道控制拆成三个独立按钮：** 移除原「设置」齿轮及其合并弹层，改为面板内 **字幕 / 音频 / 画质** 三个独立按钮，各自打开只含该分组的弹层，分别控制。字幕弹层仍需含「关闭字幕」项；音频无轨道时保留不可点的「暂无音轨」占位；画质需含「自动」加各档位；当前项保持选中态。画中画与全屏按钮位置与行为不变。
- **布局约束（因新增按钮）：** 控件行新增 3 个按钮后，**窄屏（compact）允许控制行分行/换行排布**以避免溢出，但**触摸目标必须保持 ≥48dp**，不得靠缩小命中区或整体缩放来塞进一行；宽屏（横屏）保持单行。必须验证窄屏（例如 360dp 宽）下无溢出，横屏下仍为单行且面板宽度符合 3/4。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`、`apps/tv-android/lib/ui/widgets.dart`（**仅 `kAccent` 常量**）；可扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 Kotlin 原生层（`NativePlayerView.kt`、`PlayerPlugin.kt`、PGS 解码器）、`core/native_player.dart`、`core/qoe.dart`、`ui/detail_page.dart`、`ui/shell_page.dart`、`core/catalog.dart`、`main.dart`、`pubspec`、Web 端、服务端、其他工作树及公开契约；`widgets.dart` 内除 `kAccent` 外一行都不得改动。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；测试至少覆盖：`kAccent` 等于 `#E50914`；面板内存在字幕 / 音频 / 画质三个独立按钮且**不再存在**设置按钮，各自弹层只含对应分组；窄屏（360dp）无溢出且触摸目标 ≥48dp；横屏面板宽度为屏幕的 3/4 且水平居中；毛玻璃已移除（面板不再包含 `BackdropFilter`）。附变更文件清单、与 Web 的对照说明及未验证项。真机与截图由主 Agent 负责。

### AP-07｜横屏控制行溢出修正
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-06` 改动，须在其之上开发，不得回退。
- **缺陷（主 Agent 真机实测发现）：** `AP-06` 把面板改成横屏 3/4 宽并居中后，第一行仍用宽屏三栏 `[1fr, auto, 1fr]`。右侧一组此时有 5 个按钮（字幕 / 音频 / 画质 / 画中画 / 全屏）共 240dp，而它分到的列宽只有约 203dp，**溢出约 37dp**。设备实测：面板内容区为 `[537, 2651]`，但右侧最后一个按钮（退出全屏）右边缘落在 **2794**，凸出面板约 **143px**。
- **根因与修法：** 三栏等宽分配无法容纳「左侧 1 个 + 右侧 5 个」的不对称分布。横屏改为**左右贴边、中间绝对居中**的排布（如 `Stack` 内左/中/右三组分别 `Align.centerLeft` / `Align.center` / `Align.centerRight`，或等价的 `Center` + `Align` 组合），使三个播放控件仍位于面板正中、左右两组各自贴边，且**总宽（左 48dp + 中约 160dp + 右 240dp）必须落在面板内容宽度之内，不得溢出**。竖屏 compact 的 `Wrap` 换行方案保持不变。
- **回归要求：** `AP-06` 的其余三项（品牌色 `#E50914`、去毛玻璃、面板 3/4 宽 + 居中 + 上浮 36dp）不得回退。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；可扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 `widgets.dart`、Kotlin 原生层、`core/native_player.dart`、`qoe.dart`、`detail_page.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；测试须在**会触发原缺陷的横屏尺寸**（面板内容宽度不足以容纳 240dp×2+160dp 的等分，例如 780×380）下渲染，断言无溢出异常；并断言横屏三个播放控件的中心与屏幕中心一致（±2dp）、最右控件不超出面板右边界。附变更文件清单与未验证项；真机复验由主 Agent 负责。

### AP-08｜控制面板按钮顺序与横屏单行居中
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-07` 改动，须在其之上开发，不得回退。
- **目标 / 功能：** 按**用户指定的顺序**重排控制面板第一行的按钮，并据此消除 `AP-07` 遗留的「中组与右组重叠」问题。指定顺序（共 9 个，不可增删、不可调序）：
  1. 音量　2. 画质　3. 音轨　4. 后退 10 秒　5. 播放 / 暂停　6. 前进 10 秒　7. 字幕　8. 画中画　9. 全屏
- **布局：** 该顺序左中右各 3 个，天然对称。
  - 横屏：**单行、在面板内容区内水平居中排列**（9×48dp = 432dp，面板内容宽约 565dp，可容纳且不溢出）；此时第 5 个「播放 / 暂停」**恰好落在面板正中**，无需再做分组贴边，`AP-07` 的「Stack 左/中/右三组贴边」方案由本卡取代。
  - 竖屏：同一顺序，空间不足时**换行**（如 `Wrap`，居中），**不得溢出**。
  - 两种朝向的每个按钮**触摸目标均须 ≥48dp**。
- **保留：** 画质 / 音轨 / 字幕仍是**三个独立按钮、各自打开只含本分组的弹层**（原 `AP-06` 要求）；品牌色 `kAccent = Color(0xFFE50914)`、面板纯半透明（无 `BackdropFilter`）、横屏面板宽度为屏幕 3/4 且水平居中、底边距上浮约 36dp——均不得回退。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；可扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 `widgets.dart`、Kotlin 原生层、`core/native_player.dart`、`qoe.dart`、`detail_page.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：** `dart analyze lib test`、`flutter test`、`flutter build apk --debug`；测试须断言：横屏下 9 个按钮按上述顺序出现在同一行且**无溢出**；第 5 个（播放 / 暂停）水平中心与面板中心一致（±2dp）；第 1 与第 9 个按钮均不超出面板内容区边界（即不再有 `AP-07` 的重叠/凸出）；竖屏（如 360dp 宽）无溢出且各按钮命中区 ≥48dp；三个轨道按钮的独立弹层与顺序不受影响。

### AP-09｜中央播放控制簇：快退 / 暂停 / 快进移到画面中央并放大
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-08`、`AU-03`~`AU-05` 改动，须在其之上开发，不得回退。
- **目标 / 功能（用户当面确认三项，均为硬性）：**
  1. **移到中央：** 把「后退 10 秒 / 播放暂停 / 前进 10 秒」从底部控制面板**删除**，改为画面**正中央**的悬浮按钮簇：中间为播放 / 暂停，两侧为后退 / 前进。三个按钮整体**水平居中、垂直居中**于播放区域；底部面板**不得**再保留这三个按钮的副本（不重复、不留残影）。
  2. **放大：** 中央为**直径 64dp** 的圆形按钮、图标 **32dp**；两侧各为**直径 56dp** 的圆形按钮、图标 **28dp**（约 1:2 的图标圆盘比，与 Web 移动端一致）。三个按钮的命中区不小于自身直径（≥64dp / ≥56dp）。视觉沿用 Web 移动端：`Color(0x73000000)`（black/45）半透明圆底 + 白色图标，圆角为圆；簇内相邻间距 **32dp**（对齐 Web 的 `gap-8`）。不新增毛玻璃。
  3. **可见性：** 与顶部信息栏、底部控制面板**同一套**显隐时机——仅在 `_controlsVisible` 为真且非 PiP 时显示（即共用 `_buildControls` 的既有条件）；点击画面唤出、超时由 `_scheduleHide()` 自动隐藏的行为不变；点击簇内任一按钮后同样调用 `_scheduleHide()`，不得让控制条常驻。
- **底部面板随之调整为 6 个按钮（相对顺序不得变）：** 删除原第 4、5、6 项后为
  1. 音量　2. 画质　3. 音轨　4. 字幕　5. 画中画（设备支持时才有）　6. 全屏
  - 横屏：仍在面板内容区内**单行水平居中**、无溢出；竖屏：仍**居中换行**、无溢出；每个按钮命中区仍 ≥48dp。
- **保留（不得回退）：** `AP-05` 音量弹层与静音切换；画质 / 音轨 / 字幕三个独立按钮与各自弹层；`AP-06` 的品牌色 `kAccent = Color(0xFFE50914)`、面板纯半透明（无 `BackdropFilter`）、横屏面板宽度为屏幕 3/4 且水平居中、底边距上浮约 36dp；面板第二行时间轴与**拖动预览**行为；顶部信息栏；`AP-03` 的续播与进度上报。
- **输入 / 依赖 / 数据：** 现有 `_togglePlay`、`_controller.seekBy(±_seekStep)`、`_seekStep`、`_scheduleHide()`、`_keepVisible`、`_controlsVisible`、`_buildControls`；`PlayerSnapshot.isPlaying` / `inPip`；键 `kPlayerPlayPauseKey`、`kPlayerControlPanelKey`；Web 视觉基准 `apps/web/src/components/title/video-player.tsx` 第 1794-1846 行（移动端中央簇：快退快进 `size-12 md:size-14`、播放 `size-16 md:size-20`、`bg-black/45`、`gap-8`）。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；**必须同步更新** `apps/tv-android/test/player_controls_test.dart`（其中针对「9 个按钮」「第 5 个播放键落在面板正中」等断言因本卡失效，须改写为 6 个按钮的顺序断言 + 中央簇的几何/尺寸断言）。禁改 `ui/widgets.dart`、Kotlin 原生层、`core/native_player.dart`、`qoe.dart`、`detail_page.dart`、`shell_page.dart`、`catalog.dart`、`main.dart`、`pubspec.yaml`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：**
  - 运行 `flutter test test/player_controls_test.dart test/player_progress_test.dart`（全过）与对改动文件的分析无新增告警。测试须断言：
    - 竖屏（420×900）与横屏（900×420）下中央簇存在：`Icons.replay_10`、`Icons.play_arrow`/`Icons.pause`、`Icons.forward_10` 各一个；**播放键中心与画面（`SafeArea` 内容区）中心一致（±2dp）**；三个按钮的垂直中心一致（±2dp）；
    - 播放 / 暂停圆盘直径 **64dp**、两侧命中区 ≥**56dp**（尺寸断言）；
    - 底部面板 `kPlayerControlPanelKey` 内**不再包含**这三个控件（`findsNothing`），且面板内按钮顺序为 音量 → 画质 → 音轨 → 字幕 →（画中画）→ 全屏，横屏同一行无溢出、竖屏无溢出；
    - 中央簇位于 `_buildControls` 的显隐条件内：控制条隐藏时中央簇也不可见；
    - 点按中央播放键 / 快退 / 快进仍分别触发播放暂停与 ±10 秒（沿用既有假通道断言方式）；
    - `AP-06` 的品牌色、面板宽度与半透明断言仍通过。
  - 附变更文件清单、测试输出与真机复核说明；release 包与真机复验由主 Agent 负责。

### AP-10｜横屏面板紧凑化，让出中央簇空间（用户指定数值）
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-09`、`AU-03`~`AU-05` 改动，须在其之上开发，不得回退。
- **缺陷（真机像素实测，`AP-09` 验收时发现）：** 横屏下 `AP-09` 的中央簇**下半部被底部控制面板遮挡**。证据：面板上缘（1dp `white/15` 描边，像素 38,38,38）在 **y≈734px**，中央簇纵向跨 **617–857px**，重叠 **123px ≈ 33dp**；在播放键中轴 x=1594 逐行取样，白图标在 y=720–730 为 (229,226,223)，到 **y=733 骤降为 (66,66,66)**、y=738–750 为 (31~32)，即白图标被面板 `black/85` 压掉一半。根因是横屏仅 384dp 高，而面板高 136dp + 底边距 36dp，上缘顶到屏幕中心附近，属硬几何冲突。
- **目标 / 功能（用户批准的具体数值，仅横屏生效）：**
  - 面板**底边距**：36dp → **16dp**
  - 面板**内边距**：16dp → **8dp**
  - 面板两行**行距**：8dp → **6dp**
  - 期望结果：面板高度 136dp → **118dp**，面板上缘由 734px 下移到约 **877px**，与中央簇下缘（857px）留约 20px（≈5dp）间隙，不再遮挡。
  - 建议实现（保持判定语义清晰）：`bottomGap = landscape ? 16 : (compact ? 12 : 24)`；`padding = (landscape || compact) ? 8 : 16`；`rowGap = (landscape || compact) ? 6 : 8`。
- **明确取代：** 本卡取代 `AP-06` 中「横屏面板底边距上浮约 36dp」这一项（改为 16dp），其余 `AP-06` 约束全部保留。
- **不得改动：** 中央簇的位置与尺寸（仍**水平与垂直几何居中**、播放 64dp / 快退快进 56dp / 间距 32dp，不得为了避让而移动它）；横屏面板宽度仍为 `min(screenWidth*0.75, 768)` 且水平居中；圆角 12dp、1dp `white/15` 描边、`black/85` 背景、**无 `BackdropFilter`**；**竖屏**面板的底边距（compact 12dp / 常规 24dp）、内边距（8 / 16dp）、行距（6 / 8dp）**一律不动**；面板第一行 6 个按钮的顺序（音量/画质/音轨/字幕/画中画/全屏）与命中区 ≥48dp；第二行时间轴与拖动预览。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；可扩展 `apps/tv-android/test/player_controls_test.dart`。禁改 `ui/widgets.dart`、Kotlin 原生层、`core/**`、`ui/detail_page.dart`、`ui/shell_page.dart`、`main.dart`、`pubspec.yaml`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：**
  - `flutter test test/player_controls_test.dart test/player_progress_test.dart` 全过；对改动文件分析无新增告警。
  - 测试须新增断言：在**横屏**（`900×420` 与 `780×380`）下，**面板矩形不覆盖中央簇**——`panel.top >= centerCluster.bottom`（并要求至少 4dp 间隙）；且面板在两个横屏尺寸下均无 `RenderFlex` 溢出。同时断言**竖屏**（`420×900`）面板的底边距/内边距/行距**未被改动**（可用面板矩形与已知值比对，或断言竖屏面板高度与改动前一致）。
  - 附变更文件清单、测试输出与真机复核说明；release 包与真机复验由主 Agent 负责（主 Agent 会再用模糊截图像素扫描复核「面板上缘 > 中央簇下缘」）。

### AP-11｜横屏：进度条移到顶栏，底部面板恢复 AP-06 外观（用户指定）
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-10`、`AU-03`~`AU-05` 改动，须在其之上开发，不得回退。
- **背景：** `AP-10` 靠压缩横屏面板把中央簇与面板的间隙做到约 4.8dp，偏紧。用户提出把**进度条移到屏幕上方**，并已确认：**实施该方案，同时把底部面板恢复成 `AP-06` 的外观**。
- **目标 / 功能（仅横屏生效，竖屏一律不动）：**
  1. **时间轴行上移到顶栏**：把 `[当前时间][进度条][总时长]`（即 `_buildPanelTimelineRow`）从底部控制面板移到 `_buildTopBar` 内，置于**标题行下方**，与标题行间距 **6dp**。顶栏的 `from-black/85 to-transparent` 渐变继续覆盖这一行，保证可读性。时间轴宽度**铺满顶栏内容宽度**，不额外加 `maxWidth`。
  2. **顶栏横屏内边距收紧**：横屏取 `EdgeInsets.symmetric(horizontal: 16, vertical: 8)`（横向仍 16dp，保持与底部面板一致；纵向 16→8dp 腾高度）。竖屏仍为 `EdgeInsets.all(16)`。
  3. **底部面板恢复 `AP-06` 取值**：`bottomGap = landscape ? 36 : (compact ? 12 : 24)`；`padding = compact ? 8 : 16`；`rowGap = compact ? 6 : 8`（即**撤销 `AP-10` 的三项改动**）。横屏面板此时只有按钮行一行（时间轴已移走），`rowGap` 与时间轴行在横屏不再渲染；竖屏仍是「按钮行 + 行距 + 时间轴行」两行。
  4. **不得改动**：中央簇位置与尺寸（仍水平与垂直几何居中、播放 64dp / 两侧 56dp / 间距 32dp / 图标 32、28dp）——不得为了避让而移动它；横屏面板宽度仍 `min(screenWidth*0.75, 768)` 且水平居中；圆角 12dp、1dp `Color(0x26FFFFFF)` 描边、`Color(0xD9000000)` 背景、**无 `BackdropFilter`**；面板第一行 6 个按钮的顺序（音量→画质→音轨→字幕→（画中画）→全屏）与命中区 ≥48dp；`AP-05` 音量弹层与静音切换；三个轨道弹层；`AP-03` 续播与进度上报；拖动预览行为。
- **预期几何（横屏 384dp 高，密度 600，1dp=3.75px）：**
  - 顶栏：`8 + 48 + 6 + 50 + 8 = 120dp = 450px`，自安全区顶（约 90px）到 **约 540px**；中央簇上缘 **617px** → 上方间隙 **约 20.5dp**
  - 底部面板：`16 + 48 + 16 = 80dp = 300px`，底边距 36dp + 安全区 16dp → 面板 **945–1245px**；中央簇下缘 **857px** → 下方间隙 **约 23.5dp**
  - 竖屏完全不变（面板 120dp、顶栏不含时间轴）
- **明确取代：** 本卡撤销 `AP-10` 对 `bottomGap / padding / rowGap` 的三项改动（恢复 `AP-06` 原值），并把 `AP-06`「面板第二行时间轴在底部」改为**横屏时时间轴在顶栏**；`AP-06` 其余约束全部保留。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；**必须同步更新** `apps/tv-android/test/player_controls_test.dart`（既有断言里凡假定「进度条/时间文本属于 `kPlayerControlPanelKey` 的后代」「横屏面板是两行」「横屏面板高 120dp / 内边距 8dp / 底边距 16dp」的，全部失效，须逐条改写）。禁改 `ui/widgets.dart`、Kotlin 原生层、`core/**`、`ui/detail_page.dart`、`ui/shell_page.dart`、`main.dart`、`pubspec.yaml`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：**
  - `flutter test test/player_controls_test.dart test/player_progress_test.dart` 全过；对改动文件分析无新增告警。
  - 测试须断言（横屏 `900×420` 与 `780×380`、竖屏 `420×900`）：
    - 横屏：`kPlayerSeekBarKey` 的矩形在**顶栏**内（其 `bottom <= 中央簇.top - 4`），且**不在** `kPlayerControlPanelKey` 的后代中（`findsNothing`）；时间文本同理在顶栏侧；
    - 横屏：`面板.top >= 中央簇.bottom + 4`（面板不再与中央簇重叠），面板高度为 **80dp**（±1dp）；
    - 竖屏：`kPlayerSeekBarKey` 仍是 `kPlayerControlPanelKey` 的后代（`findsOneWidget`），面板仍为两行、高度 **120dp**（±1dp），且面板底边距仍 12dp（compact）；
    - 中央簇仍几何居中（播放键中心与画面中心 ±2dp）、尺寸 64dp / 56dp、间距 32dp（`AP-09` 断言继续通过）；
    - 既有 `AP-06` 断言（横屏面板宽度 `min(width*0.75, 768)`、`kAccent == Color(0xFFE50914)`、无 `BackdropFilter`）继续通过。
  - 附变更文件清单、测试输出，以及三种尺寸下实测的顶栏 / 中央簇 / 面板矩形与两处间隙（dp）；release 包与真机复验由主 Agent 负责（主 Agent 会用真机模糊截图像素扫描复核「顶栏下缘 < 中央簇上缘」「面板上缘 > 中央簇下缘」）。
- **已知风险（需在报告中登记）：** 横屏进度条贴屏幕顶端，下拉通知栏的系统手势可能与拖动定位冲突；用户已知悉并选择该方案。

### AP-12｜播放器交互重设计：回退基线三段式骨架并对齐 Web（用户指定）
- **负责人 / 工作树 / 分支 / 模块：** Android 播放 Agent，`viddy-android-ui` / `feature/android-ui`，AND-PLAY 播放页；基线 `f89eeb9c042901c53161ab496b9bfda291078e69`。该工作树含未提交的 `AP-03`~`AP-11`、`AU-03`~`AU-05` 改动。
- **用户指令：** 「播放器退回初始状态，和 web 端一致，重新设计交互方式」。即：**放弃 `AP-09`/`AP-10`/`AP-11` 在播放页上叠加的布局补丁**，回到基线骨架，再按 Web 端重做交互。
- **关键前提（主 Agent 已核实）：** 基线 `apps/tv-android/lib/ui/player_page.dart`（`git show f89eeb9:...`，776 行）本来就是
  ```
  SafeArea > Column[ _buildTopBar(), Expanded(Center(_buildCenterControls())), _buildBottomBar(snapshot) ]
  ```
  中央簇居中于**顶栏与底栏之间的可用区域**，**结构上不可能与底栏重叠**。`AP-09` 起的「Stack + Align 几何居中」才是需要靠压缩面板/上移时间轴来补漏洞的根因，本卡将其撤销。
- **目标 1｜骨架回退到基线的三段式（Stack 悬浮布局撤销）**
  - `_buildControls(snapshot)` 改回 `SafeArea > Column` 三段：顶栏 / `Expanded(Center(中央簇))` / 底栏。中央簇**不再**用 `Stack` + `Align(center)` 悬浮。
  - 中央簇：保留 `AP-09` 被用户指定的尺寸与样式——播放/暂停 **64dp**、两侧 **56dp**、间距 **32dp**、`Color(0x73000000)` 圆底 + 白图标、图标 32/28dp；保留公开键 `kPlayerCenterControlsKey` 与 `kPlayerPlayPauseKey`。改动它的**位置来源**（由悬浮改为列内居中），不改尺寸。
  - 底栏恢复为 `AP-06` 形态的圆角浮层（圆角 12dp、`Color(0xD9000000)`、1dp `Color(0x26FFFFFF)` 描边、**无 `BackdropFilter`**），**两行恒有，且顺序对齐 Web**：**上排 = 6 个次级按钮**（音量 → 画质 → 音轨 → 字幕 →（画中画）→ 全屏，居中、命中区 ≥48dp），**下排 = 时间轴**（`[当前时间][进度条][总时长]`）。
  - 撤销 `AP-11` 的「横屏时间轴进顶栏」：`_buildTopBar` 恢复为单行（返回 / 片名 / 关闭），**内边距统一 16dp**（撤销 `AP-11` 的横屏 16/8 特例）；时间轴回到底栏。
  - 撤销 `AP-10` 的横屏面板压缩，底栏取值恢复 `AP-06`：`bottomGap = landscape ? 36 : (compact ? 12 : 24)`、`padding = compact ? 8 : 16`、`rowGap = compact ? 6 : 8`；横屏宽度 `min(screenWidth*0.75, 768)` 且水平居中。
  - 新增公开常量键 `kPlayerTopBarKey`，供测试断言「时间轴不在顶栏内」。
- **目标 2｜交互对齐 Web（本卡的「重新设计交互方式」主体）**
  1. **自动隐藏超时 4s → 3.2s**（Web `video-player.tsx:70` `const CONTROLS_TIMEOUT = 3200`）。
  2. **仅在播放中才计时隐藏**（Web `video-player.tsx:1532-1534` `if (playerRef.current.isPlaying) { hideTimer = setTimeout(..., 3200) }`）：暂停、播放结束、缓冲中一律**取消计时、控件常驻**。当前实现是「无论是否播放都固定 4s 后隐藏」，必须改掉。
  3. **显隐带 300ms 淡入淡出**（Web 顶栏与底栏均 `transition-opacity duration-300`，见 `video-player.tsx:1987`、`:2094`），且**隐藏态不可点**（对应 Web 的 `pointer-events-none opacity-0`）。实现用 `AnimatedOpacity(duration: 300ms)` + `IgnorePointer`。
  4. **唤出触发对齐 Web 的 `wakeFromPointer`**（`video-player.tsx:1766` 绑 `onMouseMove`、点击、悬停）：除现有的「单击画面」外，**画面上任意触摸按下/拖动都应唤出控件并重置计时**（触屏上等价于鼠标移动），用 `GestureDetector` 的 `onTapDown` 或外层 `Listener(onPointerDown:)` 实现；底栏与顶栏内部控件上的交互同样重置计时（沿用现有 `_keepVisible`/`_scheduleHide` 机制）。
  5. **单击画面语义（有意保留的触屏差异，须在代码注释与报告中写明）：** 仍是「切换控件显隐」，**不**改成 Web 的「单击 = 播放/暂停」。理由：Web 的 `onClick={() => { togglePlayback(); wake() }}`（`video-player.tsx:1784-1792`）依赖鼠标 `mousemove` 唤出控件的语境；Android 无 hover，若单击即播放/暂停，则「播放中想看到控制条必须先暂停」。本项按 [PLAY-04](../docs/UI_UX_GUIDELINES.md)「平台差异单独列出」处理。
  6. 中央簇的按钮点击后仍调用 `_scheduleHide()`；进度条拖动预览、释放后提交、拖动不暂停画面等既有行为保持不变。
- **保留（不得回退的功能契约）：** `PlayerPage` 构造签名与调用契约（`startPosition`、`qoe`、`api` 等，`detail_page.dart` 依赖）；`AP-03` 续播起点与「播放→暂停」上报进度；`AP-01` QoE 上报；`AP-05` 音量弹层与静音切换；`AP-06` 的 `kAccent = Color(0xFFE50914)`、无毛玻璃、画质/音轨/字幕**三个独立按钮与各自弹层**（**不**改成 Web 的单个齿轮菜单）；PiP 与全屏；字幕加载指示器；错误态与重试。
- **有意与 Web 不一致（须登记）：** ① 单击画面语义见上；② 底栏**不**重复放「后退/播放/前进」（Web 移动端中央簇与底栏中列重复，而 `AP-09` 已由用户确认「从底部移除，只留中央」）；③ 轨道设置沿用 3 个独立按钮而非单个齿轮菜单（`AP-06` 用户指定）。
- **写入 / 禁区：** `apps/tv-android/lib/ui/player_page.dart`；**必须同步重写** `apps/tv-android/test/player_controls_test.dart` 中与布局/显隐相关的用例（`AP-08`~`AP-11` 的行序与几何断言全部作废）。禁改 `ui/widgets.dart`、Kotlin 原生层、`core/**`、`ui/detail_page.dart`、`ui/shell_page.dart`、`main.dart`、`pubspec.yaml`、Web 端、服务端、其他工作树及公开契约。
- **输出 / 验收 / 交付：**
  - `flutter test test/player_controls_test.dart test/player_progress_test.dart` 全过；对改动文件分析无新增告警。
  - 测试须断言（竖屏 `420×900`、横屏 `900×420` 与 `780×380`）：
    - **无重叠（结构保证）**：`中央簇.top >= 顶栏.bottom` 且 `中央簇.bottom <= 底栏浮层.top`；中央簇垂直中心 = 「顶栏下缘与底栏上缘之间可用区域」的垂直中心（±2dp）；
    - 底栏浮层内**同时**包含时间轴与 6 个按钮（`find.descendant` 命中），且**按钮行在时间轴上方**（按钮行 `bottom <= 时间轴.top`）；
    - `kPlayerSeekBarKey` **不是** `kPlayerTopBarKey` 的后代（时间轴已不在顶栏）；
    - 中央簇尺寸 64dp / 56dp、间距 32dp、水平居中；
    - **暂停时控件常驻**：暂停态推进 `pump(Duration(seconds: 6))` 后控件仍可见；**播放中 3.2s 后隐藏**：播放态 `pump(3.4s)` 后控件不可见、`pump(3.0s)` 时仍可见；
    - **淡出 300ms**：切换后 `pump(Duration(milliseconds: 150))` 时 `AnimatedOpacity` 的 opacity 处于中间值；
    - 隐藏态不可点（`IgnorePointer` 生效）；
    - 单击画面仍切换显隐；控件隐藏时单击画面不会触发播放/暂停；
    - 顶栏内边距在横竖屏一致（无横屏特例）；横屏面板宽度 `min(w*0.75,768)`、底边距 36dp；
    - `AP-03` 续播、`AP-05` 静音、`AP-06` 品牌色/无毛玻璃/三个独立轨道弹层的既有断言继续通过。
  - 附变更文件清单、测试输出、三种尺寸下顶栏/中央簇/底栏三者的实测矩形与两处间隙；release 包与真机复验由主 Agent 负责（主 Agent 会用真机模糊截图像素扫描复核「中央簇位于顶栏与底栏之间、互不重叠」）。

### WP-01｜Web 播放生命周期回归用例
- **负责人 / 分支 / 模块：** 独立回归 Agent，`feature/wp-01-baseline`，`viddy-wp01-baseline`，WEB-PLAY。
- **目标 / 功能：** 固定可复验的播放、换源、PiP、退播、进度与外挂字幕流程；先记录差异再决定是否改播放器。
- **输入 / 依赖 / 数据：** 固定 HLS/字幕样本、`/watch/:id[/episodeId]`、`PUT /progress`、`POST /qoe`；无其他任务依赖。
- **写入 / 禁区：** 新增 `docs/web-playback-smoke.md`；禁改播放器、导航、依赖和 API。
- **输出 / 验收 / 交付：** Web 构建通过；至少覆盖 Chromium 和可用的原生 HLS 浏览器，记录设备/浏览器、测试条件、结果和未跑项；附明确预期（无自动全屏、普通离页停止、PiP 跨页、换源不残留旧状态）。

### WP-02｜Web 播放器交互对齐 Infuse
- **负责人 / 分支 / 模块：** Web 播放 Agent，`feature/web-player`，WEB-PLAY。已有控件改动保留；`WP-01` 回到干净基线独立补采，`WP-02A` 与其并行收尾。合入前核对 `WP-01` 并与 `WEB-02` 联验。
- **目标 / 功能：** 桌面采用底部居中的双层浮动控制条：上排音量、播放/暂停、既有跳转、齿轮和可用的窗口操作，下排进度和时间。拖动期间仅更新目标时间和可用缩略图，松手才提交跳转；无缩略图仍可定位。齿轮按组呈现字幕、音轨及现有画质选项，支持鼠标和键盘，显示当前项与字幕关闭。
- **输入 / 依赖 / 数据：** [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `PLAY-01` 至 `PLAY-05` 与 Infuse macOS 录屏时间点；沿用现有 HLS、`thumbnails/index.json`、观看进度、外挂 PGS 与浏览器 PiP。倍速、音量增强、投屏、章节和新遥测不在本卡范围。
- **写入 / 禁区：** `apps/web/src/components/title/video-player.tsx`、`apps/web/src/pages/watch-page.tsx`；仅可另增 `apps/web/src/components/title/playback-controls.tsx`。禁改详情页、公共路由和数据契约、Redux 结构、媒体协议、服务端及其他平台。已有无源演示兜底涉及 `ADR-009`，本卡不改变全站兜底策略。
- **验收 / 交付：** `npm run typecheck`、`npm run build`；在 Chromium 与可用的原生 HLS 浏览器记录控制条、分组菜单、轨道切换、有图及无图拖动的结果。回归无自动全屏、画中画跨页不中断、站内关闭小窗不跳转、普通退播保存进度。和 `WEB-02` 联验详情续播与返回，附截图或录屏及未验证项。

### WP-02A｜统一电影详情与播放器的续播判定
- **负责人 / 工作树 / 分支：** 播放收尾 Agent，`viddy-web-player` / `feature/web-player`；基线 `4d55038896bec0531a06f761d12996029025af5c`，保留原 `WP-02` 未提交变更。
- **目标 / 技术要求：** 与 `WEB-02` 的电影详情判据一致：有效记录才能续播，达到 98% 或记录无效时从头播放；不改变剧集续播逻辑。
- **写入 / 禁区：** 仅 `apps/web/src/components/title/video-player.tsx`；禁止改详情页、播放控件、共享接口、数据结构和其他工作树。
- **验收 / 交付：** `npm run typecheck`、`npm run build`、`git diff --check`；覆盖有效记录、片尾、无效记录和剧集不变；联合验证电影详情按钮与实际起播位置。与 `WP-01` 并行，不独立合入。

## Apple 端调研（仅文档）

### IOS-PLAY-01｜iOS 播放能力与生命周期评估
- **负责人 / 分支 / 模块：** iOS 播放 Agent，`feature/ios-player`，Apple 端媒体立项调研。
- **目标 / 功能：** 核对 HLS、系统播放器、音轨与字幕（含外挂 PGS 的限制）、PiP 和前后台切换的能力，标出兼容边界。
- **输入 / 依赖 / 数据：** ADR-008、现有 HLS/字幕测试样本说明、[v2 接口](../docs/API_SPEC.md)；与 `IOS-UI-01` 核对控制入口，可并行。
- **写入 / 禁区：** 仅新增 `docs/rfc-ios-player.md`；禁止创建工程、引入依赖或修改 API、遥测口径和现有播放器。
- **输出 / 测试 / 验收：** 交付能力矩阵与真机测试方案，列出系统版本、媒体样本、切轨、退播重进和 PiP 的操作及预期；区分官方资料与实测证据，供 `RFC-05` 汇总。

### TVOS-PLAY-01｜tvOS 播放能力与遥控控制评估
- **负责人 / 分支 / 模块：** tvOS 播放 Agent，`feature/tvos-player`，Apple TV 媒体立项调研。
- **目标 / 功能：** 核对 HLS、自适应画质、音轨与字幕（含 PGS）、遥控暂停/拖动及退播恢复；明确电视端独有的限制。
- **输入 / 依赖 / 数据：** ADR-008、现有 HLS/字幕测试样本说明、[v2 接口](../docs/API_SPEC.md)；与 `TVOS-UI-01` 核对遥控控制入口，可并行。
- **写入 / 禁区：** 仅新增 `docs/rfc-tvos-player.md`；禁止创建工程、引入依赖或修改 Android TV 播放器和公开接口。
- **输出 / 测试 / 验收：** 交付按 Apple TV 设备/系统版本区分的能力矩阵和真机测试方案，覆盖媒体切换、弱网、字幕与遥控；明确未验证项，供 `RFC-05` 汇总。

## 待审批任务（只写 RFC）

遵守[看板的 RFC 交付约定](TASK_BOARD.md#rfc-交付约定)。

| Task ID / 名称 | 负责人、分支、负责模块及唯一写入 | 目标与具体功能 | 输入、依赖、API / 数据 | 专项验收 |
|---|---|---|---|---|
| RFC-04 / 剧集契约 | 产品技术 Agent，`feature/rfc-04`，目录与播放契约，新增 `docs/rfc-episodes.md` | 评估季集 DTO、可见性、缺源和续播。 | ADR-009；目录/播放负责人；`PublicTitleDetail`、`series_episodes`、`episodeId`。 | 包含无源、首集/选集切换、旧客户端和历史进度映射。 |
| RFC-05 / Apple 端立项 | Apple 平台研究 Agent，`feature/rfc-05`，iOS/tvOS 评估，新增 `docs/rfc-apple-platforms.md` | 汇总四张调研卡，评估客户端栈、签名、TV 焦点及媒体能力。 | ADR-008；`IOS-UI-01`、`IOS-PLAY-01`、`TVOS-UI-01`、`TVOS-PLAY-01` 完成后提交；HLS、v2 DTO、进度与 QoE 兼容。 | 给出手机/TV 的字幕、轨道、PiP、焦点、发布矩阵及成本；不创建工程。 |
