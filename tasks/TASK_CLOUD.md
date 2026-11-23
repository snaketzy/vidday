# 服务端与桌面网络任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### SVC-01｜建立服务缓存回归基线
- **负责人 / 分支 / 模块：** 服务基础 Agent，`feature/svc-01`，SVC-CONTENT 测试。
- **目标 / 功能：** 为现有缓存编写确定性测试，覆盖冷缓存请求合并、过期刷新、刷新失败与重试；记录容量和陈旧上限候选，不改实现。
- **输入 / 依赖 / 数据：** `cache.ts` 的公开函数、可控 Promise 和时钟；Node 22.22.0；不需要 MySQL 或其他任务。
- **写入 / 禁区：** 新增 `server/test/cache.test.ts`；禁改 `server/src/`、包脚本和锁文件。
- **输出 / 验收 / 交付：** `npm run typecheck` 与 `node --experimental-strip-types --test test/cache.test.ts` 通过，多次运行结果一致；附覆盖清单和现行行为说明。

### DESK-01｜桌面降级验证手册
- **负责人 / 分支 / 模块：** 桌面 Agent，`feature/desk-01`，DESKTOP。
- **目标 / 功能：** 整理包内资源、缺 Mihomo、系统网络、订阅失败和恢复的可复验路径。
- **输入 / 依赖 / 数据：** `preload`/`ProxyStatus`、`GET /proxy-config`、示例资源；只用占位配置，无其他任务依赖。
- **写入 / 禁区：** 新增 `docs/electron-smoke.md`；禁改 `electron/`、包和部署配置。
- **输出 / 验收 / 交付：** 附 `npm run build:electron` 结果、可重复手册及实测/未测矩阵；用假配置分别检查普通 Web 无桥接、桌面系统网络和缺内核提示。

## 待审批任务（只写 RFC）

遵守[看板的 RFC 交付约定](TASK_BOARD.md#rfc-交付约定)。

| Task ID / 名称 | 负责人、分支、负责模块及唯一写入 | 目标与具体功能 | 输入、依赖、API / 数据 | 专项验收 |
|---|---|---|---|---|
| RFC-01 / 可见性与数据保留 | 内容 Agent，`feature/rfc-01`，SVC-CONTENT/SVC-DATA，新增 `docs/rfc-visibility.md` | 统一公开入口下架口径；确定进度是否保留及缓存生效上限。 | ADR-005；内容/库负责人；人物、专题、目录、`watch_progress`。 | 包含临时下架、再上架和并发进度写入；明确是否涉及迁移。 |
| RFC-02 / 多端身份 | 主 Agent 牵头，`feature/rfc-02`，共享 HTTP/身份，新增 `docs/rfc-identity.md` | 定义平台识别、匿名绑定/解绑、共享进度与历史合并。 | ADR-006；客户端与库负责人；拟 `x-client-platform`/CORS、device ID、user ID、`progress/list`。 | 包含旧客户端、恢复凭证、冲突优先级、双轨及回滚。 |
| RFC-03 / 遥测可靠性 | 数据 Agent，`feature/rfc-03`，SVC-DATA，新增 `docs/rfc-qoe.md` | 定义会话频率、分辨率指标、批次顺序和幂等策略。 | ADR-007；`AP-01` 证据及管理端约定；`POST /qoe`、两张 QoE 表。 | 包含乱序、重放、部分失败、数据保留及版本兼容。 |
