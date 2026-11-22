import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/native_player.dart';
import '../core/qoe.dart';
import 'widgets.dart';

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
  });

  final ApiClient api;
  final String title;
  final String url;
  /// QoE 归属：影片 / 剧集 ID（缺省时后台仅按会话展示）
  final int? titleId;
  final int? episodeId;
  final String? contentType;
  final String? titleName;

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  static const Duration _seekStep = Duration(seconds: 10);
  static const Duration _controlsTimeout = Duration(seconds: 4);

  late final NativePlayerController _controller;
  late final QoeTracker _qoe;

  Timer? _hideTimer;
  bool _controlsVisible = true;
  bool _fullscreen = false;
  bool _lastInPip = false;
  double _volumeDraft = 1;

  PlayerSnapshot get _snapshot => _controller.snapshot.value;

  @override
  void initState() {
    super.initState();
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
    _hideTimer?.cancel();
    _controller.snapshot.removeListener(_onSnapshot);
    unawaited(_qoe.dispose());
    unawaited(_controller.dispose());
    // 用户在全屏状态下退出时把系统 UI 还原
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _onSnapshot() {
    if (!mounted) return;
    final snapshot = _controller.snapshot.value;
    _qoe.onSnapshot(snapshot);
    if (snapshot.inPip != _lastInPip) {
      _lastInPip = snapshot.inPip;
      _hideTimer?.cancel();
      _controlsVisible = !snapshot.inPip;
      if (_controlsVisible) _scheduleHide();
    }
    setState(() {});
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(_controlsTimeout, () {
      if (!mounted) return;
      setState(() => _controlsVisible = false);
    });
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

  // ---------------------------------------------------------------- 菜单

  Future<void> _openMenu({
    required String title,
    required List<_MenuItem> items,
    required ValueChanged<String> onPick,
  }) async {
    _keepVisible();
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF16161C),
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (context) {
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.6,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return ListTile(
                        dense: true,
                        title: Text(
                          item.label,
                          style: TextStyle(
                            color: item.selected ? kAccent : Colors.white,
                            fontWeight:
                                item.selected ? FontWeight.w600 : FontWeight.w400,
                          ),
                        ),
                        trailing: item.selected
                            ? const Icon(Icons.check, color: kAccent, size: 20)
                            : null,
                        onTap: () => Navigator.of(context).pop(item.id),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (picked != null) onPick(picked);
    _scheduleHide();
  }

  Future<void> _pickSubtitle() async {
    final items = <_MenuItem>[
      _MenuItem('', '关闭字幕', selected: _snapshot.selectedText == null),
      for (final track in _snapshot.textTracks)
        _MenuItem(track.id, track.label, selected: track.selected),
    ];
    await _openMenu(
      title: '字幕',
      items: items,
      onPick: (id) => _controller.selectSubtitle(id.isEmpty ? null : id),
    );
  }

  Future<void> _pickAudio() async {
    final items = <_MenuItem>[
      for (final track in _snapshot.audioTracks)
        _MenuItem(track.id, track.label, selected: track.selected),
    ];
    if (items.isEmpty) {
      items.add(_MenuItem('', '暂无音轨'));
    }
    await _openMenu(
      title: '音轨',
      items: items,
      onPick: (id) => _controller.selectAudio(id.isEmpty ? null : id),
    );
  }

  Future<void> _pickQuality() async {
    final items = <_MenuItem>[
      _MenuItem('auto', '自动', selected: _snapshot.autoQuality),
      for (final track in _snapshot.videoTracks)
        _MenuItem(
          track.id,
          track.label,
          selected: !_snapshot.autoQuality && track.selected,
        ),
    ];
    await _openMenu(
      title: '画质',
      items: items,
      onPick: (id) => _controller.selectVideo(id),
    );
  }

  Future<void> _openVolume() async {
    _keepVisible();
    _volumeDraft = _snapshot.volume;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF16161C),
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Row(
                  children: <Widget>[
                    Icon(
                      _volumeDraft == 0
                          ? Icons.volume_off
                          : (_volumeDraft < 0.5
                              ? Icons.volume_down
                              : Icons.volume_up),
                      color: Colors.white70,
                    ),
                    Expanded(
                      child: Slider(
                        value: _volumeDraft,
                        onChanged: (value) {
                          setSheetState(() => _volumeDraft = value);
                          unawaited(_controller.setVolume(value));
                        },
                      ),
                    ),
                    SizedBox(
                      width: 44,
                      child: Text(
                        '${(_volumeDraft * 100).round()}%',
                        textAlign: TextAlign.end,
                        style: const TextStyle(color: Colors.white70),
                      ),
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

  // ---------------------------------------------------------------- 构建

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final pgsIndexUrl = pgsIndexUrlFor(widget.url);

    return Scaffold(
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
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _toggleControls,
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
          if (_controlsVisible && !snapshot.inPip) _buildControls(snapshot),
        ],
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
        padding: const EdgeInsets.only(bottom: 110),
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

  Widget _buildControls(PlayerSnapshot snapshot) {
    return SafeArea(
      child: Column(
        children: <Widget>[
          _buildTopBar(),
          // 播放控制簇居中于画面，底部只保留时间与各类选择
          Expanded(
            child: Center(child: _buildCenterControls(snapshot)),
          ),
          _buildBottomBar(snapshot),
        ],
      ),
    );
  }

  /// 画面中央：后退 10 秒 / 播放暂停 / 前进 10 秒。
  Widget _buildCenterControls(PlayerSnapshot snapshot) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        _centerButton(
          Icons.replay_10,
          '后退 10 秒',
          () {
            unawaited(_controller.seekBy(-_seekStep));
            _scheduleHide();
          },
        ),
        const SizedBox(width: 36),
        _centerButton(
          snapshot.isPlaying ? Icons.pause : Icons.play_arrow,
          snapshot.isPlaying ? '暂停' : '播放',
          _togglePlay,
          primary: true,
        ),
        const SizedBox(width: 36),
        _centerButton(
          Icons.forward_10,
          '前进 10 秒',
          () {
            unawaited(_controller.seekBy(_seekStep));
            _scheduleHide();
          },
        ),
      ],
    );
  }

  /// 中央控制按钮：半透明圆形底；[primary] 用于播放/暂停，尺寸更大。
  Widget _centerButton(
    IconData icon,
    String tooltip,
    VoidCallback onPressed, {
    bool primary = false,
  }) {
    final double diameter = primary ? 80 : 66;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black54,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: diameter,
            height: diameter,
            child: Center(
              child: Icon(icon, color: Colors.white, size: primary ? 42 : 33),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 4, 16, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: Row(
        children: <Widget>[
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            tooltip: '返回',
          ),
          Expanded(
            child: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar(PlayerSnapshot snapshot) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 28, 8, 4),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Colors.transparent, Color(0xE6000000)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _SeekBar(
            position: snapshot.position,
            duration: snapshot.duration,
            buffered: snapshot.buffered,
            onInteraction: _keepVisible,
            onSeek: (position) {
              unawaited(_controller.seekTo(position));
              _scheduleHide();
            },
          ),
          Row(
            children: <Widget>[
              const SizedBox(width: 8),
              Text(
                '${_formatTime(snapshot.position)} / ${_formatTime(snapshot.duration)}',
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  reverse: true,
                  child: Row(
                    children: <Widget>[
                      _iconButton(
                        snapshot.muted || snapshot.volume == 0
                            ? Icons.volume_off
                            : Icons.volume_up,
                        '音量',
                        _openVolume,
                      ),
                      _iconButton(Icons.audiotrack, '音轨', _pickAudio),
                      _iconButton(Icons.subtitles_outlined, '字幕', _pickSubtitle),
                      _iconButton(Icons.hd_outlined, '画质', _pickQuality),
                      if (snapshot.pipSupported)
                        _iconButton(
                          Icons.picture_in_picture_alt,
                          '画中画',
                          _enterPip,
                        ),
                      _iconButton(
                        _fullscreen ? Icons.fullscreen_exit : Icons.fullscreen,
                        _fullscreen ? '退出全屏' : '全屏',
                        _toggleFullscreen,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _iconButton(IconData icon, String tooltip, VoidCallback onPressed) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, color: Colors.white, size: 22),
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.all(8),
      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
    );
  }
}

/// 底部菜单的一项；[id] 为空串表示「关闭 / 自动」这类无实体轨道的选项。
class _MenuItem {
  const _MenuItem(this.id, this.label, {this.selected = false});

  final String id;
  final String label;
  final bool selected;
}

/// 支持点击与拖拽定位的进度条。
class _SeekBar extends StatefulWidget {
  const _SeekBar({
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
            height: 28,
            child: Stack(
              // 拖拽气泡悬于进度条上方，需允许越界绘制
              clipBehavior: Clip.none,
              children: <Widget>[
                Center(
                  child: Container(height: 4, color: const Color(0x33FFFFFF)),
                ),
                _fractionBar(bufferedFraction, const Color(0x66FFFFFF)),
                _fractionBar(fraction, kAccent),
                Align(
                  alignment: Alignment(fraction * 2 - 1, 0),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                if (draft != null)
                  Positioned(
                    bottom: 32,
                    left: (fraction * width - _bubbleWidth / 2)
                        .clamp(0.0, (width - _bubbleWidth).clamp(0.0, double.infinity)),
                    child: _dragBubble(Duration(milliseconds: positionMs)),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// 拖拽气泡宽度：固定值便于把气泡夹在进度条两端之内。
  static const double _bubbleWidth = 68;

  /// 拖拽中的时间气泡：贴thumb上方显示目标时间点。
  Widget _dragBubble(Duration value) {
    return Container(
      width: _bubbleWidth,
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xF2000000),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0x33FFFFFF)),
      ),
      child: Text(
        _formatTime(value),
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontSize: 13),
      ),
    );
  }

  Widget _fractionBar(double fraction, Color color) {
    return Align(
      alignment: Alignment.centerLeft,
      child: FractionallySizedBox(
        widthFactor: fraction,
        child: Container(height: 4, color: color),
      ),
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
