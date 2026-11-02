package app.soundleague;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * WebView, die beim Minimieren weiter als "sichtbar" gilt, solange Musik läuft.
 * Sonst merkt die Seite (und der YouTube-Player), dass sie versteckt ist, und pausiert.
 * Läuft keine Musik, verhält sie sich ganz normal, damit im Hintergrund nichts unnötig weiterläuft.
 */
public class BackgroundWebView extends CapacitorWebView {

    private boolean keepVisible = false;

    public BackgroundWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setKeepVisible(boolean keepVisible) {
        this.keepVisible = keepVisible;
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (keepVisible && visibility != View.GONE) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        } else {
            super.onWindowVisibilityChanged(visibility);
        }
    }
}
