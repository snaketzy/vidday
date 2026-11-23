# Vidday Android：PGS 专利查新第二轮

范围：中国发明专利申请前的公开资料查新。代码基线：`dev.android` / `e71f0b4`。承接[第一轮报告](android-playback-prior-art.md)，只查外挂 PGS 的跨呈现组恢复和远程按需读取。未上传项目代码，未修改播放器，未做真机验证、完整专利同族检索或自由实施分析（FTO）。

## 决策

**现版仍不建议申报。** “PGS 按时间定位”“从独立解码点恢复”“字幕分段或 HTTP Range 下载”分别有相近或直接公开证据。还值得研发验证的，是不改写原始 `.sup` 时，能否让客户端只取目标呈现所需的前序数据，无须整文件下载或从上一个解码入口顺序回放，并在连续跳转下保持正确性。这个方向当前尚未实现；本轮未核实单一来源完整披露该组合，但不能据此判断可授权。

## A. 跳转后的字幕状态恢复

| 证据 | 已披露 | 与 Vidday 的差别 |
| --- | --- | --- |
| [WO2010038412A1](https://patents.google.com/patent/WO2010038412A1/en)，2010-04-08 公开；同族 [EP2352153A1 原文](https://data.epo.org/publication-server/rest/v1.0/publication-dates/20110803/patents/EP2352153NWA1/document.pdf)，重点 `[0097]–[0102]`、`[0118]` | PG 的 `Epoch Start` 与 `Acquisition Point` 可包含构成显示所需的完整段；`Normal Case` 可以只有相对前组的差异。`[0100]` 的示例只有 PCS 与 END，复用已提供的 ODS；正文直接说明不能只用这组恢复画面。 | 属于蓝光 PG 结构与双视图播放方案，不是对 Android 上未改写远程 `.sup` 提取特定依赖字节的披露；但是“存在跨组依赖”“可从已有入口恢复”的直接先例。 |
| [FFmpeg 4.4 `pgssubdec.c`](https://ffmpeg.org/doxygen/4.4/pgssubdec_8c_source.html) | 解码器维护调色板和图形对象缓存，查找对象及调色板，按 epoch 状态清理缓存。 | 能用于顺序解码正确性基线；这份源码本身不证明播放器能在冷缓存跳转时只通过网络获取必要的前序段。 |
| [Media3 1.4.1 官方源码包](https://dl.google.com/dl/android/maven2/androidx/media3/media3-extractor/1.4.1/media3-extractor-1.4.1-sources.jar) / `androidx/media3/extractor/text/pgs/PgsParser.java` | `parse()` 开始时重置 `cueBuilder`；处理 END 后再次重置。 | 当前 Vidday 的 `PgsSubtitleTrack.kt:102–156,186–230` 只重组命中的一个 Display Set，不追踪前序对象或调色板。复用 `PgsParser` 实例不等于保留该状态。把原样多组数据交给同一个 `parse()` 也不能假定会跨 END 保留状态。 |

**代码判断：** 对确实依赖前序对象或调色板的呈现组，现版缺少恢复机制；影响可能同时出现在顺播和跳转，不一定是跳转专属问题。这是静态推断，不代表某个现网片源已经复现。

## B. 远程 `.sup` 的按时刻取数

| 证据 | 已披露 | 与 Vidday 的差别 |
| --- | --- | --- |
| [VobSub 格式](https://wiki.multimedia.cx/index.php/VOBsub) / [美国国会图书馆格式说明](https://www.loc.gov/preservation/digital/formats//fdd/fdd000571.shtml) | 外挂位图字幕早已有 `.idx` 时间戳和字节偏移指向独立 `.sub` 的设计。第一轮的 [KR20050075467A](https://patents.google.com/patent/KR20050075467A/ko) 也有字幕流的 PTS 到地址映射。 | “独立位图字幕＋时间到字节索引”已有先例；不等同于索引目标 PGS 所引用的一组离散前序段。 |
| [RFC 8216 §3.5、§4.3.2.2](https://www.rfc-editor.org/rfc/rfc8216.html)；[RFC 9110 §14](https://www.rfc-editor.org/rfc/rfc9110.html#section-14) | HLS 已定义时间切分的 WebVTT 和媒体字节区间；HTTP 已定义 Range 请求。 | WebVTT 不能直接推出原始 PGS 的跨组状态处理，但“字幕随时间分片”和“获取字节范围”均不宜作为独立创新点。 |
| [CN101217638B](https://patents.google.com/patent/CN101217638B/zh)（A 文献 2008-07-09 公开） | 权利要求 1 以视频/音频帧的时间戳与文件偏移映射得到下载位置，服务器截取片段。 | 是时间到字节的网络分段近邻；不是位图字幕，也不是客户端根据目标组补取跨组依赖。 |
| [libbitsub 1.12.0 文档](https://cdn.jsdelivr.net/npm/libbitsub@1.12.0/README.md)，[npm 发布元数据](https://registry.npmjs.org/libbitsub)记录 2026-08-05 UTC；[版本源码包](https://registry.npmjs.org/libbitsub/-/libbitsub-1.12.0.tgz) | Web/WASM 渲染库已公开远程 PGS 的 Range 顺序分块与渐进索引。核对发行包 `package/dist/ts/range-loader.js` 的 `fetchByRangeChunks`：从起始偏移依次取块，最终组装完整资源。 | 这是远程 PGS 最直接的工程近邻。已核对的加载路径不是按目标播放时刻和字幕依赖选择离散字节、跳过无关块。Web 和 Android 的差异本身不构成创新。 |

**现版边界：** `NativePlayerView.kt:265–289` 的 JSON 是轨道目录，不是 PTS 字节索引；`:300–356` 在未命中缓存时整份写盘、再建立本地索引。即便采用顺序 Range 或边收边解析，也只能以渐进可用为卖点，不能等同于冷缓存跳转时跳过无关字节。

## 验证与申报门槛

1. **先测正确性。** 用可控样本覆盖仅更新调色板、复用图形对象、对象跨段、清屏和 epoch 切换。待测时刻的期望画面用从有效入口顺序解码得到，做像素或区域对照；分别跑顺播、冷缓存正反向跳转和连续跳转。
2. **再测成本。** 用同一份原始 `.sup` 对比整文件落盘、顺序 Range 渐进加载、从最近可用入口连续读取，以及待验证的按依赖取数。记录首条正确字幕 P50/P95、到该字幕为止的下载字节、请求次数和峰值 PSS。增加高 RTT 下的测试；字节减少但请求过碎，延迟仍可能更差。
3. **最后决定是否申报。** 只有在依赖识别、数据选取或减少请求次数的规则足够具体、结果可复现，且能解释为何不能由蓝光入口恢复、VobSub 字节索引与渐进 Range 直接推得时，才值得针对拟保护特征补做引证链、同族和权利要求对照。没有达到这一步，就优先按产品兼容性和性能改进立项。

本轮检索概念：`PGS / SUP + Display Set / Acquisition Point / Normal Case / palette / object`；`external bitmap subtitle + PTS / filepos / range / seek`；`外挂位图字幕 + 字节范围 / 随机定位 / 按需下载`。技术披露用于判断可专利性，不表示相关权利当前有效或 Vidday 构成侵权。
