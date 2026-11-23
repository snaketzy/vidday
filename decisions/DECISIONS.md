# 技术决策与变更记录

| ID | 状态 | 决策、依据与后果 |
|---|---|---|
| ADR-001 | 现状基线 | 保留独立 monorepo 工程与共享 MySQL；省去双份内容存储，但发布前需核对共享库兼容。 |
| ADR-002 | 现状基线 | Web/Electron 共用 renderer，Android 手机/TV 共用 Flutter 与 Media3；以差异化交互适配能力，不按分支复制工程。 |
| ADR-003 | 现状基线 | HTTP v2、设备归属与平台桥接保持当前兼容；不把 App Key 或设备 ID 定义为用户认证。 |
| ADR-004 | 现状基线 | 内容用单进程 SWR，媒体直连；缓存加固、目录分页和全入口下架一致性分开验证。 |
| ADR-005 | 待审批 | 统一下架策略和进度保留。拟将公开查询一致过滤、进度读取不进行破坏性清理；需运营确认重新上架行为和缓存时效，不能以缓存命中作为授权。 |
| ADR-006 | 待审批 | 匿名身份及平台识别：评估绑定/解绑、历史设备数据合并、`x-client-platform` 与 CORS、App 版本共存及可撤销凭证；无批准不改表、请求头或身份逻辑。 |
| ADR-007 | 待审批 | QoE 升级：兼容旧报告，评估有序累计、事务、事件唯一性、采样、分辨率统计和数据保留；与管理端对齐，不默改 v2。 |
| ADR-008 | 待审批 | iOS/tvOS 工程、技术栈、能力和发布策略；先评估，架构批准后才开工。 |
| ADR-009 | 待审批 | 正式季/集与无源播放行为，明确单集身份、兼容旧 `playUrl`、历史进度以及无源状态。 |
| CR-010 | 已批准（主 Agent 自批，2026-11-24） | 影片详情元数据行下发并展示媒体规格「可靠子集」：`isUhd`→`4K`、`hasHevc`→`HEVC`、`audioTrackCount≥2`→`音轨 n`、`subtitleTrackCount≥1`→`字幕 n`。范围：仅影片（剧集表无规格列）、仅 Vidday 仓库、契约字段全可选、`PUBLIC_SCHEMA_VERSION` 保持 2；HDR / 音频编码本轮不做。依据：`movies` 表确有 `is_uhd / has_hevc / audio_track_count / subtitle_track_count`（`moive-database-op` `schema.sql`），但 Vidday `MOVIE_COLUMNS`、`contract.ts` 与前端 `Title` 均未放行——属链路收窄而非无数据。 |

### CR-010 详情

- **日期 / 状态 / 决策人：** 2026-11-24 / 已批准 / 主 Agent（技术负责人自批）。
- **问题：** 影片详情页元数据行不显示 4K / HEVC 等媒体规格；用户指出数据库应有区分字段。
- **候选：** ①保持现状；②只上可靠子集；③一并上 HDR / 音频编码。
- **决定：** 选 ②。可靠子集 = `movies.is_uhd`、`movies.has_hevc`、`movies.audio_track_count`、`movies.subtitle_track_count`。HDR（DV/HDR10/HLG）与音频编码（DTS/Atmos）仅在 `movie_discs.info`，未发现落库到 `movies` 的通路，本轮不做。
- **兼容与迁移：** 只新增可选字段，不改写现有字段语义；`PUBLIC_SCHEMA_VERSION` 保持 2；旧客户端忽略未知字段；回退 = 移除新增可选字段即可，无数据迁移。
- **测试与回滚：** `server/` `npm run typecheck`；`apps/web/` `npm run typecheck` + `npm run build`；缺字段时不渲染徽章。回滚按提交粒度 revert。
- **关联任务：** `SVC-02`（`feature/backend`）、`WEB-02`（`feature/web-ui`）；基线 `70fe43e`。

新增记录采用 `ADR-ID / 日期 / 状态 / 决策人 / 问题 / 候选 / 决定 / 兼容与迁移 / 测试与回滚 / 关联 CR、任务与提交`。状态为提议、批准、拒绝或被替代；保留旧条目，禁止把规划改写成已发布事实。
