# 总体技术架构

```text
浏览器 / Electron renderer ──┐
Android Flutter ───────────────┼── HTTPS /api/public ── Fastify ── MySQL 共享库
Electron main（配置拉取） ─────┘                              ↑ 外部内容管理端
浏览器 / Electron 媒体栈 ───────── HTTPS ── 媒体 CDN / R2
Flutter ── PlatformView / Channels ── Kotlin Media3 ── HTTPS ── 媒体 CDN / R2
Electron renderer ── preload IPC ── Electron main ── 回环 Mihomo
```

## 部署与运行

- Monorepo 不设根包管理器。Web 产物 `apps/web/dist/` 经 Cloudflare/Nginx 提供；HTML 不缓存，带哈希资产可长缓存；SPA 路由回退不拦截 `/api/` 和 `/health`。Fastify 独立进程，由 PM2 或宝塔托管。部署模板反代到 8791，代码默认 8790；部署显式设 `PORT=8791`，本地开发以实配为准。
- MySQL 启动探活、确保 QoE 表、监听、异步预热；关闭先停 Fastify 再释放连接池。内容缓存为单进程 SWR，题材 30 分钟、最新 2 分钟、其他热点通常 5 分钟；不是下架强一致保证。进度、片单和 QoE 不走内容缓存。
- Android Flutter 负责导航、界面和控制；Kotlin 负责媒体、轨道和字幕绘制。Electron 保持主进程、preload、renderer 边界，renderer 不直接调用 OS 或 Mihomo 控制面。各客户端直接读媒体，不在 Fastify 转发分片。

## 变更边界与运行约束

1. 公共 HTTP、共享库、Android 通道、桌面 IPC 及环境变量是跨模块契约，见 [接口](API_SPEC.md) 与 [模块边界](MODULE_SPEC.md)。变更必须先批 ADR；同步列出消费者、发布次序、回退和兼容窗口。
2. App Key 是公开客户端可提取的接入标识，不是用户凭证。设备 ID 是归属键而非身份认证。后端端口和 MySQL 不向公网直接开放；生产同源优先，跨域来源与反代信任配置需集成核对。
3. 进程内状态不作为持久化来源。网络失败要区分空数据和失败；播放界面进入、换源、离开分别管理任务、定时器和会话，旧请求不能覆盖新媒体。QoE 失败不得挡住播放。
4. 服务器发布前核对健康、公共响应和 SPA 深链接；生产部署和回退由发布负责人执行。不可把脚本的 `rsync --delete` 指向共享、含用户文件的目录；发布前保留可回退版本与相容静态资产。
