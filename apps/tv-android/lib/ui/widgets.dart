import 'package:flutter/material.dart';

import '../core/models.dart';

/// 品牌强调色（与 Web 端进度条同色）。
const Color kAccent = Color(0xFFA31621);

/// 深色背景。
const Color kSurface = Color(0xFF0B0B0F);

/// 海报 / 剧照：加载中与失败都回退到统一占位，避免出现破图。
class RemoteImage extends StatelessWidget {
  const RemoteImage({super.key, required this.url, this.fit = BoxFit.cover});

  final String? url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final value = url;
    if (value == null || value.isEmpty) return const _ImagePlaceholder();

    return Image.network(
      value,
      fit: fit,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const _ImagePlaceholder(),
      errorBuilder: (context, error, stackTrace) => const _ImagePlaceholder(),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFF1A1A22),
      child: Center(
        child: Icon(Icons.movie_outlined, color: Colors.white24, size: 28),
      ),
    );
  }
}

/// 可被遥控器聚焦的海报卡片。
///
/// 聚焦时放大并描边，同时把自身滚动到横向轨道可见范围内，
/// 这样电视端用方向键浏览时不会「移出画面」。
class FocusablePosterCard extends StatefulWidget {
  const FocusablePosterCard({
    super.key,
    required this.card,
    required this.onSelect,
    this.width = 148,
  });

  final CarouselCard card;
  final VoidCallback onSelect;
  final double width;

  @override
  State<FocusablePosterCard> createState() => _FocusablePosterCardState();
}

class _FocusablePosterCardState extends State<FocusablePosterCard> {
  bool _focused = false;

  void _handleFocusChange(bool focused) {
    setState(() => _focused = focused);
    if (!focused) return;
    Scrollable.ensureVisible(
      context,
      alignment: 0.5,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: _handleFocusChange,
      child: GestureDetector(
        onTap: widget.onSelect,
        child: AnimatedScale(
          scale: _focused ? 1.06 : 1,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          child: Container(
            width: widget.width,
            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _focused ? kAccent : Colors.transparent,
                width: 2,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: AspectRatio(
                aspectRatio: 2 / 3,
                child: RemoteImage(
                  url: widget.card.posterUrl ?? widget.card.backdropUrl,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 网格中的可聚焦海报卡片：随单元格自适应尺寸，底部带片名。
class FocusableGridCard extends StatefulWidget {
  const FocusableGridCard({
    super.key,
    required this.card,
    required this.onSelect,
  });

  final CarouselCard card;
  final VoidCallback onSelect;

  @override
  State<FocusableGridCard> createState() => _FocusableGridCardState();
}

class _FocusableGridCardState extends State<FocusableGridCard> {
  bool _focused = false;

  void _handleFocusChange(bool focused) {
    setState(() => _focused = focused);
    if (!focused) return;
    Scrollable.ensureVisible(
      context,
      alignment: 0.5,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: _handleFocusChange,
      child: GestureDetector(
        onTap: widget.onSelect,
        child: AnimatedScale(
          scale: _focused ? 1.04 : 1,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: _focused ? kAccent : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: RemoteImage(
                        url: widget.card.posterUrl ?? widget.card.backdropUrl,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  widget.card.displayTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 作品网格：按可用宽度自适应列数，随滚动懒加载。
class TitleGrid extends StatelessWidget {
  const TitleGrid({super.key, required this.cards, required this.onSelect});

  final List<CarouselCard> cards;
  final ValueChanged<CarouselCard> onSelect;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 180,
        childAspectRatio: 0.64,
        crossAxisSpacing: 8,
        mainAxisSpacing: 4,
      ),
      itemCount: cards.length,
      itemBuilder: (context, index) {
        final card = cards[index];
        return FocusableGridCard(
          card: card,
          onSelect: () => onSelect(card),
        );
      },
    );
  }
}

/// 列表页小标题：名称 + 作品数量。
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: <Widget>[
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '共 $count 部',
            style: const TextStyle(color: Colors.white38, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

/// 统一的错误 / 空态视图，附带重试入口。
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}
