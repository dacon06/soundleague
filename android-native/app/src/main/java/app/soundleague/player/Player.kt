package app.soundleague.player

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import app.soundleague.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class PlayerState(
    val videoId: String? = null,
    val title: String = "",
    val playing: Boolean = false,
    val buffering: Boolean = false,
    val position: Float = 0f,
    val duration: Float = 0f,
    val error: String? = null,
)

/**
 * Ein einziger YouTube-Player für die ganze App (es läuft immer nur ein Song).
 * Technisch ein unsichtbarer YouTube-Player in einer WebView, gesteuert per JavaScript.
 */
object Player {
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private var webView: PlayerWebView? = null
    private var appContext: Context? = null
    private val main = Handler(Looper.getMainLooper())

    private val validId = Regex("^[A-Za-z0-9_-]{6,20}$")

    @SuppressLint("SetJavaScriptEnabled")
    fun view(context: Context): PlayerWebView {
        appContext = context.applicationContext
        webView?.let { existing ->
            (existing.parent as? ViewGroup)?.removeView(existing)
            return existing
        }
        val wv = PlayerWebView(context.applicationContext)
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        wv.settings.mediaPlaybackRequiresUserGesture = false
        wv.webViewClient = WebViewClient()
        // Der Player soll auch im Hintergrund volle Priorität behalten
        wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        wv.addJavascriptInterface(Bridge(), "SoundleagueNative")
        wv.loadUrl("${BuildConfig.WEB_BASE}/native-player.html")
        webView = wv
        return wv
    }

    private fun js(code: String) {
        main.post { webView?.evaluateJavascript(code, null) }
    }

    /** Spielt einen Song ab bzw. setzt ihn fort, wenn er schon geladen ist. */
    fun play(videoId: String, title: String) {
        if (!validId.matches(videoId)) return
        val current = _state.value
        if (current.videoId == videoId) {
            js("play()")
        } else {
            _state.value = PlayerState(videoId = videoId, title = title, buffering = true)
            js("load('$videoId')")
        }
        webView?.keepVisible = true
        appContext?.let { PlaybackService.start(it) }
    }

    fun toggle(videoId: String, title: String) {
        val s = _state.value
        if (s.videoId == videoId && (s.playing || s.buffering)) pause() else play(videoId, title)
    }

    fun togglePlayback() {
        val s = _state.value
        val id = s.videoId ?: return
        if (s.playing) pause() else play(id, s.title)
    }

    fun pause() = js("pause()")

    fun seek(seconds: Float) {
        _state.update { it.copy(position = seconds) }
        js("seek($seconds)")
    }

    /** Beendet die Wiedergabe komplett (Mini-Player schließen, Benachrichtigung weg). */
    fun stop() {
        js("stop()")
        _state.value = PlayerState()
        webView?.keepVisible = false
        appContext?.let { PlaybackService.stop(it) }
    }

    private fun notifyChanged() {
        appContext?.let { PlaybackService.update(it) }
    }

    // Rückmeldungen aus dem YouTube-Player (laufen auf einem eigenen Thread)
    private class Bridge {
        @JavascriptInterface
        fun onReady() {
        }

        @JavascriptInterface
        fun onState(code: Int, duration: Double) {
            when (code) {
                1 -> Player._state.update { it.copy(playing = true, buffering = false, duration = duration.toFloat(), error = null) }
                2 -> Player._state.update { it.copy(playing = false, buffering = false) }
                3 -> Player._state.update { it.copy(buffering = true) }
                0 -> {
                    // Song zu Ende → Mini-Player bleibt, aber Hintergrund-Dienst darf weg
                    Player._state.update { it.copy(playing = false, buffering = false, position = 0f) }
                }
            }
            Player.notifyChanged()
        }

        @JavascriptInterface
        fun onTime(position: Double, duration: Double) {
            Player._state.update {
                if (it.videoId == null) it else it.copy(position = position.toFloat(), duration = duration.toFloat())
            }
        }

        @JavascriptInterface
        fun onError(code: Int) {
            val msg = when (code) {
                101, 150 -> "Dieses Video darf nicht eingebettet werden"
                100 -> "Video nicht gefunden"
                else -> "Wiedergabe-Fehler ($code)"
            }
            Player._state.update { it.copy(playing = false, buffering = false, error = msg) }
            Player.notifyChanged()
        }
    }
}
