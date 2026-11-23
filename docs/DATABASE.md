# 数据库结构与数据规范

共享 MySQL，部署示例库 `isee_videos_db`。本文件是源码可证的逻辑结构，不是生产 DDL。除 QoE 的建表 SQL 外，本仓无权威迁移历史；不能据此在生产建表。

| 所有权 | 表与关系 | Vidday 行为 |
|---|---|---|
| 内容管理端 | `movies`、`series`；`series_episodes.series_id → series.id` | 只读。主目录只读 `published`；剧集详情取排序后首个非空单集播放地址；作品 ID 假设跨电影/剧集全局唯一，冲突时电影优先。 |
| 内容管理端 | `dict`；`movie_attrs`、`series_attrs` 关联作品与字典；`carousel`/`carousel_item` 关联 `target_type/target_id`；`collections` 与 `collection_movies`、`collection_series` | 只读。DTO 只输出公开字段，`published` 覆盖不一致见分析。 |
| 内容管理端 | `people`、`movie_credits`、`series_credits` | 只读。署名 `person_id` 可缺失，姓名使用冗余信息。 |
| 设备数据 | `watch_progress(device_id,title_id,episode_id,position,duration,percent,created_at,updated_at)`；`my_list(device_id,title_id,created_at)` | 都依赖 `(device_id,title_id)` 唯一来保证幂等；DDL、索引与列类型待库负责人核对。片单 `INSERT IGNORE`；进度以不早于旧值的时间戳覆盖，删除和读过滤当前见 API。 |
| 播放遥测 | `qoe_session`（自增 PK，`session_id` 唯一，含设备/来源、作品/单集、聚合计数、起止时间）；`qoe_event`（自增 PK，以 `session_id` 逻辑关联、含事件类型/时间、数值、级别、消息和 JSON） | 以 [`SCHEMA_DDL`](../server/src/db/qoe.ts) 为精确 DDL。会话索引含起始时间、来源/作品与起始时间、设备；事件索引含会话/类型与事件时间及单列事件时间。无事件去重键，现行会话与事件分开写。 |

## 单位与写入规范

- UTC `DATETIME(3)` ↔ ISO 8601 UTC（`Z`）；入参缺失或非法 `updatedAt` 时现行服务使用服务器时间。设备进度用整数秒，百分比 0–100，QoE 时长/位置用毫秒，码率用 kbps；轨道协议使用其各自单位。
- SQL 值一律参数绑定；动态表名/列名只用代码内白名单；多设备数据读写需带设备条件，不使用真实生产数据作为测试夹具。
- 不得通过修改 `CREATE TABLE IF NOT EXISTS` 假装完成历史库升级。拟变更需附已脱敏的 `SHOW CREATE TABLE`/索引证据、受影响写入方、临时库验证、扩容/回填/切换顺序、回滚、锁和停机评估；经主 Agent 与库负责人批准后实施。
- 不新增真实设备标识、签名媒体 URL、代理订阅或凭证到日志/夹具；QoE 新字段要说明采集目的、脱敏、保留期限和删除责任。跨设备方案不可直接重用装置 ID 当用户凭证。
