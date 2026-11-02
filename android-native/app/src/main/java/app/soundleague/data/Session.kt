package app.soundleague.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

// Angemeldeter Nutzer (E-Mail/Passwort über Firebase, wie auf der Website)
object Session {
    private val auth get() = FirebaseAuth.getInstance()

    var uid by mutableStateOf<String?>(null)
        private set
    var displayName by mutableStateOf("")
        private set
    var ready by mutableStateOf(false)
        private set

    fun start() {
        auth.addAuthStateListener { a ->
            val u = a.currentUser
            uid = u?.uid
            if (u != null && !u.displayName.isNullOrEmpty()) displayName = u.displayName ?: ""
            if (u == null) displayName = ""
            ready = true
        }
    }

    val nameOrAnon: String get() = displayName.ifEmpty { "Anonym" }

    suspend fun login(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun register(email: String, password: String, name: String) {
        displayName = name
        val cred = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val user = cred.user ?: return
        user.updateProfile(UserProfileChangeRequest.Builder().setDisplayName(name).build()).await()
        displayName = name
        FirebaseFirestore.getInstance().collection("users").document(user.uid).set(
            hashMapOf(
                "displayName" to name,
                "email" to email.trim(),
                "createdAt" to FieldValue.serverTimestamp(),
                "totalPoints" to 0,
            )
        ).await()
    }

    fun logout() = auth.signOut()

    fun errorText(e: Exception): String {
        val code = (e as? FirebaseAuthException)?.errorCode
        return when (code) {
            "ERROR_USER_NOT_FOUND" -> "Kein Account mit dieser E-Mail gefunden."
            "ERROR_WRONG_PASSWORD" -> "Falsches Passwort."
            "ERROR_EMAIL_ALREADY_IN_USE" -> "Diese E-Mail ist bereits registriert."
            "ERROR_WEAK_PASSWORD" -> "Passwort muss mindestens 6 Zeichen haben."
            "ERROR_INVALID_EMAIL" -> "Ungültige E-Mail-Adresse."
            "ERROR_INVALID_CREDENTIAL" -> "E-Mail oder Passwort falsch."
            else -> e.localizedMessage ?: "Unbekannter Fehler"
        }
    }
}
