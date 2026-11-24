import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

/// 后端返回的业务错误（含错误码），供 UI 分层提示。
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// 后端 /api/public/* 的只读访问封装。
///
/// 所有请求携带 x-app-key；用户侧数据接口额外携带 x-device-id。
class ApiClient {
  ApiClient({required this.deviceId, http.Client? client})
      : _client = client ?? http.Client();

  final String deviceId;
  final http.Client _client;

  static const Duration _timeout = Duration(seconds: 20);
  /// 与后端 PUBLIC_SCHEMA_VERSION 保持一致。
  static const int _schemaVersion = 2;

  Map<String, String> get _headers => <String, String>{
        'x-app-key': AppConfig.appKey,
        'x-device-id': deviceId,
        'accept': 'application/json',
      };

  /// 首页内容轨道（placement=home）。
  Future<List<Carousel>> fetchHomeCarousels() async {
    final body = await _getJson('/public/carousels', <String, String>{'placement': 'home'});
    return (body['carousels'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Carousel.fromJson)
        .toList();
  }

  /// 最新上架内容（近 N 天「已上架」影片 + 剧集），按入库时间倒序。
  ///
  /// `limit` 传 null 表示返回窗口内全部，供「最近更新」页使用。
  Future<List<CarouselCard>> fetchLatest({int days = 30, int? limit = 40}) async {
    final body = await _getJson('/public/latest', <String, String>{
      'days': '$days',
      if (limit != null) 'limit': '$limit',
    });
    return (body['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CarouselCard.fromJson)
        .toList();
  }

  /// 全量目录（「已上架」影片 + 剧集），按入库时间倒序分页。
  Future<AllTitlesPage> fetchAllTitles({int? limit, int? offset}) async {
    final body = await _getJson('/public/titles', <String, String>{
      if (limit != null) 'limit': '$limit',
      if (offset != null) 'offset': '$offset',
    });
    return AllTitlesPage(
      total: (body['total'] as num?)?.toInt() ?? 0,
      items: (body['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CarouselCard.fromJson)
          .toList(),
    );
  }

  /// 影片 / 剧集详情（含真实播放地址）。
  Future<TitleDetail> fetchTitle(int id) async {
    final body = await _getJson('/public/titles/$id');
    final title = body['title'];
    if (title is! Map<String, dynamic>) {
      throw ApiException('详情数据格式异常');
    }
    return TitleDetail.fromJson(title);
  }

  /// 影片 / 剧集完整演职员表（演员与职员分列）。
  Future<TitleCredits> fetchCredits(int id) async {
    final body = await _getJson('/public/titles/$id/credits');
    final credits = body['credits'];
    if (credits is! Map<String, dynamic>) {
      throw ApiException('演职员数据格式异常');
    }
    return TitleCredits.fromJson(credits);
  }

  /// 影人资料与参演作品（`GET /public/people/:id`）。
  Future<PersonDetail> fetchPerson(int id) async {
    final body = await _getJson('/public/people/$id');
    final person = body['person'];
    if (person is! Map<String, dynamic>) {
      throw ApiException('影人数据格式异常');
    }
    return PersonDetail.fromJson(person);
  }

  /// 合作影人（`GET /public/people/:id/collaborators`）；失败由调用方静默处理。
  Future<List<PersonCollaborator>> fetchPersonCollaborators(int id) async {
    final body = await _getJson('/public/people/$id/collaborators');
    return (body['collaborators'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(PersonCollaborator.fromJson)
        .toList();
  }

  /// 本设备「我的片单」（含卡片摘要），供详情页判断当前影片是否已加入。
  Future<List<CarouselCard>> fetchMyList() async {
    final body = await _getJson('/public/list');
    return (body['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CarouselCard.fromJson)
        .toList();
  }

  /// 加入片单（幂等，重复加入也成功）；失败由调用方静默处理。
  Future<void> addToMyList(int titleId) =>
      _putJson('/public/list', <String, dynamic>{'titleId': titleId});

  /// 移出片单（空操作也返回成功）；失败由调用方静默处理。
  Future<void> removeFromMyList(int titleId) =>
      _deleteJson('/public/list/$titleId');

  /// 本设备全部观看进度（含卡片摘要），按最近更新倒序。
  ///
  /// 详情页据此判断当前影片是否有可续播记录。
  Future<List<WatchProgress>> fetchWatchProgress() async {
    final body = await _getJson('/public/progress');
    return (body['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WatchProgress.fromJson)
        .toList();
  }

  /// 写入单条观看进度（幂等 upsert）；失败由调用方静默处理。
  Future<void> saveWatchProgress({
    required int titleId,
    int? episodeId,
    required int position,
    required int duration,
    required double percent,
    DateTime? updatedAt,
  }) async {
    await _putJson('/public/progress', <String, dynamic>{
      'titleId': titleId,
      'episodeId': ?episodeId,
      'position': position,
      'duration': duration,
      'percent': percent,
      'updatedAt': (updatedAt ?? DateTime.now().toUtc()).toIso8601String(),
    });
  }

  /// 上报一次播放会话的 QoE 数据（尽力而为，失败由调用方静默处理）。
  Future<void> reportQoe({
    required Map<String, dynamic> session,
    required List<Map<String, dynamic>> events,
  }) async {
    await _postJson('/public/qoe', <String, dynamic>{
      'schemaVersion': _schemaVersion,
      'session': session,
      'events': events,
    });
  }

  Future<void> _postJson(String path, Map<String, dynamic> body) =>
      _writeJson('post', path, body);

  Future<void> _putJson(String path, Map<String, dynamic> body) =>
      _writeJson('put', path, body);

  /// 无请求体的 DELETE（成功判定 HTTP 200，错误壳解析沿用 `_describeError`）。
  Future<void> _deleteJson(String path) async {
    if (!AppConfig.isConfigured) {
      throw ApiException('未注入 APP_API_KEY，请用 --dart-define 重新构建');
    }

    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');

    late final http.Response response;
    try {
      response = await _client.delete(uri, headers: _headers).timeout(_timeout);
    } on TimeoutException {
      throw ApiException('请求超时，请检查网络');
    } catch (error) {
      throw ApiException('网络不可用：$error');
    }

    if (response.statusCode != 200) {
      throw ApiException(_describeError(response), statusCode: response.statusCode);
    }
  }

  Future<void> _writeJson(
    String method,
    String path,
    Map<String, dynamic> body,
  ) async {
    if (!AppConfig.isConfigured) {
      throw ApiException('未注入 APP_API_KEY，请用 --dart-define 重新构建');
    }

    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final headers = <String, String>{
      ..._headers,
      'content-type': 'application/json',
    };
    final payload = json.encode(body);

    late final http.Response response;
    try {
      final request = method == 'put'
          ? _client.put(uri, headers: headers, body: payload)
          : _client.post(uri, headers: headers, body: payload);
      response = await request.timeout(_timeout);
    } on TimeoutException {
      throw ApiException('请求超时，请检查网络');
    } catch (error) {
      throw ApiException('网络不可用：$error');
    }

    if (response.statusCode != 200) {
      throw ApiException(_describeError(response), statusCode: response.statusCode);
    }
  }

  Future<Map<String, dynamic>> _getJson(
    String path, [
    Map<String, String>? query,
  ]) async {
    if (!AppConfig.isConfigured) {
      throw ApiException('未注入 APP_API_KEY，请用 --dart-define 重新构建');
    }

    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path')
        .replace(queryParameters: query == null || query.isEmpty ? null : query);

    late final http.Response response;
    try {
      response = await _client.get(uri, headers: _headers).timeout(_timeout);
    } on TimeoutException {
      throw ApiException('请求超时，请检查网络');
    } catch (error) {
      throw ApiException('网络不可用：$error');
    }

    if (response.statusCode != 200) {
      throw ApiException(_describeError(response), statusCode: response.statusCode);
    }

    final decoded = json.decode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw ApiException('接口返回格式异常');
    }
    return decoded;
  }

  /// 优先取后端 error.message，缺省时回退到状态码描述。
  String _describeError(http.Response response) {
    try {
      final decoded = json.decode(utf8.decode(response.bodyBytes));
      if (decoded is Map<String, dynamic>) {
        final error = decoded['error'];
        if (error is Map<String, dynamic> && error['message'] is String) {
          return error['message'] as String;
        }
      }
    } catch (_) {
      // 非 JSON 响应，走下面的兜底文案
    }
    if (response.statusCode == 401) return '接口鉴权失败（x-app-key 不匹配）';
    if (response.statusCode == 404) return '内容不存在';
    return '请求失败（HTTP ${response.statusCode}）';
  }
}
