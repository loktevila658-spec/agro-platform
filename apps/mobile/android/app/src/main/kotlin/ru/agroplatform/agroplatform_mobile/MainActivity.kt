package ru.agroplatform.agroplatform_mobile

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var scouting: ScoutingCapture? = null
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        scouting = ScoutingCapture(this, MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "agroplatform/scouting"))
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        scouting?.permissionResult(requestCode, grantResults)
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        scouting?.activityResult(requestCode, resultCode, data)
    }
    override fun onPause() { scouting?.pause(); super.onPause() }
    override fun onDestroy() { scouting?.close(); scouting = null; super.onDestroy() }
}
