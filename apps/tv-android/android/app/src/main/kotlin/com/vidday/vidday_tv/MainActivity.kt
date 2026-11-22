package com.vidday.vidday_tv

import android.content.res.Configuration
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {

    private var playerPlugin: PlayerPlugin? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val plugin = PlayerPlugin(this, flutterEngine.dartExecutor.binaryMessenger)
        flutterEngine.platformViewsController.registry.registerViewFactory(
            PlayerPlugin.VIEW_TYPE,
            plugin.viewFactory,
        )
        playerPlugin = plugin
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        playerPlugin?.notifyPipModeChanged(isInPictureInPictureMode)
    }

    override fun onDestroy() {
        playerPlugin?.dispose()
        playerPlugin = null
        super.onDestroy()
    }
}
