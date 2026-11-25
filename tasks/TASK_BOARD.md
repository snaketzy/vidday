# 任务看板与 Agent 分工

状态：已规划、未派发写入任务。调查 Agent 已完成只读任务。主 Agent 批准规范后发布基线 SHA，再逐张授权任务。没有批准的任务、基线和 worktree 三元组，不得开工。

## 调度与工作树

| 波次 | 可并行任务 | 合并门禁 |
|---|---|---|
| A：基线与低耦合 | `QA-01`、`SVC-01`、`WEB-01`、`DESK-01`、`REL-01` | 优先合 `QA-01` 恢复 Flutter 测试；其余逐项独立集成。 |
| Web：Infuse 对齐 | `WEB-02`、`WP-02` | 两卡可并行，`WP-02` 先采集 `WP-01` 基线；合入前联验详情 → 续播 → 返回。 |
| B：客户端加固 | `AU-01`、`AU-02`、`AU-03`、`AU-04`、`AU-05`、`AU-06`、`AU-07`、`AU-08`、`AU-09`、`AU-10`、`AP-01`、`AP-03`、`AP-04`、`AP-05`、`AP-06`、`AP-07`、`AP-08`、`AP-09`、`AP-10`、`AP-11`、`AP-12`、`AP-13`、`AP-14`、`WP-01` | 四项 Android 卡等 `QA-01`；`AU-01` 与 `AU-02`/`AU-03` 使用不同工作树；`AU-03`~`AU-10`、`AP-04`~`AP-14` 与其工作树内未提交的 `AP-03` 顺序衔接，须保留 `AP-03` 的续播与进度上报契约，各卡细节见对应任务卡。`AU-09` 修「详情页演职员与 Watching 均不可点击」：Watching 卡推入该影片详情页；演职员卡在 `personId != null` 时推入**新建的影人页**（对齐 Web `/person/:id`，后端 `GET /public/people/:id[/collaborators]` 契约齐备），`personId == null` 时按 Web 的 guard 保持不可点；`AU-10` 把详情页的简介截断/`MORE` 弹层提取为共享组件 `ui/expandable_text.dart`，详情页与影人页共用（影人页原先是全文铺开）。`AU-05` 修「横屏转竖屏后详情页出现遮罩、整页不可点击」的旋转缺陷（共用 `ScrollController` 在切换帧暴露两个 `ScrollPosition`），须先以回归用例证伪再修。`AU-06` 与 `QA-01` 修同一缺陷类：`void _reload() => setState(() => _future = …)` 的箭头闭包返回 `Future`，命中 `setState() callback argument returned a Future` 断言，debug/test 下「重试」必抛（release 因断言被裁而未暴露）；`AU-06` 负责 `detail_page.dart:81`，`QA-01` 经主 Agent 边界批准负责 `home_page.dart:44` 与 `latest_page.dart:27`，两者都须先证伪再修、不得改测试绕过。播放页历经 `AP-04`~`AP-11` 的布局迭代；`AP-12` 按用户指令**撤销 `AP-09`~`AP-11` 的布局补丁**，回退到基线「顶栏 / 中央簇 / 底栏」三段式骨架（`Column` 结构上不重叠），并按 Web 重做交互（超时 3.2s 且仅播放中隐藏、300ms 淡出、触摸唤出、时间轴回到底栏）。`AP-06` 经用户批准放开 `widgets.dart`（仅 `kAccent`），改动对全 App 生效。`AP-13` 把横屏底栏底边距 36→26dp；`AP-14` 把音量弹层由实测 200dp 压缩为紧凑单行（`[音量图标按钮][滑块][百分比]`，目标 ≤92dp、预期约 80dp，并去掉 `showDragHandle`），规格由用户当面选定。Web 播放与上述均独立。 |
| C：原生播放 | `AP-02` | 等 `AP-01` 合入并取得 Android 播放独占窗口；真机验收。 |
| D：跨模块评审 | `RFC-01` 至 `RFC-05` | 仅写提案，可提前并行收证；获批并拆出实施卡后才允许改行为。 |
| D：Apple 端调研 | `IOS-UI-01`、`IOS-PLAY-01`、`TVOS-UI-01`、`TVOS-PLAY-01` | 四张调研卡并行，结果交给 `RFC-05` 汇总；本轮不授权创建 Apple 工程。 |

## 子 Agent 工作树与任务

下表以现有 Git 工作树为准，窗口标识使用工作树目录名。收到派发后，以 `git worktree list --porcelain` 定位并核对批准的基线。表中分配不等于已派发；其他任务仍按[开发流程](../docs/DEVELOPMENT_RULES.md)申请独立工作树。

| 窗口 / 角色 | 分支 | 对应任务 | 开工条件 |
|---|---|---|---|
| `viddy-QA` / QA | `feature/QA` | [QA-01：Flutter 基础测试](../tasks/TASK_QA.md) | 规范基线发布并派发 |
| `viddy-web-ui` / Web UI | `feature/web-ui` | [WEB-01：账户数据说明](../tasks/TASK_UI.md)、[WEB-02：Infuse 影片详情](../tasks/TASK_UI.md) | 规范基线发布并派发 |
| `viddy-web-player` / Web 播放 | `feature/web-player` | [WP-01：播放回归用例](../tasks/TASK_PLAYER.md)、[WP-02：Infuse 播放交互](../tasks/TASK_PLAYER.md) | 规范基线发布并派发；先采集 `WP-01` 基线 |
| `viddy-android-ui` / Android UI | `feature/android-ui` | [AU-02](../tasks/TASK_UI.md)、[AU-03](../tasks/TASK_UI.md)、[AU-04](../tasks/TASK_UI.md)、[AU-05](../tasks/TASK_UI.md)、[AP-03](../tasks/TASK_PLAYER.md)、[AP-04](../tasks/TASK_PLAYER.md)、[AP-05](../tasks/TASK_PLAYER.md)、[AP-06](../tasks/TASK_PLAYER.md)、[AP-07](../tasks/TASK_PLAYER.md)、[AP-08](../tasks/TASK_PLAYER.md)、[AP-09](../tasks/TASK_PLAYER.md)、[AP-10](../tasks/TASK_PLAYER.md)、[AP-11](../tasks/TASK_PLAYER.md)、[AP-12](../tasks/TASK_PLAYER.md)、[AP-13](../tasks/TASK_PLAYER.md)、[AP-14](../tasks/TASK_PLAYER.md)、[AU-06](../tasks/TASK_UI.md)、[AU-07](../tasks/TASK_UI.md)、[AU-08](../tasks/TASK_UI.md)、[AU-09](../tasks/TASK_UI.md)、[AU-10](../tasks/TASK_UI.md) | `QA-01` 合入后派发；`AU-03`~`AU-10`、`AP-03`~`AP-14` 需真机或模拟器验收 |
| `viddy-android-tv-ui` / Android TV UI | `feature/android-tv-ui` | [AU-01：遥控器与焦点](../tasks/TASK_UI.md) | `QA-01` 合入后派发 |
| `viddy-android-tv-player` / Android TV 播放 | `feature/android-tv-player` | [AP-01：QoE 上报](../tasks/TASK_PLAYER.md) | `QA-01` 合入后派发 |
| `viddy-android-player` / Android 播放 | `feature/android-player` | [AP-02：字幕不阻塞起播](../tasks/TASK_SUBTITLE.md) | `AP-01` 合入并完成播放独占窗口交接 |
| `viddy-ios-ui` / iOS UI | `feature/ios-ui` | [IOS-UI-01：交互方案](../tasks/TASK_UI.md) | 派发后仅做调研 |
| `viddy-ios-player` / iOS 播放 | `feature/ios-player` | [IOS-PLAY-01：播放能力](../tasks/TASK_PLAYER.md) | 派发后仅做调研 |
| `viddy-tvos-ui` / tvOS UI | `feature/tvos-ui` | [TVOS-UI-01：遥控与焦点方案](../tasks/TASK_UI.md) | 派发后仅做调研 |
| `viddy-tvos-player` / tvOS 播放 | `feature/tvos-player` | [TVOS-PLAY-01：电视播放能力](../tasks/TASK_PLAYER.md) | 派发后仅做调研 |

**统一任务卡约定：** 下列「写入」是唯一 allowlist（路径相对仓库根），**每张卡都禁止修改白名单外全部文件**，特别是公共契约、Schema、锁文件和其他 Agent 文件。未列新文件权限即不许新建。每张卡交付授权分支上的 Git Commit、变更文件清单、测试报告和完成报告；另外交付所列专项证据。无机型/配置/环境视为阻塞，不得验收通过。

## 模块任务索引

| 模块 | 任务编号 |
|---|---|
| [界面与交互](../tasks/TASK_UI.md) | `WEB-01`、`WEB-02`、`AU-01`、`AU-02`、`AU-03`、`AU-04`、`AU-05`、`AU-06`、`AU-07`、`AU-08`、`AU-09`、`AU-10`、`IOS-UI-01`、`TVOS-UI-01` |
| [播放器](../tasks/TASK_PLAYER.md) | `AP-01`、`AP-03`、`AP-04`、`AP-05`、`AP-06`、`AP-07`、`AP-08`、`AP-09`、`AP-10`、`AP-11`、`AP-12`、`AP-13`、`AP-14`、`WP-01`、`WP-02`、`IOS-PLAY-01`、`TVOS-PLAY-01`、`RFC-04`、`RFC-05` |
| [服务端与桌面网络](TASK_CLOUD.md) | `SVC-01`、`DESK-01`、`RFC-01`、`RFC-02`、`RFC-03` |
| [字幕](TASK_SUBTITLE.md) | `AP-02` |
| [质量与发布](TASK_QA.md) | `QA-01`、`REL-01` |

## RFC 交付约定

统一输入是本轮基线及各自 ADR。统一禁止修改源代码、数据库和公开契约。每张卡交付独立 RFC Commit、文件清单及评审报告；**测试要求是可复验的夹具/测试矩阵和回退演练设计，不要求修改线上运行环境**。验收须包含候选方案、决定依据、迁移或兼容、测试、负责人、回退点，并由主 Agent 和受影响所有者签字确认；没有批准不可拆实施卡。

## 主 Agent 集成

核对工作树与提交、文件白名单、契约 diff、数据兼容、依赖及变更报告；按波次合到批准的候选分支，每步执行[对应门禁](../docs/DEVELOPMENT_RULES.md#主-agent-合并门禁)。出现共享文件冲突暂停后续合入，先确认负责人和合并语义，重跑影响端。交付集成 SHA、测试矩阵、回退点和未解决问题；禁止次序外直接合 `main`。
