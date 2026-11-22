import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// 设备标识的本地存储键。
const String _deviceIdKey = 'vidday.deviceId';

/// 读取设备标识；首次启动时生成并持久化。
///
/// 后端以 `x-device-id` 作为观看进度 / 我的片单的归属键，
/// 因此必须满足其校验规则 `^[A-Za-z0-9._-]{8,64}$`。
Future<String> loadOrCreateDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  final existing = prefs.getString(_deviceIdKey);
  if (existing != null && existing.isNotEmpty) return existing;

  final created = _generateDeviceId();
  await prefs.setString(_deviceIdKey, created);
  return created;
}

/// 生成 32 位十六进制随机串（满足后端的字符集与长度约束）。
String _generateDeviceId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}
