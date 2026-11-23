# 质量与发布任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### QA-01｜恢复 Flutter 测试门禁
- **负责人 / 分支 / 模块：** QA Agent，`feature/QA`，Android 测试。
- **目标 / 功能：** 把失效计数器测试替换成 `ViddayApp` 和首页冒烟；用假 API 驱动有数据、空内容与失败重试。
- **输入 / 依赖 / 数据：** 当前 `ViddayApp(api:)`、`ApiClient`、首页目录 DTO；无其他任务依赖。
- **写入 / 禁区：** `apps/tv-android/test/widget_test.dart`；禁改 `lib/`、Gradle、pubspec。
- **输出 / 验收 / 交付：** `flutter test` 能加载并通过，新用例离线；`flutter analyze` 成为可重复门禁，分析器启动故障另列证据和解决条件，不改业务绕过；附测试日志。

### REL-01｜校准开发与发布入口
- **负责人 / 分支 / 模块：** 发布文档 Agent，`feature/rel-01`，RELEASE。
- **目标 / 功能：** 更新旧 Mock/720p 说法，写清工具链、本地与部署端口、Android wrapper 与正式签名限制。
- **输入 / 依赖 / 数据：** `.nvmrc`、包脚本、Gradle 配置、Nginx 反代、`/health`；无其他任务依赖。
- **写入 / 禁区：** `README.md`、`apps/tv-android/README.md`、`deploy/README.md`；禁改脚本、签名和真实环境。
- **输出 / 验收 / 交付：** 启动、构建、静态验证、回退步骤与代码一致，不再将 debug 签名当正式；逐脚本 `bash -n`、检查文档链接，附命令核对表。
