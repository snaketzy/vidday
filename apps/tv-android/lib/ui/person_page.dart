import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'detail_page.dart';
import 'expandable_text.dart';
import 'widgets.dart';

/// 影人页：基础资料 + 参演作品 + 合作影人，对齐 Web `/person/:id`。
///
/// 参演作品卡可进入对应影片详情页；合作影人卡可再进入该影人的影人页。
/// 合作影人是补充信息，接口失败时静默隐藏，不影响主体展示。
class PersonPage extends StatefulWidget {
  const PersonPage({super.key, required this.api, required this.personId});

  final ApiClient api;
  final int personId;

  @override
  State<PersonPage> createState() => _PersonPageState();
}

class _PersonPageState extends State<PersonPage> {
  late Future<PersonDetail> _future;

  /// 合作影人；为空表示未获取、失败或确无记录（失败静默隐藏整个区块）。
  List<PersonCollaborator> _collaborators = const <PersonCollaborator>[];

  @override
  void initState() {
    super.initState();
    _future = widget.api.fetchPerson(widget.personId);
    unawaited(_loadCollaborators());
  }

  /// 重新拉取影人详情；用块体闭包，避免箭头闭包返回 `Future` 触发断言。
  void _reload() {
    setState(() {
      _future = widget.api.fetchPerson(widget.personId);
    });
  }

  Future<void> _loadCollaborators() async {
    try {
      final list = await widget.api.fetchPersonCollaborators(widget.personId);
      if (!mounted) return;
      setState(() {
        _collaborators = list;
      });
    } catch (_) {
      // 合作影人接口失败静默隐藏，不影响主体展示。
    }
  }

  /// 进入某部作品的详情页（`titleId` + `contentType` 语义统一）。
  Future<void> _openTitle(PersonCredit credit) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DetailPage(api: widget.api, titleId: credit.titleId),
      ),
    );
  }

  /// 进入另一位影人的影人页（自递归，层数由用户控制）。
  Future<void> _openPerson(int personId) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PersonPage(api: widget.api, personId: personId),
      ),
    );
  }

  /// 打开简介全文弹层（复用详情页同一组件）：标题为影人显示名，左上角关闭。
  Future<void> _openBiography(String title, String text) {
    return showDialog<void>(
      context: context,
      builder: (_) => ExpandableTextDialog(title: title, text: text),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kSurface,
      body: FutureBuilder<PersonDetail>(
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
          return _buildBody(snapshot.data!);
        },
      ),
    );
  }

  Widget _buildBody(PersonDetail person) {
    final biography = person.biography?.trim() ?? '';
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                tooltip: '返回',
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '影人',
              style: TextStyle(
                color: kAccent,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 3,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              person.headlineName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w900,
                height: 1.15,
              ),
            ),
            if (person.secondaryName != null) ...<Widget>[
              const SizedBox(height: 4),
              Text(
                person.secondaryName!,
                style: const TextStyle(color: Colors.white60, fontSize: 18),
              ),
            ],
            if (biography.isNotEmpty) ...<Widget>[
              const SizedBox(height: 20),
              const Text(
                '简介',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              ExpandableText(
                text: biography,
                onOpen: () => _openBiography(person.headlineName, biography),
              ),
            ],
            const SizedBox(height: 28),
            const _SectionTitle('参演作品'),
            const SizedBox(height: 12),
            if (person.credits.isEmpty)
              const Text(
                '暂无收录作品。',
                style: TextStyle(color: Colors.white54),
              )
            else
              Wrap(
                spacing: 12,
                runSpacing: 16,
                children: <Widget>[
                  for (final credit in person.credits)
                    _WorkCard(credit: credit, onOpen: () => _openTitle(credit)),
                ],
              ),
            if (_collaborators.isNotEmpty) ...<Widget>[
              const SizedBox(height: 32),
              const _SectionTitle('合作过的演职人员'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                runSpacing: 16,
                children: <Widget>[
                  for (final item in _collaborators)
                    _CollaboratorTile(
                      item: item,
                      onOpen: () => _openPerson(item.personId),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

/// 作品海报卡：海报 + 中英片名 + 年份与角色 / 职务；点击进入影片详情页。
class _WorkCard extends StatelessWidget {
  const _WorkCard({required this.credit, required this.onOpen});

  final PersonCredit credit;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final role = credit.roleLabel;
    final meta = <String>[
      if (credit.releaseYear != null) '${credit.releaseYear}',
      ?role,
    ].join(' · ');
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onOpen,
      child: SizedBox(
        width: 132,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: AspectRatio(
                aspectRatio: 2 / 3,
                child: RemoteImage(url: credit.posterUrl),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              credit.primaryTitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
            if (credit.secondaryTitle != null)
              Text(
                credit.secondaryTitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white60, fontSize: 12),
              ),
            if (meta.isNotEmpty)
              Text(
                meta,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white38, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}

/// 合作影人卡：圆头像 + 中英姓名 + 共同作品数；点击进入该影人页。
class _CollaboratorTile extends StatelessWidget {
  const _CollaboratorTile({required this.item, required this.onOpen});

  final PersonCollaborator item;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onOpen,
      child: SizedBox(
        width: 96,
        child: Column(
          children: <Widget>[
            ClipOval(
              child: SizedBox(
                width: 76,
                height: 76,
                child: RemoteImage(url: item.avatarUrl),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              item.headlineName,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
            if (item.secondaryName != null)
              Text(
                item.secondaryName!,
                maxLines: 1,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white60, fontSize: 12),
              ),
            const SizedBox(height: 2),
            Text(
              '合作 ${item.sharedCount} 部',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white38, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
