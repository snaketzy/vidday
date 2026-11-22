/// 构建期注入的运行时配置。
///
/// 密钥不出现在源码里，由构建命令通过 --dart-define 注入：
///   flutter build apk --release \
///     --dart-define=APP_API_KEY=$VITE_APP_API_KEY \
///     --dart-define=API_BASE_URL=https://laybackzzz.com/api
///
/// 后端鉴权头 x-app-key 的值必须与 server/.env 的 APP_API_KEY 一致，
/// 否则所有接口返回 401。
class AppConfig {
  const AppConfig._();

  /// 后端接口根地址（已含 /api 前缀）。
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://laybackzzz.com/api',
  );

  /// App 级密钥，随 x-app-key 请求头发送。
  static const String appKey = String.fromEnvironment('APP_API_KEY');

  /// 密钥缺失时给出可操作的提示，避免表现为一片空白的「加载失败」。
  static bool get isConfigured => appKey.trim().isNotEmpty;
}
