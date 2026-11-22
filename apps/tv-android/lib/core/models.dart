/// 后端接口契约的本地镜像（对照 server/src/contract.ts）。
///
/// 只保留前台需要的字段，缺失字段一律给安全默认值，
/// 避免后端加字段时直接抛解析异常。
library;

/// 影片 / 剧集 / 专题的轻量卡片。
class CarouselCard {
  const CarouselCard({
    required this.id,
    required this.targetType,
    required this.targetId,
    required this.title,
    this.chineseTitle,
    this.englishTitle,
    this.subtitle,
    this.backdropUrl,
    this.posterUrl,
    this.playUrl,
    this.releaseYear,
    this.runtime,
    this.maturity,
    this.rating,
    this.genres = const <String>[],
  });

  final int id;

  /// movie | series | collection
  final String targetType;
  final int targetId;
  final String title;
  final String? chineseTitle;
  final String? englishTitle;
  final String? subtitle;
  final String? backdropUrl;
  final String? posterUrl;
  final String? playUrl;
  final int? releaseYear;
  final int? runtime;
  final String? maturity;
  final double? rating;
  final List<String> genres;

  /// 中文优先，其次英文，最后回退原始标题。
  String get displayTitle {
    for (final candidate in <String?>[chineseTitle, englishTitle, title]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return title;
  }

  /// 卡片副标题：年份与类型，供详情页与轨道卡片复用。
  String get metaLine {
    final parts = <String>[
      if (releaseYear != null) '$releaseYear',
      if (targetType == 'series') '剧集',
    ];
    return parts.join(' · ');
  }

  factory CarouselCard.fromJson(Map<String, dynamic> json) {
    return CarouselCard(
      id: (json['id'] as num?)?.toInt() ?? 0,
      targetType: json['targetType'] as String? ?? 'movie',
      targetId: (json['targetId'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      chineseTitle: json['chineseTitle'] as String?,
      englishTitle: json['englishTitle'] as String?,
      subtitle: json['subtitle'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      playUrl: json['playUrl'] as String?,
      releaseYear: (json['releaseYear'] as num?)?.toInt(),
      runtime: (json['runtime'] as num?)?.toInt(),
      maturity: json['maturity'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      genres: (json['genres'] as List<dynamic>? ?? const <dynamic>[])
          .map((item) => '$item')
          .toList(),
    );
  }
}

/// 全量目录的分页结果（`GET /public/titles`）。
class AllTitlesPage {
  const AllTitlesPage({required this.total, required this.items});

  /// 后端全库总数，用于判断是否还有下一批。
  final int total;
  final List<CarouselCard> items;
}

/// 首页 / 专题页的一条内容轨道。
class Carousel {
  const Carousel({
    required this.id,
    required this.title,
    required this.variant,
    required this.items,
  });

  final int id;
  final String title;

  /// hero | rail
  final String variant;
  final List<CarouselCard> items;

  factory Carousel.fromJson(Map<String, dynamic> json) {
    return Carousel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      variant: json['variant'] as String? ?? 'rail',
      items: (json['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CarouselCard.fromJson)
          .toList(),
    );
  }
}

/// 影片 / 剧集详情。
class TitleDetail {
  const TitleDetail({
    required this.id,
    required this.contentType,
    required this.title,
    this.chineseTitle,
    this.englishTitle,
    this.year,
    this.runtime,
    this.rating,
    this.maturity,
    this.genres = const <String>[],
    this.logline,
    this.synopsis,
    this.director,
    this.cast = const <String>[],
    this.backdropUrl,
    this.posterUrl,
    this.playUrl,
  });

  final int id;
  final String contentType;
  final String title;
  final String? chineseTitle;
  final String? englishTitle;
  final int? year;
  final int? runtime;
  final double? rating;
  final String? maturity;
  final List<String> genres;
  final String? logline;
  final String? synopsis;
  final String? director;
  final List<String> cast;
  final String? backdropUrl;
  final String? posterUrl;

  /// 播放地址（HLS）。为 null 表示该片暂无可用片源。
  final String? playUrl;

  String get displayTitle {
    for (final candidate in <String?>[chineseTitle, englishTitle, title]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return title;
  }

  /// 「2024 · 128 分钟 · 8.1」这类元信息行。
  String get metaLine {
    final parts = <String>[
      if (year != null) '$year',
      if (runtime != null && runtime! > 0) '$runtime 分钟',
      if (rating != null) rating!.toStringAsFixed(1),
      if (maturity != null && maturity!.isNotEmpty) maturity!,
    ];
    return parts.join(' · ');
  }

  factory TitleDetail.fromJson(Map<String, dynamic> json) {
    return TitleDetail(
      id: (json['id'] as num?)?.toInt() ?? 0,
      contentType: json['contentType'] as String? ?? 'movie',
      title: json['title'] as String? ?? '',
      chineseTitle: json['chineseTitle'] as String?,
      englishTitle: json['englishTitle'] as String?,
      year: (json['year'] as num?)?.toInt(),
      runtime: (json['runtime'] as num?)?.toInt(),
      rating: (json['rating'] as num?)?.toDouble(),
      maturity: json['maturity'] as String?,
      genres: (json['genres'] as List<dynamic>? ?? const <dynamic>[])
          .map((item) => '$item')
          .toList(),
      logline: json['logline'] as String?,
      synopsis: json['synopsis'] as String?,
      director: json['director'] as String?,
      cast: (json['cast'] as List<dynamic>? ?? const <dynamic>[])
          .map((item) => '$item')
          .toList(),
      backdropUrl: json['backdropUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      playUrl: json['playUrl'] as String?,
    );
  }
}
