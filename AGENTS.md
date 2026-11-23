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
