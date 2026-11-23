# Agent 协作规则

本文件适用于整个仓库和所有委派会话。没有主 Agent 下发的任务卡，不写业务文件。先读本文件、[任务计划](tasks/TASK_BOARD.md)、[模块边界](docs/MODULE_SPEC.md)、[协作流程](docs/DEVELOPMENT_RULES.md) 和任务关联规范；以任务的确定基线、路径白名单、测试矩阵开工。

## 规范索引

| 需要回答的问题 | 文件 |
|---|---|
| 做什么，哪些能力未上线？ | [产品](docs/PROJECT.md)、[仓库分析](docs/PROJECT_ANALYSIS.md) |
| 怎么分层、用什么工具？ | [架构](docs/ARCHITECTURE.md)、[技术栈](docs/TECH_STACK.md)、[模块](docs/MODULE_SPEC.md) |
| 数据和消费者如何兼容？ | [数据库](docs/DATABASE.md)、[API 与桥接](docs/API_SPEC.md) |
| 如何编码、设计交互、交付和集成？ | [编码规范](docs/CODING_STANDARDS.md)、[UI / UX 规范](docs/UI_UX_GUIDELINES.md)、[开发流程](docs/DEVELOPMENT_RULES.md)、[任务看板](tasks/TASK_BOARD.md) |
| 谁批准变更？ | [技术决策](decisions/DECISIONS.md) |
| 去哪里查进度和交接记录？ | [UI 日志](agent-logs/AGENT_UI.md)、[播放器日志](agent-logs/AGENT_PLAYER.md)、[服务端与网络日志](agent-logs/AGENT_CLOUD.md) |

## 不可越界

- 只在分配的 Git 分支和独立 Worktree 开发；不得改 `main`、他人工作树、任务白名单外文件，不得擅自提交、推送或发布到未授权目标。
- 不擅自修改公共 API、数据库公用结构、总体架构、其他 Agent 所有文件，不引入新栈，不重构公共模块。公共 API 包括 JSON、状态码、行为语义、配置、原生通道和 IPC。
- 发现必须越界或规范有误时停在该边界：发出 `CR-ID / Task ID / 现行规则和证据 / 拟变更 / 文件和负责人 / 兼容与回退 / 测试 / 影响任务`。主 Agent 记录批准及交接后，以新白名单开工；沉默、观察到别人改动或临时可运行不是批准。
- 隔离测试，不读取或复制生产秘密；保留用户改动，不做破坏性 Git 操作。开发结束运行相关测试，按任务授权提交 Git Commit，给出文件清单、测试结果和未验证项，提交完成报告等主 Agent 集成。

## 主 Agent 派发与验收

- 本项目所有子 Agent 统一使用 `DeepSeek-V4-Flash-Official`。新建子 Agent 时显式指定该模型；环境不支持或无法确认模型时，按固定豁免继续执行并如实登记，不擅自切换模型。已有独立 Trae 会话须在各自会话中选择并确认该模型后再执行任务。
- 开发任务先拆成可独立验收的 WP 卡，写清可并行项、前置依赖和共享文件。适合委派的工作必须实际调用 Sub Agent；只写看板不算派发。调用失败应记录原因和阻塞项。
- 每次派发明确任务编号、目标、技术要求、文件白名单与禁区、完整基线 SHA、独立 Worktree 和分支、验收标准及测试命令。子 Agent 先在本运行环境验证工作树、分支和写权限。共享文件只能由一位 Agent 写，交接时核对残留变更。
- 主 Agent 维护架构、契约与调度；收件时核对提交记录、实际变更文件和测试证据，再决定是否合入。未跑的用例和未获得的 Git 授权必须如实登记。
