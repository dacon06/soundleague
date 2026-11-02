package app.soundleague.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import app.soundleague.MainActivity
import app.soundleague.R
import app.soundleague.SoundleagueApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class PushService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        scope.launch {
            try {
                PushTokens.save(token, uid)
            } catch (_: Exception) {
            }
        }
    }

    // Nur wenn die App offen ist — sonst zeigt Android die Benachrichtigung selbst an
    override fun onMessageReceived(message: RemoteMessage) {
        val n = message.notification ?: return
        val url = message.data["url"]
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("url", url)
        val pending = PendingIntent.getActivity(
            this, (url ?: "").hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, SoundleagueApp.CHANNEL_ROUNDS)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle(n.title ?: "Soundleague")
            .setContentText(n.body ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body ?: ""))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        try {
            getSystemService(NotificationManager::class.java)
                .notify((message.messageId ?: url ?: "").hashCode(), notification)
        } catch (_: SecurityException) {
        }
    }
}
