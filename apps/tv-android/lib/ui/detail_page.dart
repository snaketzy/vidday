import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'player_page.dart';
import 'widgets.dart';

/// 详情页：展示真实元数据，并在有片源时进入播放。
class DetailPage extends StatefulWidget {
  const DetailPage({super.key, required this.api, required this.titleId});

  final ApiClient api;
  final int titleId;

  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  late Future<TitleDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.fetchTitle(widget.titleId);
  }

  void _reload() =>
      setState(() => _future = widget.api.fetchTitle(widget.titleId));

  void _play(TitleDetail detail) {
    final url = detail.playUrl;
    if (url == null || url.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PlayerPage(
          api: widget.api,
          title: detail.displayTitle,
          url: url,
          titleId: detail.id,
          contentType: detail.contentType,
          titleName: detail.displayTitle,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
                                labelStyle:
                                    const TextStyle(color: Colors.white70),
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
                        label: Text(
                          detail.playUrl == null ? '暂无片源' : '播放',
                        ),
                      ),
                      const SizedBox(height: 24),
                      if (detail.synopsis != null || detail.logline != null)
                        Text(
                          detail.synopsis ?? detail.logline!,
                          style: const TextStyle(
                            color: Colors.white70,
                            height: 1.6,
                          ),
                        ),
                      if (detail.director != null) ...<Widget>[
                        const SizedBox(height: 20),
                        _MetaBlock(label: '导演', value: detail.director!),
                      ],
                      if (detail.cast.isNotEmpty) ...<Widget>[
                        const SizedBox(height: 12),
                        _MetaBlock(
                          label: '主演',
                          value: detail.cast.take(6).join('、'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
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
