import 'dart:ui' show BoxHeightStyle;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vidday_tv/core/api_client.dart';
import 'package:vidday_tv/core/models.dart';
import 'package:vidday_tv/ui/detail_page.dart';
import 'package:vidday_tv/ui/expandable_text.dart';
import 'package:vidday_tv/ui/person_page.dart';

/// 注入式假 ApiClient：不发起任何真实网络请求，行为完全由夹具决定。
class _FakeApi extends ApiClient {
  _FakeApi({
    required this.person,
    this.collaborators = const <PersonCollaborator>[],
    this.failCollaborators = false,
    this.failFirstPerson = false,
  }) : super(deviceId: 'test-device');

  final PersonDetail person;
  final List<PersonCollaborator> collaborators;

  /// 为 true 时合作影人接口抛错，用于验证该区块静默隐藏。
  final bool failCollaborators;

  /// 为 true 时首次 `fetchPerson` 抛错，用于验证错误态与「重试」。
  final bool failFirstPerson;

  int personCalls = 0;

  @override
  Future<PersonDetail> fetchPerson(int id) async {
    personCalls++;
    if (failFirstPerson && personCalls == 1) {
      throw ApiException('首次加载失败', statusCode: 500);
    }
    return person;
  }

  @override
  Future<List<PersonCollaborator>> fetchPersonCollaborators(int id) async {
    if (failCollaborators) {
      throw ApiException('合作影人失败', statusCode: 500);
    }
    return collaborators;
  }

  @override
  Future<TitleDetail> fetchTitle(int id) async =>
      TitleDetail(id: id, contentType: 'movie', title: '作品 $id');

  @override
  Future<TitleCredits> fetchCredits(int id) async =>
      TitleCredits(id: id, contentType: 'movie');

  @override
  Future<List<CarouselCard>> fetchMyList() async => const <CarouselCard>[];

  @override
  Future<List<WatchProgress>> fetchWatchProgress() async =>
      const <WatchProgress>[];
}

/// 图片 URL 一律留空（无头测试中 RemoteImage 走占位），图片渲染由主 Agent 真机验收。
PersonDetail _person({
  int id = 7,
  String name = '张三',
  String? englishName = 'San Zhang',
  String? biography = '这是一段影人简介。',
  List<PersonCredit> credits = const <PersonCredit>[],
}) {
  return PersonDetail(
    id: id,
    name: name,
    englishName: englishName,
    biography: biography,
    credits: credits,
  );
}

const PersonCredit _workCredit = PersonCredit(
  titleId: 42,
  contentType: 'movie',
  title: '作品标题',
  releaseYear: 2021,
  character: '主角',
);

const PersonCollaborator _collaborator = PersonCollaborator(
  personId: 99,
  name: '李四',
  englishName: 'Co Star',
  sharedCount: 3,
);

/// 长简介末尾独有的句子，用于断言首屏已截断（不出现该句）。
const String _biographyTail = '结尾独有句子，只有展开全文时才应出现。';

/// 远超 3 行的长简介（1000+ 字符），末尾附上独有句子。
final String _longBiography =
    '${List<String>.filled(40, '这是一段很长的影人简介，用于验证影人页简介的折叠与展开行为。').join()}$_biographyTail';

/// 挂载影人页并等待所有派生请求完成。
Future<void> _pumpPerson(
  WidgetTester tester,
  _FakeApi api, {
  Size size = const Size(900, 1600),
}) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: PersonPage(api: api, personId: api.person.id),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('AU-09 影人页头部', () {
    testWidgets('渲染中英姓名；biography 非空时渲染「简介」与内容', (tester) async {
      await _pumpPerson(tester, _FakeApi(person: _person()));

      expect(find.text('San Zhang'), findsOneWidget);
      expect(find.text('张三'), findsOneWidget);
      expect(find.text('影人'), findsOneWidget);
      expect(find.text('简介'), findsOneWidget);
      expect(find.text('这是一段影人简介。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('biography 为空时不渲染「简介」标题', (tester) async {
      await _pumpPerson(tester, _FakeApi(person: _person(biography: null)));

      expect(find.text('San Zhang'), findsOneWidget);
      expect(find.text('简介'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('无英文名时大字号回退中文名，且不重复渲染副标题', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(person: _person(englishName: null)),
      );

      expect(find.text('张三'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AU-09 影人页参演作品', () {
    testWidgets('渲染作品卡；点一张推入对应影片详情页', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(
          person: _person(credits: const <PersonCredit>[_workCredit]),
        ),
      );

      expect(find.text('参演作品'), findsOneWidget);
      expect(find.text('作品标题'), findsOneWidget);
      expect(find.textContaining('主角'), findsOneWidget);
      expect(find.byType(DetailPage), findsNothing);

      final card = find.text('作品标题');
      await tester.ensureVisible(card);
      await tester.pumpAndSettle();
      await tester.tap(card);
      await tester.pumpAndSettle();

      final detail = tester.widget<DetailPage>(find.byType(DetailPage));
      expect(detail.titleId, 42);
      expect(tester.takeException(), isNull);
    });

    testWidgets('无可点击作品时显示空态文案', (tester) async {
      await _pumpPerson(tester, _FakeApi(person: _person()));

      expect(find.text('参演作品'), findsOneWidget);
      expect(find.text('暂无收录作品。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AU-09 影人页合作影人', () {
    testWidgets('渲染合作影人卡；点一张再推入一个影人页', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(
          person: _person(),
          collaborators: const <PersonCollaborator>[_collaborator],
        ),
      );

      expect(find.text('合作过的演职人员'), findsOneWidget);
      expect(find.text('Co Star'), findsOneWidget);
      expect(find.text('合作 3 部'), findsOneWidget);
      expect(find.byType(PersonPage), findsOneWidget);

      await tester.tap(find.text('Co Star'));
      await tester.pumpAndSettle();

      // 下层路由在新页完全覆盖后转为 offstage，故计数需带上 offstage 子树。
      expect(
        find.byType(PersonPage, skipOffstage: false),
        findsNWidgets(2),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('合作影人接口失败时静默隐藏该区块，页面其余部分正常', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(
          person: _person(credits: const <PersonCredit>[_workCredit]),
          failCollaborators: true,
        ),
      );

      expect(find.text('合作过的演职人员'), findsNothing);
      expect(find.text('San Zhang'), findsOneWidget);
      expect(find.text('参演作品'), findsOneWidget);
      expect(find.text('作品标题'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AU-09 影人页错误态重试', () {
    testWidgets('首次请求失败进入错误态，点「重试」重新请求并恢复内容且无异常', (tester) async {
      final api = _FakeApi(person: _person(), failFirstPerson: true);
      await _pumpPerson(tester, api);

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      final retry = find.widgetWithText(FilledButton, '重试');
      expect(retry, findsOneWidget);
      expect(find.text('San Zhang'), findsNothing);
      expect(api.personCalls, 1);

      await tester.tap(retry);
      await tester.pumpAndSettle();

      expect(api.personCalls, 2);
      expect(find.byIcon(Icons.error_outline), findsNothing);
      expect(find.widgetWithText(FilledButton, '重试'), findsNothing);
      expect(find.text('San Zhang'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AU-10 影人页简介复用 ExpandableText', () {
    testWidgets('短简介：不出现 MORE，简介全文直接内联可见', (tester) async {
      await _pumpPerson(tester, _FakeApi(person: _person()));

      expect(find.text('简介'), findsOneWidget);
      expect(find.byType(ExpandableText), findsOneWidget);
      expect(find.text('MORE'), findsNothing);
      expect(find.text('这是一段影人简介。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('长简介：内联 3 行截断并出现 MORE，末尾句子不在首屏', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(person: _person(biography: _longBiography)),
      );

      expect(find.byType(ExpandableText), findsOneWidget);
      expect(find.text('MORE'), findsOneWidget);

      // 末尾独有句子在首屏（折叠态）不应出现。
      expect(find.text(_biographyTail), findsNothing);

      // 进一步证明是「截断」而非「全文铺开」：内联正文被钳制为 3 行 + 省略号。
      final paragraph = tester.renderObject<RenderParagraph>(
        find.text(_longBiography),
      );
      expect(paragraph.maxLines, 3);
      expect(paragraph.overflow, TextOverflow.ellipsis);
      final lineTops = paragraph
          .getBoxesForSelection(
            TextSelection(baseOffset: 0, extentOffset: _longBiography.length),
            boxHeightStyle: BoxHeightStyle.max,
          )
          .map((box) => box.top.round())
          .toSet();
      expect(lineTops, hasLength(3));
      expect(tester.takeException(), isNull);
    });

    testWidgets('点 MORE 打开弹层：标题为影人显示名，弹层含完整简介', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(person: _person(biography: _longBiography)),
      );

      final more = find.text('MORE');
      await tester.ensureVisible(more);
      await tester.pumpAndSettle();
      await tester.tap(more);
      await tester.pumpAndSettle();

      final dialog = find.byType(ExpandableTextDialog);
      expect(dialog, findsOneWidget);
      // 弹层标题用影人显示名（headlineName 为英文名）。
      expect(
        find.descendant(of: dialog, matching: find.text('San Zhang')),
        findsOneWidget,
      );
      // 弹层内为 biography 全文（含末尾独有句子）。
      expect(
        find.descendant(of: dialog, matching: find.textContaining(_biographyTail)),
        findsOneWidget,
      );
      expect(find.byTooltip('关闭'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('关闭弹层后回到影人页，头部与参演作品等区块仍正常', (tester) async {
      await _pumpPerson(
        tester,
        _FakeApi(
          person: _person(
            biography: _longBiography,
            credits: const <PersonCredit>[_workCredit],
          ),
        ),
      );

      await tester.ensureVisible(find.text('MORE'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('MORE'));
      await tester.pumpAndSettle();
      expect(find.byType(ExpandableTextDialog), findsOneWidget);

      await tester.tap(find.byTooltip('关闭'));
      await tester.pumpAndSettle();

      expect(find.byType(ExpandableTextDialog), findsNothing);
      expect(find.text('San Zhang'), findsOneWidget);
      expect(find.text('参演作品'), findsOneWidget);
      expect(find.text('作品标题'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('biography 为空时不渲染「简介」标题', (tester) async {
      await _pumpPerson(tester, _FakeApi(person: _person(biography: null)));

      expect(find.text('简介'), findsNothing);
      expect(find.byType(ExpandableText), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
