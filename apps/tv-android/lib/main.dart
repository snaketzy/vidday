import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/device_id.dart';
import 'ui/shell_page.dart';
import 'ui/widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final deviceId = await loadOrCreateDeviceId();
  runApp(ViddayApp(api: ApiClient(deviceId: deviceId)));
}

class ViddayApp extends StatelessWidget {
  const ViddayApp({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vidday',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: kSurface,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kAccent,
          brightness: Brightness.dark,
        ),
      ),
      home: ShellPage(api: api),
    );
  }
}
