package ru.agroplatform.agroplatform_mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.core.content.FileProvider
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Optional evidence adapters. No canonical writes or synthetic coordinates. */
class ScoutingCapture(private val activity: Activity, channel: MethodChannel) : MethodChannel.MethodCallHandler {
    private var pending: MethodChannel.Result? = null
    private var pendingAction: (() -> Unit)? = null
    private var photo: File? = null
    private var mediaKind = ""
    private var recorder: MediaRecorder? = null
    private var audio: File? = null
    private var listener: LocationListener? = null
    private val handler = Handler(Looper.getMainLooper())
    private val directory: File get() = File(activity.cacheDir, "scouting").apply { mkdirs() }
    init { channel.setMethodCallHandler(this) }
    private fun error(code: String) { val r = pending; pending = null; pendingAction = null; r?.error(code, code, null) }
    private fun success(value: Any?) { val r = pending; pending = null; pendingAction = null; r?.success(value) }
    private fun permission(name: String, fn: () -> Unit) {
        if (activity.checkSelfPermission(name) == PackageManager.PERMISSION_GRANTED) fn()
        else { pendingAction = fn; activity.requestPermissions(arrayOf(name), 3401) }
    }
    fun permissionResult(code: Int, results: IntArray) {
        if (code != 3401) return
        val fn = pendingAction; pendingAction = null
        if (results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED) {
            try { fn?.invoke() } catch (_: Exception) { error("CAPTURE_UNAVAILABLE") }
        } else error("PERMISSION_DENIED")
    }
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (pending != null) { result.error("CAPTURE_BUSY", "Capture is busy", null); return }
        pending = result
        try {
            when (call.method) {
                "location" -> permission(Manifest.permission.ACCESS_FINE_LOCATION) { locate() }
                "recordStart" -> permission(Manifest.permission.RECORD_AUDIO) { record() }
                "recordStop" -> stopRecording()
                "media" -> {
                    mediaKind = call.argument<String>("kind") ?: ""
                    if (mediaKind == "PHOTO") permission(Manifest.permission.CAMERA) { camera() }
                    else if (mediaKind == "PHOTO_IMPORT" || mediaKind == "VOICE") {
                        activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = if (mediaKind == "VOICE") "audio/*" else "image/*"
                        }, 3403)
                    } else error("CAPTURE_INVALID_KIND")
                }
                "discard" -> {
                    val path = call.argument<String>("path") ?: ""
                    val f = File(path).canonicalFile
                    if (f.parentFile != directory.canonicalFile) error("CAPTURE_INVALID_PATH")
                    else { f.delete(); success(null) }
                }
                else -> { pending = null; result.notImplemented() }
            }
        } catch (_: Exception) { error("CAPTURE_UNAVAILABLE") }
    }
    private fun locate() {
        val manager = activity.getSystemService(Activity.LOCATION_SERVICE) as LocationManager
        if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) { error("GPS_UNAVAILABLE"); return }
        val l = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                manager.removeUpdates(this); listener = null
                if (!location.hasAccuracy()) { error("GPS_ACCURACY_UNAVAILABLE"); return }
                success(mapOf("latitude" to location.latitude, "longitude" to location.longitude,
                    "accuracyMetres" to location.accuracy.toDouble(), "provider" to (location.provider ?: "gps"),
                    "observedAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(location.time))))
            }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        listener = l
        manager.requestSingleUpdate(LocationManager.GPS_PROVIDER, l, Looper.getMainLooper())
        handler.postDelayed({ if (listener === l) { manager.removeUpdates(l); listener = null; error("GPS_TIMEOUT") } }, 15000)
    }
    private fun camera() {
        val f = File.createTempFile("photo-", ".jpg", directory); photo = f
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.scouting", f)
        activity.startActivityForResult(Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, 3402)
    }
    private fun record() {
        if (recorder != null) { error("RECORDING_ACTIVE"); return }
        val f = File.createTempFile("voice-", ".m4a", directory); audio = f
        val r = MediaRecorder(); recorder = r
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC); r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); r.setOutputFile(f.absolutePath)
            r.setMaxDuration(300000); r.prepare(); r.start(); success(null)
        } catch (e: Exception) { r.release(); recorder = null; f.delete(); throw e }
    }
    private fun stopRecording() {
        val r = recorder ?: run { error("RECORDING_UNAVAILABLE"); return }
        recorder = null
        try { r.stop(); success(mapOf("path" to audio!!.absolutePath, "mime" to "audio/mp4", "kind" to "VOICE")) }
        catch (_: Exception) { audio?.delete(); error("RECORDING_FAILED") }
        finally { r.release(); audio = null }
    }
    fun activityResult(code: Int, status: Int, data: Intent?) {
        if (code != 3402 && code != 3403) return
        if (status != Activity.RESULT_OK) { photo?.delete(); photo = null; success(null); return }
        if (code == 3402) {
            val f = photo; photo = null
            if (f == null || f.length() == 0L) { f?.delete(); error("PHOTO_UNAVAILABLE") }
            else success(mapOf("path" to f.absolutePath, "mime" to "image/jpeg", "kind" to "PHOTO"))
            return
        }
        val uri = data?.data ?: run { success(null); return }
        val mime = activity.contentResolver.getType(uri)
        val allowed = if (mediaKind == "VOICE") setOf("audio/mpeg", "audio/mp4") else setOf("image/jpeg", "image/png")
        if (!allowed.contains(mime)) { error("MEDIA_TYPE_UNSUPPORTED"); return }
        val kind = if (mediaKind == "VOICE") "VOICE" else "PHOTO"
        // Copy bounded streams off the UI thread; no URI/path enters business metadata.
        Thread {
            var f: File? = null
            try {
                val target = File.createTempFile("import-", ".bin", directory)
                f = target
                activity.contentResolver.openInputStream(uri)!!.use { input ->
                    target.outputStream().use { output ->
                        val bytes = ByteArray(65536); var size = 0L
                        while (true) { val n = input.read(bytes); if (n < 0) break
                            size += n; if (size > 2L * 1024 * 1024 * 1024) throw IllegalArgumentException()
                            output.write(bytes, 0, n)
                        }
                        if (size == 0L) throw IllegalArgumentException()
                    }
                }
                val path = target.absolutePath
                handler.post { success(mapOf("path" to path, "mime" to mime, "kind" to kind)) }
            } catch (_: Exception) { f?.delete(); handler.post { error("MEDIA_IMPORT_FAILED") } }
        }.start()
    }
    fun pause() { if (recorder != null) { try { recorder?.stop() } catch (_: Exception) {} ; recorder?.release(); recorder = null; audio?.delete(); audio = null } }
    fun close() {
        pause(); listener?.let { (activity.getSystemService(Activity.LOCATION_SERVICE) as LocationManager).removeUpdates(it) }
        listener = null; handler.removeCallbacksAndMessages(null); photo?.delete(); photo = null; error("CAPTURE_CANCELLED")
    }
}
