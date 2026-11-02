package app.soundleague;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Verbindung zwischen Website und App: Die Website meldet, ob gerade Musik läuft.
 * Dann bleibt die WebView "sichtbar" und ein Hintergrunddienst hält die App am Leben.
 */
@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    private static BackgroundAudioPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setPlaying(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        String title = call.getString("title", "");

        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            if (webView instanceof BackgroundWebView) {
                ((BackgroundWebView) webView).setKeepVisible(playing);
            }
        });

        Context context = getContext();
        Intent intent = new Intent(context, PlaybackService.class);
        if (playing) {
            intent.putExtra(PlaybackService.EXTRA_TITLE, title);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent);
                } else {
                    context.startService(intent);
                }
            } catch (Exception e) {
                // Android erlaubt den Start manchmal nicht (z. B. aus dem Hintergrund) – Musik läuft trotzdem weiter
            }
        } else {
            context.stopService(intent);
        }
        call.resolve();
    }

    /** Wird vom Pause-Knopf in der Benachrichtigung aufgerufen. */
    static void requestPause() {
        if (instance != null) {
            instance.notifyListeners("pause", new JSObject());
        }
    }
}
