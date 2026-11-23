# 播放器任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### AP-01｜Android QoE 批次串行
- **负责人 / 分支 / 模块：** Android 播放 Agent，`feature/android-tv-player`，AND-PLAY 遥测。
- **目标 / 功能：** 串行周期与终止 flush，成功只移除该批，失败保留待重试；终止报告含 `endedAt`。
- **输入 / 依赖 / 数据：** `QA-01`；`POST /qoe` v2 的累计 session、增量 events 和 `accepted`；不可宣称服务端事件去重。
- **写入 / 禁区：** `apps/tv-android/lib/core/qoe.dart`、新增 `apps/tv-android/test/qoe_test.dart`；禁改 UI、通道、服务端和表。
- **输出 / 验收 / 交付：** `flutter analyze/test`，假时钟覆盖慢请求、退出竞态、失败重试和批次边界；附请求时序样本。

### WP-01｜Web 播放生命周期回归用例
- **负责人 / 分支 / 模块：** Web 播放 Agent，`feature/web-player`，WEB-PLAY。
- **目标 / 功能：** 固定可复验的播放、换源、PiP、退播、进度与外挂字幕流程；先记录差异再决定是否改播放器。
- **输入 / 依赖 / 数据：** 固定 HLS/字幕样本、`/watch/:id[/episodeId]`、`PUT /progress`、`POST /qoe`；无其他任务依赖。
- **写入 / 禁区：** 新增 `docs/web-playback-smoke.md`；禁改播放器、导航、依赖和 API。
- **输出 / 验收 / 交付：** Web 构建通过；至少覆盖 Chromium 和可用的原生 HLS 浏览器，记录设备/浏览器、测试条件、结果和未跑项；附明确预期（无自动全屏、普通离页停止、PiP 跨页、换源不残留旧状态）。

### WP-02｜Web 播放器交互对齐 Infuse
- **负责人 / 分支 / 模块：** Web 播放 Agent，`feature/web-player`，WEB-PLAY；先采集 `WP-01` 基线，再改控件。可与 `WEB-02` 并行，合入前联合验收。
- **目标 / 功能：** 桌面采用底部居中的双层浮动控制条：上排音量、播放/暂停、既有跳转、齿轮和可用的窗口操作，下排进度和时间。拖动期间仅更新目标时间和可用缩略图，松手才提交跳转；无缩略图仍可定位。齿轮按组呈现字幕、音轨及现有画质选项，支持鼠标和键盘，显示当前项与字幕关闭。
- **输入 / 依赖 / 数据：** [UI / UX 规范](../docs/UI_UX_GUIDELINES.md) `PLAY-01` 至 `PLAY-05` 与 Infuse macOS 录屏时间点；沿用现有 HLS、`thumbnails/index.json`、观看进度、外挂 PGS 与浏览器 PiP。倍速、音量增强、投屏、章节和新遥测不在本卡范围。
- **写入 / 禁区：** `apps/web/src/components/title/video-player.tsx`、`apps/web/src/pages/watch-page.tsx`；仅可另增 `apps/web/src/components/title/playback-controls.tsx`。禁改详情页、公共路由和数据契约、Redux 结构、媒体协议、服务端及其他平台。已有无源演示兜底涉及 `ADR-009`，本卡不改变全站兜底策略。
- **验收 / 交付：** `npm run typecheck`、`npm run build`；在 Chromium 与可用的原生 HLS 浏览器记录控制条、分组菜单、轨道切换、有图及无图拖动的结果。回归无自动全屏、画中画跨页不中断、站内关闭小窗不跳转、普通退播保存进度。和 `WEB-02` 联验详情续播与返回，附截图或录屏及未验证项。

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
