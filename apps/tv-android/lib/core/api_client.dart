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
