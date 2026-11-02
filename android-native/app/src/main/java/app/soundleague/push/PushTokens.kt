package app.soundleague.push

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import java.security.MessageDigest

// Speichert den FCM-Token des Geräts in `pushSubscriptions` — im selben Format wie
// die bisherige App, damit der Server (api/_push.js) ihn ohne Änderung nutzen kann.
object PushTokens {

    fun hasPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun subscriptionId(key: String): String {
        val hash = MessageDigest.getInstance("SHA-256").digest(key.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }.take(32)
    }

    suspend fun refresh(context: Context): Boolean {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return false
        if (!hasPermission(context)) return false
        return try {
            save(FirebaseMessaging.getInstance().token.await(), uid)
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun save(token: String, uid: String) {
        FirebaseFirestore.getInstance().collection("pushSubscriptions").document(subscriptionId(token)).set(
            hashMapOf(
                "userId" to uid,
                "type" to "fcm",
                "token" to token,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
        ).await()
    }
}
