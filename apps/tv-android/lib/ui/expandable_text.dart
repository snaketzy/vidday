import 'package:flutter/material.dart';

import 'package:vidday_tv/ui/widgets.dart';

/// 简介：正文内联截断（maxLines + ellipsis），仅在内容超出时于末行末尾显示 `MORE`。
class ExpandableText extends StatelessWidget {
  const ExpandableText({super.key, required this.text, required this.onOpen});

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

/// 简介全文弹层：顶部居中片名，左上角关闭。
class ExpandableTextDialog extends StatelessWidget {
  const ExpandableTextDialog({
    super.key,
    required this.title,
    required this.text,
  });

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
