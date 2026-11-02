package app.soundleague.data

import androidx.compose.runtime.mutableStateMapOf
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

// Emoji-Avatare der Nutzer (Feld `emoji` in users/{uid}), einmal geladen und gemerkt.
object Emojis {
    val cache = mutableStateMapOf<String, String?>()
    private val requested = HashSet<String>()

    val all = listOf(
        "🎵", "🎸", "🎹", "🥁", "🎺", "🎷", "🎻", "🎤", "🎧", "🎼",
        "🦊", "🐼", "🐨", "🦁", "🐯", "🐻", "🐺", "🦝", "🐸", "🦋",
        "🐙", "🦀", "🐠", "🦜", "🦚", "🦩", "🐧", "🦦", "🦥", "🐝",
        "🍕", "🍣", "🌮", "🍜", "🧇", "🍩", "🍦", "🧋", "☕", "🍺",
        "🌵", "🌸", "🌊", "⛰️", "🌙", "⭐", "🌈", "🔥", "❄️", "⚡",
        "🚀", "🎮", "📷", "🎨", "📚", "🏆", "💎", "🔮", "🎭", "🎪",
        "😎", "🤖", "👾", "🧙", "🦸", "🧛", "🧜", "🧝", "🤠", "🥷",
        "⚽", "🏀", "🎾", "🏄", "🧗", "🤸", "⛷️", "🏋️", "🤺", "🎯",
    )

    fun load(uid: String?) {
        if (uid.isNullOrEmpty() || !requested.add(uid)) return
        FirebaseFirestore.getInstance().collection("users").document(uid).get()
            .addOnSuccessListener { cache[uid] = it.getString("emoji") }
            .addOnFailureListener { requested.remove(uid) }
    }

    fun setMine(uid: String, emoji: String) {
        cache[uid] = emoji
        requested.add(uid)
        FirebaseFirestore.getInstance().collection("users").document(uid)
            .set(mapOf("emoji" to emoji), SetOptions.merge())
    }
}
