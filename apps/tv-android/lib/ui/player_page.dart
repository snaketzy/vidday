import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/native_player.dart';
import '../core/qoe.dart';
import 'widgets.dart';

/// Web（`sm`）断点：可用宽度小于该值时用紧凑间距，否则用常规间距。
/// 竖屏与全屏（横屏）共用同一套面板，仅按宽度自适应。
const double _compactBreakpoint = 640;

/// 底部控制面板容器。窄屏 / 宽屏公用同一个 Key，便于断言布局一致。
const Key kPlayerControlPanelKey = ValueKey<String>('player-control-panel');

/// 顶部信息栏容器（返回 / 片名 / 关闭），横竖屏内边距一致。
const Key kPlayerTopBarKey = ValueKey<String>('player-top-bar');

/// 画面中央的控制簇（后退 10 秒 / 播放暂停 / 前进 10 秒）。
const Key kPlayerCenterControlsKey = ValueKey<String>('player-center-controls');

/// 中央控制簇里的播放 / 暂停圆盘（黑 45% 半透明圆形 + 白色图标，直径 64dp）。
const Key kPlayerPlayPauseKey = ValueKey<String>('player-play-pause');

/// 时间轴进度条。
const Key kPlayerSeekBarKey = ValueKey<String>('player-seek-bar');

/// 拖动时进度条上方的目标时间气泡。
const Key kPlayerSeekBubbleKey = ValueKey<String>('player-seek-bubble');

/// 播放页。
///
/// 进入播放页不会自动全屏、也不强制横屏：由用户点击控制栏的「全屏」自行切换。
/// 控制能力（音量 / 快进快退 / 字幕 / 音轨 / 画质 / 画中画）与 Web 端对齐，
/// 底层由原生 media3 ExoPlayer 承载。
class PlayerPage extends StatefulWidget {
  const PlayerPage({
    super.key,
    required this.api,
    required this.title,
    required this.url,
    this.titleId,
    this.episodeId,
    this.contentType,
    this.titleName,
    this.startPosition,
  });

  final ApiClient api;
  final String title;
  final String url;
  /// QoE 归属：影片 / 剧集 ID（缺省时后台仅按会话展示）
  final int? titleId;
  final int? episodeId;
  final String? contentType;
  final String? titleName;
  /// 续播起点；播放器就绪后只 seek 一次。为空表示从头播放。
  final Duration? startPosition;

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> with WidgetsBindingObserver {
  static const Duration _seekStep = Duration(seconds: 10);
  /// 控制条自动隐藏超时，对齐 Web `CONTROLS_TIMEOUT = 3200`。
  static const Duration _controlsTimeout = Duration(milliseconds: 3200);

  late final NativePlayerController _controller;
  late final QoeTracker _qoe;

  Timer? _hideTimer;
  bool _controlsVisible = true;
  bool _fullscreen = false;
  bool _lastInPip = false;

  /// 静音前的非零音量；取消静音时恢复。初值 1.0（从未调过音量时的兜底）。
  double _lastVolume = 1;

  /// 续播起点；播放器就绪后消费一次即置空，避免反复跳转。
  Duration? _pendingSeek;
  /// 上一次快照的播放状态，用于识别「播放 → 暂停」沿并上报进度。
  bool _wasPlaying = false;
  /// 退播只退出一次（顶栏返回与系统返回共用同一入口）。
  bool _exiting = false;

  /// 本次单击是否用于「唤出控制条」：为 true 时收尾的单击不再切回隐藏。
  ///
  /// 触屏无 hover，按下即唤出（对齐 Web `wakeFromPointer`），故在隐藏态下
  /// 「按下」已经让控制条显形，随后的 `onTap` 不应再把它切回隐藏。
  bool _tapRevealed = false;

  PlayerSnapshot get _snapshot => _controller.snapshot.value;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final start = widget.startPosition;
    _pendingSeek = start != null && start > Duration.zero ? start : null;
    _controller = NativePlayerController()..start();
    _controller.snapshot.addListener(_onSnapshot);
    _qoe = QoeTracker(
      api: widget.api,
      meta: QoeSessionMeta(
        titleId: widget.titleId,
        episodeId: widget.episodeId,
        contentType: widget.contentType,
        titleName: widget.titleName ?? widget.title,
        playUrl: widget.url,
      ),
    )..start();
    _scheduleHide();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hideTimer?.cancel();
    // 兜底上报一次最终进度（暂停 / 退后台路径已上报，upsert 幂等）
    unawaited(_saveProgress(_snapshot));
    _controller.snapshot.removeListener(_onSnapshot);
    unawaited(_qoe.dispose());
    unawaited(_controller.dispose());
    // 用户在全屏状态下退出时把系统 UI 还原
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 退到后台时上报一次进度；失败静默，不阻断播放。
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      unawaited(_saveProgress(_snapshot));
    }
  }

  void _onSnapshot() {
    if (!mounted) return;
    final snapshot = _controller.snapshot.value;
    _qoe.onSnapshot(snapshot);

    // 续播：播放器就绪（拿到总时长）后只 seek 一次
    final pending = _pendingSeek;
    if (pending != null && snapshot.duration > Duration.zero) {
      _pendingSeek = null;
      unawaited(_controller.seekTo(pending));
    }

    // 「播放 → 暂停」沿上报一次进度（片尾结束也落一次，达 98% 后下次从头播）
    final wasPlaying = _wasPlaying;
    _wasPlaying = snapshot.isPlaying;
    if (wasPlaying && !snapshot.isPlaying) {
      unawaited(_saveProgress(snapshot));
    }
    // 仅在播放中才计时隐藏：播放开始 → 重新计时；暂停 / 结束 / 缓冲中 →
    // 取消计时、控件常驻（对齐 Web `wake()` 中对 isPlaying 的判断）。
    if (wasPlaying != snapshot.isPlaying) {
      _scheduleHide();
    }

    if (snapshot.inPip != _lastInPip) {
      _lastInPip = snapshot.inPip;
      _hideTimer?.cancel();
      _controlsVisible = !snapshot.inPip;
      if (_controlsVisible) _scheduleHide();
    }
    setState(() {});
  }

  /// 重新开始自动隐藏计时；**仅在播放中**才排程，否则取消计时（控件常驻）。
  void _scheduleHide() {
    _hideTimer?.cancel();
    if (!_snapshot.isPlaying) return;
    _hideTimer = Timer(_controlsTimeout, () {
      if (!mounted) return;
      setState(() => _controlsVisible = false);
    });
  }

  /// 触屏上「任意按下 / 移动即唤出控制条并重置计时」，对齐 Web 的
  /// `onMouseMove → wakeFromPointer`（Android 无 hover，用触摸代替鼠标移动）。
  void _wakeFromPointer() {
    if (!_controlsVisible) {
      setState(() => _controlsVisible = true);
    }
    _scheduleHide();
  }

  /// 画面任意触摸按下：先把控制条唤出并重置计时；若本次是「唤出」，
  /// 收尾的单击不再切回隐藏（见 [_tapRevealed]）。
  void _onPointerDown() {
    _tapRevealed = !_controlsVisible;
    _wakeFromPointer();
  }

  /// 画面单击：切换控制条显隐。
  ///
  /// 有意与 Web 不同：Web 整屏热区是「单击 = 播放 / 暂停」，因为它依赖鼠标
  /// `mousemove` 唤出控制条；Android 无 hover，若单击即播放 / 暂停，则
  /// 「播放中想看到控制条必须先暂停」。故此处保留「单击切换显隐」的触屏语义。
  void _onTap() {
    if (_tapRevealed) {
      // 本次按下已用于唤出控制条，不再立即切回隐藏。
      _tapRevealed = false;
      return;
    }
    _toggleControls();
  }

  void _toggleControls() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) {
      _scheduleHide();
    } else {
      _hideTimer?.cancel();
    }
  }

  void _keepVisible() {
    _hideTimer?.cancel();
  }

  Future<void> _togglePlay() async {
    final snapshot = _snapshot;
    if (snapshot.isPlaying) {
      await _controller.pause();
    } else {
      await _controller.play();
    }
    _scheduleHide();
  }

  Future<void> _toggleFullscreen() async {
    final next = !_fullscreen;
    setState(() => _fullscreen = next);
    if (next) {
      await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    _scheduleHide();
  }

  Future<void> _enterPip() async {
    final entered = await _controller.enterPip();
    if (!entered && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('当前设备不支持画中画')),
      );
    }
  }

  // ---------------------------------------------------------------- 进度

  /// 上报一次观看进度（暂停 / 退播 / 退后台 / 释放时调用）。
  ///
  /// 仅电影接入；剧集等待 RFC-04。失败静默，不阻断播放。
  Future<void> _saveProgress(PlayerSnapshot snapshot) async {
    if (widget.contentType != 'movie') return;
    final titleId = widget.titleId;
    if (titleId == null) return;
    final duration = snapshot.duration.inSeconds;
    final position = snapshot.position.inSeconds;
    // 时长未知或尚未开始播放时不写记录，避免用 0 覆盖已有续播点。
    if (duration <= 0 || position <= 0) return;
    try {
      await widget.api.saveWatchProgress(
        titleId: titleId,
        episodeId: widget.episodeId,
        position: position,
        duration: duration,
        percent: progressPercent(position, duration),
      );
    } catch (_) {
      // 进度上报失败不影响播放
    }
  }

  /// 由当前快照构造回传给详情页的进度；不适用（剧集 / 无时长）时返回 null。
  WatchProgress? _finalProgress(PlayerSnapshot snapshot) {
    if (widget.contentType != 'movie') return null;
    final titleId = widget.titleId;
    final duration = snapshot.duration.inSeconds;
    if (titleId == null || duration <= 0) return null;
    return WatchProgress.fromPlayback(
      titleId: titleId,
      episodeId: widget.episodeId,
      position: snapshot.position.inSeconds,
      duration: duration,
    );
  }

  /// 退播：先尽力上报最终进度，再把最终位置回传详情页，保证续播状态即时刷新。
  Future<void> _exitPlayer() async {
    if (_exiting) return;
    _exiting = true;
    final navigator = Navigator.of(context);
    final snapshot = _snapshot;
    final result = _finalProgress(snapshot);
    await _saveProgress(snapshot);
    if (mounted) navigator.pop(result);
  }

  // ---------------------------------------------------------------- 菜单

  /// 轨道入口：字幕 / 音频 / 画质各由一个独立按钮打开，各自只含对应分组的弹层。
  ///
  /// 弹层载具沿用与音量一致的 bottom sheet 风格；当前项沿用 [_buildSettingGroup]
  /// 的选中样式，选中后调用对应控制器方法（字幕 / 音轨 / 画质）。
  Future<void> _openTrackSheet(_SettingKind kind) async {
    _keepVisible();
    final snapshot = _snapshot;
    final choice = await showModalBottomSheet<_SettingChoice>(
      context: context,
      backgroundColor: const Color(0xFF16161C),
      showDragHandle: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.7,
            ),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.only(bottom: 12),
              children: <Widget>[
                _buildSettingGroup(
                  title: _settingTitle(kind),
                  options: _settingOptions(kind, snapshot),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (!mounted) return;
    if (choice != null) {
      switch (choice.kind) {
        case _SettingKind.subtitle:
          await _controller.selectSubtitle(choice.id);
        case _SettingKind.audio:
          if (choice.id != null) await _controller.selectAudio(choice.id);
        case _SettingKind.quality:
          if (choice.id != null) await _controller.selectVideo(choice.id);
      }
    }
    _scheduleHide();
  }

  /// 分组标题：字幕 / 音轨 / 画质（与 Web 设置弹层的分组名一致）。
  String _settingTitle(_SettingKind kind) {
    switch (kind) {
      case _SettingKind.subtitle:
        return '字幕';
      case _SettingKind.audio:
        return '音轨';
      case _SettingKind.quality:
        return '画质';
    }
  }

  /// 构建某一分组的可选项：字幕含「关闭字幕」，音频无轨时保留占位，画质含「自动」。
  List<_SettingOption> _settingOptions(
    _SettingKind kind,
    PlayerSnapshot snapshot,
  ) {
    switch (kind) {
      case _SettingKind.subtitle:
        return <_SettingOption>[
          _SettingOption(
            _SettingKind.subtitle,
            null,
            '关闭字幕',
            selected: snapshot.selectedText == null,
          ),
          for (final track in snapshot.textTracks)
            _SettingOption(
              _SettingKind.subtitle,
              track.id,
              track.label,
              selected: track.selected,
            ),
        ];
      case _SettingKind.audio:
        if (snapshot.audioTracks.isEmpty) {
          return <_SettingOption>[
            const _SettingOption(
              _SettingKind.audio,
              null,
              '暂无音轨',
              enabled: false,
            ),
          ];
        }
        return <_SettingOption>[
          for (final track in snapshot.audioTracks)
            _SettingOption(
              _SettingKind.audio,
              track.id,
              track.label,
              selected: track.selected,
            ),
        ];
      case _SettingKind.quality:
        return <_SettingOption>[
          _SettingOption(
            _SettingKind.quality,
            'auto',
            '自动',
            selected: snapshot.autoQuality,
          ),
          for (final track in snapshot.videoTracks)
            _SettingOption(
              _SettingKind.quality,
              track.id,
              track.label,
              selected: !snapshot.autoQuality && track.selected,
            ),
        ];
    }
  }

  /// 菜单中的一组（字幕 / 音轨 / 画质），组内每项可点选。
  Widget _buildSettingGroup({
    required String title,
    required List<_SettingOption> options,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
          child: Text(
            title,
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        for (final option in options)
          ListTile(
            dense: true,
            title: Text(
              option.label,
              style: TextStyle(
                color: option.selected ? kAccent : Colors.white,
                fontWeight:
                    option.selected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
            trailing: option.selected
                ? const Icon(Icons.check, color: kAccent, size: 20)
                : null,
            onTap: option.enabled
                ? () => Navigator.of(context).pop(
                      _SettingChoice(option.kind, option.id),
                    )
                : null,
          ),
      ],
    );
  }

  /// 音量弹层：对齐 Web 音量 Popover 的三段结构。
  ///
  /// ①静音 / 取消静音 切换按钮；②「音量」标签 + 百分比读数（静音为 0%）；
  /// ③音量滑块。弹层是独立路由，页面 `setState` 不会重建它，故直接用
  /// [ValueListenableBuilder] 监听真实快照，保证静音后文案与百分比立即正确。
  Future<void> _openVolume() async {
    _keepVisible();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF16161C),
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) {
        return ValueListenableBuilder<PlayerSnapshot>(
          valueListenable: _controller.snapshot,
          builder: (context, snapshot, _) {
            // 状态以快照为唯一来源：原生把「音量 0」定义为静音，二者取或。
            final bool isMuted = snapshot.muted || snapshot.volume == 0;
            final double level =
                isMuted ? 0 : snapshot.volume.clamp(0.0, 1.0).toDouble();
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    // ①静音 / 取消静音 切换（带音量图标）
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                      leading: Icon(
                        isMuted ? Icons.volume_off : Icons.volume_up,
                        color: Colors.white,
                      ),
                      title: Text(
                        isMuted ? '取消静音' : '静音',
                        style: const TextStyle(color: Colors.white),
                      ),
                      onTap: () => unawaited(_toggleMute(snapshot)),
                    ),
                    // ②「音量」标签 + 百分比读数
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: <Widget>[
                          const Text(
                            '音量',
                            style:
                                TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                          Text(
                            '${(level * 100).round()}%',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    // ③音量滑块：拖动即设为音量（非零值同步记住，供取消静音恢复）
                    Slider(
                      value: level,
                      onChanged: (value) {
                        if (value > 0) _lastVolume = value;
                        unawaited(_controller.setVolume(value));
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    _scheduleHide();
  }

  /// 静音 = `setVolume(0)`；取消静音恢复静音前的非零音量。
  ///
  /// 不新增 / 修改原生通道方法（`vidday/player` 属公开契约）：原生 `setVolume`
  /// 内已把「音量为 0」判定为静音并把 `muted` 随快照下发，故此处仅调用现有方法。
  /// `_lastVolume` 为 0 或无效（越界 / 非有限）时回落到 1.0。
  Future<void> _toggleMute(PlayerSnapshot snapshot) async {
    final bool isMuted = snapshot.muted || snapshot.volume == 0;
    if (isMuted) {
      double restore = _lastVolume;
      if (!restore.isFinite || restore <= 0 || restore > 1) restore = 1;
      await _controller.setVolume(restore);
    } else {
      _lastVolume = snapshot.volume;
      await _controller.setVolume(0);
    }
  }

  // ---------------------------------------------------------------- 构建

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final pgsIndexUrl = pgsIndexUrlFor(widget.url);

    // 拦截系统返回，与顶栏返回共用同一退播入口，保证进度上报与回传只发生一次。
    return PopScope<WatchProgress?>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) unawaited(_exitPlayer());
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            Center(
              child: AspectRatio(
                aspectRatio: snapshot.aspectRatio,
                child: AndroidView(
                  viewType: 'vidday/player',
                  creationParams: <String, dynamic>{
                    'url': widget.url,
                    'pgsIndexUrl': pgsIndexUrl,
                    'autoplay': true,
                  },
                  creationParamsCodec: const StandardMessageCodec(),
                ),
              ),
            ),
            Positioned.fill(
              child: Listener(
                behavior: HitTestBehavior.opaque,
                // 任意按下 / 移动都唤出控制条并重置计时（触屏等价于鼠标移动）。
                onPointerDown: (_) => _onPointerDown(),
                onPointerMove: (_) => _wakeFromPointer(),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _onTap,
                ),
              ),
            ),
            if (snapshot.error != null)
              _buildError(snapshot.error!)
            else if (snapshot.duration == Duration.zero)
              const Center(child: CircularProgressIndicator()),
            if (snapshot.isBuffering && snapshot.duration > Duration.zero)
              const Center(child: CircularProgressIndicator()),
            // 外挂 PGS 可能要下上百 MB，指示器不跟控制条一起自动隐藏
            if (snapshot.subtitleLoading != null)
              _buildSubtitleLoading(snapshot.subtitleLoading!),
            // 控制条常驻于树中（显隐由 AnimatedOpacity + IgnorePointer 控制，
            // 以便有 300ms 淡入淡出）；仅画中画时整体移除。
            if (!snapshot.inPip) _buildControls(snapshot),
          ],
        ),
      ),
    );
  }

  Widget _buildError(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 12),
            Text(
              '播放失败：$message',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => _controller.retry(),
              child: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }

  /// 外挂字幕下载期间的提示：大轨（最大 137MB）可能等十几秒，必须有反馈。
  Widget _buildSubtitleLoading(SubtitleLoading loading) {
    final progress = loading.progress;
    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        // 抬到底部控制面板上方，避免被面板遮挡。
        padding: const EdgeInsets.only(bottom: 160),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xCC000000),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white70,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                progress == null
                    ? '${loading.label} 加载中…'
                    : '${loading.label} 加载中… ${(progress * 100).round()}%',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 三段式控制层骨架：顶栏贴顶 / 中央簇居中于「顶栏与底栏之间」的可用区域 /
  /// 底栏贴底。中央簇不再用 `Stack` + `Align(center)` 悬浮，结构上不可能与底栏
  /// 重叠（撤销 AP-09 的几何悬浮方案，回归基线骨架）。
  ///
  /// 显隐统一由 `_controlsVisible` 驱动：300ms 淡入淡出 + 隐藏态不可点。
  Widget _buildControls(PlayerSnapshot snapshot) {
    final double width = MediaQuery.sizeOf(context).width;
    final bool compact = width < _compactBreakpoint;
    return IgnorePointer(
      // 动画期间也保证「隐藏即不可点」（_controlsVisible 立即为 false）。
      ignoring: !_controlsVisible,
      child: AnimatedOpacity(
        opacity: _controlsVisible ? 1 : 0,
        duration: const Duration(milliseconds: 300),
        child: SafeArea(
          child: Column(
            children: <Widget>[
              _buildTopBar(compact),
              // 中央簇居中于顶栏与底栏之间的可用区域。
              Expanded(child: Center(child: _buildCenterControls(snapshot))),
              // Column 默认居中；显式居中以确保浮层水平居中。
              Align(
                alignment: Alignment.center,
                child: _buildBottomBar(snapshot, compact),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 底部居中悬浮面板（对齐 Web 的浮动控制条）。
  ///
  /// 两行**恒有**：上排 6 个次级按钮（音量 / 画质 / 音轨 / 字幕 /（画中画）/ 全屏），
  /// 下排时间轴 `[当前时间][进度条][总时长]`；横竖屏一致，仅按宽度自适应。
  ///
  /// `bottomGap = landscape ? 36 : (compact ? 12 : 24)`；`padding = compact ? 8 : 16`；
  /// `rowGap = compact ? 6 : 8`；横屏宽度 `min(屏宽 × 3/4, 768)` 且水平居中，
  /// 竖屏 `maxWidth 768`。圆角 12dp、1dp `white/15` 描边、`black/85` 背景、投影；
  /// 面板为纯半透明（无毛玻璃、无 `BackdropFilter`）。
  Widget _buildBottomBar(PlayerSnapshot snapshot, bool compact) {
    final double screenWidth = MediaQuery.sizeOf(context).width;
    final bool landscape =
        MediaQuery.of(context).orientation == Orientation.landscape;
    final double bottomGap = landscape ? 36 : (compact ? 12 : 24);
    final double padding = compact ? 8 : 16;
    final double rowGap = compact ? 6 : 8;
    // 横屏宽度 = 屏幕宽度 × 3/4，并保留 768dp 上限；竖屏沿用 calc(100% - 16dp) + 768dp 上限。
    final double maxPanelWidth =
        landscape ? math.min(screenWidth * 0.75, 768) : 768;
    final BorderRadius radius = BorderRadius.circular(12);
    return Padding(
      padding: EdgeInsets.only(left: 8, right: 8, bottom: bottomGap),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxPanelWidth),
        // 投影画在不裁剪的外层。
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: radius,
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x73000000),
                blurRadius: 24,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Container(
            key: kPlayerControlPanelKey,
            width: double.infinity,
            padding: EdgeInsets.all(padding),
            decoration: BoxDecoration(
              color: const Color(0xD9000000), // black/85
              borderRadius: radius,
              border: Border.all(color: const Color(0x26FFFFFF)), // white/15
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                // 上排：6 个次级按钮（居中）。
                _buildPanelControlsRow(snapshot, compact),
                SizedBox(height: rowGap),
                // 下排：时间轴「[当前时间][进度条][总时长]」。两行恒有。
                _buildPanelTimelineRow(snapshot, compact),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 面板第一行：按用户指定顺序排列的 6 个控制按钮。
  ///
  /// 顺序（不可增删、不可调序）：
  ///   1 音量　2 画质　3 音轨　4 字幕　5 画中画（仅设备支持时存在）　6 全屏
  /// 「后退 10 秒 / 播放暂停 / 前进 10 秒」已移到画面正中央的控制簇
  /// （见 [_buildCenterControls]），底部面板内不再出现它们。
  ///
  /// 横竖屏共用同一顺序：居中单行；空间不足时**居中换行**；不使用 `FittedBox`
  /// 缩放、命中区仍 ≥48dp。
  ///
  /// 实现上横竖屏共用同一个有序列表，避免「左组 / 中组 / 右组」
  /// 分别构造后拼装导致顺序与几何不一致。
  Widget _buildPanelControlsRow(PlayerSnapshot snapshot, bool compact) {
    // 6 个按钮的有序列表（画中画仅在设备支持时存在，其余恒有）。
    final List<Widget> buttons = <Widget>[
      // 1. 音量
      _panelIconButton(
        _volumeIcon(snapshot),
        '音量',
        _openVolume,
        compact: compact,
      ),
      // 2. 画质
      _panelIconButton(
        Icons.hd_outlined,
        '画质',
        () => _openTrackSheet(_SettingKind.quality),
        compact: compact,
      ),
      // 3. 音轨
      _panelIconButton(
        Icons.audiotrack,
        '音轨',
        () => _openTrackSheet(_SettingKind.audio),
        compact: compact,
      ),
      // 4. 字幕
      _panelIconButton(
        Icons.subtitles_outlined,
        '字幕',
        () => _openTrackSheet(_SettingKind.subtitle),
        compact: compact,
      ),
      // 5. 画中画（设备支持时才有）
      if (snapshot.pipSupported)
        _panelIconButton(
          Icons.picture_in_picture_alt,
          '画中画',
          _enterPip,
          compact: compact,
        ),
      // 6. 全屏 / 退出全屏
      _panelIconButton(
        _fullscreen ? Icons.fullscreen_exit : Icons.fullscreen,
        _fullscreen ? '退出全屏' : '全屏',
        _toggleFullscreen,
        compact: compact,
      ),
    ];

    // 横竖屏共用：居中单行；空间不足时居中换行（不缩放、命中区仍 ≥48dp）。
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: buttons,
    );
  }

  IconData _volumeIcon(PlayerSnapshot snapshot) {
    if (snapshot.muted || snapshot.volume == 0) return Icons.volume_off;
    return snapshot.volume < 0.5 ? Icons.volume_down : Icons.volume_up;
  }

  /// 时间轴行：`[当前时间] [进度条] [总时长]`。
  ///
  /// 竖屏由底部面板作为第二行渲染；横屏上移到顶栏、渲染在标题行下方。
  Widget _buildPanelTimelineRow(PlayerSnapshot snapshot, bool compact) {
    const TextStyle timeStyle = TextStyle(
      fontSize: 12,
      fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
    );
    return Row(
      children: <Widget>[
        // 当前时间右对齐、等宽数字、white/85，最小宽度约 40dp。
        SizedBox(
          width: 40,
          child: Text(
            _formatTime(snapshot.position),
            textAlign: TextAlign.right,
            maxLines: 1,
            style: timeStyle.copyWith(color: const Color(0xD9FFFFFF)),
          ),
        ),
        SizedBox(width: compact ? 8 : 12),
        Expanded(
          child: _SeekBar(
            key: kPlayerSeekBarKey,
            position: snapshot.position,
            duration: snapshot.duration,
            buffered: snapshot.buffered,
            onInteraction: _keepVisible,
            onSeek: (position) {
              unawaited(_controller.seekTo(position));
              _scheduleHide();
            },
          ),
        ),
        SizedBox(width: compact ? 8 : 12),
        // 总时长 12sp、white/70。
        SizedBox(
          width: 40,
          child: Text(
            _formatTime(snapshot.duration),
            maxLines: 1,
            style: timeStyle.copyWith(color: const Color(0xB3FFFFFF)),
          ),
        ),
      ],
    );
  }

  /// ghost 图标按钮：视觉图标 20–22dp，命中区维持 ≥48dp。
  Widget _panelIconButton(
    IconData icon,
    String tooltip,
    VoidCallback onPressed, {
    bool compact = false,
  }) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, color: Colors.white, size: compact ? 20 : 22),
      tooltip: tooltip,
      padding: EdgeInsets.zero,
      // 触摸目标不小于 48dp（视觉图标仍为 20–22dp）。
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
    );
  }

  /// 画面中央的控制簇：`[后退 10 秒] [播放 / 暂停] [前进 10 秒]`。
  ///
  /// 对齐 Web 移动端中央层（`bg-black/45`、`gap-8`、快退快进 `size-12`、播放
  /// `size-16`）：三键整体水平居中，簇内相邻间距 32dp（对齐 `gap-8`）；
  /// 黑 45% 半透明圆形底 + 白色图标，不新增毛玻璃 / `BackdropFilter`。
  ///
  /// 位置来源为「列内 `Expanded > Center`」（回归基线三段式），不再用
  /// `Stack` + `Align(center)` 几何悬浮。`Row(mainAxisSize: MainAxisSize.min)`
  /// 按内容定尺寸，自身既不透明命中也不吞触摸，故簇内空白（含 32dp 间距）
  /// 不会挡住既有的「点击画面切换控制条」手势。
  Widget _buildCenterControls(PlayerSnapshot snapshot) {
    return Row(
      key: kPlayerCenterControlsKey,
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        _centerCircleButton(
          tooltip: '后退 10 秒',
          diameter: 56,
          onPressed: () {
            unawaited(_controller.seekBy(-_seekStep));
            _scheduleHide();
          },
          child: const Icon(Icons.replay_10, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 32),
        _playPauseButton(snapshot),
        const SizedBox(width: 32),
        _centerCircleButton(
          tooltip: '前进 10 秒',
          diameter: 56,
          onPressed: () {
            unawaited(_controller.seekBy(_seekStep));
            _scheduleHide();
          },
          child: const Icon(Icons.forward_10, color: Colors.white, size: 28),
        ),
      ],
    );
  }

  /// 中央控制簇的圆形按钮：黑 45% 半透明圆底 + 白色图标（不使用毛玻璃）。
  ///
  /// 命中区即按钮直径（[diameter]），不小于视觉圆盘；[circleKey] 用于把
  /// [kPlayerPlayPauseKey] 挂到播放 / 暂停圆盘上，供测试与其它代码定位。
  Widget _centerCircleButton({
    required String tooltip,
    required double diameter,
    required VoidCallback onPressed,
    required Widget child,
    Key? circleKey,
  }) {
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: diameter,
        height: diameter,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: Center(
              child: Container(
                key: circleKey,
                width: diameter,
                height: diameter,
                decoration: const BoxDecoration(
                  color: Color(0x73000000), // black/45
                  shape: BoxShape.circle,
                ),
                child: Center(child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// 中央「播放 / 暂停」：黑 45% 半透明圆形 + 白色图标；直径 64dp、图标 32dp。
  ///
  /// 键 [kPlayerPlayPauseKey] 保留在圆盘 `Container` 上（测试与其它代码依赖它）。
  Widget _playPauseButton(PlayerSnapshot snapshot) {
    final bool isPlaying = snapshot.isPlaying;
    return _centerCircleButton(
      tooltip: isPlaying ? '暂停' : '播放',
      diameter: 64,
      circleKey: kPlayerPlayPauseKey,
      onPressed: _togglePlay,
      child: Icon(
        isPlaying ? Icons.pause : Icons.play_arrow,
        color: Colors.white,
        size: 32,
      ),
    );
  }

  /// 顶部信息栏：单行 `[返回] [片名] [关闭]`。
  ///
  /// 内边距横竖屏统一 16dp（撤销 AP-11 横屏收紧的特例）；时间轴**不再**出现在
  /// 顶栏，恒留在底部面板。
  Widget _buildTopBar(bool compact) {
    return Container(
      key: kPlayerTopBarKey,
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        // Web：from-black/85 to-transparent。
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xD9000000), Colors.transparent],
        ),
      ),
      child: Row(
        children: <Widget>[
          _panelIconButton(
              Icons.arrow_back, '返回', _exitPlayer, compact: compact),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Colors.white,
                fontSize: compact ? 15 : 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 「关闭 / 返回详情」与返回共用同一退播入口（_exiting 保证只退播一次）。
          _panelIconButton(
              Icons.close, '关闭', _exitPlayer, compact: compact),
        ],
      ),
    );
  }
}

/// 设置菜单的三个分组。
enum _SettingKind { subtitle, audio, quality }

/// 设置菜单中被选中的一项；[id] 为 null 表示「关闭字幕」这类无实体轨道的选项。
class _SettingChoice {
  const _SettingChoice(this.kind, this.id);

  final _SettingKind kind;
  final String? id;
}

/// 设置菜单中的一个可选项。
class _SettingOption {
  const _SettingOption(
    this.kind,
    this.id,
    this.label, {
    this.selected = false,
    this.enabled = true,
  });

  final _SettingKind kind;
  final String? id;
  final String label;
  final bool selected;

  /// 占位项（如「暂无音轨」）不可点选。
  final bool enabled;
}

/// 支持点击与拖拽定位的进度条（对齐 Web `PlaybackTimeline`）。
class _SeekBar extends StatefulWidget {
  const _SeekBar({
    super.key,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.onSeek,
    required this.onInteraction,
  });

  final Duration position;
  final Duration duration;
  final Duration buffered;
  final ValueChanged<Duration> onSeek;
  final VoidCallback onInteraction;

  @override
  State<_SeekBar> createState() => _SeekBarState();
}

class _SeekBarState extends State<_SeekBar> {
  /// 拖拽过程中的临时比例；为 null 表示未在拖拽，跟随真实播放进度。
  double? _dragFraction;

  /// 拖拽气泡宽度：固定值便于把气泡夹在进度条两端之内。
  static const double _bubbleWidth = 68;

  @override
  Widget build(BuildContext context) {
    final total = widget.duration.inMilliseconds;
    final canSeek = total > 0;
    final draft = _dragFraction;
    final positionMs = draft != null
        ? (total * draft).round()
        : widget.position.inMilliseconds;
    final fraction = canSeek ? (positionMs / total).clamp(0.0, 1.0) : 0.0;
    final bufferedFraction =
        canSeek ? (widget.buffered.inMilliseconds / total).clamp(0.0, 1.0) : 0.0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;

        void update(Offset local) {
          if (!canSeek || width <= 0) return;
          setState(() {
            _dragFraction = (local.dx / width).clamp(0.0, 1.0);
          });
        }

        void commit() {
          final value = _dragFraction;
          setState(() => _dragFraction = null);
          if (value == null) return;
          widget.onSeek(Duration(milliseconds: (total * value).round()));
        }

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) {
            widget.onInteraction();
            update(details.localPosition);
          },
          onTapUp: (_) => commit(),
          onHorizontalDragStart: (details) {
            widget.onInteraction();
            update(details.localPosition);
          },
          onHorizontalDragUpdate: (details) => update(details.localPosition),
          onHorizontalDragEnd: (_) => commit(),
          child: SizedBox(
            // 命中区高度不小于 48dp（视觉进度条仍为 4dp，垂直居中）。
            height: 48,
            child: Stack(
              // 拖拽气泡悬于进度条上方，需允许越界绘制。
              clipBehavior: Clip.none,
              children: <Widget>[
                Center(
                  child: SizedBox(
                    width: double.infinity,
                    height: 4,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: Stack(
                        fit: StackFit.expand,
                        children: <Widget>[
                          // 轨道底色 white/25
                          const ColoredBox(color: Color(0x40FFFFFF)),
                          // 已缓冲 white/35
                          _fractionBar(bufferedFraction, const Color(0x59FFFFFF)),
                          // 已播放：品牌色
                          _fractionBar(fraction, kAccent),
                        ],
                      ),
                    ),
                  ),
                ),
                // 滑块：12dp 圆形品牌色。
                Align(
                  alignment: Alignment(fraction * 2 - 1, 0),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: const BoxDecoration(
                      color: kAccent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                if (draft != null)
                  Positioned(
                    // 气泡悬于进度条上方，左右两端夹在进度条之内。
                    bottom: 40,
                    left: (fraction * width - _bubbleWidth / 2).clamp(
                      0.0,
                      (width - _bubbleWidth).clamp(0.0, double.infinity),
                    ),
                    child: _dragBubble(Duration(milliseconds: positionMs)),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// 拖拽中的时间气泡：贴滑块上方显示「拖动中」的目标时间点。
  Widget _dragBubble(Duration value) {
    return Container(
      key: kPlayerSeekBubbleKey,
      width: _bubbleWidth,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xE6000000), // black/90
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        _formatTime(value),
        textAlign: TextAlign.center,
        maxLines: 1,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
        ),
      ),
    );
  }

  Widget _fractionBar(double fraction, Color color) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fraction,
      child: ColoredBox(color: color),
    );
  }
}

/// 时长格式化：不足一小时用 mm:ss，超过则 h:mm:ss。
String _formatTime(Duration duration) {
  final hours = duration.inHours;
  final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
  return hours > 0 ? '$hours:$minutes:$seconds' : '$minutes:$seconds';
}
