import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// 播放器中的一个可选项（音轨 / 字幕 / 画质）。
class PlayerTrack {
  const PlayerTrack({
    required this.id,
    required this.label,
    required this.selected,
    this.height,
  });

  final String id;
  final String label;
  final bool selected;
  final int? height;

  static PlayerTrack? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    if (id is! String || id.isEmpty) return null;
    return PlayerTrack(
      id: id,
      label: raw['label'] is String ? raw['label'] as String : id,
      selected: raw['selected'] == true,
      height: (raw['height'] as num?)?.toInt(),
    );
  }

  static List<PlayerTrack> parseList(Object? raw) {
    if (raw is! List) return const <PlayerTrack>[];
    return raw
        .map(PlayerTrack.tryParse)
        .whereType<PlayerTrack>()
        .toList(growable: false);
  }
}

/// 外挂 PGS 字幕的加载状态。
///
/// 单份 `.sup` 最大见过 137MB，下载期间必须给用户反馈，否则会被当成「点了没反应」。
class SubtitleLoading {
  const SubtitleLoading({required this.label, this.progress});

  final String label;

  /// 0~1；服务端未给出长度时为 null。
  final double? progress;

  static SubtitleLoading? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final label = raw['label'];
    if (label is! String || label.isEmpty) return null;
    final progress = (raw['progress'] as num?)?.toDouble();
    return SubtitleLoading(
      label: label,
      progress: progress == null || progress < 0
          ? null
          : progress.clamp(0.0, 1.0).toDouble(),
    );
  }
}

/// 原生播放器上报的一次状态快照。
class PlayerSnapshot {
  const PlayerSnapshot({
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.buffered = Duration.zero,
    this.isPlaying = false,
    this.isBuffering = false,
    this.hasEnded = false,
    this.volume = 1,
    this.muted = false,
    this.speed = 1,
    this.videoWidth = 0,
    this.videoHeight = 0,
    this.error,
    this.inPip = false,
    this.pipSupported = false,
    this.autoQuality = true,
    this.audioTracks = const <PlayerTrack>[],
    this.videoTracks = const <PlayerTrack>[],
    this.textTracks = const <PlayerTrack>[],
    this.subtitleLoading,
  });

  final Duration position;
  final Duration duration;
  final Duration buffered;
  final bool isPlaying;
  final bool isBuffering;
  final bool hasEnded;
  final double volume;
  final bool muted;
  final double speed;
  final int videoWidth;
  final int videoHeight;
  final String? error;
  final bool inPip;
  final bool pipSupported;

  /// 画质是否处于自适应（未手动锁定档位）。
  final bool autoQuality;
  final List<PlayerTrack> audioTracks;
  final List<PlayerTrack> videoTracks;
  final List<PlayerTrack> textTracks;

  /// 外挂字幕正在下载时的状态；null 表示没有在加载。
  final SubtitleLoading? subtitleLoading;

  /// 尚未拿到视频尺寸时按 16:9 兜底，避免首帧画面高度为 0。
  double get aspectRatio {
    if (videoWidth > 0 && videoHeight > 0) return videoWidth / videoHeight;
    return 16 / 9;
  }

  PlayerTrack? get selectedAudio =>
      audioTracks.where((track) => track.selected).firstOrNull;
  PlayerTrack? get selectedText =>
      textTracks.where((track) => track.selected).firstOrNull;
  PlayerTrack? get selectedVideo =>
      videoTracks.where((track) => track.selected).firstOrNull;

  factory PlayerSnapshot.fromMap(Map<dynamic, dynamic> map) {
    return PlayerSnapshot(
      position: _duration(map['position']),
      duration: _duration(map['duration']),
      buffered: _duration(map['buffered']),
      isPlaying: map['isPlaying'] == true,
      isBuffering: map['isBuffering'] == true,
      hasEnded: map['hasEnded'] == true,
      volume: (map['volume'] as num?)?.toDouble() ?? 1,
      muted: map['muted'] == true,
      speed: (map['speed'] as num?)?.toDouble() ?? 1,
      videoWidth: (map['videoWidth'] as num?)?.toInt() ?? 0,
      videoHeight: (map['videoHeight'] as num?)?.toInt() ?? 0,
      error: map['error'] as String?,
      inPip: map['inPip'] == true,
      pipSupported: map['pipSupported'] == true,
      autoQuality: map['autoQuality'] != false,
      audioTracks: PlayerTrack.parseList(map['audioTracks']),
      videoTracks: PlayerTrack.parseList(map['videoTracks']),
      textTracks: PlayerTrack.parseList(map['textTracks']),
      subtitleLoading: SubtitleLoading.tryParse(map['subtitleLoading']),
    );
  }

  static Duration _duration(Object? raw) {
    final value = (raw as num?)?.toInt() ?? 0;
    return value > 0 ? Duration(milliseconds: value) : Duration.zero;
  }
}

/// 原生 media3 ExoPlayer 的 Flutter 侧控制器。
///
/// 画面由 PlatformView 承载，这里只负责下发指令与接收状态。
class NativePlayerController {
  static const MethodChannel _method = MethodChannel('vidday/player');
  static const EventChannel _event = EventChannel('vidday/player/events');

  final ValueNotifier<PlayerSnapshot> snapshot =
      ValueNotifier<PlayerSnapshot>(const PlayerSnapshot());

  StreamSubscription<dynamic>? _subscription;

  void start() {
    _subscription ??= _event.receiveBroadcastStream().listen((event) {
      if (event is Map) snapshot.value = PlayerSnapshot.fromMap(event);
    });
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
    snapshot.dispose();
  }

  Future<void> play() => _invoke('play');

  Future<void> pause() => _invoke('pause');

  Future<void> seekTo(Duration position) =>
      _invoke('seekTo', <String, dynamic>{'position': position.inMilliseconds});

  Future<void> seekBy(Duration delta) =>
      _invoke('seekBy', <String, dynamic>{'delta': delta.inMilliseconds});

  Future<void> setVolume(double volume) =>
      _invoke('setVolume', <String, dynamic>{'volume': volume.clamp(0.0, 1.0)});

  Future<void> setSpeed(double speed) =>
      _invoke('setSpeed', <String, dynamic>{'speed': speed});

  Future<void> selectAudio(String? id) =>
      _invoke('selectAudio', <String, dynamic>{'id': id});

  Future<void> selectVideo(String? id) =>
      _invoke('selectVideo', <String, dynamic>{'id': id});

  /// id 传 null 表示关闭字幕。
  Future<void> selectSubtitle(String? id) =>
      _invoke('selectSubtitle', <String, dynamic>{'id': id});

  Future<void> retry() => _invoke('retry');

  /// 返回 false 表示当前设备不支持画中画（如 Android TV）。
  Future<bool> enterPip() async {
    try {
      return await _method.invokeMethod<bool>('enterPip') ?? false;
    } on PlatformException {
      return false;
    }
  }

  Future<void> _invoke(String method, [Map<String, dynamic>? args]) async {
    try {
      await _method.invokeMethod<void>(method, args);
    } on PlatformException {
      // 播放器可能尚未创建或已随页面释放，指令直接丢弃即可。
    } on MissingPluginException {
      // 非 Android 平台（或未注册原生插件）时静默降级。
    }
  }
}

/// 推导外挂 PGS 清单地址：约定与 master.m3u8 同级目录下的 `pgs-subs/index.json`。
String? pgsIndexUrlFor(String playUrl) {
  final uri = Uri.tryParse(playUrl);
  if (uri == null || uri.pathSegments.isEmpty) return null;
  final segments = uri.pathSegments.toList(growable: true);
  segments.removeLast();
  segments.add('pgs-subs');
  segments.add('index.json');
  return uri.replace(pathSegments: segments).toString();
}
