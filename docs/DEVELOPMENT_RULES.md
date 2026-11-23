# 开发、测试、提交与集成

## 开工与交付

1. 领取任务时记录 `Task ID / Agent / 基线 SHA / 分支 / Worktree / 白名单 / 依赖 / 验收`。主 Agent 先发布已批准的规范提交，任务以该确定 SHA（或其后明确授权的集成 SHA）为基线，不能在 `f89eeb9` 上直接开始而拿不到规范。
2. 本轮集成候选是 `dev.all-platforms`，以实际授权为准；不直接改 `main`。`git worktree list --porcelain` 查路径，复用分配的 worktree 前核对 `git status --short --branch` 和 `git rev-parse HEAD`；不同步或有用户改动则暂停。无预建工作树时，在批准的父目录下执行 `git worktree add -b feature/<task> "<独占路径>" "<已批准SHA>"`。不得重置、抢占或修改他人工作树。
3. 开发前记录基线测试；用隔离配置、假服务、固定 HLS/PGS fixture，禁止连接生产库。只暂存白名单文件，检查 `git diff --cached --check`、`git diff --cached --name-only`；授权后使用 `fix: ...`、`feat: ...`、`test: ...` 或 `docs: ...` 短标题提交。不得绕开 hooks；不得擅自推送、发布或合并。
4. 提交完成报告：任务、分支/路径、基线/提交 SHA、完整文件列表、命令/环境/结果、验收证据、未跑项、局限和回退方式。故障要写既有还是新引入，不得把跳过记为通过。

## 验证矩阵

| 范围 | 执行目录与必做验证 |
|---|---|
| 服务端 | `server/`: `npm ci`、`npm run typecheck`；变更测试用 `node --experimental-strip-types --test <测试文件>` 或已批准入口；HTTP 用 Fastify `inject` + 夹具，SQL 用一次性测试库。 |
| Web | `apps/web/`: `npm ci`、`npm run typecheck`、`npm run build`；固定数据走相关路由，记录 loading/empty/error、正常及键盘流程。播放再测换源、弱网、进度、离开和 PiP。 |
| Electron | `apps/web/`: `npm run build:electron`，涉及打包时 `npm run dist:mac`；验系统网络、缺内核降级、订阅失败与重启，确认普通 Web 不变。 |
| Android | `apps/tv-android/`: `flutter pub get`、`flutter analyze`、`flutter test`；源或构建有改动时使用隔离服务参数 `flutter build apk --debug --dart-define=API_BASE_URL=<test-api-with-/api> --dart-define=APP_API_KEY=<test-key>`；播放/交互需真机。 |
| 部署 | `bash -n` 分别检查两个脚本；在隔离环境渲染配置、`nginx -t`，再验证健康、公共 API、深层路由与回退，不在开发工作树执行生产部署脚本。 |

## 主 Agent 合并门禁

按 [TASK_PLAN.md](../tasks/TASK_BOARD.md) 的依赖顺序收件。逐份检查提交差异与白名单、架构、API/数据兼容、依赖及潜在回归；共享文件冲突退回责任人或在独立集成提交中解决，重跑影响矩阵。集成候选至少重跑服务端类型检查、Web build、Flutter analyze/test；涉及桌面或 Android 原生则增跑相应构建和真机矩阵。未通过的门禁不得默认为通过，例外须记录范围、原因、负责人、补验计划并经批准。批准合并后保留任务提交映射、测试报告、回退点；`main` 合并及生产发布另行授权。
