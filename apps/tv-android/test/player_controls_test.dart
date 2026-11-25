import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vidday_tv/core/api_client.dart';
import 'package:vidday_tv/core/native_player.dart';
import 'package:vidday_tv/ui/player_page.dart';
import 'package:vidday_tv/ui/widgets.dart';

/// 注入式假后端：不发起任何真实网络请求，进度 / QoE 上报直接吞掉。
class _FakeApi extends ApiClient {
  _FakeApi() : super(deviceId: 'test-device');

  int progressSaves = 0;

  @override
  Future<void> saveWatchProgress({
    required int titleId,
    int? episodeId,
    required int position,
    required int duration,
    required double percent,
    DateTime? updatedAt,
  }) async {
    progressSaves++;
  }

  @override
  Future<void> reportQoe({
    required Map<String, dynamic> session,
    required List<Map<String, dynamic>> events,
  }) async {}
}

/// 用测试替身接管原生事件 / 方法通道：
/// - `vidday/player/events` 事件通道由测试主动推送 [PlayerSnapshot]；
/// - `vidday/player` 方法通道记录所有下发指令（play / pause / seekTo / …）；
/// - `flutter/platform_views`(＋`_2`) 平台视图通道打桩，避免承载 AndroidView 时无实现。
class _PlayerChannels {
  static const MethodChannel _events =
      MethodChannel('vidday/player/events', StandardMethodCodec());
  static const MethodChannel _methods = MethodChannel('vidday/player');
  static const MethodCodec _codec = StandardMethodCodec();

  final List<MethodCall> calls = <MethodCall>[];

  void install() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    // 事件通道：拦截 listen / cancel，事件由 _push 主动推入。
    messenger.setMockMethodCallHandler(_events, (call) async => null);
    messenger.setMockMethodCallHandler(_methods, (call) async {
      calls.add(call);
      if (call.method == 'enterPip') return true;
      return null;
    });
    Future<Object?> fakeView(MethodCall call) async =>
        call.method == 'create' ? 1 : null;
    messenger.setMockMethodCallHandler(SystemChannels.platform_views, fakeView);
    messenger.setMockMethodCallHandler(
        SystemChannels.platform_views_2, fakeView);
  }

  Future<void> emit(PlayerSnapshot snapshot) {
    return TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .handlePlatformMessage(
      _events.name,
      _codec.encodeSuccessEnvelope(_snapshotMap(snapshot)),
      (_) {},
    );
  }

  void uninstall() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(_events, null);
    messenger.setMockMethodCallHandler(_methods, null);
    messenger.setMockMethodCallHandler(SystemChannels.platform_views, null);
    messenger.setMockMethodCallHandler(SystemChannels.platform_views_2, null);
  }
}

Map<String, dynamic> _snapshotMap(PlayerSnapshot s) => <String, dynamic>{
      'position': s.position.inMilliseconds,
      'duration': s.duration.inMilliseconds,
      'buffered': s.buffered.inMilliseconds,
      'isPlaying': s.isPlaying,
      'isBuffering': s.isBuffering,
      'hasEnded': s.hasEnded,
      'volume': s.volume,
      'muted': s.muted,
      'speed': s.speed,
      'videoWidth': s.videoWidth,
      'videoHeight': s.videoHeight,
      'error': s.error,
      'inPip': s.inPip,
      'pipSupported': s.pipSupported,
      'autoQuality': s.autoQuality,
      'audioTracks': const <Object?>[],
      'videoTracks': const <Object?>[],
      'textTracks': const <Object?>[],
      'subtitleLoading': null,
    };

/// 与播放页一致的时间格式化：不足一小时 mm:ss，超过则 h:mm:ss。
String _fmt(int seconds) {
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  final s = seconds % 60;
  final mm = m.toString().padLeft(2, '0');
  final ss = s.toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}

const PlayerSnapshot _defaultSnapshot = PlayerSnapshot(
  position: Duration(minutes: 13, seconds: 59),
  duration: Duration(hours: 2, minutes: 3, seconds: 53),
  buffered: Duration(minutes: 20),
);

/// 暂停态即为默认快照：控制条常驻、不自动隐藏。
/// 播放态快照：控制条 3.2s 后自动隐藏。
const PlayerSnapshot _playingSnapshot = PlayerSnapshot(
  position: Duration(minutes: 13, seconds: 59),
  duration: Duration(hours: 2, minutes: 3, seconds: 53),
  buffered: Duration(minutes: 20),
  isPlaying: true,
);

/// 设备支持画中画的快照：底部面板第一行此时为 6 个按钮
/// （音量 / 画质 / 音轨 / 字幕 / 画中画 / 全屏），用于覆盖含画中画的完整面板。
const PlayerSnapshot _landscapeSnapshot = PlayerSnapshot(
  position: Duration(minutes: 13, seconds: 59),
  duration: Duration(hours: 2, minutes: 3, seconds: 53),
  buffered: Duration(minutes: 20),
  pipSupported: true,
);

/// 挂载播放页并推入一帧快照；结束时卸载页面以取消内部定时器。
Future<void> _pumpPlayer(
  WidgetTester tester,
  _PlayerChannels channels, {
  Size size = const Size(420, 900),
  PlayerSnapshot snapshot = _defaultSnapshot,
}) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = size;
  addTearDown(() async {
    // 卸载页面 → dispose 取消控制条隐藏定时器与 QoE 周期定时器
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    channels.uninstall();
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: PlayerPage(
        api: _FakeApi(),
        title: '测试影片',
        url: 'https://media.example.com/movie.m3u8',
      ),
    ),
  );
  await tester.pump();
  await channels.emit(snapshot);
  await tester.pump();
}

/// 控制层淡入淡出载具：`AnimatedOpacity` 包住整棵控制层（含中央簇）。
Finder _controlsFade() => find.ancestor(
      of: find.byKey(kPlayerCenterControlsKey),
      matching: find.byType(AnimatedOpacity),
    );

/// 控制层目标透明度（1 可见 / 0 隐藏）——即传给 `AnimatedOpacity.opacity` 的值。
double _controlsTargetOpacity(WidgetTester tester) =>
    tester.widget<AnimatedOpacity>(_controlsFade()).opacity;

/// 控制层当前动画值（用于断言 300ms 过渡的中间态）。
double _controlsAnimatedOpacity(WidgetTester tester) => tester
    .widget<FadeTransition>(
      find.descendant(of: _controlsFade(), matching: find.byType(FadeTransition)),
    )
    .opacity
    .value;

/// 点开面板上的「音量」入口并跑完底部弹层动画（不推进到控制条自动隐藏时刻）。
Future<void> _openVolumeSheet(WidgetTester tester) async {
  await tester.tap(find.byTooltip('音量'));
  await tester.pump(); // 启动弹层路由
  await tester.pump(const Duration(milliseconds: 350)); // 完成弹层动画
}

/// 取出一次 `setVolume` 调用下发的音量值。
List<double> _setVolumeCalls(_PlayerChannels channels) => channels.calls
    .where((c) => c.method == 'setVolume')
    .map((c) => (c.arguments! as Map<Object?, Object?>)['volume']! as double)
    .toList(growable: false);

/// 底栏浮层上排（6 个，画中画仅在设备支持时存在）的指定顺序：
///   音量 / 画质 / 音轨 / 字幕 /（画中画）/ 全屏
const List<String> _panelOrder = <String>[
  '音量',
  '画质',
  '音轨',
  '字幕',
  '画中画',
  '全屏',
];

/// 三段式几何测试覆盖的三种尺寸。
const Map<String, Size> _sizes = <String, Size>{
  '竖屏 420×900': Size(420, 900),
  '横屏 900×420': Size(900, 420),
  '横屏 780×380': Size(780, 380),
};

void main() {
  testWidgets('底栏浮层存在 6 个按钮，宽屏单行顺序为 音量/画质/音轨/字幕/画中画/全屏',
      (tester) async {
    final channels = _PlayerChannels()..install();
    // pipSupported=true → 面板第一行 6 个按钮齐全（含画中画）。
    await _pumpPlayer(tester, channels,
        size: const Size(900, 420), snapshot: _landscapeSnapshot);

    // 面板存在（且为唯一的底栏浮层容器）
    final panel = find.byKey(kPlayerControlPanelKey);
    expect(panel, findsOneWidget);

    // 面板内 6 个按钮的图标各恰好一个
    for (final icon in <IconData>[
      Icons.volume_up,
      Icons.hd_outlined,
      Icons.audiotrack,
      Icons.subtitles_outlined,
      Icons.picture_in_picture_alt,
      Icons.fullscreen,
    ]) {
      expect(
        find.descendant(of: panel, matching: find.byIcon(icon)),
        findsOneWidget,
        reason: '面板缺少图标 $icon',
      );
    }
    // 中央簇 3 个控件各恰好一个，且均不在底栏浮层内。
    for (final icon in <IconData>[
      Icons.replay_10,
      Icons.play_arrow,
      Icons.forward_10,
    ]) {
      expect(find.byIcon(icon), findsOneWidget, reason: '缺少中央控件 $icon');
      expect(
        find.descendant(of: panel, matching: find.byIcon(icon)),
        findsNothing,
        reason: '中央控件 $icon 不应出现在底栏浮层',
      );
    }
    // 旧「设置」齿轮已移除
    expect(find.byIcon(Icons.settings), findsNothing, reason: '设置齿轮应已移除');

    // 面板 6 个按钮按指定顺序从左到右排列
    final List<Offset> centers = <Offset>[
      for (final tooltip in _panelOrder) tester.getCenter(find.byTooltip(tooltip)),
    ];
    for (var i = 1; i < centers.length; i++) {
      expect(centers[i].dx, greaterThan(centers[i - 1].dx),
          reason: '面板第 $i 与第 ${i + 1} 个按钮顺序错误');
    }

    // 顶部信息栏：返回 + 关闭入口
    expect(find.byTooltip('返回'), findsOneWidget);
    expect(find.byTooltip('关闭'), findsOneWidget);
    expect(find.text('测试影片'), findsOneWidget);
  });

  testWidgets('面板中存在字幕 / 音轨 / 画质三个独立按钮，且不再有设置按钮', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(900, 420));

    expect(find.byTooltip('字幕'), findsOneWidget);
    expect(find.byTooltip('音轨'), findsOneWidget);
    expect(find.byTooltip('画质'), findsOneWidget);
    expect(find.byTooltip('设置'), findsNothing);
  });

  // ------------------------------ 目标 1：三段式骨架（结构不重叠 + 居中）

  for (final entry in _sizes.entries) {
    final String label = entry.key;
    final Size size = entry.value;

    testWidgets('$label：三段式不重叠，中央簇居中于顶栏与底栏之间可用区域', (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels,
          size: size, snapshot: _landscapeSnapshot);

      final Rect topBar = tester.getRect(find.byKey(kPlayerTopBarKey));
      final Rect cluster = tester.getRect(find.byKey(kPlayerCenterControlsKey));
      final Rect panel = tester.getRect(find.byKey(kPlayerControlPanelKey));

      // 结构上不重叠：中央簇完全落在顶栏下缘与底栏上缘之间。
      expect(cluster.top, greaterThanOrEqualTo(topBar.bottom - 0.5));
      expect(cluster.bottom, lessThanOrEqualTo(panel.top + 0.5));

      // 中央簇垂直中心 == 可用区域（顶栏下缘 ~ 底栏上缘）垂直中心（±2dp）。
      final double availCenter = (topBar.bottom + panel.top) / 2;
      expect(cluster.center.dy, closeTo(availCenter, 2));

      // 水平居中于画面。
      expect(cluster.center.dx, closeTo(size.width / 2, 2));
    });

    testWidgets('$label：中央簇 64dp / 56dp、间距 32dp、播放键水平居中', (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels,
          size: size, snapshot: _landscapeSnapshot);

      final Size play = tester.getSize(find.byKey(kPlayerPlayPauseKey));
      expect(play.width, closeTo(64, 0.5));
      expect(play.height, closeTo(64, 0.5));

      final Rect back = tester.getRect(find.byTooltip('后退 10 秒'));
      final Rect playRect = tester.getRect(find.byKey(kPlayerPlayPauseKey));
      final Rect forward = tester.getRect(find.byTooltip('前进 10 秒'));
      expect(back.width, greaterThanOrEqualTo(56));
      expect(back.height, greaterThanOrEqualTo(56));
      expect(forward.width, greaterThanOrEqualTo(56));
      expect(forward.height, greaterThanOrEqualTo(56));

      // 相邻间距 32dp（对齐 Web 的 gap-8）。
      expect(playRect.left - back.right, closeTo(32, 0.5));
      expect(forward.left - playRect.right, closeTo(32, 0.5));

      // 播放键中心水平 = 画面中心。
      expect(playRect.center.dx, closeTo(size.width / 2, 2));
    });

    testWidgets('$label：底栏浮层同时含进度条与 6 个按钮，且按钮行在时间轴上方',
        (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels,
          size: size, snapshot: _landscapeSnapshot);

      final panel = find.byKey(kPlayerControlPanelKey);
      expect(
        find.descendant(of: panel, matching: find.byKey(kPlayerSeekBarKey)),
        findsOneWidget,
        reason: '进度条应是底栏浮层的后代',
      );
      for (final tooltip in _panelOrder) {
        expect(
          find.descendant(of: panel, matching: find.byTooltip(tooltip)),
          findsOneWidget,
          reason: '底栏浮层缺少按钮 $tooltip',
        );
      }

      // 按钮行整体位于时间轴上方。
      final double buttonsBottom = _panelOrder
          .map((t) => tester.getRect(find.byTooltip(t)).bottom)
          .reduce(math.max);
      final double timelineTop = tester.getRect(find.byKey(kPlayerSeekBarKey)).top;
      expect(buttonsBottom, lessThanOrEqualTo(timelineTop),
          reason: '按钮行底缘应 ≤ 时间轴上缘');
    });
  }

  testWidgets('进度条不是顶栏的后代，且仍是底栏浮层的后代', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels,
        size: const Size(900, 420), snapshot: _landscapeSnapshot);

    expect(
      find.descendant(
          of: find.byKey(kPlayerTopBarKey),
          matching: find.byKey(kPlayerSeekBarKey)),
      findsNothing,
      reason: '时间轴不应出现在顶栏',
    );
    expect(
      find.descendant(
          of: find.byKey(kPlayerControlPanelKey),
          matching: find.byKey(kPlayerSeekBarKey)),
      findsOneWidget,
    );
  });

  testWidgets('顶栏内边距横竖屏一致（高 80dp，无横屏特例）', (tester) async {
    for (final size in _sizes.values) {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels, size: size);
      expect(
        tester.getRect(find.byKey(kPlayerTopBarKey)).height,
        closeTo(80, 1),
        reason: '${size.width.toInt()}×${size.height.toInt()} 顶栏高度',
      );
      await tester.pumpWidget(const SizedBox.shrink());
      channels.uninstall();
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    }
  });

  for (final size in <Size>[const Size(900, 420), const Size(780, 380)]) {
    final String label = '${size.width.toInt()}×${size.height.toInt()}';
    testWidgets('横屏 $label：底栏宽度 min(w×0.75, 768)、底边距 26dp、水平居中',
        (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels, size: size);

      final Rect panel = tester.getRect(find.byKey(kPlayerControlPanelKey));
      final double expectedWidth = math.min(size.width * 0.75, 768);
      expect(panel.width, closeTo(expectedWidth, 2));
      expect(panel.center.dx, closeTo(size.width / 2, 2));
      expect(size.height - panel.bottom, closeTo(26, 0.5));
    });
  }

  testWidgets('底部面板已不含 后退/播放/前进 三个控件', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(420, 900));

    final panel = find.byKey(kPlayerControlPanelKey);
    expect(panel, findsOneWidget);
    expect(
      find.descendant(of: panel, matching: find.byIcon(Icons.replay_10)),
      findsNothing,
    );
    expect(
      find.descendant(of: panel, matching: find.byIcon(Icons.forward_10)),
      findsNothing,
    );
    expect(
      find.descendant(of: panel, matching: find.byKey(kPlayerPlayPauseKey)),
      findsNothing,
    );

    // 中央簇仍承载这三个控件
    final cluster = find.byKey(kPlayerCenterControlsKey);
    expect(
      find.descendant(of: cluster, matching: find.byKey(kPlayerPlayPauseKey)),
      findsOneWidget,
    );
    expect(
      find.descendant(of: cluster, matching: find.byIcon(Icons.replay_10)),
      findsOneWidget,
    );
    expect(
      find.descendant(of: cluster, matching: find.byIcon(Icons.forward_10)),
      findsOneWidget,
    );
  });

  // ------------------------------ 目标 2：显隐 / 超时 / 唤出交互

  testWidgets('超时语义：暂停态常驻，播放态 3.2s 后自动隐藏', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels); // 暂停快照

    // 暂停态：等待远超超时时间仍可见。
    await tester.pump(const Duration(seconds: 6));
    expect(_controlsTargetOpacity(tester), 1,
        reason: '暂停态控制条应常驻（不计时隐藏）');

    // 切到播放态 → 重新计时。
    await channels.emit(_playingSnapshot);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 3000));
    expect(_controlsTargetOpacity(tester), 1,
        reason: '播放 3.0s 时控制条仍应可见');
    await tester.pump(const Duration(milliseconds: 400)); // 累计 3.4s
    expect(_controlsTargetOpacity(tester), 0,
        reason: '播放 3.4s 后控制条应自动隐藏');
  });

  testWidgets('控制条显隐带 300ms 淡入淡出（中间态透明度在 (0,1)）', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(420, 900);
    await _pumpPlayer(tester, channels, size: size);
    expect(_controlsTargetOpacity(tester), 1);

    // 单击画面触发隐藏，动画起步后走到中点。
    await tester.tapAt(const Offset(210, 180));
    await tester.pump(); // 应用隐藏目标
    await tester.pump(const Duration(milliseconds: 150));
    final double mid = _controlsAnimatedOpacity(tester);
    expect(mid, greaterThan(0));
    expect(mid, lessThan(1));

    await tester.pump(const Duration(milliseconds: 200)); // 动画收尾
    expect(_controlsTargetOpacity(tester), 0);
  });

  testWidgets('控制条隐藏时画面不可点（不产生播放 / 暂停调用）', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(420, 900);
    await _pumpPlayer(tester, channels, size: size);

    // 先隐藏控制条（单击画面空白处）。
    await tester.tapAt(const Offset(210, 180));
    await tester.pump();
    expect(_controlsTargetOpacity(tester), 0);

    channels.calls.clear();
    // 在画面中心（隐藏的中央播放键位置）点击：隐藏态不可点。
    await tester.tapAt(Offset(size.width / 2, size.height / 2));
    await tester.pump();

    expect(
      channels.calls
          .map((c) => c.method)
          .where((m) => m == 'play' || m == 'pause'),
      isEmpty,
      reason: '隐藏态点击不应触发播放 / 暂停',
    );
  });

  testWidgets('单击画面切换控制条显隐', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(420, 900);
    await _pumpPlayer(tester, channels, size: size);

    // 可见 → 单击 → 隐藏
    expect(_controlsTargetOpacity(tester), 1);
    await tester.tapAt(const Offset(210, 180));
    await tester.pump();
    expect(_controlsTargetOpacity(tester), 0);

    // 隐藏 → 单击 → 可见
    await tester.tapAt(const Offset(210, 180));
    await tester.pump();
    expect(_controlsTargetOpacity(tester), 1);
  });

  testWidgets('点按中央「播放 / 暂停」触发 pause / play', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      size: const Size(420, 900),
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        isPlaying: true,
      ),
    );

    await tester.tap(find.byKey(kPlayerPlayPauseKey));
    await tester.pump();
    expect(channels.calls.map((c) => c.method), contains('pause'));
  });

  testWidgets('点按中央「后退 / 前进 10 秒」分别触发 seekBy ±10 秒', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(420, 900));

    await tester.tap(find.byTooltip('后退 10 秒'));
    await tester.pump();
    await tester.tap(find.byTooltip('前进 10 秒'));
    await tester.pump();

    final List<int> deltas = channels.calls
        .where((c) => c.method == 'seekBy')
        .map((c) => (c.arguments! as Map<Object?, Object?>)['delta']! as int)
        .toList(growable: false);
    expect(deltas, <int>[-10000, 10000]);
  });

  // ------------------------------ 中央簇样式（AP-09 指定，位置已回归列内居中）

  testWidgets('中央播放 / 暂停为黑底白图标圆形（64dp），并反映真实播放状态', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        isPlaying: false,
      ),
    );

    final circle = find.byKey(kPlayerPlayPauseKey);
    expect(circle, findsOneWidget);
    final decoration = tester.widget<Container>(circle).decoration! as BoxDecoration;
    expect(decoration.color, const Color(0x73000000)); // black/45
    expect(decoration.shape, BoxShape.circle);
    // 直径 64dp
    expect(tester.getSize(circle).width, closeTo(64, 0.5));
    expect(tester.getSize(circle).height, closeTo(64, 0.5));
    // 未播放 → 播放图标（白色）
    expect(
      tester
          .widget<Icon>(find.descendant(of: circle, matching: find.byIcon(Icons.play_arrow)))
          .color,
      Colors.white,
    );
    expect(find.descendant(of: circle, matching: find.byIcon(Icons.pause)), findsNothing);

    // 上报播放中 → 图标切到暂停（反映真实状态）
    await channels.emit(const PlayerSnapshot(
      position: Duration(seconds: 31),
      duration: Duration(minutes: 10),
      isPlaying: true,
    ));
    await tester.pump();
    expect(
      tester
          .widget<Icon>(find.descendant(of: circle, matching: find.byIcon(Icons.pause)))
          .color,
      Colors.white,
    );
    expect(find.descendant(of: circle, matching: find.byIcon(Icons.play_arrow)), findsNothing);
  });

  testWidgets('时间轴两侧时间文本存在且为 mm:ss / h:mm:ss', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels);

    final current = find.text('13:59'); // mm:ss
    final total = find.text('2:03:53'); // h:mm:ss
    expect(current, findsOneWidget);
    expect(total, findsOneWidget);
    // 当前时间在面板内、且位于总时长左侧
    expect(
      find.descendant(of: find.byKey(kPlayerControlPanelKey), matching: current),
      findsOneWidget,
    );
    expect(
      tester.getCenter(current).dx,
      lessThan(tester.getCenter(total).dx),
    );
  });

  testWidgets('拖动时显示目标时间气泡、不立即跳转，松手后才提交 seekTo', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels);

    expect(find.byKey(kPlayerSeekBubbleKey), findsNothing);
    expect(channels.calls.where((c) => c.method == 'seekTo'), isEmpty);

    final bar = find.byKey(kPlayerSeekBarKey);
    final center = tester.getCenter(bar);
    final width = tester.getSize(bar).width;

    final gesture = await tester.startGesture(center);
    await tester.pump();
    // 拖到进度条约 80% 处
    await gesture.moveTo(Offset(center.dx + width * 0.3, center.dy));
    await tester.pump();

    final bubble = find.byKey(kPlayerSeekBubbleKey);
    expect(bubble, findsOneWidget, reason: '拖动中应显示目标时间气泡');
    // 拖动中不提交跳转
    expect(
      channels.calls.where((c) => c.method == 'seekTo'),
      isEmpty,
      reason: '拖动过程不应立即跳转',
    );

    final bubbleText = tester
        .widget<Text>(find.descendant(of: bubble, matching: find.byType(Text)))
        .data!;
    // 拖动中的目标时间不同于当前播放时间 13:59
    expect(bubbleText, isNot('13:59'));

    await gesture.up();
    await tester.pump();

    // 松手后气泡消失并提交一次 seekTo，位置与拖动目标时间一致
    expect(find.byKey(kPlayerSeekBubbleKey), findsNothing);
    final seeks = channels.calls.where((c) => c.method == 'seekTo').toList();
    expect(seeks, hasLength(1));
    final args = seeks.single.arguments! as Map<Object?, Object?>;
    final positionMs = args['position']! as int;
    expect(_fmt(positionMs ~/ 1000), bubbleText);
  });

  for (final entry in <String, Size>{
    '竖屏窄屏': const Size(420, 900),
    '全屏横屏': const Size(900, 420),
  }.entries) {
    testWidgets('${entry.key}下使用同一套底部面板布局', (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels, size: entry.value);

      // 窄屏与宽屏（含横屏比例）都走同一套面板（同一 ValueKey）
      expect(find.byKey(kPlayerControlPanelKey), findsOneWidget);
      expect(find.byKey(kPlayerPlayPauseKey), findsOneWidget);
      expect(find.byKey(kPlayerSeekBarKey), findsOneWidget);
    });
  }

  testWidgets('音量弹层为紧凑单行：静音按钮 / 滑块 / 百分比，高度 ≤92dp', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        volume: 0.5,
      ),
    );
    await _openVolumeSheet(tester);

    // 单行三元素：图标按钮（未静音时 tooltip 为「静音」）/ 滑块 / 百分比读数。
    final muteButton = find.byTooltip('静音');
    expect(muteButton, findsOneWidget);
    expect(
      find.descendant(of: muteButton, matching: find.byIcon(Icons.volume_up)),
      findsOneWidget,
    );
    expect(find.byType(Slider), findsOneWidget);
    expect(find.text('50%'), findsOneWidget);

    // 旧三段结构（静音 ListTile 文案 / 「音量」标签行）在新结构下均不存在。
    expect(find.text('静音'), findsNothing);
    expect(find.text('取消静音'), findsNothing);
    expect(find.text('音量'), findsNothing);

    // 弹层内容高度压缩到 ≤92dp（实测 80dp；改造前为 200dp）。
    expect(
      tester.getSize(find.byKey(kPlayerVolumeSheetKey)).height,
      lessThanOrEqualTo(92),
    );

    // 单行三元素垂直中心一致（±2dp）。
    final double iconCenter = tester.getCenter(muteButton).dy;
    final double sliderCenter = tester.getCenter(find.byType(Slider)).dy;
    final double textCenter = tester.getCenter(find.text('50%')).dy;
    expect((sliderCenter - iconCenter).abs(), lessThanOrEqualTo(2));
    expect((textCenter - iconCenter).abs(), lessThanOrEqualTo(2));

    // 图标按钮命中区 ≥48dp（触摸目标不得缩小）。
    final Size muteSize = tester.getSize(muteButton);
    expect(muteSize.height, greaterThanOrEqualTo(48));
    expect(muteSize.width, greaterThanOrEqualTo(48));
  });

  testWidgets('点击静音发出 setVolume(0)，tooltip 与百分比更新为取消静音 / 0%',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        volume: 0.8,
      ),
    );
    await _openVolumeSheet(tester);

    await tester.tap(find.byTooltip('静音'));
    await tester.pump();
    // 静音 = setVolume(0)
    expect(_setVolumeCalls(channels), <double>[0]);

    // 原生回执静音后的快照 → 弹层跟随真实状态刷新
    await channels.emit(const PlayerSnapshot(
      position: Duration(seconds: 30),
      duration: Duration(minutes: 10),
      volume: 0,
      muted: true,
    ));
    await tester.pump();

    expect(find.byTooltip('取消静音'), findsOneWidget);
    expect(find.byTooltip('静音'), findsNothing);
    expect(find.text('0%'), findsOneWidget);
    expect(find.text('80%'), findsNothing);
  });

  testWidgets('点击取消静音恢复到静音前的音量', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        volume: 0.6,
      ),
    );
    await _openVolumeSheet(tester);

    await tester.tap(find.byTooltip('静音'));
    await tester.pump();
    await channels.emit(const PlayerSnapshot(
      position: Duration(seconds: 30),
      duration: Duration(minutes: 10),
      volume: 0,
      muted: true,
    ));
    await tester.pump();

    await tester.tap(find.byTooltip('取消静音'));
    await tester.pump();

    expect(_setVolumeCalls(channels), <double>[0, 0.6]);
  });

  testWidgets('静音前音量为 0（_lastVolume 无效）时取消静音回落到 1.0',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(
      tester,
      channels,
      snapshot: const PlayerSnapshot(
        position: Duration(seconds: 30),
        duration: Duration(minutes: 10),
        volume: 0,
        muted: true,
      ),
    );
    await _openVolumeSheet(tester);

    expect(find.byTooltip('取消静音'), findsOneWidget);
    expect(find.text('0%'), findsOneWidget);

    await tester.tap(find.byTooltip('取消静音'));
    await tester.pump();

    expect(_setVolumeCalls(channels), <double>[1]);
  });

  testWidgets('拖动滑块发出对应 setVolume，百分比读数与之一致', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels); // 默认音量 1.0
    await _openVolumeSheet(tester);

    expect(find.text('100%'), findsOneWidget);

    final slider = find.byType(Slider);
    await tester.drag(slider, const Offset(-120, 0));
    await tester.pump();

    final volumes = _setVolumeCalls(channels);
    expect(volumes, isNotEmpty, reason: '拖动滑块应下发 setVolume');
    final double dragged = volumes.last;

    // 原生回执该音量 → 百分比读数与之一致
    await channels.emit(PlayerSnapshot(
      position: const Duration(seconds: 30),
      duration: const Duration(minutes: 10),
      volume: dragged,
    ));
    await tester.pump();
    expect(find.text('${(dragged * 100).round()}%'), findsOneWidget);
  });

  // ------------------------------------------- AP-06：品牌色 / 面板形态 / 轨道按钮

  test('品牌色 kAccent 与 Web `--brand` 同色（#E50914）', () {
    expect(kAccent, const Color(0xFFE50914));
  });

  testWidgets('点击「字幕」只出现字幕分组（含「关闭字幕」），不含音轨 / 画质分组',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(900, 420));

    await tester.tap(find.byTooltip('字幕'));
    await tester.pump(); // 启动弹层路由
    await tester.pump(const Duration(milliseconds: 350)); // 完成弹层动画

    expect(find.text('关闭字幕'), findsOneWidget);
    expect(find.text('暂无音轨'), findsNothing);
    expect(find.text('自动'), findsNothing);
  });

  testWidgets('点击「音轨」只出现音轨分组，无音轨时保留「暂无音轨」占位', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(900, 420));

    await tester.tap(find.byTooltip('音轨'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.text('暂无音轨'), findsOneWidget);
    expect(find.text('关闭字幕'), findsNothing);
    expect(find.text('自动'), findsNothing);
  });

  testWidgets('点击「画质」只出现画质分组（含「自动」），不含字幕 / 音轨分组',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(900, 420));

    await tester.tap(find.byTooltip('画质'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.text('自动'), findsOneWidget);
    expect(find.text('关闭字幕'), findsNothing);
    expect(find.text('暂无音轨'), findsNothing);
  });

  testWidgets('窄屏 360dp 下控制行换行且无溢出，三个轨道按钮命中区 ≥48dp',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(360, 640));

    // 无 RenderFlex overflow 等布局异常
    expect(tester.takeException(), isNull);
    expect(find.byKey(kPlayerControlPanelKey), findsOneWidget);

    for (final tooltip in <String>['字幕', '音轨', '画质']) {
      final size = tester.getSize(find.byTooltip(tooltip));
      expect(size.width, greaterThanOrEqualTo(48), reason: '$tooltip 命中区宽度');
      expect(size.height, greaterThanOrEqualTo(48), reason: '$tooltip 命中区高度');
    }
  });

  testWidgets('横屏面板宽度为屏幕宽度的 3/4（±2dp）且水平居中', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(900, 420);
    await _pumpPlayer(tester, channels, size: size);

    final panel = tester.getRect(find.byKey(kPlayerControlPanelKey));
    expect(panel.width, closeTo(size.width * 0.75, 2));
    expect(panel.center.dx, closeTo(size.width / 2, 2));
  });

  testWidgets('面板中不再包含 BackdropFilter（毛玻璃已退化为纯半透明）',
      (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels, size: const Size(900, 420));

    expect(
      find.descendant(
        of: find.byKey(kPlayerControlPanelKey),
        matching: find.byType(BackdropFilter),
      ),
      findsNothing,
    );
  });

  testWidgets('横屏 780×380（旧等分三栏必然溢出）控制行无溢出异常', (tester) async {
    final channels = _PlayerChannels()..install();
    // pipSupported=true → 右侧 5 个按钮共 240dp；旧实现了列宽仅约 196dp，RenderFlex 必溢出。
    await _pumpPlayer(tester, channels,
        size: const Size(780, 380), snapshot: _landscapeSnapshot);

    // 旧的等宽三栏会把右侧组溢出面板，RenderFlex 溢出会以异常暴露，这里必须为空。
    expect(tester.takeException(), isNull,
        reason: '横屏第一行不应有 RenderFlex 溢出');
    expect(find.byKey(kPlayerControlPanelKey), findsOneWidget);
    expect(find.byTooltip('画中画'), findsOneWidget);
  });

  testWidgets('中央簇三个控件的水平中心与屏幕水平中心一致（±2dp）', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(780, 380);
    await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

    final Rect back = tester.getRect(find.byTooltip('后退 10 秒'));
    final Rect forward = tester.getRect(find.byTooltip('前进 10 秒'));
    // 中央簇（后退 / 播放暂停 / 前进）整体中心必须落在屏幕水平中心。
    expect((back.left + forward.right) / 2, closeTo(size.width / 2, 2));
    // 播放暂停圆盘自身即位于屏幕水平中心。
    expect(
      tester.getCenter(find.byKey(kPlayerPlayPauseKey)).dx,
      closeTo(size.width / 2, 2),
    );
  });

  testWidgets('横屏面板首尾控件均落在底栏浮层内（居中排布，不再重叠 / 凸出）',
      (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(780, 380);
    await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

    final Rect panel = tester.getRect(find.byKey(kPlayerControlPanelKey));
    // 面板宽度 = 屏幕宽度的 3/4（AP-06 成果不得回退）。
    expect(panel.width, closeTo(size.width * 0.75, 2));

    // 最右侧控件（全屏）的右边缘不得越过面板右边界。
    final Rect fullscreen = tester.getRect(find.byTooltip('全屏'));
    expect(fullscreen.right, lessThanOrEqualTo(panel.right));
    // 最左侧控件（音量）不得越过面板左边界（居中单行不再贴边，但仍须完整落入面板）。
    final Rect volume = tester.getRect(find.byTooltip('音量'));
    expect(volume.left, greaterThanOrEqualTo(panel.left));
  });

  // ------------------------------------------- 面板两行：6 个按钮的顺序 / 换行

  for (final size in <Size>[const Size(900, 420), const Size(780, 380)]) {
    final String label = '${size.width.toInt()}×${size.height.toInt()}';
    testWidgets('横屏 $label：6 个面板按钮同一行，顺序为 音量/画质/音轨/字幕/画中画/全屏',
        (tester) async {
      final channels = _PlayerChannels()..install();
      // pipSupported=true → 面板 6 个按钮齐全，顺序断言不会缺项。
      await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

      expect(tester.takeException(), isNull, reason: '横屏第一行不得溢出');
      final panel = find.byKey(kPlayerControlPanelKey);
      expect(panel, findsOneWidget);

      for (final tooltip in _panelOrder) {
        expect(
          find.descendant(of: panel, matching: find.byTooltip(tooltip)),
          findsOneWidget,
          reason: '面板缺少按钮 $tooltip',
        );
      }

      final List<Offset> centers = <Offset>[
        for (final tooltip in _panelOrder) tester.getCenter(find.byTooltip(tooltip)),
      ];
      // 单行：6 个按钮的垂直中心一致。
      for (final center in centers) {
        expect(center.dy, closeTo(centers.first.dy, 1),
            reason: '6 个面板按钮应位于同一行');
      }
      // 顺序：水平中心从左到右严格递增。
      for (var i = 1; i < centers.length; i++) {
        expect(centers[i].dx, greaterThan(centers[i - 1].dx),
            reason: '面板第 $i 与第 ${i + 1} 个按钮顺序错误');
      }
    });
  }

  // 竖屏 420×900（指定测试视口）空间充足时单行；更窄的 300dp 触发居中换行。
  for (final size in <Size>[const Size(420, 900), const Size(300, 640)]) {
    testWidgets('竖屏 ${size.width.toInt()}dp：面板 6 个按钮顺序不变、命中区 ≥48dp、无溢出',
        (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

      expect(tester.takeException(), isNull, reason: '竖屏不得溢出');
      final panel = find.byKey(kPlayerControlPanelKey);
      expect(panel, findsOneWidget);

      for (final tooltip in _panelOrder) {
        expect(
          find.descendant(of: panel, matching: find.byTooltip(tooltip)),
          findsOneWidget,
          reason: '面板缺少按钮 $tooltip',
        );
      }

      // 按阅读顺序（先上后下、同行先左后右）还原 6 个按钮，须与指定顺序一致。
      final List<(Offset, String)> placed = <(Offset, String)>[
        for (final tooltip in _panelOrder)
          (tester.getCenter(find.byTooltip(tooltip)), tooltip),
      ];
      placed.sort((a, b) {
        final int rowA = a.$1.dy.round();
        final int rowB = b.$1.dy.round();
        return rowA != rowB ? rowA.compareTo(rowB) : a.$1.dx.compareTo(b.$1.dx);
      });
      expect(placed.map((e) => e.$2).toList(), _panelOrder);

      // 每个按钮命中区 ≥48dp（不缩放、不缩小命中区）。
      for (final tooltip in _panelOrder) {
        final Size s = tester.getSize(find.byTooltip(tooltip));
        expect(s.width, greaterThanOrEqualTo(48), reason: '$tooltip 命中区宽度');
        expect(s.height, greaterThanOrEqualTo(48), reason: '$tooltip 命中区高度');
      }
    });
  }

  testWidgets('竖屏 300dp：面板 6 个按钮确实换行（不止一行）', (tester) async {
    final channels = _PlayerChannels()..install();
    await _pumpPlayer(tester, channels,
        size: const Size(300, 640), snapshot: _landscapeSnapshot);

    final Set<int> rows = <int>{
      for (final tooltip in _panelOrder)
        tester.getCenter(find.byTooltip(tooltip)).dy.round(),
    };
    expect(rows.length, greaterThan(1), reason: '300dp 竖屏下应换行');
  });

  testWidgets('竖屏 420×900：进度条与时间文本仍在底栏浮层内', (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(420, 900);
    await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

    final panel = find.byKey(kPlayerControlPanelKey);
    expect(panel, findsOneWidget);

    expect(
      find.descendant(of: panel, matching: find.byKey(kPlayerSeekBarKey)),
      findsOneWidget,
      reason: '竖屏进度条应在底栏浮层内',
    );
    expect(
      find.descendant(of: panel, matching: find.text('13:59')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: panel, matching: find.text('2:03:53')),
      findsOneWidget,
    );
  });

  testWidgets('竖屏 420×900：底栏浮层两行、底边距 12dp、中央簇居中于可用区域',
      (tester) async {
    final channels = _PlayerChannels()..install();
    const size = Size(420, 900);
    await _pumpPlayer(tester, channels, size: size, snapshot: _landscapeSnapshot);

    final Rect panel = tester.getRect(find.byKey(kPlayerControlPanelKey));
    final Rect topBar = tester.getRect(find.byKey(kPlayerTopBarKey));
    final Rect cluster = tester.getRect(find.byKey(kPlayerCenterControlsKey));

    // 竖屏紧凑态：内边距 8dp / 行距 6dp / 底边距 12dp → 两行面板高 120dp。
    expect(panel.height, closeTo(120, 1), reason: '竖屏两行面板高 120dp');
    expect(size.height - panel.bottom, closeTo(12, 0.5), reason: '竖屏底边距 12dp');

    // 中央簇居中于顶栏与底栏之间的可用区域。
    expect(cluster.center.dy, closeTo((topBar.bottom + panel.top) / 2, 2));
    expect(cluster.top, greaterThanOrEqualTo(topBar.bottom - 0.5));
    expect(cluster.bottom, lessThanOrEqualTo(panel.top + 0.5));
  });

  // ------------------------------------------- AP-15：旋转后画面几何

  // 本 Bug 属真机 TLHC 纹理层几何不同步，Widget 测试无法复现纹理层 latch；
  // 这里只保证竖 / 横屏下播放页均正常构建、三段式关键容器齐全、无布局异常。
  for (final entry in <String, Size>{
    '竖屏 420×900': const Size(420, 900),
    '横屏 900×420': const Size(900, 420),
  }.entries) {
    testWidgets('${entry.key}：播放页正常构建，中央簇与底栏浮层均在，无布局异常',
        (tester) async {
      final channels = _PlayerChannels()..install();
      await _pumpPlayer(tester, channels, size: entry.value);

      expect(tester.takeException(), isNull, reason: '${entry.key} 不应有布局异常');
      // 三段式关键容器在旋转前后均存在（控制层结构不随方向改变）。
      expect(find.byKey(kPlayerCenterControlsKey), findsOneWidget);
      expect(find.byKey(kPlayerControlPanelKey), findsOneWidget);
      // 画面承载层 Center > AspectRatio > AndroidView 仍在树中。
      expect(find.byType(AndroidView), findsOneWidget);
    });
  }
}
