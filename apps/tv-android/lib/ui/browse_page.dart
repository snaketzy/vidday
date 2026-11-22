import 'package:flutter/material.dart';

import '../core/catalog.dart';
import '../core/models.dart';
import 'widgets.dart';

/// 浏览页：从全量目录按类型筛选展示（「剧集」/「影片」）。
class BrowsePage extends StatefulWidget {
  const BrowsePage({
    super.key,
    required this.catalog,
    required this.label,
    required this.onOpen,
    this.type,
  });

  final CatalogStore catalog;

  /// 页面标题，如「剧集」。
  final String label;

  /// 作品类型过滤（`movie` / `series`）；为 null 表示全部。
  final String? type;
  final ValueChanged<CarouselCard> onOpen;

  @override
  State<BrowsePage> createState() => _BrowsePageState();
}

class _BrowsePageState extends State<BrowsePage> {
  @override
  void initState() {
    super.initState();
    widget.catalog.loadAll();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.catalog,
      builder: (context, _) {
        final catalog = widget.catalog;

        if (catalog.isLoading && !catalog.isLoaded) {
          return const Center(child: CircularProgressIndicator());
        }
        if (catalog.error != null) {
          return ErrorView(message: catalog.error!, onRetry: catalog.reload);
        }

        final cards = widget.type == null
            ? catalog.titles
            : catalog.byType(widget.type!);

        if (cards.isEmpty) {
          return ErrorView(
            message: '暂无${widget.label}内容',
            onRetry: catalog.reload,
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SectionHeader(title: widget.label, count: cards.length),
            Expanded(
              child: TitleGrid(cards: cards, onSelect: widget.onOpen),
            ),
          ],
        );
      },
    );
  }
}
