import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';

/// 全量目录缓存：一次分页拉完后供「剧集 / 影片 / 查找」三个页面本地筛选复用。
///
/// 与 Web 端一致，类型筛选与关键词搜索都在客户端完成，
/// 后端 `/public/titles` 只负责按入库时间倒序分页下发。
class CatalogStore extends ChangeNotifier {
  CatalogStore(this._api);

  final ApiClient _api;

  /// 后端单批上限为 200，这里按上限拉取以减少请求数。
  static const int _pageSize = 200;

  final List<CarouselCard> _titles = <CarouselCard>[];
  bool _loading = false;
  bool _loaded = false;
  String? _error;

  /// 已加载的全部作品（影片 + 剧集，不含专题）。
  List<CarouselCard> get titles => List<CarouselCard>.unmodifiable(_titles);
  bool get isLoading => _loading;
  bool get isLoaded => _loaded;
  String? get error => _error;

  /// 加载全量目录；已加载或加载中时为幂等空操作。
  Future<void> loadAll() async {
    if (_loading || _loaded) return;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final collected = <CarouselCard>[];
      var offset = 0;
      while (true) {
        final page = await _api.fetchAllTitles(limit: _pageSize, offset: offset);
        collected.addAll(
          page.items.where((card) => card.targetType != 'collection'),
        );
        offset += page.items.length;
        if (page.items.isEmpty || offset >= page.total) break;
      }
      _titles
        ..clear()
        ..addAll(collected);
      _loaded = true;
    } catch (error) {
      _error = '$error';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// 丢弃缓存并重新加载。
  void reload() {
    _loaded = false;
    _error = null;
    loadAll();
  }

  /// 按作品类型筛选（`movie` / `series`）。
  List<CarouselCard> byType(String type) =>
      _titles.where((card) => card.targetType == type).toList();

  /// 关键词搜索：命中片名、别名、副标题与题材。
  List<CarouselCard> search(String keyword) {
    final query = keyword.trim().toLowerCase();
    if (query.isEmpty) return const <CarouselCard>[];
    return _titles.where((card) => _matches(card, query)).toList();
  }

  bool _matches(CarouselCard card, String query) {
    final haystack = <String>[
      card.title,
      card.chineseTitle ?? '',
      card.englishTitle ?? '',
      card.subtitle ?? '',
      ...card.genres,
    ];
    return haystack.any((value) => value.toLowerCase().contains(query));
  }
}
