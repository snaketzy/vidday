import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/catalog.dart';
import '../core/models.dart';
import 'browse_page.dart';
import 'detail_page.dart';
import 'home_page.dart';
import 'latest_page.dart';
import 'search_page.dart';
import 'widgets.dart';

/// 应用外壳：顶部导航（首页 / 剧集 / 影片 / 最近更新 / 查找）+ 内容区。
///
/// 页面按需创建并用 [IndexedStack] 保活，切回时不重新拉取数据。
class ShellPage extends StatefulWidget {
  const ShellPage({super.key, required this.api});

  final ApiClient api;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  static const List<String> _labels = <String>[
    '首页',
    '剧集',
    '影片',
    '最近更新',
    '查找',
  ];

  late final CatalogStore _catalog = CatalogStore(widget.api);

  /// 已访问过的页签，未访问的不参与构建（避免启动即拉取全量目录）。
  final Set<int> _visited = <int>{0};
  int _index = 0;

  @override
  void dispose() {
    _catalog.dispose();
    super.dispose();
  }

  void _select(int index) {
    if (index == _index) return;
    setState(() {
      _index = index;
      _visited.add(index);
    });
  }

  Future<void> _openCard(CarouselCard card) async {
    if (card.targetType == 'collection') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('专题页尚未接入')),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DetailPage(api: widget.api, titleId: card.targetId),
      ),
    );
  }

  Widget _pageAt(int index) {
    switch (index) {
      case 1:
        return BrowsePage(
          key: const ValueKey<String>('browse-series'),
          catalog: _catalog,
          label: '剧集',
          type: 'series',
          onOpen: _openCard,
        );
      case 2:
        return BrowsePage(
          key: const ValueKey<String>('browse-movie'),
          catalog: _catalog,
          label: '影片',
          type: 'movie',
          onOpen: _openCard,
        );
      case 3:
        return LatestPage(
          key: const ValueKey<String>('latest'),
          api: widget.api,
          onOpen: _openCard,
        );
      case 4:
        return SearchPage(
          key: const ValueKey<String>('search'),
          catalog: _catalog,
          onOpen: _openCard,
        );
      default:
        return HomePage(
          key: const ValueKey<String>('home'),
          api: widget.api,
          onOpen: _openCard,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            _buildNavBar(),
            Expanded(
              child: IndexedStack(
                index: _index,
                children: <Widget>[
                  for (int i = 0; i < _labels.length; i++)
                    if (_visited.contains(i))
                      _pageAt(i)
                    else
                      const SizedBox.shrink(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 14, 24, 10),
      child: Row(
        children: <Widget>[
          const Text(
            'VIDDAY',
            style: TextStyle(
              color: kAccent,
              fontSize: 22,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(width: 28),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: <Widget>[
                  for (int i = 0; i < _labels.length; i++)
                    _NavButton(
                      label: _labels[i],
                      active: i == _index,
                      onTap: () => _select(i),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 顶部导航项：可被遥控器聚焦，选中项高亮加粗。
class _NavButton extends StatefulWidget {
  const _NavButton({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  State<_NavButton> createState() => _NavButtonState();
}

class _NavButtonState extends State<_NavButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Focus(
        onFocusChange: (focused) => setState(() => _focused = focused),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: _focused ? Colors.white24 : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _focused ? kAccent : Colors.transparent,
                width: 2,
              ),
            ),
            child: Text(
              widget.label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: widget.active ? FontWeight.w700 : FontWeight.w500,
                color: widget.active ? Colors.white : Colors.white70,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
