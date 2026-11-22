import 'dart:async';
import 'dart:math';

import 'api_client.dart';
import 'native_player.dart';

/// 会话所属内容信息（快照，便于后台直接展示）。
class QoeSessionMeta {
  const QoeSessionMeta({
    this.titleId,
    this.episodeId,
    this.contentType,
    this.titleName,
    this.playUrl,
  });

  final int? titleId;
  final int? episodeId;
  final String? contentType;
  final String? titleName;
  final String? playUrl;
}

/// Android TV 播放器 QoE 采集器：把一次播放会话的体验指标汇总后上报服务端。
///
/// 采集口径与 Web 端对齐（起播耗时 / 卡顿 / 切档 / 错误 / 播放时长）。
/// 原生 media3 未暴露码率与解码帧计数，故码率与丢帧指标缺省上报 null / 0，
/// 档位切换以分辨率高度变化近似。
///
/// 上报策略：状态每次变化即更新本地累计值，每 15s 汇总上报一次；
/// 暂停 / 结束 / 离开页面触发即时上报。全链路失败静默，不影响播放。
class QoeTracker {
  QoeTracker({
    required this.api,
    required this.meta,
    this.flushInterval = const Duration(seconds: 15),
  });

  final ApiClient api;
  final QoeSessionMeta meta;
  final Duration flushInterval;

  static final Random _random = Random();
  /// 本地积压事件上限：超出丢弃最旧的，避免长时间离线导致内存膨胀
  static const int _maxPendingEvents = 300;
  /// 单次上报携带的事件条数上限（与服务端一致）
  static const int _maxEventsPerReport = 100;

  /// 会话标识：满足服务端 ^[A-Za-z0-9._-]{8,64}$。
  late final String sessionId = _createSessionId();
  final DateTime startedAt = DateTime.now().toUtc();
  final Stopwatch _clock = Stopwatch()..start();

  DateTime? endedAt;
  int? ttffMs;
  bool _sawFirstFrame = false;

  bool _playing = false;
  DateTime? _lastSampleAt;
  int watchedMs = 0;

  int durationMs = 0;
  int rebufferCount = 0;
  int rebufferMs = 0;
  DateTime? _bufferingSince;

  int switchCount = 0;
  int? _lastVideoHeight;

  int errorCount = 0;
  String? _lastError;

  bool _disposed = false;
  Timer? _timer;
  final List<Map<String, dynamic>> _pendingEvents = <Map<String, dynamic>>[];

  /// 启动周期上报定时器。应在页面进入时调用一次。
  void start() {
    _timer ??= Timer.periodic(flushInterval, (_) => unawaited(flush()));
  }

  /// 消费一次播放器状态快照（由页面在 snapshot 变化时调用）。
  void onSnapshot(PlayerSnapshot snapshot) {
    if (_disposed) return;
    final now = DateTime.now().toUtc();
    final positionMs = snapshot.position.inMilliseconds;

    // 播放时长：按两次快照的时间差累计（仅在真正播放中）
    final last = _lastSampleAt;
    if (last != null && _playing) {
      watchedMs += now.difference(last).inMilliseconds;
    }
    _lastSampleAt = now;

    if (snapshot.duration > Duration.zero) {
      durationMs = snapshot.duration.inMilliseconds;
    }

    // 起播耗时：进入播放且已有播放位置时记为出首帧
    if (!_sawFirstFrame && snapshot.isPlaying && snapshot.position > Duration.zero) {
      _sawFirstFrame = true;
      ttffMs = _clock.elapsedMilliseconds;
      _pushEvent(
        'ttff',
        valueMs: ttffMs,
        severity: (ttffMs ?? 0) > 5000 ? 'warn' : 'info',
        message: '起播耗时 ${ttffMs}ms',
      );
    }

    // 卡顿：isBuffering 的上升沿与下降沿。
    // 首帧之前的缓冲属于「起播加载」，不计入卡顿，否则会把起播耗时误算成一次 rebuffer。
    if (_sawFirstFrame && snapshot.isBuffering && _bufferingSince == null) {
      _bufferingSince = now;
      _pushEvent('stall',
          positionMs: positionMs, severity: 'warn', message: '开始缓冲');
    } else if (!snapshot.isBuffering && _bufferingSince != null) {
      final duration = now.difference(_bufferingSince!).inMilliseconds;
      _bufferingSince = null;
      rebufferCount += 1;
      rebufferMs += duration;
      _pushEvent(
        'stall',
        positionMs: positionMs,
        valueMs: duration,
        severity: duration > 2000 ? 'warn' : 'info',
        message: '卡顿 ${duration}ms',
      );
    }

    // 播放状态（缓冲中不计入播放时长）
    _playing = snapshot.isPlaying && !snapshot.isBuffering;

    // 档位切换：以分辨率高度变化近似
    final height = snapshot.videoHeight;
    if (height > 0 && height != _lastVideoHeight) {
      final first = _lastVideoHeight == null;
      _lastVideoHeight = height;
      if (!first) {
        switchCount += 1;
        _pushEvent('level_switch', valueNum: height, message: '切换到 ${height}p');
      }
    }

    // 错误：仅在错误信息变化时计一次
    final error = snapshot.error;
    if (error != null && error.isNotEmpty) {
      if (error != _lastError) {
        _lastError = error;
        errorCount += 1;
        _pushEvent('error', severity: 'error', message: error);
      }
    } else {
      _lastError = null;
    }
  }

  /// 汇总上报一次（周期性 / 暂停 / 结束触发）。
  Future<void> flush() async {
    final session = _buildSession();
    final count = _pendingEvents.length < _maxEventsPerReport
        ? _pendingEvents.length
        : _maxEventsPerReport;
    final events = _pendingEvents.take(count).toList(growable: false);
    try {
      await api.reportQoe(session: session, events: events);
      _pendingEvents.removeRange(0, count);
    } catch (_) {
      // 上报尽力而为：事件保留，下次重试
    }
  }

  /// 结束会话：补收尾事件并做一次带 endedAt 的最终上报。
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _timer?.cancel();
    _timer = null;

    final now = DateTime.now().toUtc();
    final last = _lastSampleAt;
    if (last != null && _playing) {
      watchedMs += now.difference(last).inMilliseconds;
    }
    _playing = false;
    if (_bufferingSince != null) {
      final duration = now.difference(_bufferingSince!).inMilliseconds;
      _bufferingSince = null;
      rebufferCount += 1;
      rebufferMs += duration;
      _pushEvent('stall', valueMs: duration, message: '卡顿 ${duration}ms');
    }

    endedAt = now;
    _pushEvent('end', valueMs: watchedMs, message: '会话结束');
    await flush();
  }

  Map<String, dynamic> _buildSession() {
    return <String, dynamic>{
      'sessionId': sessionId,
      'client': 'android',
      'titleId': meta.titleId,
      'episodeId': meta.episodeId,
      'contentType': meta.contentType,
      'titleName': meta.titleName,
      'playUrl': meta.playUrl,
      'ttffMs': ttffMs,
      'durationMs': durationMs,
      'watchedMs': watchedMs,
      'rebufferCount': rebufferCount,
      'rebufferMs': rebufferMs,
      'switchCount': switchCount,
      'errorCount': errorCount,
      'droppedFrames': 0,
      'totalFrames': 0,
      'startedAt': startedAt.toIso8601String(),
      'endedAt': endedAt?.toIso8601String(),
    };
  }

  void _pushEvent(
    String type, {
    int? positionMs,
    int? valueMs,
    int? valueNum,
    String? severity,
    String? message,
  }) {
    _pendingEvents.add(<String, dynamic>{
      'type': type,
      'eventAt': DateTime.now().toUtc().toIso8601String(),
      'positionMs': ?positionMs,
      'valueMs': ?valueMs,
      'valueNum': ?valueNum,
      'severity': ?severity,
      'message': ?message,
    });
    if (_pendingEvents.length > _maxPendingEvents) {
      _pendingEvents.removeRange(0, _pendingEvents.length - _maxPendingEvents);
    }
  }

  static String _createSessionId() {
    final millis = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
    final suffix = _random.nextInt(1 << 32).toRadixString(36);
    return 'android-$millis-$suffix';
  }
}
