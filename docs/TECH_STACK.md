# 技术栈与选型依据

以下为基线清单；安装以各工程 lockfile 为准，不用机器上的全局依赖代替。

| 模块 | 已用技术与版本 | 选型理由及约束 |
|---|---|---|
| Web | Node 22.22.0、npm、React 19、Vite 8、TS 7、React Router 8、Redux Toolkit 2 | SPA 独立构建；沿用 Redux 管理跨页播放和设备侧状态，不为局部状态引入另一容器。 |
| Web UI / 媒体 | Tailwind 4、Radix、Lucide；hls.js 1.7、libpgs 0.9 | 现有基础 UI 复用；MSE 上使用 hls.js，在适用浏览器用原生 HLS；位图字幕独立于文本字幕。 |
| 桌面 | Electron 33、esbuild、electron-builder 26、Mihomo 本地二进制 | 复用 Web 渲染层，同时隔离本机网络能力；普通浏览器不依赖桌面资源。 |
| Android | Flutter、Dart `^3.13.5`、`http`、`shared_preferences`；JDK 17、AGP 9.1.0、Gradle 9.3.1、Kotlin 声明 2.4.0 | 共享手机和 TV UI；SDK 构建用 `local.properties` 定位 Flutter，不提交本地配置。 |
| Android 媒体 | Kotlin + Media3 1.4.1、ExoPlayer HLS、TextureView、自有 PGS 解析与叠加 | 原生轨道、硬件解码与 PiP；Dart 不解码、不依赖浏览器播放器。 |
| 服务端 | Node 22.22.0、Fastify 5、mysql2 3、TS 5.9 | 服务直接运行 TS（`--experimental-strip-types`）；避免要求运行时做 TS 转译的语法；SQL 复用既有共享库。 |
| 发布 | Cloudflare、Nginx、PM2/宝塔；HLS/图片从媒体源直连 | 静态与 API 分开发布；本仓无已跟踪 CI。Android APK 的 debug 签名不能视为正式发布配置。 |

禁止未经批准升级主版本、修改锁文件、添加生产依赖或更换播放器/数据库。提案须提供现有栈替代方案、包体/构建与运行影响、兼容矩阵和撤回方式，记录到 [DECISIONS.md](../decisions/DECISIONS.md)。
