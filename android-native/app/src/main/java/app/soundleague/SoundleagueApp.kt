package app.soundleague

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import app.soundleague.data.Session

class SoundleagueApp : Application() {
    companion object {
        const val CHANNEL_ROUNDS = "rounds"
        const val CHANNEL_PLAYBACK = "playback"
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ROUNDS, "Runden & Erinnerungen", NotificationManager.IMPORTANCE_DEFAULT)
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_PLAYBACK, "Musikwiedergabe", NotificationManager.IMPORTANCE_LOW).apply {
                    setShowBadge(false)
                }
            )
        }
        Session.start()
    }
}
