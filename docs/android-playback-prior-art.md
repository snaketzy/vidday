# Vidday Android 播放能力对照与专利初筛

范围：中国发明专利可专利性初筛；Vidday `dev.android`，基线 `e71f0b4`。对照场景是 Android 手机和 Android TV 上的 HLS 点播、外挂 PGS 位图字幕、随机跳转与低内存表现。本报告只使用公开产品资料、公开源码及专利文献对照本地实现；未做竞品真机测试、完整同族检索或自由实施分析（FTO）。

## 决策摘要

现版不建议直接申报。外挂 `.sup` 已有明确产品先例，时间戳到文件位置的定位思路也已有相近披露。当前值得保留的产品能力是：播放既有 HLS 视频时，由客户端独立加载和叠加原始位图字幕，不需要为了选中字幕而重编码视频。现有公开资料尚未确认有单一文献逐项披露 Vidday 的完整组合，但这不意味着具备新颖性或创造性。

## 产品能力对照

| 对标对象 | 已有公开证据 | 与 Vidday 对照时的边界 |
| --- | --- | --- |
| Vidday Android / TV | HLS 自动码率；外挂 `.sup` 按轨从网络下载到磁盘；客户端按播放时间读取并解码字幕，再叠加到视频上。 | 冷缓存要等字幕文件下载完才建索引，按需的是**本地读取与解码**，不是网络按需下载。无竞品性能数据。 |
| Kodi VideoPlayer | [Kodi v17 更新日志](https://kodi.wiki/view/Archive:Kodi_v17_(Krypton)_changelog)已列外挂 PGS/`.sup`；[官方字幕 Wiki](https://kodi.wiki/view/Subtitles)列 PGS 和 SUP；[Kodi 论坛](https://forum.kodi.tv/archive/index.php?thread-356403.html)记录 v20 夜版对自定义字幕目录的扫描。 | 是最直接的外挂能力先例。自定义目录扫描与最早支持不是一回事；特定 HLS 输入或流媒体插件能否走相同路径，需按版本实测。 |
| MX Player（Android） | [历史更新日志](https://sites.google.com/site/mxvpen/features/changelog)明确列出外挂 PGS (`*.sup`)。 | 最直接的 Android 手机功能对标之一；当前发行版、TV 客户端及 HLS＋远程外挂组合未实测。 |
| mpv | [公开问题 #14021](https://github.com/mpv-player/mpv/issues/14021)记录 MP4 加外挂 PGS 的播放与跳转后旧字幕残留。 | 证明该能力和跳转恢复问题均已公开；不代表当前版本仍有同一问题，也不代表 Android 前端均有同样表现。 |
| Emby Android TV | [官方兼容表](https://emby.media/support/articles/Android-TV.html)把 PGS 列入 Direct Play；[历史论坛答复](https://emby.media/community/topic/113248-does-it-support-external-pgs-sup-subtitles/)曾称不支持外挂 `.sup`。 | PGS Direct Play 不等于服务器能识别并分发独立 `.sup`；历史答复不能当作当前版本不支持的证据。 |
| Plex | [官方说明](https://support.plex.tv/articles/200471133-adding-local-subtitles-to-your-media/)称部分客户端支持 PGS，许多客户端需要烧录；[社区案例](https://forums.plex.tv/t/lg-webos-unnecessarily-transcodes-4k-video-when-dts-audio-and-subtitles-are-used/941834/2)报告特定 Android TV 客户端无需视频转码即可播放 PGS。 | 不应从社区案例推断独立 `.sup` 能在当前 Android TV 链路直接显示。对照时要记录实际 Direct Play / Direct Stream / 转码路径。 |
| Jellyfin / VLC Android | [Jellyfin 兼容表](https://jellyfin.org/docs/general/clients/codec-support/)涉及容器与字幕兼容性；[VLC Android 官方页](https://www.videolan.org/vlc/download-android.html)确认支持 Android TV 及内嵌和外挂字幕。 | 这些证据不足以确认当前官方 Android TV 客户端支持“远程外挂 `.sup`＋HLS、不烧录”。记为未确认，不记为不支持。 |

## 最接近的公开技术

| 公开资料 | 已披露 | 对 Vidday 的影响 |
| --- | --- | --- |
| [FFmpeg 4.4 `supdec.c`](https://ffmpeg.org/doxygen/4.4/supdec_8c_source.html)、[PGS decoder](https://ffmpeg.org/doxygen/4.2/pgssubdec_8c_source.html) | SUP 解复用读取 PTS/DTS，记录数据包位置并声明通用索引；已有 PGS 解码器。 | 去除 SUP 封装、提取时间戳、记录位置和解码都不是空白。未证明 FFmpeg 使用同样的“只扫段头，按呈现组建立区间，再重组给 Media3 解码”的流程。 |
| [KR20050075467A，2005-07-21 公开](https://patents.google.com/patent/KR20050075467A/ko) | 独立字幕流；通过 Clip Info 中的 `EP_map` 把 PTS 映射到字幕流地址，从指定位置播放。 | 时间到位置的定位思想已公开。它是光盘侧预置映射，不等同于 Android 端扫描独立 `.sup` 临时建索引。 |
| [CN113014834A，2021-06-22 公开](https://patents.google.com/patent/CN113014834A/zh) | 通过循环存储调色板数据组的索引、按索引读取并在显示后释放，降低图片字幕内存占用。 | “按索引显示图片字幕并控制内存”已有近邻方案。它不是 Vidday 的文件偏移索引或同样的延迟解码顺序。 |
| [Media3 支持格式](https://developer.android.com/media/media3/exoplayer/supported-formats)、[SIGCOMM 2014 缓冲驱动 ABR](https://dl.acm.org/doi/10.1145/2619239.2626296) | HLS 是成熟播放能力；按缓冲占用调整码率、区分起播和稳态也有早期公开研究。 | 当前 Android 使用 `AdaptiveTrackSelection` 与 `DefaultLoadControl`，主要是参数配置。当前基线未见自定义起播门控，不建议以 ABR 或起播阈值单独申报。 |

检索概念包括 `external PGS / SUP subtitle`、`PTS / byte offset / entry-point map`、`bitmap subtitle / on-demand decoding / seek`，并查阅图片字幕相关专利分类 H04N5/278 的代表性文献。本轮是选取最相关文献的初筛，不是对全部国家、分类和同族权利要求的穷尽检索。新颖性判断应对照单一文献的全部必要特征；创造性还需判断多个公开教导能否被本领域技术人员显而易见地组合。

## 当前实现与下一轮验证

- `NativePlayerView.kt:300–356`：切换到未缓存的字幕轨时，先将整个 `.sup` 流式写入磁盘，再扫描文件。与整份读入堆相比有工程价值，但不减少冷缓存首次加载必须接收的数据量。
- `PgsSubtitleTrack.kt:102–156,186–230`：按呈现时间二分定位；读取该次呈现的段范围，重组后交给 Media3 解码，缓存当前 cue。当前查新应围绕这条具体组合，而不是“能播放外挂 PGS”。
- `PgsOverlayView.kt:68–144`：按播放器位置取字幕，并映射到实际画面区域。当前读盘和解码发生在覆盖层刷新调用链路上；低内存收益不能替代掉帧数据。

建议先在 Galaxy S23 Ultra 和一台低内存 Android TV 上做两类实验。产品对比用同一素材，分别测“本地视频＋同一外挂 `.sup`”和“同一 HLS＋远程外挂 `.sup`”；无对应入口就标为不适用，不能与服务端烧录直接混测。实现对比用同一批字幕，对照正向顺播、冷缓存跳转、热缓存跳转和连续切轨，优先记录首次字幕延迟、跳转后首条正确字幕延迟（P50/P95）、峰值 PSS 和掉帧，并记录实际网络下载量。

研发上最值得验证的缺口是：对依赖前序调色板或图形对象的 PGS 呈现，随机跳转后能否在不扩大内存和延迟的情况下正确恢复；以及远程字幕能否避免冷缓存整文件下载。目前不把这些设想记为已有能力，也不预设它们有专利性。若测试确认具体问题，且新机制能证明相较公开方案有明确区别和技术收益，再做扩展查新、交专利代理师评审。
