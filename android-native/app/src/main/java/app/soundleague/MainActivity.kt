package app.soundleague

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import app.soundleague.player.Player
import app.soundleague.ui.AppRoot
import app.soundleague.ui.SoundleagueTheme

class MainActivity : ComponentActivity() {
    // Ziel aus einer angetippten Push-Benachrichtigung, z. B. /group/abc/round/xyz
    private val pendingUrl = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        pendingUrl.value = intent?.getStringExtra("url")
        setContent {
            SoundleagueTheme {
                AppRoot(
                    pendingUrl = pendingUrl.value,
                    onUrlHandled = { pendingUrl.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("url")?.let { pendingUrl.value = it }
    }

    override fun onDestroy() {
        // App wirklich beendet (nicht nur minimiert) → Musik aus
        if (isFinishing) Player.stop()
        super.onDestroy()
    }
}
