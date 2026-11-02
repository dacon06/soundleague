package app.soundleague.player

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import app.soundleague.MainActivity
import app.soundleague.R
import app.soundleague.SoundleagueApp

/**
 * Hintergrunddienst, solange ein Song geladen ist: zeigt eine Benachrichtigung mit
 * Play/Pause und hält die App am Leben, wenn sie minimiert ist.
 */
class PlaybackService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 4711
        private const val ACTION_TOGGLE = "app.soundleague.TOGGLE"
        private const val ACTION_STOP = "app.soundleague.STOP"

        @Volatile
        var running = false
            private set

        fun start(context: Context) {
            if (running) {
                update(context)
                return
            }
            val intent = Intent(context, PlaybackService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
            } catch (_: Exception) {
                // Android erlaubt den Start manchmal nicht (z. B. aus dem Hintergrund) — Musik läuft trotzdem
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PlaybackService::class.java))
        }

        fun update(context: Context) {
            if (!running) return
            try {
                context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(context))
            } catch (_: Exception) {
            }
        }

        private fun build(context: Context): Notification {
            val s = Player.state.value
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val open = PendingIntent.getActivity(
                context, 0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                flags,
            )
            val toggle = PendingIntent.getService(
                context, 1, Intent(context, PlaybackService::class.java).setAction(ACTION_TOGGLE), flags,
            )
            val close = PendingIntent.getService(
                context, 2, Intent(context, PlaybackService::class.java).setAction(ACTION_STOP), flags,
            )
            return NotificationCompat.Builder(context, SoundleagueApp.CHANNEL_PLAYBACK)
                .setSmallIcon(R.drawable.ic_stat_note)
                .setContentTitle(s.title.ifEmpty { "Soundleague" })
                .setContentText(if (s.playing) "Läuft" else "Pausiert")
                .setContentIntent(open)
                .addAction(
                    if (s.playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                    if (s.playing) "Pause" else "Abspielen",
                    toggle,
                )
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Schließen", close)
                .setOngoing(s.playing)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setDeleteIntent(close)
                .build()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> {
                Player.togglePlayback()
                return START_NOT_STICKY
            }
            ACTION_STOP -> {
                Player.stop()
                stopSelf()
                return START_NOT_STICKY
            }
        }
        val notification = build(this)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        running = true
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App aus der Übersicht weggewischt → Musik beenden
        Player.stop()
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
