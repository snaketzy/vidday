import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'player_page.dart';
import 'widgets.dart';

/// 详情页：展示真实元数据，并在有片源时进入播放。
///
/// 电影按 `DETAIL-01` 至 `DETAIL-07` 对齐 Infuse（顶栏、主视觉、主播放按钮、
/// 次级动作、元信息、简介、续播进度条、演职员与 `Watching` 区）。
/// 剧集详情暂不适用（等待 `RFC-04`），保持原有简洁布局。
class DetailPage extends StatefulWidget {
  const DetailPage({super.key, required this.api, required this.titleId});

  final ApiClient api;
  final int titleId;

  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  late Future<TitleDetail> _future;

  /// 本设备对该影片的观看进度；null 表示无记录或读取失败。
  WatchProgress? _progress;

  /// 本设备全部观看进度，供 `Watching` 区展示真实记录。
  List<WatchProgress> _allProgress = const <WatchProgress>[];

  /// 演职员（演员 + 职员）；null 表示未获取或获取失败。
  TitleCredits? _credits;

  /// 当前影片是否已在本设备片单中。
  bool _inMyList = false;

  /// 片单写入中，避免连点重复请求。
  bool _listBusy = false;

  /// 防止连点或重复进入播放页。
  bool _navigating = false;

  /// 保留滚动位置，退播回详情后回到原处。
  final ScrollController _scrollController = ScrollController();

  /// 窄竖屏分支专用控制器。横屏与竖屏布局是结构不同的互斥子树，旋转时旧子树
  /// 要到本帧 `finalizeTree()` 才卸载，若与竖屏共用一个控制器，竖屏新子树在
  /// layout 阶段首次挂载时会读到两个 `ScrollPosition`，`offset` 因而抛
  /// `Bad state: Too many elements`（release）/ 断言失败（debug）。
  final ScrollController _portraitScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _future = widget.api.fetchTitle(widget.titleId);
    // 详情就绪后仅电影拉取进度 / 演职员 / 片单；失败静默，不影响详情页展示。
    _future
        .then((detail) {
          if (detail.contentType != 'movie') return;
          unawaited(_loadProgress());
          unawaited(_loadCredits());
          unawaited(_loadMyList());
        })
        .catchError((Object _) {
          // 详情请求失败由 FutureBuilder 呈现，这里只需吞掉派生 future 的错误。
        });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _portraitScrollController.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() {
      _future = widget.api.fetchTitle(widget.titleId);
    });
  }

  /// 读取本设备进度并刷新续播按钮；失败静默（按无记录处理）。
  Future<void> _loadProgress() async {
    try {
      final items = await widget.api.fetchWatchProgress();
      if (!mounted) return;
      setState(() {
        _allProgress = items;
        _progress = _findProgress(items);
      });
    } catch (_) {
      // 进度接口失败不阻断详情页加载与起播
    }
  }

  /// 读取演职员；失败静默（按无演职员处理）。
  Future<void> _loadCredits() async {
    try {
      final credits = await widget.api.fetchCredits(widget.titleId);
      if (!mounted) return;
      setState(() => _credits = credits);
    } catch (_) {
      // 演职员接口失败不影响详情页其它区域
    }
  }

  /// 读取本设备片单，判断当前影片是否已加入；失败静默（按未加入处理）。
  Future<void> _loadMyList() async {
    try {
      final items = await widget.api.fetchMyList();
      if (!mounted) return;
      final inList = items.any((card) => card.targetId == widget.titleId);
      setState(() => _inMyList = inList);
    } catch (_) {
      // 片单接口失败时保持默认未选中态，不影响其它操作
    }
  }

  /// 加入 / 移出我的片单；失败给出提示且不改变选中态。
  Future<void> _toggleMyList(int titleId) async {
    if (_listBusy) return;
    final next = !_inMyList;
    setState(() => _listBusy = true);
    try {
      if (next) {
        await widget.api.addToMyList(titleId);
      } else {
        await widget.api.removeFromMyList(titleId);
      }
      if (!mounted) return;
      setState(() {
        _inMyList = next;
        _listBusy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _listBusy = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('片单操作失败，请稍后重试')));
    }
  }

  WatchProgress? _findProgress(List<WatchProgress> items) {
    for (final item in items) {
      if (item.titleId == widget.titleId) return item;
    }
    return null;
  }

  /// 当前影片可续播的进度；剧集（等待 RFC-04）或不满足有效条件时返回 null。
  WatchProgress? _resumeFor(TitleDetail detail) {
    if (detail.contentType != 'movie') return null;
    final progress = _progress;
    if (progress == null || progress.titleId != detail.id) return null;
    return progress.isResumable ? progress : null;
  }

  Future<void> _play(TitleDetail detail) async {
    final url = detail.playUrl;
    if (url == null || url.isEmpty || _navigating) return;
    _navigating = true;
    final resume = _resumeFor(detail);
    final result = await Navigator.of(context).push<WatchProgress>(
      MaterialPageRoute<WatchProgress>(
        builder: (_) => PlayerPage(
          api: widget.api,
          title: detail.displayTitle,
          url: url,
          titleId: detail.id,
          contentType: detail.contentType,
          titleName: detail.displayTitle,
          startPosition: resume == null
              ? null
              : Duration(seconds: resume.position),
        ),
      ),
    );
    _navigating = false;
    if (!mounted) return;
    // 退播回传的最终位置即时刷新续播按钮，同时再尽力刷新服务端记录。
    if (result != null) setState(() => _progress = result);
    unawaited(_loadProgress());
  }

  /// 续播按钮上的时间戳，固定 HH:MM:SS。
  String _formatClock(int seconds) {
    final h = (seconds ~/ 3600).toString().padLeft(2, '0');
    final m = ((seconds % 3600) ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  /// 播放按钮文案：无片源 / 继续观看 HH:MM:SS / 从头播放。
  String _playLabel(TitleDetail detail) {
    if (detail.playUrl == null || detail.playUrl!.isEmpty) return '暂无片源';
    final resume = _resumeFor(detail);
    return resume == null ? '播放' : '继续观看 ${_formatClock(resume.position)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kSurface,
      body: FutureBuilder<TitleDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return SafeArea(
              child: ErrorView(message: '${snapshot.error}', onRetry: _reload),
            );
          }

          final detail = snapshot.data!;
          if (detail.contentType == 'movie') return _buildMovie(detail);
          return _buildSeries(detail);
        },
      ),
    );
  }

  // ------------------------------------------------------------ 电影详情

  Widget _buildMovie(TitleDetail detail) {
    final hasSource = detail.playUrl != null && detail.playUrl!.isNotEmpty;
    final size = MediaQuery.sizeOf(context);
    // 横屏时主播放按钮收窄到与次级动作图标行对齐；竖屏与宽屏竖排保持全宽。
    final landscape = size.width > size.height;
    // 没有 TV 专用设备信号；仅窄竖屏开启，横屏（含窄窗口）维持原布局。
    if (size.width < 600 && size.height > size.width) {
      return _buildPortraitMovie(detail, hasSource);
    }
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        SafeArea(
          bottom: false,
          child: SingleChildScrollView(
            key: const PageStorageKey<String>('movie-detail-scroll'),
            controller: _scrollController,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _MovieHero(detail: detail),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
                  child: _MovieBody(
                    detail: detail,
                    resume: _resumeFor(detail),
                    hasSource: hasSource,
                    alignPlayToActions: landscape,
                    credits: _credits,
                    watching: _watchingItems(detail),
                    inMyList: _inMyList,
                    listBusy: _listBusy,
                    onPlay: () => _play(detail),
                    onToggleList: () => _toggleMyList(detail.id),
                    onOpenSynopsis: (text) =>
                        _openSynopsis(detail.displayTitle, text),
                    formatClock: _formatClock,
                    playLabel: _playLabel(detail),
                  ),
                ),
              ],
            ),
          ),
        ),
        // 顶栏浮于主视觉之上：返回 + 片名，右侧收藏与更多（暂无后端能力，置灰）。
        // 必须用 Positioned 贴顶：Stack 的 fit=expand 会把非定位子节点拉满整屏高度，
        // 否则 Row 的垂直居中会把返回按钮与片名压到屏幕竖直中部。
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SafeArea(child: _MovieTopBar(title: detail.displayTitle)),
        ),
      ],
    );
  }

  Widget _buildPortraitMovie(TitleDetail detail, bool hasSource) {
    final synopsis = _MovieBody._synopsisText(detail);
    final resume = _resumeFor(detail);
    final watching = _watchingItems(detail);
    final credits = _credits;
    return Material(
      color: _portraitSurface,
      child: SafeArea(
        top: false,
        bottom: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            // 454 宽参考图；小窗口仍保留合理的间距和 48dp 触摸目标。
            final unit = (constraints.maxWidth / 454).clamp(0.65, 1.2);
            final inset = 29 * unit;
            return Stack(
              fit: StackFit.expand,
              children: <Widget>[
                SingleChildScrollView(
                  key: const PageStorageKey<String>('movie-detail-scroll'),
                  controller: _portraitScrollController,
                  padding: EdgeInsets.only(
                    bottom: 32 + MediaQuery.paddingOf(context).bottom,
                  ),
                  child: Column(
                    children: <Widget>[
                      _PortraitMovieHero(
                        detail: detail,
                        unit: unit,
                        topInset: MediaQuery.paddingOf(context).top,
                      ),
                      Padding(
                        padding: EdgeInsets.fromLTRB(
                          inset,
                          10 * unit,
                          inset,
                          0,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: <Widget>[
                            _PortraitMovieMetadata(detail: detail, unit: unit),
                            SizedBox(height: 17 * unit),
                            // 约占参考宽度 334/454，居中且可随文字增高。
                            Padding(
                              key: const ValueKey<String>('movie-play-slot'),
                              padding: EdgeInsets.symmetric(
                                horizontal: 31 * unit,
                              ),
                              child: FilledButton(
                                key: const ValueKey<String>(
                                  'movie-play-button',
                                ),
                                onPressed: hasSource
                                    ? () => _play(detail)
                                    : null,
                                style: FilledButton.styleFrom(
                                  backgroundColor: _portraitAccent,
                                  foregroundColor: Colors.white,
                                  disabledBackgroundColor: const Color(
                                    0xFFE2E2E2,
                                  ),
                                  disabledForegroundColor: _portraitMuted,
                                  minimumSize: Size(
                                    48,
                                    (50 * unit).clamp(48, 60),
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 8,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  textStyle: Theme.of(context)
                                      .textTheme
                                      .labelLarge
                                      ?.copyWith(
                                        fontSize: (20 * unit).clamp(16, 22),
                                        fontWeight: FontWeight.w700,
                                        shadows: hasSource
                                            ? _portraitPlayShadows
                                            : null,
                                      ),
                                ),
                                child: Text(
                                  _playLabel(detail),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                            if (!hasSource) ...<Widget>[
                              const SizedBox(height: 6),
                              const Text(
                                '该影片暂无可用片源',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: _portraitMuted),
                              ),
                            ],
                            SizedBox(height: 8 * unit),
                            _PortraitMovieActions(
                              inMyList: _inMyList,
                              listBusy: _listBusy,
                              onToggleList: () => _toggleMyList(detail.id),
                            ),
                            if (synopsis.isNotEmpty) ...<Widget>[
                              SizedBox(height: 13 * unit),
                              _PortraitSynopsis(
                                text: synopsis,
                                unit: unit,
                                onOpen: () => _openSynopsis(
                                  detail.displayTitle,
                                  synopsis,
                                ),
                              ),
                            ],
                            if (detail.rating != null &&
                                detail.rating!.isFinite) ...<Widget>[
                              SizedBox(height: 12 * unit),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: <Widget>[
                                  Icon(
                                    Icons.star_rounded,
                                    color: _portraitAccent,
                                    size: 19 * unit,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    detail.rating!.toStringAsFixed(1),
                                    semanticsLabel:
                                        '评分 ${detail.rating!.toStringAsFixed(1)}',
                                    style: _portraitInfoStyle.copyWith(
                                      fontSize: (16 * unit).clamp(14, 18),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            if (resume != null) ...<Widget>[
                              const SizedBox(height: 20),
                              _WatchProgressBar(
                                key: const ValueKey<String>(
                                  'watch-progress-bar',
                                ),
                                position: resume.position,
                                duration: resume.duration,
                                light: true,
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (credits != null && !credits.isEmpty) ...<Widget>[
                        SizedBox(height: 15 * unit),
                        _CastRail(credits: credits, portraitUnit: unit),
                      ],
                      if (watching.isNotEmpty)
                        Padding(
                          padding: EdgeInsets.fromLTRB(inset, 24, inset, 0),
                          child: _WatchingRail(
                            items: watching,
                            formatClock: _formatClock,
                            light: true,
                          ),
                        ),
                    ],
                  ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: AnnotatedRegion<SystemUiOverlayStyle>(
                    value: const SystemUiOverlayStyle(
                      statusBarColor: Colors.transparent,
                      statusBarIconBrightness: Brightness.light,
                      systemStatusBarContrastEnforced: false,
                    ),
                    child: AnimatedBuilder(
                      animation: _portraitScrollController,
                      builder: (context, child) {
                        // `hasClients` 在挂载了多个 position 时同样为 true，
                        // 只有恰好一个 position 时读取 `offset` 才安全。
                        final hasSinglePosition =
                            _portraitScrollController.positions.length == 1;
                        final overLightContent =
                            hasSinglePosition &&
                            _portraitScrollController.offset > 230 * unit;
                        return ColoredBox(
                          color: overLightContent
                              ? const Color(0xE61A1A22)
                              : Colors.transparent,
                          child: child!,
                        );
                      },
                      child: const SafeArea(
                        bottom: false,
                        child: _PortraitMovieTopBar(),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// `Watching` 区条目：本设备真实观看记录，排除当前影片，避免重复海报凑数。
  List<WatchProgress> _watchingItems(TitleDetail detail) {
    return _allProgress
        .where((item) => item.titleId != detail.id && item.position > 0)
        .toList();
  }

  /// 打开全文弹层：顶部居中片名，左上角关闭。
  Future<void> _openSynopsis(String title, String text) {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => _SynopsisDialog(title: title, text: text),
    );
  }

  // ------------------------------------------------------------ 剧集详情（保持现状）

  Widget _buildSeries(TitleDetail detail) {
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        RemoteImage(url: detail.backdropUrl ?? detail.posterUrl),
        // 由下至上的暗化渐变，保证正文可读
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: <Color>[
                Color(0xCC000000),
                Color(0xE6000000),
                Color(0xFF0B0B0F),
              ],
              stops: <double>[0, 0.55, 1],
            ),
          ),
        ),
        SafeArea(
          child: SingleChildScrollView(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back),
                    tooltip: '返回',
                  ),
                ),
                const SizedBox(height: 120),
                Text(
                  detail.displayTitle,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  detail.metaLine,
                  style: const TextStyle(color: Colors.white70),
                ),
                if (detail.genres.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      for (final genre in detail.genres)
                        Chip(
                          label: Text(genre),
                          backgroundColor: const Color(0x33FFFFFF),
                          labelStyle: const TextStyle(color: Colors.white70),
                          side: BorderSide.none,
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: detail.playUrl == null
                      ? null
                      : () => _play(detail),
                  icon: const Icon(Icons.play_arrow),
                  label: Text(_playLabel(detail)),
                ),
                const SizedBox(height: 24),
                if (detail.synopsis != null || detail.logline != null)
                  Text(
                    detail.synopsis ?? detail.logline!,
                    style: const TextStyle(color: Colors.white70, height: 1.6),
                  ),
                if (detail.director != null) ...<Widget>[
                  const SizedBox(height: 20),
                  _MetaBlock(label: '导演', value: detail.director!),
                ],
                if (detail.cast.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 12),
                  _MetaBlock(label: '主演', value: detail.cast.take(6).join('、')),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

const Color _portraitSurface = Color(0xFFF5F5F5);
const Color _portraitAccent = Color(0xFFF1852C);
const Color _portraitInk = Color(0xFF161616);
const Color _portraitMuted = Color(0xFF595959);
const TextStyle _portraitInfoStyle = TextStyle(color: _portraitInk);
// 保留参考橙色，用深色阴影将白色字形与按钮底色分开。
const List<Shadow> _portraitPlayShadows = <Shadow>[
  Shadow(color: Color(0xBE4B2108), offset: Offset(0, 1), blurRadius: 2),
  Shadow(color: Color(0x984B2108), blurRadius: 2),
];

class _PortraitMovieHero extends StatelessWidget {
  const _PortraitMovieHero({
    required this.detail,
    required this.unit,
    required this.topInset,
  });

  final TitleDetail detail;
  final double unit;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final backdrop = detail.backdropUrl;
    final layers = _TitleLayers.from(detail);
    final secondary = layers.secondary;
    final titleShadows = const <Shadow>[
      Shadow(color: Color(0xBFF5F5F5), blurRadius: 12),
    ];
    return ConstrainedBox(
      key: const ValueKey<String>('portrait-movie-hero'),
      constraints: BoxConstraints(minHeight: 450 * unit + topInset),
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: <Widget>[
          Positioned.fill(
            child: RemoteImage(
              url: backdrop != null && backdrop.isNotEmpty
                  ? backdrop
                  : detail.posterUrl,
            ),
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: <Color>[
                    Color(0x99000000),
                    Color(0x00000000),
                    Color(0x00F5F5F5),
                    _portraitSurface,
                    _portraitSurface,
                  ],
                  stops: <double>[0, 0.17, 0.55, 0.91, 1],
                ),
              ),
            ),
          ),
          // 片名覆盖在渐隐区内，居中；中文在上（大字号）、英文在下（小一号），
          // 长标题可增高，不裁切动态字体。
          SizedBox(
            width: double.infinity,
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                29 * unit,
                340 * unit + topInset,
                29 * unit,
                8 * unit,
              ),
              child: Column(
                key: const ValueKey<String>('movie-title'),
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: <Widget>[
                  Text(
                    layers.primary,
                    textAlign: TextAlign.center,
                    style: _portraitInfoStyle.copyWith(
                      fontSize: (46 * unit).clamp(28, 52),
                      fontWeight: FontWeight.w900,
                      height: 1.04,
                      shadows: titleShadows,
                    ),
                  ),
                  if (secondary != null) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(
                      secondary,
                      textAlign: TextAlign.center,
                      style: _portraitInfoStyle.copyWith(
                        fontSize: (30 * unit).clamp(18, 35),
                        fontWeight: FontWeight.w700,
                        height: 1.04,
                        shadows: titleShadows,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PortraitMovieTopBar extends StatelessWidget {
  const _PortraitMovieTopBar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const DecoratedBox(
              decoration: BoxDecoration(
                color: Color(0x73000000),
                shape: BoxShape.circle,
              ),
              child: SizedBox.square(
                dimension: 32,
                child: Icon(Icons.chevron_left, color: Colors.white, size: 22),
              ),
            ),
            tooltip: '返回',
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          ),
          const _SecondaryActionButton(
            icon: Icons.more_horiz,
            tooltip: '更多操作暂不可用',
            disabledColor: Colors.white70,
          ),
        ],
      ),
    );
  }
}

class _PortraitMovieMetadata extends StatelessWidget {
  const _PortraitMovieMetadata({required this.detail, required this.unit});

  final TitleDetail detail;
  final double unit;

  @override
  Widget build(BuildContext context) {
    final style = _portraitInfoStyle.copyWith(
      fontSize: (17 * unit).clamp(14, 19),
      height: 1.15,
    );
    final maturity = detail.maturity?.trim() ?? '';
    final fields = <Widget>[
      if (detail.runtime != null && detail.runtime! > 0)
        Text('${detail.runtime} 分钟', style: style),
      if (detail.year != null) Text('${detail.year}', style: style),
      if (maturity.isNotEmpty)
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: _portraitMuted),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            child: Text(maturity, style: style),
          ),
        ),
      // 当前接口不提供可信画质，不以片名或 URL 推断。
    ];
    return Column(
      children: <Widget>[
        if (fields.isNotEmpty)
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 14 * unit,
            runSpacing: 4,
            children: fields,
          ),
        if (fields.isNotEmpty && detail.genres.isNotEmpty)
          SizedBox(height: 7 * unit),
        if (detail.genres.isNotEmpty)
          Text(
            detail.genres.join(', '),
            textAlign: TextAlign.center,
            style: style,
          ),
      ],
    );
  }
}

class _PortraitMovieActions extends StatelessWidget {
  const _PortraitMovieActions({
    required this.inMyList,
    required this.listBusy,
    required this.onToggleList,
  });

  final bool inMyList;
  final bool listBusy;
  final VoidCallback onToggleList;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final actions = <Widget>[
          const _SecondaryActionButton(
            icon: Icons.visibility_off_outlined,
            tooltip: '已看标记暂不可用',
            disabledColor: Colors.black38,
          ),
          const _SecondaryActionButton(
            icon: Icons.download_outlined,
            tooltip: '下载暂不可用',
            disabledColor: Colors.black38,
          ),
          _SecondaryActionButton(
            icon: inMyList ? Icons.bookmark : Icons.bookmark_border,
            tooltip: inMyList ? '移出我的片单' : '加入我的片单',
            onPressed: listBusy ? null : onToggleList,
            color: _portraitMuted,
            disabledColor: Colors.black38,
          ),
          const _SecondaryActionButton(
            icon: Icons.movie_creation_outlined,
            tooltip: '影片附加内容暂不可用',
            disabledColor: Colors.black38,
          ),
          const _SecondaryActionButton(
            icon: Icons.star,
            tooltip: '评分暂不可用',
            disabledColor: Colors.black38,
          ),
        ];
        if (constraints.maxWidth < 48 * actions.length) {
          return Wrap(alignment: WrapAlignment.center, children: actions);
        }
        return Row(
          children: <Widget>[
            for (final action in actions)
              Expanded(child: Center(child: action)),
          ],
        );
      },
    );
  }
}

class _PortraitSynopsis extends StatelessWidget {
  const _PortraitSynopsis({
    required this.text,
    required this.unit,
    required this.onOpen,
  });

  final String text;
  final double unit;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final style = DefaultTextStyle.of(context).style.merge(
      _portraitInfoStyle.copyWith(
        fontSize: (15 * unit).clamp(13, 17),
        height: 1.22,
      ),
    );
    final scaler = MediaQuery.textScalerOf(context);
    final locale = Localizations.maybeLocaleOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          maxLines: 3,
          textDirection: Directionality.of(context),
          textScaler: scaler,
          locale: locale,
        );
        bool fits(TextSpan span) {
          painter.text = span;
          painter.layout(maxWidth: constraints.maxWidth);
          return !painter.didExceedMaxLines;
        }

        try {
          if (fits(TextSpan(text: text, style: style))) {
            return Text(text, style: style);
          }
          // 测量的是包含 MORE 的同一段文字，不压缩第一、二行。
          TextSpan withMore(String prefix) => TextSpan(
            text: prefix.isEmpty ? '' : '$prefix…\u00a0',
            style: style,
            children: <TextSpan>[
              TextSpan(
                text: 'MORE',
                style: TextStyle(
                  color: _portraitMuted,
                  fontSize: (12 * unit).clamp(11, 14),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          );

          // 仅在字素边界截断，兼容无空格的 CJK 及组合字符。
          final ends = <int>[0];
          for (final grapheme in text.characters) {
            ends.add(ends.last + grapheme.length);
          }
          var low = 0;
          var high = ends.length - 1;
          while (low < high) {
            final mid = (low + high + 1) ~/ 2;
            if (fits(withMore(text.substring(0, ends[mid]).trimRight()))) {
              low = mid;
            } else {
              high = mid - 1;
            }
          }
          final prefix = text.substring(0, ends[low]).trimRight();
          // 让整段都是触摸目标，MORE 仍在第三行正文末尾。
          return Semantics(
            button: true,
            child: InkWell(
              onTap: onOpen,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Text.rich(
                  withMore(prefix),
                  key: const ValueKey<String>('portrait-expanded-synopsis'),
                  textScaler: scaler,
                  locale: locale,
                  maxLines: 3,
                ),
              ),
            ),
          );
        } finally {
          painter.dispose();
        }
      },
    );
  }
}

/// 电影主视觉：全宽背景图 + 底部渐变衔接深色内容区。
///
/// 背景缺失时 `RemoteImage` 回退到纯色占位，仍保证标题可读。
class _MovieHero extends StatelessWidget {
  const _MovieHero({required this.detail});

  final TitleDetail detail;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 300,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          RemoteImage(url: detail.backdropUrl ?? detail.posterUrl),
          // 顶部略暗保证顶栏可读，底部过渡到内容底色
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[Color(0xB3000000), Color(0x00000000), kSurface],
                stops: <double>[0, 0.45, 1],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 电影顶栏：返回 + 片名；右侧收藏与更多操作暂无后端能力，置灰并提示。
class _MovieTopBar extends StatelessWidget {
  const _MovieTopBar({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
      child: Row(
        children: <Widget>[
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            tooltip: '返回',
          ),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const _SecondaryActionButton(
            icon: Icons.favorite_border,
            tooltip: '该功能暂不可用',
          ),
          const _SecondaryActionButton(
            icon: Icons.more_horiz,
            tooltip: '该功能暂不可用',
          ),
        ],
      ),
    );
  }
}

/// 电影详情正文：宽屏两列、窄屏纵排，其后为进度条、演职员与 `Watching` 区。
class _MovieBody extends StatelessWidget {
  const _MovieBody({
    required this.detail,
    required this.resume,
    required this.hasSource,
    required this.alignPlayToActions,
    required this.credits,
    required this.watching,
    required this.inMyList,
    required this.listBusy,
    required this.onPlay,
    required this.onToggleList,
    required this.onOpenSynopsis,
    required this.formatClock,
    required this.playLabel,
  });

  final TitleDetail detail;
  final WatchProgress? resume;
  final bool hasSource;

  /// 横屏时主播放按钮收窄到与次级动作图标行对齐。
  final bool alignPlayToActions;
  final TitleCredits? credits;
  final List<WatchProgress> watching;
  final bool inMyList;
  final bool listBusy;
  final VoidCallback onPlay;
  final VoidCallback onToggleList;
  final ValueChanged<String> onOpenSynopsis;
  final String Function(int) formatClock;
  final String playLabel;

  @override
  Widget build(BuildContext context) {
    final synopsis = _synopsisText(detail);
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 720;

        final playBlock = _PlayBlock(
          playLabel: playLabel,
          hasSource: hasSource,
          alignPlayToActions: alignPlayToActions,
          inMyList: inMyList,
          listBusy: listBusy,
          onPlay: onPlay,
          onToggleList: onToggleList,
        );
        final infoBlock = _InfoBlock(
          detail: detail,
          synopsis: synopsis,
          onOpenSynopsis: onOpenSynopsis,
        );

        final Widget top = wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    flex: 5,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        _TitleText(_TitleLayers.from(detail)),
                        const SizedBox(height: 20),
                        playBlock,
                      ],
                    ),
                  ),
                  const SizedBox(width: 40),
                  Expanded(flex: 4, child: infoBlock),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _TitleText(_TitleLayers.from(detail)),
                  const SizedBox(height: 18),
                  playBlock,
                  const SizedBox(height: 24),
                  infoBlock,
                ],
              );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            top,
            // DETAIL-06：只读进度条位于主视觉与演职员之间（紧随播放区之后）。
            if (resume != null) ...<Widget>[
              const SizedBox(height: 28),
              _WatchProgressBar(
                key: const ValueKey<String>('watch-progress-bar'),
                position: resume!.position,
                duration: resume!.duration,
              ),
            ],
            if (credits != null && !credits!.isEmpty) ...<Widget>[
              const SizedBox(height: 32),
              _CastRail(credits: credits!),
            ],
            if (watching.isNotEmpty) ...<Widget>[
              const SizedBox(height: 28),
              _WatchingRail(items: watching, formatClock: formatClock),
            ],
          ],
        );
      },
    );
  }

  static String _synopsisText(TitleDetail detail) {
    final synopsis = detail.synopsis?.trim();
    if (synopsis != null && synopsis.isNotEmpty) return synopsis;
    return detail.logline?.trim() ?? '';
  }
}

/// 分层片名：`primary` 用大字号、`secondary`（可空）用小一号字号。
///
/// 电影规则：英中都有 → 中文在上（大字号）、英文在下（小一号）；
/// 只有其一 → 只显示该条大字号；两条都缺 → 回退到 `title` 大字号。
class _TitleLayers {
  const _TitleLayers(this.primary, this.secondary);

  final String primary;
  final String? secondary;

  factory _TitleLayers.from(TitleDetail detail) {
    final english = detail.englishTitle?.trim() ?? '';
    final chinese = detail.chineseTitle?.trim() ?? '';
    final hasEnglish = english.isNotEmpty;
    final hasChinese = chinese.isNotEmpty;
    if (hasEnglish && hasChinese) return _TitleLayers(chinese, english);
    if (hasEnglish) return _TitleLayers(english, null);
    if (hasChinese) return _TitleLayers(chinese, null);
    return _TitleLayers(detail.title, null);
  }
}

/// 片名（大字号标题字，缺标题图时以文字呈现）。
class _TitleText extends StatelessWidget {
  const _TitleText(this.layers);

  final _TitleLayers layers;

  @override
  Widget build(BuildContext context) {
    const large = TextStyle(
      fontSize: 30,
      fontWeight: FontWeight.w800,
      color: Colors.white,
      height: 1.2,
    );
    final secondary = layers.secondary;
    return Column(
      key: const ValueKey<String>('movie-title'),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(layers.primary, style: large),
        if (secondary != null) ...<Widget>[
          const SizedBox(height: 4),
          Text(
            secondary,
            style: large.copyWith(fontSize: 20, fontWeight: FontWeight.w600),
          ),
        ],
      ],
    );
  }
}

/// 次级动作图标的几何：5 个 48dp 图标 + 4 个 4dp 间距 = 256dp。
/// 主播放按钮横屏时收窄到该整体宽度，保证与图标行左右边界一致。
const double _secondaryActionExtent = 48;
const double _secondaryActionSpacing = 4;
const int _secondaryActionCount = 5;
const double _secondaryActionsWidth =
    _secondaryActionCount * _secondaryActionExtent +
        (_secondaryActionCount - 1) * _secondaryActionSpacing;

/// 主播放按钮 + 次级动作行。
class _PlayBlock extends StatelessWidget {
  const _PlayBlock({
    required this.playLabel,
    required this.hasSource,
    required this.alignPlayToActions,
    required this.inMyList,
    required this.listBusy,
    required this.onPlay,
    required this.onToggleList,
  });

  final String playLabel;
  final bool hasSource;

  /// 横屏时把主播放按钮收窄到与次级动作图标行等宽（左右边界对齐）。
  final bool alignPlayToActions;
  final bool inMyList;
  final bool listBusy;
  final VoidCallback onPlay;
  final VoidCallback onToggleList;

  @override
  Widget build(BuildContext context) {
    final Widget playButton = FilledButton.icon(
      key: const ValueKey<String>('movie-play-button'),
      onPressed: hasSource ? onPlay : null,
      style: FilledButton.styleFrom(
        backgroundColor: kAccent,
        foregroundColor: Colors.white,
        disabledBackgroundColor: const Color(0x33FFFFFF),
        disabledForegroundColor: Colors.white54,
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
      icon: const Icon(Icons.play_arrow, size: 26),
      label: Text(playLabel),
    );

    return Column(
      key: const ValueKey<String>('movie-play-block'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // 橙色主播放按钮：默认全宽；横屏收窄到图标行宽度（可用宽度更小时回退）。
        if (alignPlayToActions)
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: _secondaryActionsWidth),
            child: SizedBox(width: _secondaryActionsWidth, child: playButton),
          )
        else
          playButton,
        if (!hasSource) ...<Widget>[
          const SizedBox(height: 8),
          const Text(
            '该影片暂无可用片源',
            style: TextStyle(color: Colors.white54, fontSize: 13),
          ),
        ],
        const SizedBox(height: 12),
        // 次级动作行：仅「我的片单」可操作，其余无后端能力置灰并提示。
        Wrap(
          key: const ValueKey<String>('movie-secondary-actions'),
          spacing: _secondaryActionSpacing,
          children: <Widget>[
            const _SecondaryActionButton(
              icon: Icons.visibility_off_outlined,
              tooltip: '该功能暂不可用',
            ),
            const _SecondaryActionButton(
              icon: Icons.download_outlined,
              tooltip: '该功能暂不可用',
            ),
            _SecondaryActionButton(
              icon: inMyList ? Icons.bookmark : Icons.bookmark_add_outlined,
              tooltip: inMyList ? '移出我的片单' : '加入我的片单',
              onPressed: listBusy ? null : onToggleList,
            ),
            const _SecondaryActionButton(
              icon: Icons.play_circle_outline,
              tooltip: '该功能暂不可用',
            ),
            const _SecondaryActionButton(
              icon: Icons.star_border,
              tooltip: '该功能暂不可用',
            ),
          ],
        ),
      ],
    );
  }
}

/// 元信息（评分 / 年份 / 分级 / 时长）+ 类型 + 简介（内联截断 + `MORE`）。
class _InfoBlock extends StatelessWidget {
  const _InfoBlock({
    required this.detail,
    required this.synopsis,
    required this.onOpenSynopsis,
  });

  final TitleDetail detail;
  final String synopsis;
  final ValueChanged<String> onOpenSynopsis;

  @override
  Widget build(BuildContext context) {
    final meta = <Widget>[
      if (detail.rating != null)
        _MetaChip(
          icon: Icons.star_rounded,
          label: detail.rating!.toStringAsFixed(1),
        ),
      if (detail.year != null) _MetaChip(label: '${detail.year}'),
      if (detail.maturity != null && detail.maturity!.isNotEmpty)
        _MetaChip(label: detail.maturity!),
      if (detail.runtime != null && detail.runtime! > 0)
        _MetaChip(label: '${detail.runtime} 分钟'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (meta.isNotEmpty) ...<Widget>[
          Wrap(spacing: 10, runSpacing: 8, children: meta),
          const SizedBox(height: 16),
        ],
        if (detail.genres.isNotEmpty) ...<Widget>[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final genre in detail.genres)
                Chip(
                  label: Text(genre),
                  backgroundColor: const Color(0x33FFFFFF),
                  labelStyle: const TextStyle(color: Colors.white70),
                  side: BorderSide.none,
                ),
            ],
          ),
          const SizedBox(height: 16),
        ],
        if (synopsis.isNotEmpty)
          _ExpandableSynopsis(
            text: synopsis,
            onOpen: () => onOpenSynopsis(synopsis),
          ),
      ],
    );
  }
}

/// 元信息小徽章：真实字段才渲染，缺失不放空徽章。
class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (icon != null) ...<Widget>[
          Icon(icon, size: 16, color: Colors.white70),
          const SizedBox(width: 4),
        ],
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 14)),
      ],
    );
  }
}

/// 简介：正文内联截断（maxLines + ellipsis），仅在内容超出时于末行末尾显示 `MORE`。
class _ExpandableSynopsis extends StatelessWidget {
  const _ExpandableSynopsis({required this.text, required this.onOpen});

  final String text;
  final VoidCallback onOpen;

  static const int _maxLines = 3;

  /// 末行为 `MORE` 预留的宽度，避免正文与入口重叠。
  static const double _moreSlot = 60;

  static const TextStyle _style = TextStyle(
    color: Colors.white70,
    height: 1.6,
    fontSize: 15,
  );

  static const TextStyle _moreStyle = TextStyle(
    color: kAccent,
    fontWeight: FontWeight.w700,
    letterSpacing: 1,
  );

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // 以完整宽度判定是否超出：未超出直接内联整段；超出时正文按预留宽度截断。
        final painter = TextPainter(
          text: TextSpan(text: text, style: _style),
          maxLines: _maxLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: constraints.maxWidth);

        if (!painter.didExceedMaxLines) {
          return Text(text, style: _style);
        }

        return Stack(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.only(right: _moreSlot),
              child: Text(
                text,
                style: _style,
                maxLines: _maxLines,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: TextButton(
                onPressed: onOpen,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  minimumSize: const Size(48, 40),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('MORE', style: _moreStyle),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// `DETAIL-06` 只读进度条：左起填充已看比例，标注已看时长与总时长。
class _WatchProgressBar extends StatelessWidget {
  const _WatchProgressBar({
    super.key,
    required this.position,
    required this.duration,
    this.light = false,
  });

  final int position;
  final int duration;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final fraction = duration > 0 ? (position / duration).clamp(0.0, 1.0) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            final scale = light
                ? MediaQuery.textScalerOf(context).scale(12) / 12
                : 1.0;
            final labelWidth = (92 * scale).clamp(0.0, width);
            final markerLeft = (width * fraction - labelWidth / 2).clamp(
              0.0,
              (width - labelWidth).clamp(0.0, width),
            );
            return SizedBox(
              height: light ? 20 * scale + 10 : 30,
              child: Stack(
                clipBehavior: Clip.none,
                children: <Widget>[
                  Align(
                    alignment: Alignment.bottomLeft,
                    child: Container(
                      height: 4,
                      width: width,
                      decoration: BoxDecoration(
                        color: light
                            ? const Color(0x33000000)
                            : const Color(0x33FFFFFF),
                        borderRadius: const BorderRadius.all(
                          Radius.circular(2),
                        ),
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.bottomLeft,
                    child: FractionallySizedBox(
                      widthFactor: fraction,
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: light ? _portraitAccent : kAccent,
                          borderRadius: const BorderRadius.all(
                            Radius.circular(2),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: markerLeft,
                    top: 0,
                    width: light ? labelWidth : null,
                    child: Text(
                      '已看 ${_formatWatchLabel(position)}',
                      style: TextStyle(
                        color: light ? _portraitMuted : Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerRight,
          child: Text(
            '总时长 ${_formatWatchLabel(duration)}',
            style: TextStyle(
              color: light ? _portraitMuted : Colors.white54,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );
  }
}

/// 演职员横向列表：人物卡显示姓名与可用的角色或职务，无头像仍可识别。
class _CastRail extends StatelessWidget {
  const _CastRail({required this.credits, this.portraitUnit});

  final TitleCredits credits;
  final double? portraitUnit;

  @override
  Widget build(BuildContext context) {
    final people = <CreditEntry>[...credits.cast, ...credits.crew];
    final unit = portraitUnit;
    final avatarSize = unit == null ? 96.0 : 72 * unit;
    final inset = unit == null ? 0.0 : 29 * unit;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: EdgeInsets.only(left: inset),
          child: _SectionTitle('演职员', light: unit != null),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: unit == null
              ? 150
              : _portraitHeight(context, people, avatarSize),
          child: ListView.separated(
            key: unit == null
                ? null
                : const ValueKey<String>('portrait-cast-rail'),
            scrollDirection: Axis.horizontal,
            padding: unit == null ? null : EdgeInsets.only(left: inset),
            itemCount: people.length,
            separatorBuilder: (_, _) => SizedBox(width: 14 * (unit ?? 1)),
            itemBuilder: (context, index) => _CreditCard(
              entry: people[index],
              size: avatarSize,
              light: unit != null,
            ),
          ),
        ),
      ],
    );
  }

  static double _portraitHeight(
    BuildContext context,
    List<CreditEntry> people,
    double width,
  ) {
    final defaults = DefaultTextStyle.of(context);
    final painter = TextPainter(
      maxLines: 2,
      ellipsis: '…',
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      locale: Localizations.maybeLocaleOf(context),
      textHeightBehavior:
          defaults.textHeightBehavior ??
          DefaultTextHeightBehavior.maybeOf(context),
    );
    double measure(String label, TextStyle style) {
      painter.text = TextSpan(text: label, style: defaults.style.merge(style));
      painter.layout(maxWidth: width);
      return painter.height;
    }

    // 横滑列表使用统一高度；按实际字体和换行测量，不裁掉大字号的第二行。
    var labelsHeight = 0.0;
    try {
      for (final person in people) {
        final role = person.roleLabel;
        final height =
            measure(person.displayName, _CreditCard.nameStyle) +
            (role == null ? 0 : measure(role, _CreditCard.roleStyle));
        if (height > labelsHeight) labelsHeight = height;
      }
    } finally {
      painter.dispose();
    }
    return width + 6 + labelsHeight.ceilToDouble();
  }
}

/// 单个人物卡：方形头像 + 姓名 + 角色或职务。
class _CreditCard extends StatelessWidget {
  const _CreditCard({
    required this.entry,
    required this.size,
    required this.light,
  });

  final CreditEntry entry;
  final double size;
  final bool light;

  static const nameStyle = TextStyle(fontSize: 13, fontWeight: FontWeight.w600);
  static const roleStyle = TextStyle(fontSize: 12);

  Widget _avatar() {
    if (!light) return RemoteImage(url: entry.avatarUrl);
    const placeholder = ColoredBox(
      color: Color(0xFFE3E3E3),
      child: Center(
        child: Icon(Icons.person, color: Color(0xFF777777), size: 32),
      ),
    );
    final url = entry.avatarUrl;
    if (url == null || url.isEmpty) return placeholder;
    return Image.network(
      url,
      fit: BoxFit.cover,
      loadingBuilder: (_, child, progress) =>
          progress == null ? child : placeholder,
      errorBuilder: (_, _, _) => placeholder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final role = entry.roleLabel;
    return SizedBox(
      width: size,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(width: size, height: size, child: _avatar()),
          ),
          const SizedBox(height: 6),
          Text(
            entry.displayName,
            maxLines: light ? 2 : 1,
            overflow: TextOverflow.ellipsis,
            style: nameStyle.copyWith(
              color: light ? _portraitInk : Colors.white,
            ),
          ),
          if (role != null)
            Text(
              role,
              maxLines: light ? 2 : 1,
              overflow: TextOverflow.ellipsis,
              style: roleStyle.copyWith(
                color: light ? _portraitMuted : Colors.white54,
              ),
            ),
        ],
      ),
    );
  }
}

/// `DETAIL-03` `Watching` 区：仅在有真实观看数据时渲染，位于演职员之后。
class _WatchingRail extends StatelessWidget {
  const _WatchingRail({
    required this.items,
    required this.formatClock,
    this.light = false,
  });

  final List<WatchProgress> items;
  final String Function(int) formatClock;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _SectionTitle('Watching', light: light),
        const SizedBox(height: 8),
        SizedBox(
          height: 176,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 14),
            itemBuilder: (context, index) => _WatchingCard(
              item: items[index],
              formatClock: formatClock,
              light: light,
            ),
          ),
        ),
      ],
    );
  }
}

/// `Watching` 区单张卡片：海报 + 片名 + 已看位置。
class _WatchingCard extends StatelessWidget {
  const _WatchingCard({
    required this.item,
    required this.formatClock,
    required this.light,
  });

  final WatchProgress item;
  final String Function(int) formatClock;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 112,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // 海报占满卡片剩余高度：随轨道高度自适应，避免文字行把卡片撑溢出。
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 112,
                child: RemoteImage(url: item.posterUrl ?? item.backdropUrl),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.displayTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: light ? _portraitInk : Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            '已看 ${formatClock(item.position)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: light ? _portraitMuted : Colors.white54,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

/// 分区小标题。
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, {this.light = false});

  final String title;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: TextStyle(
        color: light ? _portraitInk : Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

/// 次级动作图标：`onPressed` 为 null 时置灰不可点（底层按钮禁用、不发起任何请求），
/// 长按或点击仅给出提示文案。
class _SecondaryActionButton extends StatelessWidget {
  const _SecondaryActionButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.color = Colors.white,
    this.disabledColor = Colors.white24,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color color;
  final Color disabledColor;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final button = IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 24),
      color: color,
      disabledColor: disabledColor,
      // 占位项的提示统一由外层 Tooltip 给出，避免叠加两处提示。
      tooltip: enabled ? tooltip : null,
      // 触摸目标不小于 48dp，与 `_secondaryActionsWidth` 计算保持一致。
      constraints: const BoxConstraints(
        minWidth: _secondaryActionExtent,
        minHeight: _secondaryActionExtent,
      ),
    );
    if (enabled) return button;
    // 无后端能力：置灰不可点，点击只弹出「该功能暂不可用」提示，不改变任何状态。
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () =>
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(tooltip))),
        child: button,
      ),
    );
  }
}

/// 简介全文弹层：顶部居中片名，左上角关闭。
class _SynopsisDialog extends StatelessWidget {
  const _SynopsisDialog({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF16161C),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 560),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Stack(
              alignment: Alignment.center,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.fromLTRB(56, 16, 56, 12),
                  child: Text(
                    title,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                    tooltip: '关闭',
                  ),
                ),
              ],
            ),
            const Divider(height: 1, color: Color(0x33FFFFFF)),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Text(
                  text,
                  style: const TextStyle(
                    color: Colors.white70,
                    height: 1.7,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 时长标注：不足 1 小时用 `mm:ss`，超过用 `h:mm:ss`（小时位不补零）。
String _formatWatchLabel(int seconds) {
  final safe = seconds < 0 ? 0 : seconds;
  final h = safe ~/ 3600;
  final m = ((safe % 3600) ~/ 60).toString().padLeft(2, '0');
  final s = (safe % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$m:$s' : '$m:$s';
}

class _MetaBlock extends StatelessWidget {
  const _MetaBlock({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(color: Colors.white60, height: 1.5),
        children: <InlineSpan>[
          TextSpan(
            text: '$label：',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
          TextSpan(text: value),
        ],
      ),
    );
  }
}
