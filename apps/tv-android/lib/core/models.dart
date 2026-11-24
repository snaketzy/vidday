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

/// 单条演职员署名（对照 `PublicCreditEntry`）。
class CreditEntry {
  const CreditEntry({
    this.personId,
    required this.name,
    this.englishName,
    this.gender = 'unknown',
    this.avatarUrl,
    this.department = '',
    this.job = '',
    this.character,
  });

  /// 影人 ID；影人已删除时为 null（仅保留冗余姓名）。
  final int? personId;
  final String name;
  final String? englishName;

  /// 'male' | 'female' | 'unknown'。
  final String gender;
  final String? avatarUrl;

  /// 所属部门：演员为 Acting。
  final String department;

  /// 职务：导演 / 编剧 / 制片等。
  final String job;

  /// 饰演角色；非演员为 null。
  final String? character;

  /// 展示名：中文优先，回退英文名，最后回退空串。
  String get displayName {
    for (final candidate in <String?>[name, englishName]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return name;
  }

  /// 人物卡副标题：演员优先展示角色，否则展示职务；都没有时为 null。
  String? get roleLabel {
    for (final candidate in <String?>[character, job]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return null;
  }

  factory CreditEntry.fromJson(Map<String, dynamic> json) {
    return CreditEntry(
      personId: (json['personId'] as num?)?.toInt(),
      name: json['name'] as String? ?? '',
      englishName: json['englishName'] as String?,
      gender: json['gender'] as String? ?? 'unknown',
      avatarUrl: json['avatarUrl'] as String?,
      department: json['department'] as String? ?? '',
      job: json['job'] as String? ?? '',
      character: json['character'] as String?,
    );
  }
}

/// 单部作品的完整演职员表（对照 `PublicTitleCredits`）。
///
/// 演员与职员分开，便于前台分组展示；缺失字段一律给安全默认值。
class TitleCredits {
  const TitleCredits({
    required this.id,
    required this.contentType,
    this.cast = const <CreditEntry>[],
    this.crew = const <CreditEntry>[],
  });

  final int id;
  final String contentType;

  /// 演员（department = Acting），按署名顺序。
  final List<CreditEntry> cast;

  /// 职员（导演 / 编剧 / 制片等），按署名顺序。
  final List<CreditEntry> crew;

  bool get isEmpty => cast.isEmpty && crew.isEmpty;

  factory TitleCredits.fromJson(Map<String, dynamic> json) {
    return TitleCredits(
      id: (json['id'] as num?)?.toInt() ?? 0,
      contentType: json['contentType'] as String? ?? 'movie',
      cast: (json['cast'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CreditEntry.fromJson)
          .toList(),
      crew: (json['crew'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CreditEntry.fromJson)
          .toList(),
    );
  }
}

/// 观看进度条目（对照 `PublicWatchProgress`）。
///
/// 进度归属以作品 ID（后端 `targetId`）为准，`episodeId` 为剧集单集 ID、
/// 电影为 null；单位统一为秒与百分比（0–100）。
/// 后端响应是「卡片摘要 + 进度字段」，故一并保留卡片展示所需字段，
/// 供详情页 `Watching` 区渲染真实记录（不额外请求）。
class WatchProgress {
  const WatchProgress({
    required this.titleId,
    this.episodeId,
    required this.position,
    required this.duration,
    required this.percent,
    this.updatedAt,
    this.title = '',
    this.chineseTitle,
    this.englishTitle,
    this.posterUrl,
    this.backdropUrl,
  });

  /// 作品 ID；栏目卡片 id 不总是作品 ID，故取 `targetId`。
  final int titleId;
  final int? episodeId;

  /// 已观看位置（秒）。
  final int position;

  /// 总时长（秒）。
  final int duration;

  /// 已观看百分比（0–100）。
  final double percent;
  final DateTime? updatedAt;

  /// 卡片摘要（`Watching` 区用）；缺失时给安全默认值。
  final String title;
  final String? chineseTitle;
  final String? englishTitle;
  final String? posterUrl;
  final String? backdropUrl;

  /// 是否可续播：位置与时长有效，且未接近片尾（达到 98% 视为已看完）。
  bool get isResumable => position > 0 && duration > 0 && percent < 98;

  /// 中文优先，其次英文，最后回退原始标题。
  String get displayTitle {
    for (final candidate in <String?>[chineseTitle, englishTitle, title]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return title;
  }

  factory WatchProgress.fromJson(Map<String, dynamic> json) {
    final percent = (json['percent'] as num?)?.toDouble() ?? 0;
    return WatchProgress(
      titleId: (json['targetId'] as num?)?.toInt() ??
          (json['id'] as num?)?.toInt() ??
          0,
      episodeId: (json['episodeId'] as num?)?.toInt(),
      position: (json['position'] as num?)?.toInt() ?? 0,
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      percent: percent.isFinite ? percent.clamp(0, 100).toDouble() : 0,
      updatedAt: json['updatedAt'] is String
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      title: json['title'] as String? ?? '',
      chineseTitle: json['chineseTitle'] as String?,
      englishTitle: json['englishTitle'] as String?,
      posterUrl: json['posterUrl'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
    );
  }

  /// 由播放器当前位置即时构造记录（暂停 / 退播 / 退后台上报，及回传详情页）。
  factory WatchProgress.fromPlayback({
    required int titleId,
    int? episodeId,
    required int position,
    required int duration,
    DateTime? updatedAt,
  }) {
    final safeDuration = duration > 0 ? duration : 0;
    final safePosition = position.clamp(0, safeDuration).toInt();
    return WatchProgress(
      titleId: titleId,
      episodeId: episodeId,
      position: safePosition,
      duration: safeDuration,
      percent: progressPercent(safePosition, safeDuration),
      updatedAt: updatedAt ?? DateTime.now().toUtc(),
    );
  }
}

/// 计算观看百分比（0–100）；时长无效时返回 0。
double progressPercent(int position, int duration) {
  if (duration <= 0 || position <= 0) return 0;
  return (position / duration * 100).clamp(0, 100).toDouble();
}

/// 影人参演 / 参与制作的一部作品（对照 `PublicPersonCredit`）。
class PersonCredit {
  const PersonCredit({
    required this.titleId,
    required this.contentType,
    required this.title,
    this.chineseTitle,
    this.englishTitle,
    this.releaseYear,
    this.posterUrl,
    this.playUrl,
    this.rating,
    this.job = '',
    this.department = '',
    this.character,
  });

  final int titleId;

  /// movie | series。
  final String contentType;
  final String title;
  final String? chineseTitle;
  final String? englishTitle;
  final int? releaseYear;
  final String? posterUrl;
  final String? playUrl;
  final double? rating;

  /// 职务：导演 / 编剧 / 制片等；演员为空串。
  final String job;

  /// 所属部门：演员为 Acting。
  final String department;

  /// 饰演角色；非演员为 null。
  final String? character;

  /// 主标题（英文在上）：对齐 Web 影人页作品卡，英文优先，回退原始标题。
  String get primaryTitle {
    for (final candidate in <String?>[englishTitle, title]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return title;
  }

  /// 副标题（中文在下）：与主标题重复或缺失时返回 null。
  String? get secondaryTitle {
    final chinese = chineseTitle?.trim();
    if (chinese == null || chinese.isEmpty || chinese == primaryTitle) {
      return null;
    }
    return chinese;
  }

  /// 角色或职务：演员优先展示饰演角色，否则展示职务；都没有时为 null。
  String? get roleLabel {
    for (final candidate in <String?>[character, job]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return null;
  }

  factory PersonCredit.fromJson(Map<String, dynamic> json) {
    return PersonCredit(
      titleId: (json['titleId'] as num?)?.toInt() ?? 0,
      contentType: json['contentType'] as String? ?? 'movie',
      title: json['title'] as String? ?? '',
      chineseTitle: json['chineseTitle'] as String?,
      englishTitle: json['englishTitle'] as String?,
      releaseYear: (json['releaseYear'] as num?)?.toInt(),
      posterUrl: json['posterUrl'] as String?,
      playUrl: json['playUrl'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      job: json['job'] as String? ?? '',
      department: json['department'] as String? ?? '',
      character: json['character'] as String?,
    );
  }
}

/// 影人详情：基础资料 + 参演 / 参与制作的作品（对照 `PublicPersonDetail`）。
class PersonDetail {
  const PersonDetail({
    required this.id,
    required this.name,
    this.englishName,
    this.gender = 'unknown',
    this.avatarUrl,
    this.biography,
    this.credits = const <PersonCredit>[],
  });

  final int id;
  final String name;
  final String? englishName;

  /// 'male' | 'female' | 'unknown'。
  final String gender;
  final String? avatarUrl;

  /// 简介：中文优先，缺失回退英文。
  final String? biography;
  final List<PersonCredit> credits;

  /// 头部大字号姓名：对齐 Web，英文优先，缺失回退中文名。
  String get headlineName {
    final english = englishName?.trim();
    if (english != null && english.isNotEmpty) return english;
    return name;
  }

  /// 头部副标题（中文名）：与主名重复或缺失时不重复渲染。
  String? get secondaryName {
    final chinese = name.trim();
    if (chinese.isEmpty || chinese == headlineName) return null;
    return chinese;
  }

  factory PersonDetail.fromJson(Map<String, dynamic> json) {
    return PersonDetail(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      englishName: json['englishName'] as String?,
      gender: json['gender'] as String? ?? 'unknown',
      avatarUrl: json['avatarUrl'] as String?,
      biography: json['biography'] as String?,
      credits: (json['credits'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(PersonCredit.fromJson)
          .toList(),
    );
  }
}

/// 合作影人：与该影人出现在同一部作品里的另一位影人（对照 `PublicCollaborator`）。
class PersonCollaborator {
  const PersonCollaborator({
    required this.personId,
    required this.name,
    this.englishName,
    this.gender = 'unknown',
    this.avatarUrl,
    this.sharedCount = 0,
  });

  final int personId;
  final String name;
  final String? englishName;

  /// 'male' | 'female' | 'unknown'。
  final String gender;
  final String? avatarUrl;

  /// 共同参演 / 参与制作的作品数。
  final int sharedCount;

  /// 展示名（英文在上）：英文优先，回退中文名。
  String get headlineName {
    final english = englishName?.trim();
    if (english != null && english.isNotEmpty) return english;
    return name;
  }

  /// 副标题（中文在下）：与主名重复或缺失时不重复渲染。
  String? get secondaryName {
    final chinese = name.trim();
    if (chinese.isEmpty || chinese == headlineName) return null;
    return chinese;
  }

  factory PersonCollaborator.fromJson(Map<String, dynamic> json) {
    return PersonCollaborator(
      personId: (json['personId'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      englishName: json['englishName'] as String?,
      gender: json['gender'] as String? ?? 'unknown',
      avatarUrl: json['avatarUrl'] as String?,
      sharedCount: (json['sharedCount'] as num?)?.toInt() ?? 0,
    );
  }
}
