import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'widgets.dart';

/// 首页：按后端下发的轨道（carousels）逐条横向展示内容。
class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.api,
    required this.onOpen,
  });

  final ApiClient api;

  /// 打开作品详情（由外壳统一处理专题等分支）。
  final ValueChanged<CarouselCard> onOpen;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late Future<List<Carousel>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  /// 轨道全部为空时回退到「最新上架」，避免线上轮播未配置时首页一片空白。
  Future<List<Carousel>> _load() async {
    final carousels = await widget.api.fetchHomeCarousels();
    if (carousels.any((carousel) => carousel.items.isNotEmpty)) return carousels;

    final latest = await widget.api.fetchLatest();
    return <Carousel>[
      Carousel(id: 0, title: '最新上架', variant: 'rail', items: latest),
    ];
  }

  void _reload() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Carousel>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ErrorView(
            message: '${snapshot.error}',
            onRetry: _reload,
          );
        }

        final visible = (snapshot.data ?? const <Carousel>[])
            .where((carousel) => carousel.items.isNotEmpty)
            .toList();
        if (visible.isEmpty) {
          return ErrorView(message: '暂无可用内容', onRetry: _reload);
        }

        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: CustomScrollView(
            slivers: <Widget>[
              for (final carousel in visible)
                SliverToBoxAdapter(
                  child: _Rail(carousel: carousel, onSelect: widget.onOpen),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
            ],
          ),
        );
      },
    );
  }
}

/// 单条横向轨道。
class _Rail extends StatelessWidget {
  const _Rail({required this.carousel, required this.onSelect});

  final Carousel carousel;
  final ValueChanged<CarouselCard> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
          child: Text(
            carousel.title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
        SizedBox(
          // 海报高约 210 + 上下 margin，留出聚焦放大后的空间
          height: 250,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: carousel.items.length,
            itemBuilder: (context, index) {
              final card = carousel.items[index];
              return FocusablePosterCard(
                card: card,
                onSelect: () => onSelect(card),
              );
            },
          ),
        ),
      ],
    );
  }
}
