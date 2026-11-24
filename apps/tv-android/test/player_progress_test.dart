import 'package:flutter_test/flutter_test.dart';
import 'package:vidday_tv/core/models.dart';

void main() {
  group('WatchProgress.fromJson 字段解析', () {
    test('优先使用 targetId 作为作品 ID，并保留其余字段', () {
      final progress = WatchProgress.fromJson(<String, dynamic>{
        'id': 999,
        'targetId': 42,
        'episodeId': null,
        'position': 3212,
        'duration': 7433,
        'percent': 43.2,
        'updatedAt': '2026-01-02T03:04:05.000Z',
      });

      expect(progress.titleId, 42);
      expect(progress.episodeId, isNull);
      expect(progress.position, 3212);
      expect(progress.duration, 7433);
      expect(progress.percent, closeTo(43.2, 1e-9));
      expect(progress.updatedAt, DateTime.utc(2026, 1, 2, 3, 4, 5));
    });

    test('缺少 targetId 时回退到 id', () {
      final progress = WatchProgress.fromJson(<String, dynamic>{
        'id': 7,
        'position': 10,
        'duration': 100,
        'percent': 10,
      });

      expect(progress.titleId, 7);
    });

    test('字段缺失 / 非法时给安全默认值', () {
      final progress = WatchProgress.fromJson(<String, dynamic>{});

      expect(progress.titleId, 0);
      expect(progress.episodeId, isNull);
      expect(progress.position, 0);
      expect(progress.duration, 0);
      expect(progress.percent, 0);
      expect(progress.updatedAt, isNull);
    });

    test('percent 超界时夹到 0–100', () {
      expect(
        WatchProgress.fromJson(<String, dynamic>{'percent': 150}).percent,
        100,
      );
      expect(
        WatchProgress.fromJson(<String, dynamic>{'percent': -5}).percent,
        0,
      );
    });

    test('非法 updatedAt 解析为 null', () {
      final progress = WatchProgress.fromJson(<String, dynamic>{
        'updatedAt': 'not-a-date',
      });

      expect(progress.updatedAt, isNull);
    });
  });

  group('isResumable 续播有效性判定', () {
    WatchProgress build(int position, int duration, double percent) =>
        WatchProgress(
          titleId: 1,
          position: position,
          duration: duration,
          percent: percent,
        );

    test('正常进度可续播', () {
      expect(build(339, 7433, 4.56).isResumable, isTrue);
    });

    test('位置为 0 不可续播', () {
      expect(build(0, 7433, 0).isResumable, isFalse);
    });

    test('时长为 0 不可续播', () {
      expect(build(100, 0, 10).isResumable, isFalse);
    });

    test('percent 达到 98 视为已看完，不可续播', () {
      expect(build(5880, 6000, 98).isResumable, isFalse);
    });

    test('percent 略低于 98 仍可续播', () {
      expect(build(5879, 6000, 97.9).isResumable, isTrue);
    });
  });

  group('progressPercent 百分比计算', () {
    test('常规比例', () {
      expect(progressPercent(839, 7433), closeTo(11.29, 0.01));
    });

    test('位置为 0 返回 0', () {
      expect(progressPercent(0, 6000), 0);
    });

    test('时长为 0 返回 0', () {
      expect(progressPercent(100, 0), 0);
    });

    test('位置超过时长时封顶 100', () {
      expect(progressPercent(7000, 6000), 100);
    });
  });

  group('WatchProgress.fromPlayback 即时构造', () {
    test('按位置与时长计算百分比，并写入 UTC 时间', () {
      final progress = WatchProgress.fromPlayback(
        titleId: 3,
        position: 300,
        duration: 600,
      );

      expect(progress.titleId, 3);
      expect(progress.position, 300);
      expect(progress.duration, 600);
      expect(progress.percent, 50);
      expect(progress.updatedAt, isNotNull);
      expect(progress.updatedAt!.isUtc, isTrue);
    });

    test('位置超过时长时夹到时长', () {
      final progress = WatchProgress.fromPlayback(
        titleId: 3,
        position: 900,
        duration: 600,
      );

      expect(progress.position, 600);
      expect(progress.percent, 100);
    });

    test('负位置夹到 0', () {
      final progress = WatchProgress.fromPlayback(
        titleId: 3,
        position: -10,
        duration: 600,
      );

      expect(progress.position, 0);
      expect(progress.percent, 0);
    });
  });
}
