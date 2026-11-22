import 'package:flutter/material.dart';

import '../core/catalog.dart';
import '../core/models.dart';
import 'widgets.dart';

/// 「查找」：在全量目录内按关键词搜索片名 / 别名 / 题材。
class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.catalog, required this.onOpen});

  final CatalogStore catalog;
  final ValueChanged<CarouselCard> onOpen;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final TextEditingController _controller = TextEditingController();
  String _keyword = '';

  @override
  void initState() {
    super.initState();
    widget.catalog.loadAll();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.catalog,
      builder: (context, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: TextField(
                controller: _controller,
                onChanged: (value) => setState(() => _keyword = value),
                onSubmitted: (value) => setState(() => _keyword = value),
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: '搜索片名、题材',
                  hintStyle: const TextStyle(color: Colors.white38),
                  prefixIcon: const Icon(Icons.search, color: Colors.white54),
                  filled: true,
                  fillColor: const Color(0xFF181818),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(child: _buildResults()),
          ],
        );
      },
    );
  }

  Widget _buildResults() {
    final catalog = widget.catalog;
    if (catalog.isLoading && !catalog.isLoaded) {
      return const Center(child: CircularProgressIndicator());
    }
    if (catalog.error != null) {
      return ErrorView(message: catalog.error!, onRetry: catalog.reload);
    }

    final query = _keyword.trim();
    if (query.isEmpty) {
      return const Center(
        child: Text(
          '输入关键词开始搜索',
          style: TextStyle(color: Colors.white54),
        ),
      );
    }

    final results = catalog.search(query);
    if (results.isEmpty) {
      return Center(
        child: Text(
          '没有找到与「$query」匹配的作品',
          style: const TextStyle(color: Colors.white54),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SectionHeader(title: '搜索结果', count: results.length),
        Expanded(
          child: TitleGrid(cards: results, onSelect: widget.onOpen),
        ),
      ],
    );
  }
}
