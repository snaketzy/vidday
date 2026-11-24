import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vidday_tv/core/api_client.dart';
import 'package:vidday_tv/core/models.dart';
import 'package:vidday_tv/main.dart';
import 'package:vidday_tv/ui/latest_page.dart';
import 'package:vidday_tv/ui/widgets.dart';

const _movie = CarouselCard(
  id: 1,
  targetType: 'movie',
  targetId: 1,
  title: 'Test Movie',
);

const _homeCarousels = [
  Carousel(id: 1, title: 'Test Rail', variant: 'rail', items: [_movie]),
];

class _FakeApiClient implements ApiClient {
  _FakeApiClient({
    required this.carousels,
    this.latest = const [],
    this.failFirstRequest = false,
    this.failFirstLatestRequest = false,
  });

  final List<Carousel> carousels;
  final List<CarouselCard> latest;
  final bool failFirstRequest;
  final bool failFirstLatestRequest;
  int homeRequests = 0;
  int latestRequests = 0;

  @override
  Future<List<Carousel>> fetchHomeCarousels() async {
    homeRequests++;
    if (failFirstRequest && homeRequests == 1) {
      throw ApiException('Test request failed', statusCode: 503);
    }
    return carousels;
  }

  @override
  Future<List<CarouselCard>> fetchLatest({
    int days = 30,
    int? limit = 40,
  }) async {
    latestRequests++;
    if (failFirstLatestRequest && latestRequests == 1) {
      throw ApiException('Test request failed', statusCode: 503);
    }
    return latest;
  }

  @override
  Never noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Unexpected API call: ${invocation.memberName}');
}

void main() {
  testWidgets('Home renders the configured rail and poster', (tester) async {
    final api = _FakeApiClient(carousels: _homeCarousels);
    await tester.pumpWidget(ViddayApp(api: api));
    await tester.pumpAndSettle();

    expect(find.text('首页'), findsOneWidget);
    expect(find.text('Test Rail'), findsOneWidget);
    final poster = tester.widget<FocusablePosterCard>(
      find.byType(FocusablePosterCard),
    );
    expect(poster.card, same(_movie));
    expect(api.homeRequests, 1);
    expect(api.latestRequests, 0);
  });

  testWidgets('Home shows the empty state when both lists are empty', (
    tester,
  ) async {
    final api = _FakeApiClient(carousels: const []);
    await tester.pumpWidget(ViddayApp(api: api));
    await tester.pumpAndSettle();

    expect(find.text('暂无可用内容'), findsOneWidget);
    expect(find.byType(FocusablePosterCard), findsNothing);
    expect(find.widgetWithText(FilledButton, '重试'), findsOneWidget);
    expect(api.homeRequests, 1);
    expect(api.latestRequests, 1);
  });

  testWidgets('Home recovers after retrying a failed request', (tester) async {
    final api = _FakeApiClient(
      carousels: _homeCarousels,
      failFirstRequest: true,
    );
    await tester.pumpWidget(ViddayApp(api: api));
    await tester.pumpAndSettle();

    final error = find.textContaining('Test request failed');
    final retry = find.widgetWithText(FilledButton, '重试');
    expect(error, findsOneWidget);
    expect(find.byType(FocusablePosterCard), findsNothing);
    expect(api.homeRequests, 1);

    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(api.homeRequests, 2);
    expect(api.latestRequests, 0);
    expect(error, findsNothing);
    expect(retry, findsNothing);
    expect(find.text('Test Rail'), findsOneWidget);
    expect(find.byType(FocusablePosterCard), findsOneWidget);
  });

  testWidgets('LatestPage recovers after retrying a failed request', (
    tester,
  ) async {
    final api = _FakeApiClient(
      carousels: const [],
      latest: const [_movie],
      failFirstLatestRequest: true,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LatestPage(api: api, onOpen: (_) {}),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final error = find.textContaining('Test request failed');
    final retry = find.widgetWithText(FilledButton, '重试');
    expect(error, findsOneWidget);
    expect(find.byType(FocusableGridCard), findsNothing);
    expect(api.latestRequests, 1);

    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(api.latestRequests, 2);
    expect(error, findsNothing);
    expect(retry, findsNothing);
    expect(find.byType(FocusableGridCard), findsOneWidget);
  });
}
