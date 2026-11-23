# 字幕任务

先读[任务看板](TASK_BOARD.md)中的调度、写入限制和交付约定。

### AP-02｜原生起播不等待外挂字幕
- **负责人 / 分支 / 模块：** Android 播放轮值 Agent，`feature/android-player`，AND-PLAY Kotlin。
- **目标 / 功能：** 片源准备不等待 PGS 清单；异步结果只作用于仍存活的同一视图；桥接生命周期重构不在本卡。
- **输入 / 依赖 / 数据：** `AP-01` 合入且播放窗口已交接；固定 HLS、慢/404 的 PGS 清单、既有 `PlayerSnapshot`。
- **写入 / 禁区：** `apps/tv-android/android/app/src/main/kotlin/com/vidday/vidday_tv/NativePlayerView.kt`；禁改 `PlayerPlugin.kt`、Dart 通道与 PGS 解码器。
- **输出 / 验收 / 交付：** APK 构建；TV 和手机验证慢清单/404 不阻断首帧、迟到结果不污染退出重进，外挂字幕正常时仍可选；附时间线与设备记录。
