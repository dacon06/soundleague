package app.soundleague.player

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.webkit.WebView

/**
 * WebView für den YouTube-Player. Solange ein Song geladen ist, meldet sie sich beim
 * Minimieren weiter als „sichtbar" — sonst pausiert YouTube die Wiedergabe.
 */
@SuppressLint("ViewConstructor")
class PlayerWebView(context: Context) : WebView(context) {
    var keepVisible = false

    override fun onWindowVisibilityChanged(visibility: Int) {
        if (keepVisible && visibility != View.GONE) {
            super.onWindowVisibilityChanged(View.VISIBLE)
        } else {
            super.onWindowVisibilityChanged(visibility)
        }
    }
}
