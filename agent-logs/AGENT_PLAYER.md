# 播放器 Agent 日志

任务入口：[播放器](../tasks/TASK_PLAYER.md)、[字幕](../tasks/TASK_SUBTITLE.md)；边界见[模块规范](../docs/MODULE_SPEC.md)。

## 已有记录

| 日期与基线 | 状态 | 调查结果与下一步 |
|---|---|---|
| 2026-11-23 · `f89eeb9` | 只读调查完成，实施未派发 | 记录了 Web 换源、退播与 PiP 验收点，以及 Android PGS 清单阻塞起播和 QoE 上报重叠的待处理问题。Android 播放与字幕任务需按看板交接独占窗口。 |
| 2026-11-26 · `4efc2be` | `AP-15` 已合入 `dev.all-platforms` | 修复「竖屏↔横屏切换后暂停态画面偏移到左上角」。子 Agent（`viddy-android-ui` / `feature/android-ui`，基线 `2312ca7`，提交 `19003af`）在 `NativePlayerView.kt` 的 `init` 中监听 `rootView` bounds 变化并 `requestLayout` + `invalidate`，促使 TLHC 纹理层以新几何重新 latch；未改通道契约与 `emitState()` 字段，未换 `AndroidView` key（避免重启播放）。变更文件：`NativePlayerView.kt`、`test/player_controls_test.dart`。门禁：`dart analyze lib test` 无告警、`flutter test` 124 项全过、服务端 `npm run typecheck` 与 Web `npm run build` 通过。真机 A/B（SM-S9180，release 1.0.28/31）：同一路径「竖屏暂停 → 点全屏 → 横屏暂停」在旧包 1.0.27 上复现内容偏移（投影 x 473–1527，约 34% 宽、偏左上），在 1.0.28 上为 x 314–2873（2560px = 82.9%）居中；反向「横屏暂停 → 回竖屏暂停」视频框为 `[0,1139][1440,1949]`（1440×810 居中）；播放位置连续未重置。未跑项：无。 |

后续每条记录包含：日期、Task ID、Agent、状态、分支和 Worktree、基线/提交、变更文件、媒体样本及测试结果、阻塞与交接。由主 Agent 归档，或由任务卡显式授权写入。
