import 'dart:ui' show BoxHeightStyle;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vidday_tv/core/api_client.dart';
import 'package:vidday_tv/core/models.dart';
import 'package:vidday_tv/ui/detail_page.dart';

/// 注入式假 ApiClient：不发起任何真实网络请求，行为完全由夹具决定。
class _FakeApi extends ApiClient {
  _FakeApi({
    required this.detail,
    this.credits,
    this.progress = const <WatchProgress>[],
    this.myList = const <CarouselCard>[],
    this.failFirstFetch = false,
  }) : super(deviceId: 'test-device');

  final TitleDetail detail;
  final TitleCredits? credits;
  final List<WatchProgress> progress;
  final List<CarouselCard> myList;

  /// 为 true 时首次 `fetchTitle` 抛 `ApiException`，其后正常返回，
  /// 用于构造详情页错误态并验证错误态「重试」入口。
  final bool failFirstFetch;

  int addCalls = 0;
  int removeCalls = 0;
  int fetchTitleCalls = 0;

  @override
  Future<TitleDetail> fetchTitle(int id) async {
    fetchTitleCalls++;
    if (failFirstFetch && fetchTitleCalls == 1) {
      throw ApiException('首次加载失败', statusCode: 500);
    }
    return detail;
  }

  @override
  Future<TitleCredits> fetchCredits(int id) async =>
      credits ?? TitleCredits(id: id, contentType: detail.contentType);

  @override
  Future<List<CarouselCard>> fetchMyList() async => myList;

  @override
  Future<List<WatchProgress>> fetchWatchProgress() async => progress;

  @override
  Future<void> addToMyList(int titleId) async => addCalls++;

  @override
  Future<void> removeFromMyList(int titleId) async => removeCalls++;
}

/// 构造一部电影详情；图片 URL 一律留空（无头测试中 RemoteImage 走占位），
/// 图片渲染由主 Agent 在真机验收。
TitleDetail _movie({
  int id = 1,
  String? chineseTitle = '测试影片',
  String? englishTitle,
  String? playUrl = 'https://media.example.com/movie.m3u8',
  String? synopsis = '短简介',
  String? backdropUrl,
  String? posterUrl,
  double? rating = 8.1,
  int? year = 2024,
  int? runtime = 128,
  String? maturity = 'PG-13',
  List<String> genres = const <String>['动作', '科幻'],
}) {
  return TitleDetail(
    id: id,
    contentType: 'movie',
    title: 'Test Movie',
    chineseTitle: chineseTitle,
    englishTitle: englishTitle,
    year: year,
    runtime: runtime,
    rating: rating,
    maturity: maturity,
    genres: genres,
    logline: '一句话简介',
    synopsis: synopsis,
    backdropUrl: backdropUrl,
    posterUrl: posterUrl,
    playUrl: playUrl,
  );
}

const String _longSynopsis =
    '这是一段很长的剧情简介，用于验证详情页摘要的折叠与展开交互，'
    '在窄屏与宽屏下都应只显示三行并在末尾出现 MORE 入口。'
    '这是一段很长的剧情简介，用于验证详情页摘要的折叠与展开交互，'
    '在窄屏与宽屏下都应只显示三行并在末尾出现 MORE 入口。'
    '这是一段很长的剧情简介，用于验证详情页摘要的折叠与展开交互，'
    '在窄屏与宽屏下都应只显示三行并在末尾出现 MORE 入口。'
    '这是一段很长的剧情简介，用于验证详情页摘要的折叠与展开交互，'
    '在窄屏与宽屏下都应只显示三行并在末尾出现 MORE 入口。';

TitleCredits _credits({int id = 1}) {
  return TitleCredits(
    id: id,
    contentType: 'movie',
    cast: const <CreditEntry>[
      CreditEntry(personId: 10, name: '张三', character: '主角'),
    ],
    crew: const <CreditEntry>[
      CreditEntry(personId: 20, name: '李四', department: 'Directing', job: '导演'),
    ],
  );
}

/// 挂载详情页并等待所有派生请求完成。
Future<void> _pumpDetail(
  WidgetTester tester,
  _FakeApi api, {
  Size size = const Size(1100, 2200),
  double topInset = 0,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = size;
  tester.view.padding = FakeViewPadding(top: topInset);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
    tester.view.resetPadding();
  });

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: DetailPage(api: api, titleId: api.detail.id),
    ),
  );
  await tester.pumpAndSettle();
}

const Size _wide = Size(1100, 2200);
const Size _narrow = Size(420, 1800);
const Size _narrowLandscape = Size(540, 420);
const _playKey = ValueKey<String>('movie-play-button');
const _portraitSynopsisKey = ValueKey<String>('portrait-expanded-synopsis');
const _titleKey = ValueKey<String>('movie-title');
const _actionsKey = ValueKey<String>('movie-secondary-actions');
const _playBlockKey = ValueKey<String>('movie-play-block');
const _playSlotKey = ValueKey<String>('movie-play-slot');

void main() {
  group('AU-03-V 手机竖屏', () {
    testWidgets('454 宽首屏顺序、顶部操作和参考位置', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(
          detail: _movie(synopsis: _longSynopsis),
          credits: _credits(),
        ),
        size: const Size(454, 1000),
        topInset: 41,
      );

      double y(Finder finder) => tester.getTopLeft(finder).dy;
      final title = find.text('测试影片');
      final runtime = find.text('128 分钟');
      final year = find.text('2024');
      final maturity = find.text('PG-13');
      final genre = find.text('动作, 科幻');
      final play = tester.getRect(find.byKey(_playKey));
      final playStyle = tester
          .widget<FilledButton>(find.byKey(_playKey))
          .style!;
      final score = find.text('8.1');
      final cast = find.text('演职员');
      final actors = find.byKey(const ValueKey<String>('portrait-cast-rail'));
      final actions = <IconData>[
        Icons.visibility_off_outlined,
        Icons.download_outlined,
        Icons.bookmark_border,
        Icons.movie_creation_outlined,
        Icons.star,
      ];
      final actionCenters = actions
          .map((icon) => tester.getCenter(find.byIcon(icon)))
          .toList();

      expect(title, findsOneWidget);
      expect(y(find.byKey(const ValueKey<String>('portrait-movie-hero'))), 0);
      final overlay = find.byType(AnnotatedRegion<SystemUiOverlayStyle>);
      expect(tester.getRect(overlay).contains(const Offset(227, 20)), isTrue);
      final overlayStyle = tester
          .widget<AnnotatedRegion<SystemUiOverlayStyle>>(overlay)
          .value;
      expect(overlayStyle.statusBarColor, Colors.transparent);
      expect(overlayStyle.statusBarIconBrightness, Brightness.light);
      expect(overlayStyle.systemNavigationBarColor, isNull);
      expect(find.byIcon(Icons.favorite_border), findsNothing);
      for (final icon in <IconData>[Icons.chevron_left, Icons.more_horiz]) {
        expect(tester.getCenter(find.byIcon(icon)).dy, closeTo(65, 1));
      }
      expect(
        tester.getCenter(find.byIcon(Icons.chevron_left)).dx,
        lessThan(48),
      );
      expect(
        tester.getCenter(find.byIcon(Icons.more_horiz)).dx,
        greaterThan(406),
      );
      expect(tester.getCenter(title).dx, closeTo(227, 1));
      expect(y(title), inInclusiveRange(400, 486));
      expect(y(runtime), closeTo(510, 10));
      expect(
        tester.getCenter(runtime).dy,
        closeTo(tester.getCenter(maturity).dy, 1),
      );
      expect(
        tester.getTopLeft(runtime).dx,
        lessThan(tester.getTopLeft(year).dx),
      );
      expect(
        tester.getTopLeft(year).dx,
        lessThan(tester.getTopLeft(maturity).dx),
      );
      expect(y(genre), closeTo(540, 10));
      expect(y(genre), greaterThan(y(runtime)));
      expect(y(genre), lessThan(play.top));
      expect(play.top, closeTo(570, 10));
      expect(play.height, closeTo(50, 2));
      expect(play.width, closeTo(334, 2));
      expect(play.center.dx, closeTo(227, 1));
      expect(tester.getCenter(find.text('播放')).dx, closeTo(227, 1));
      expect(find.byIcon(Icons.play_arrow), findsNothing);
      expect(playStyle.foregroundColor!.resolve({}), Colors.white);
      expect(playStyle.backgroundColor!.resolve({}), const Color(0xFFF1852C));
      for (var i = 0; i < actionCenters.length; i++) {
        expect(actionCenters[i].dy, closeTo(652, 10));
        if (i > 0) {
          expect(
            actionCenters[i].dx - actionCenters[i - 1].dx,
            closeTo(79.2, 1),
          );
        }
      }
      final synopsis = find.byKey(_portraitSynopsisKey);
      expect(tester.getTopLeft(synopsis).dx, closeTo(29, 1));
      expect(y(synopsis), closeTo(690, 12));
      expect(y(score), greaterThan(tester.getBottomLeft(synopsis).dy));
      expect(y(score), closeTo(754, 12));
      final scoreStar = find.byIcon(Icons.star_rounded);
      expect(
        (tester.getTopLeft(scoreStar).dx + tester.getTopRight(score).dx) / 2,
        closeTo(227, 1),
      );
      expect(tester.getTopLeft(cast).dx, closeTo(29, 1));
      expect(y(cast), greaterThan(y(score)));
      expect(y(cast), closeTo(789, 14));
      expect(y(actors), closeTo(818, 14));
      expect(tester.getRect(actors).right, 454);
      final firstAvatar = find
          .descendant(of: actors, matching: find.byType(ClipRRect))
          .first;
      final secondAvatar = find
          .descendant(of: actors, matching: find.byType(ClipRRect))
          .last;
      expect(tester.getSize(firstAvatar), const Size.square(72));
      expect(tester.getTopLeft(firstAvatar).dx, 29);
      expect(
        find.descendant(of: firstAvatar, matching: find.byIcon(Icons.person)),
        findsOneWidget,
      );
      expect(
        tester.getTopLeft(secondAvatar).dx - tester.getTopRight(firstAvatar).dx,
        14,
      );
      expect(find.text('4K'), findsNothing);
      expect(find.text('All Movies'), findsNothing);
    });

    testWidgets('动态字体下 MORE 与 CJK 第三行同行，前两行使用全宽', (tester) async {
      const synopsis = '长篇电影简介用于测试文字换行和剧情简介的截断位置。';
      await _pumpDetail(
        tester,
        _FakeApi(
          detail: _movie(synopsis: List<String>.filled(12, synopsis).join()),
          credits: _credits(),
        ),
        size: const Size(360, 1000),
        textScale: 1.65,
      );
      final folded = find.byKey(_portraitSynopsisKey);
      await tester.ensureVisible(folded);
      final paragraph = tester.renderObject<RenderParagraph>(folded);
      final span = tester.widget<Text>(folded).textSpan! as TextSpan;
      final plain = span.toPlainText();
      final moreStyle = (span.children!.single as TextSpan).style!;
      expect(moreStyle.color, const Color(0xFF595959));
      expect(moreStyle.fontSize, lessThan(span.style!.fontSize!));
      final lines = paragraph.getBoxesForSelection(
        TextSelection(baseOffset: 0, extentOffset: plain.length),
        boxHeightStyle: BoxHeightStyle.max,
      );
      final lineTops = lines.map((box) => box.top.round()).toSet().toList();
      expect(lineTops, hasLength(3));
      expect(lines.first.right, greaterThan(paragraph.size.width * 0.9));
      final more = paragraph
          .getBoxesForSelection(
            TextSelection(
              baseOffset: plain.length - 4,
              extentOffset: plain.length,
            ),
            boxHeightStyle: BoxHeightStyle.max,
          )
          .single;
      final before = paragraph
          .getBoxesForSelection(
            TextSelection(
              baseOffset: plain.length - 7,
              extentOffset: plain.length - 6,
            ),
            boxHeightStyle: BoxHeightStyle.max,
          )
          .single;
      expect(plain, endsWith('…\u00a0MORE'));
      expect(more.top, closeTo(lineTops.last.toDouble(), 1));
      expect(more.top, closeTo(before.top, 1));
      final moreCenter = Offset(
        (more.left + more.right) / 2,
        (more.top + more.bottom) / 2,
      );
      await tester.tapAt(paragraph.localToGlobal(moreCenter));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('大字号姓名与职务各保留两行，列表可从屏幕边缘横滑', (tester) async {
      const name = 'Li Ma Wu';
      const role = 'Co EP VP';
      await _pumpDetail(
        tester,
        _FakeApi(
          detail: _movie(),
          credits: TitleCredits(
            id: 1,
            contentType: 'movie',
            crew: <CreditEntry>[
              const CreditEntry(personId: 1, name: name, job: role),
              for (var i = 2; i <= 9; i++)
                CreditEntry(personId: i, name: 'Credit $i', job: role),
            ],
          ),
        ),
        size: const Size(454, 1000),
        textScale: 2.5,
      );
      final rail = find.byKey(const ValueKey<String>('portrait-cast-rail'));
      await tester.ensureVisible(rail);
      final viewport = tester.getRect(rail);
      expect(viewport.right, 454);
      for (final label in <String>[name, role]) {
        final text = find.text(label).first;
        final paragraph = tester.renderObject<RenderParagraph>(text);
        expect(paragraph.maxLines, 2);
        expect(paragraph.overflow, TextOverflow.ellipsis);
        final lineTops = paragraph
            .getBoxesForSelection(
              TextSelection(baseOffset: 0, extentOffset: label.length),
            )
            .map((box) => box.top)
            .toSet();
        expect(lineTops, hasLength(2));
        expect(tester.getRect(text).bottom, lessThanOrEqualTo(viewport.bottom));
      }
      final scrollable = find.descendant(
        of: rail,
        matching: find.byType(Scrollable),
      );
      await tester.dragFrom(
        Offset(453, viewport.top + 20),
        const Offset(-180, 0),
      );
      await tester.pumpAndSettle();
      expect(
        tester.state<ScrollableState>(scrollable).position.pixels,
        greaterThan(0),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('缺评分时不生成评分行，片单仍可操作', (tester) async {
      final api = _FakeApi(detail: _movie(rating: null));
      await _pumpDetail(tester, api, size: _narrow);
      expect(find.byIcon(Icons.star_rounded), findsNothing);
      final bookmark = find.byTooltip('加入我的片单');
      await tester.tap(bookmark);
      await tester.pumpAndSettle();
      expect(api.addCalls, 1);
      expect(find.byTooltip('移出我的片单'), findsOneWidget);
      expect(find.byIcon(Icons.bookmark), findsOneWidget);
    });

    testWidgets('窄横屏仍是旧电影布局', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie(synopsis: _longSynopsis)),
        size: _narrowLandscape,
      );
      expect(find.text('测试影片'), findsNWidgets(2));
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      expect(find.byType(AnnotatedRegion<SystemUiOverlayStyle>), findsNothing);
      expect(find.text('MORE'), findsOneWidget);
      expect(find.byKey(_portraitSynopsisKey), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('DETAIL-05 完整数据（宽 / 窄屏）', () {
    for (final entry in <String, Size>{'宽屏': _wide, '窄屏': _narrow}.entries) {
      testWidgets('${entry.key}渲染标题、元信息、类型与演职员', (tester) async {
        await _pumpDetail(
          tester,
          _FakeApi(detail: _movie(), credits: _credits()),
          size: entry.value,
        );

        expect(find.text('测试影片'), findsWidgets);
        expect(find.text('播放'), findsOneWidget);
        // 真实元信息徽章
        expect(find.text('8.1'), findsOneWidget);
        expect(find.text('2024'), findsOneWidget);
        expect(find.text('PG-13'), findsOneWidget);
        expect(find.text('128 分钟'), findsOneWidget);
        // 类型
        if (entry.value == _narrow) {
          expect(find.text('动作, 科幻'), findsOneWidget);
        } else {
          expect(find.text('动作'), findsOneWidget);
          expect(find.text('科幻'), findsOneWidget);
        }
        // 演职员区与姓名 / 角色 / 职务
        expect(find.text('演职员'), findsOneWidget);
        expect(find.text('张三'), findsOneWidget);
        expect(find.text('主角'), findsOneWidget);
        expect(find.text('李四'), findsOneWidget);
        expect(find.text('导演'), findsOneWidget);
        // 无续播记录时不出现 Watching
        expect(find.text('Watching'), findsNothing);
      });
    }
  });

  group('DETAIL-05 缺背景与头像（宽 / 窄屏）', () {
    for (final entry in <String, Size>{'宽屏': _wide, '窄屏': _narrow}.entries) {
      testWidgets('${entry.key}仍可读，回退到占位', (tester) async {
        await _pumpDetail(
          tester,
          _FakeApi(detail: _movie(backdropUrl: null, posterUrl: null)),
          size: entry.value,
        );

        expect(find.text('测试影片'), findsWidgets);
        // 缺背景时有主图占位，且标题仍可读。
        expect(find.byIcon(Icons.movie_outlined), findsWidgets);
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('DETAIL-02 长简介 MORE（宽 / 窄屏）', () {
    for (final entry in <String, Size>{'宽屏': _wide, '窄屏': _narrow}.entries) {
      testWidgets('${entry.key}显示 MORE 并可展开弹层', (tester) async {
        await _pumpDetail(
          tester,
          _FakeApi(detail: _movie(synopsis: _longSynopsis)),
          size: entry.value,
        );

        final more = entry.value == _narrow
            ? find.byKey(_portraitSynopsisKey)
            : find.text('MORE');
        expect(more, findsOneWidget);

        await tester.ensureVisible(more);
        await tester.tap(more);
        await tester.pumpAndSettle();

        // 全文弹层：左上角关闭按钮存在
        expect(find.byType(Dialog), findsOneWidget);
        expect(find.byTooltip('关闭'), findsOneWidget);

        await tester.tap(find.byTooltip('关闭'));
        await tester.pumpAndSettle();
        expect(find.byType(Dialog), findsNothing);
      });
    }
  });

  group('DETAIL-04 / PLAY-05 无片源（宽 / 窄屏）', () {
    for (final entry in <String, Size>{'宽屏': _wide, '窄屏': _narrow}.entries) {
      testWidgets('${entry.key}主按钮禁用并给出提示', (tester) async {
        await _pumpDetail(
          tester,
          _FakeApi(detail: _movie(playUrl: null)),
          size: entry.value,
        );

        final button = tester.widget<FilledButton>(
          find.byKey(const ValueKey<String>('movie-play-button')),
        );
        expect(button.onPressed, isNull);
        expect(find.text('暂无片源'), findsOneWidget);
        expect(find.text('该影片暂无可用片源'), findsOneWidget);
      });
    }
  });

  group('DETAIL-06 / DETAIL-07 续播记录', () {
    testWidgets('有续播记录：按钮文案、进度条与标注用同一条进度', (tester) async {
      final api = _FakeApi(
        detail: _movie(),
        // DETAIL-07 夹具：position=839, duration=7433 → 约 11%
        progress: const <WatchProgress>[
          WatchProgress(
            titleId: 1,
            position: 839,
            duration: 7433,
            percent: 11.29,
          ),
        ],
      );
      await _pumpDetail(tester, api, size: _narrow);

      expect(find.text('继续观看 00:13:59'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('watch-progress-bar')),
        findsOneWidget,
      );
      expect(find.text('已看 13:59'), findsOneWidget);
      expect(find.text('总时长 2:03:53'), findsOneWidget);
    });

    testWidgets('无续播记录：按钮为「播放」且不显示进度条', (tester) async {
      await _pumpDetail(tester, _FakeApi(detail: _movie()));

      expect(find.text('播放'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('watch-progress-bar')),
        findsNothing,
      );
    });
  });

  group('DETAIL-03 演职员与 Watching', () {
    testWidgets('空演职员时不渲染演职员区', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(
          detail: _movie(),
          credits: const TitleCredits(id: 1, contentType: 'movie'),
        ),
      );

      expect(find.text('演职员'), findsNothing);
    });

    testWidgets('Watching 仅展示其它影片的真实记录', (tester) async {
      final api = _FakeApi(
        detail: _movie(),
        progress: const <WatchProgress>[
          // 当前影片（进入续播，不应出现在 Watching）
          WatchProgress(
            titleId: 1,
            position: 839,
            duration: 7433,
            percent: 11.29,
          ),
          // 其它影片（应出现在 Watching）
          WatchProgress(
            titleId: 2,
            position: 600,
            duration: 1200,
            percent: 50,
            chineseTitle: '其他影片',
          ),
        ],
      );
      await _pumpDetail(tester, api);

      expect(find.text('Watching'), findsOneWidget);
      expect(find.text('其他影片'), findsOneWidget);
      expect(find.text('已看 00:10:00'), findsOneWidget);
    });
  });

  group('我的片单（/public/list）', () {
    testWidgets('未加入时点击书签调用加入接口并切换为已选', (tester) async {
      final api = _FakeApi(detail: _movie());
      await _pumpDetail(tester, api);

      expect(find.byTooltip('加入我的片单'), findsOneWidget);
      await tester.ensureVisible(find.byTooltip('加入我的片单'));
      await tester.tap(find.byTooltip('加入我的片单'));
      await tester.pumpAndSettle();

      expect(api.addCalls, 1);
      expect(api.removeCalls, 0);
      expect(find.byTooltip('移出我的片单'), findsOneWidget);
      expect(find.byIcon(Icons.bookmark), findsOneWidget);
    });

    testWidgets('已加入时点击书签调用移除接口并切换为未选', (tester) async {
      final api = _FakeApi(
        detail: _movie(),
        myList: const <CarouselCard>[
          CarouselCard(id: 5, targetType: 'movie', targetId: 1, title: '测试影片'),
        ],
      );
      await _pumpDetail(tester, api);

      expect(find.byTooltip('移出我的片单'), findsOneWidget);
      await tester.ensureVisible(find.byTooltip('移出我的片单'));
      await tester.tap(find.byTooltip('移出我的片单'));
      await tester.pumpAndSettle();

      expect(api.removeCalls, 1);
      expect(api.addCalls, 0);
      expect(find.byTooltip('加入我的片单'), findsOneWidget);
    });
  });

  group('次级动作占位（无后端能力）', () {
    testWidgets('占位项置灰不可点且带提示，点击只弹提示不发起请求', (tester) async {
      final api = _FakeApi(detail: _movie());
      await _pumpDetail(tester, api);

      // 顶栏 2 个 + 动作行 4 个占位项，统一带「该功能暂不可用」提示。
      final hints = find.byTooltip('该功能暂不可用');
      expect(hints, findsNWidgets(6));

      // 底层按钮均为禁用态（onPressed == null → 置灰、不可触发任何动作）。
      final buttons = tester
          .widgetList<IconButton>(
            find.descendant(of: hints, matching: find.byType(IconButton)),
          )
          .toList();
      expect(buttons, hasLength(6));
      for (final button in buttons) {
        expect(button.onPressed, isNull);
      }

      // 点击占位项只给出提示文案，不改变片单状态、不发起任何网络请求。
      await tester.tap(hints.first, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text('该功能暂不可用'), findsOneWidget);
      expect(api.addCalls, 0);
      expect(api.removeCalls, 0);

      // 片单项是可操作项（onPressed 非空、带专属提示）。
      // 注意：IconButton.tooltip 生成的 Tooltip 是 IconButton 的子节点，故用 ancestor 反查。
      final listButton = tester.widget<IconButton>(
        find.ancestor(
          of: find.byTooltip('加入我的片单'),
          matching: find.byType(IconButton),
        ),
      );
      expect(listButton.onPressed, isNotNull);
    });
  });

  group('剧集详情保持现状', () {
    testWidgets('contentType=series 走旧布局，不渲染电影主按钮', (tester) async {
      final series = TitleDetail(
        id: 9,
        contentType: 'series',
        title: 'Series Title',
        chineseTitle: '测试剧集',
        year: 2023,
        synopsis: '剧集简介',
        playUrl: 'https://media.example.com/series.m3u8',
      );
      await _pumpDetail(tester, _FakeApi(detail: series), size: _narrow);

      expect(find.text('测试剧集'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('movie-play-button')),
        findsNothing,
      );
    });
  });

  group('AU-04 片名分层', () {
    testWidgets('宽屏：英中都有时中文在上（大字号）、英文在下（小一号）', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie(englishTitle: 'Test Movie')),
        size: _wide,
      );

      final titleBlock = find.byKey(_titleKey);
      final en = find.descendant(of: titleBlock, matching: find.text('Test Movie'));
      final zh = find.descendant(of: titleBlock, matching: find.text('测试影片'));
      expect(en, findsOneWidget);
      expect(zh, findsOneWidget);

      // 中文在上、英文在下。
      expect(
        tester.getTopLeft(zh).dy,
        lessThan(tester.getTopLeft(en).dy),
      );
      // 宽屏字号：中文 30、英文 20，中文更大。
      final enSize = tester.widget<Text>(en).style!.fontSize;
      final zhSize = tester.widget<Text>(zh).style!.fontSize;
      expect(zhSize, closeTo(30.0, 0.01));
      expect(enSize, closeTo(20.0, 0.01));
      expect(zhSize, greaterThan(enSize!));
      // 宽屏仍左对齐。
      expect(
        tester.getTopLeft(zh).dx,
        closeTo(tester.getTopLeft(en).dx, 0.5),
      );
    });

    testWidgets('宽屏：只有英文时仅渲染一条且用大字号', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie(chineseTitle: null, englishTitle: 'Only English')),
        size: _wide,
      );

      final titleBlock = find.byKey(_titleKey);
      expect(
        find.descendant(of: titleBlock, matching: find.byType(Text)),
        findsOneWidget,
      );
      final en = find.descendant(
        of: titleBlock,
        matching: find.text('Only English'),
      );
      expect(en, findsOneWidget);
      expect(tester.widget<Text>(en).style!.fontSize, 30);
    });

    testWidgets('宽屏：只有中文时仅渲染一条且用大字号', (tester) async {
      await _pumpDetail(tester, _FakeApi(detail: _movie()), size: _wide);

      final titleBlock = find.byKey(_titleKey);
      expect(
        find.descendant(of: titleBlock, matching: find.byType(Text)),
        findsOneWidget,
      );
      final zh = find.descendant(of: titleBlock, matching: find.text('测试影片'));
      expect(zh, findsOneWidget);
      expect(tester.widget<Text>(zh).style!.fontSize, 30);
    });

    testWidgets('宽屏：英中皆缺时回退到 title 大字号', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie(chineseTitle: null, englishTitle: null)),
        size: _wide,
      );

      final titleBlock = find.byKey(_titleKey);
      expect(
        find.descendant(of: titleBlock, matching: find.byType(Text)),
        findsOneWidget,
      );
      final fallback = find.descendant(
        of: titleBlock,
        matching: find.text('Test Movie'),
      );
      expect(fallback, findsOneWidget);
      expect(tester.widget<Text>(fallback).style!.fontSize, 30);
    });

    testWidgets('竖屏：中文在上（大字号）、英文在下（小一号），片名仍居中', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie(englishTitle: 'Test Movie')),
        size: const Size(454, 1000),
        topInset: 41,
      );

      final titleBlock = find.byKey(_titleKey);
      final en = find.descendant(of: titleBlock, matching: find.text('Test Movie'));
      final zh = find.descendant(of: titleBlock, matching: find.text('测试影片'));
      expect(en, findsOneWidget);
      expect(zh, findsOneWidget);
      expect(
        tester.getTopLeft(zh).dy,
        lessThan(tester.getTopLeft(en).dy),
      );
      // 竖屏字号：中文 (46*unit)、英文 (30*unit)，unit=1.0。
      final enSize = tester.widget<Text>(en).style!.fontSize;
      final zhSize = tester.widget<Text>(zh).style!.fontSize;
      expect(zhSize, closeTo(46, 0.01));
      expect(enSize, closeTo(30, 0.01));
      // 英文副标题字号落在 (30*unit).clamp(18, 35) 的 clamp 区间内。
      expect(enSize, inInclusiveRange(18, 35));
      expect(zhSize, greaterThan(enSize!));
      // 仍居中。
      expect(tester.getCenter(zh).dx, closeTo(227, 1));
      expect(tester.getCenter(en).dx, closeTo(227, 1));
    });
  });

  group('AU-04 横屏返回按钮贴顶', () {
    for (final size in <Size>[const Size(900, 420), const Size(780, 380)]) {
      testWidgets(
        '横屏 ${size.width.toInt()}×${size.height.toInt()}：返回按钮贴顶而非垂直居中',
        (tester) async {
          await _pumpDetail(
            tester,
            _FakeApi(detail: _movie()),
            size: size,
            topInset: 40,
          );

          final back = tester.getRect(find.byTooltip('返回'));
          // 贴顶：位于顶部安全区（topInset=40）之下一点，远小于屏幕竖直中点。
          expect(back.top, closeTo(44, 6));
          expect(back.top, lessThan(size.height / 2));
          expect(back.bottom, lessThan(size.height / 2));
          expect(back.left, lessThan(48));
        },
      );
    }
  });

  group('AU-04 横屏主播放按钮收窄', () {
    for (final size in <Size>[const Size(900, 420), const Size(780, 380)]) {
      testWidgets(
        '横屏 ${size.width.toInt()}×${size.height.toInt()}：主按钮 ≈256dp 且与动作行左右对齐',
        (tester) async {
          await _pumpDetail(
            tester,
            _FakeApi(detail: _movie()),
            size: size,
            topInset: 40,
          );

          final play = tester.getRect(find.byKey(_playKey));
          final actions = tester.getRect(find.byKey(_actionsKey));
          // 5×48 + 4×4 = 256。
          expect(play.width, closeTo(256, 1));
          expect(actions.width, closeTo(256, 1));
          expect(play.left, closeTo(actions.left, 1));
          expect(play.right, closeTo(actions.right, 1));
        },
      );
    }

    testWidgets('宽屏竖排 1100×2200：主按钮仍为全宽（等于其可用宽度）', (tester) async {
      await _pumpDetail(tester, _FakeApi(detail: _movie()), size: _wide);

      final play = tester.getRect(find.byKey(_playKey));
      final block = tester.getRect(find.byKey(_playBlockKey));
      expect(play.width, greaterThan(256));
      expect(play.width, closeTo(block.width, 1));
      expect(play.left, closeTo(block.left, 1));
      expect(play.right, closeTo(block.right, 1));
    });

    testWidgets('竖屏 420×1800：主按钮仍为全宽（等于其可用宽度）', (tester) async {
      await _pumpDetail(
        tester,
        _FakeApi(detail: _movie()),
        size: const Size(420, 1800),
      );

      final play = tester.getRect(find.byKey(_playKey));
      final slot = tester.getRect(find.byKey(_playSlotKey));
      // 未被收窄到图标行宽度。
      expect(play.width, greaterThan(256));
      // 仍按参考图比例 334/454 随屏幕等比全宽，且在内容槽内左右对称铺满。
      expect(play.width, closeTo(334 / 454 * 420, 1));
      expect(play.center.dx, closeTo(210, 1));
      expect(play.left - slot.left, closeTo(slot.right - play.right, 0.5));
    });
  });

  group('AU-05 旋转回归：横屏→竖屏不得共用滚动控制器', () {
    testWidgets('横屏旋转回竖屏不抛 Bad state，且竖屏顶栏着色链路仍有效', (tester) async {
      final api = _FakeApi(
        detail: _movie(synopsis: _longSynopsis),
        credits: _credits(),
        progress: const <WatchProgress>[
          // 当前影片（触发续播进度条，加高竖屏内容）
          WatchProgress(
            titleId: 1,
            position: 839,
            duration: 7433,
            percent: 11.29,
          ),
          // 其它影片（触发 Watching 区，进一步加高内容以支持滚动）
          WatchProgress(
            titleId: 2,
            position: 600,
            duration: 1200,
            percent: 50,
            chineseTitle: '其他影片',
          ),
        ],
      );

      // 1) 横屏挂载详情页（电影、playUrl 非空）。
      await _pumpDetail(tester, api, size: const Size(900, 420));
      expect(tester.takeException(), isNull);

      // 2) 同一测试、同一元素树内把视口改为竖屏。
      tester.view.physicalSize = const Size(420, 900);
      await tester.pump();

      // 3) 关键断言：横屏旧子树与竖屏新子树结构互斥，共用控制器会在
      //    layout 阶段读到 2 个 ScrollPosition 并抛 `Bad state: Too many elements`。
      expect(tester.takeException(), isNull);

      // 4) 正向断言：竖屏向下滚动超过 230*unit 后，顶栏底色应变为半透明深色，
      //    证明着色链路未被守卫短路成永远透明。
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -800),
      );
      await tester.pumpAndSettle();
      final topBarBox = find
          .descendant(
            of: find.byType(AnnotatedRegion<SystemUiOverlayStyle>),
            matching: find.byType(ColoredBox),
          )
          .first;
      expect(
        tester.widget<ColoredBox>(topBarBox).color,
        const Color(0xE61A1A22),
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('AU-06 详情页错误态重试', () {
    testWidgets('首次请求失败进入错误态，点「重试」重新请求并恢复内容且无异常', (tester) async {
      final api = _FakeApi(detail: _movie(), failFirstFetch: true);
      await _pumpDetail(tester, api);

      // 错误态：错误图标 + 可点的「重试」按钮，正常内容尚未渲染。
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      final retry = find.widgetWithText(FilledButton, '重试');
      expect(retry, findsOneWidget);
      expect(find.text('测试影片'), findsNothing);
      expect(api.fetchTitleCalls, 1);

      // 触发错误态里真实的「重试」入口。
      await tester.tap(retry);
      await tester.pumpAndSettle();

      // 重新发起请求，错误态消失、正常内容出现，且整个过程无异常。
      expect(api.fetchTitleCalls, 2);
      expect(find.byIcon(Icons.error_outline), findsNothing);
      expect(find.widgetWithText(FilledButton, '重试'), findsNothing);
      expect(find.text('测试影片'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });
}
