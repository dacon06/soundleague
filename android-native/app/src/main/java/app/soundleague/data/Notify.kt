package app.soundleague.data

import app.soundleague.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Löst die Push-Benachrichtigungen auf dem Server aus (derselbe Endpunkt wie die Website).
// Der Server prüft selbst, ob das Ereignis stimmt, und schickt jede Nachricht nur einmal.
object Notify {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun round(roundId: String, event: String, actorUid: String?) {
        scope.launch {
            try {
                val body = JSONObject()
                    .put("roundId", roundId)
                    .put("event", event)
                    .put("actorUid", actorUid ?: JSONObject.NULL)
                    .toString()
                val conn = URL("${BuildConfig.WEB_BASE}/api/notify-round").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 10_000
                conn.readTimeout = 15_000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
                conn.responseCode // Anfrage abschicken
                conn.disconnect()
            } catch (_: Exception) {
                // Benachrichtigung ist Beiwerk — Fehler nie an den Nutzer durchreichen
            }
        }
    }
}
