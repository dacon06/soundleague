package app.soundleague.player

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.webkit.WebView

/**
 * WebView für den YouTube-Player. Solange ein Song geladen ist, meldet sie sich beim
 * Minimieren und bei gesperrtem Bildschirm weiter als „sichtbar" — sonst pausiert YouTube.
 */
@SuppressLint("ViewConstructor")
class PlayerWebView(context: Context) : WebView(context) {
    var keepVisible = false

    override fun onWindowVisibilityChanged(visibility: Int) {
        // Beim Minimieren meldet Android GONE oder INVISIBLE → beides überschreiben
        super.onWindowVisibilityChanged(if (keepVisible) View.VISIBLE else visibility)
    }
}
