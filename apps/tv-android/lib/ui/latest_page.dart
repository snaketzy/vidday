import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'widgets.dart';

/// 「最近更新」：后端近 N 天「已上架」内容（影片 + 剧集），按入库时间倒序。
class LatestPage extends StatefulWidget {
  const LatestPage({super.key, required this.api, required this.onOpen});

  final ApiClient api;
  final ValueChanged<CarouselCard> onOpen;

  @override
  State<LatestPage> createState() => _LatestPageState();
}

class _LatestPageState extends State<LatestPage> {
  /// 与 Web 端「最新上架」导航项同窗口。
  static const int _days = 7;

  late Future<List<CarouselCard>> _future = _load();

  Future<List<CarouselCard>> _load() =>
      widget.api.fetchLatest(days: _days, limit: null);

  void _reload() {
    setState(() {
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<CarouselCard>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ErrorView(message: '${snapshot.error}', onRetry: _reload);
        }

        final cards = snapshot.data ?? const <CarouselCard>[];
        if (cards.isEmpty) {
          return ErrorView(message: '近 $_days 天暂无更新', onRetry: _reload);
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SectionHeader(title: '近 $_days 天更新', count: cards.length),
            Expanded(
              child: TitleGrid(cards: cards, onSelect: widget.onOpen),
            ),
          ],
        );
      },
    );
  }
}
