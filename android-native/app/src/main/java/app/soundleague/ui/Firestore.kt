package app.soundleague.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

// Kleine Helfer: Firestore-Daten live in Compose anzeigen (wie onSnapshot auf der Website).

val db: FirebaseFirestore get() = FirebaseFirestore.getInstance()

/** Live-Liste einer Abfrage. null = lädt noch. */
@Composable
fun <T : Any> rememberQuery(key: Any?, query: () -> Query?, map: (DocumentSnapshot) -> T?): List<T>? {
    var data by remember(key) { mutableStateOf<List<T>?>(null) }
    DisposableEffect(key) {
        val q = query()
        val reg = q?.addSnapshotListener { snap, err ->
            if (snap != null) data = snap.documents.mapNotNull(map)
            else if (err != null && data == null) data = emptyList()
        }
        onDispose { reg?.remove() }
    }
    return data
}

class Loaded<T>(val value: T?)

/** Live-Dokument. null = lädt noch, Loaded(null) = existiert nicht. */
@Composable
fun <T : Any> rememberDoc(key: Any?, ref: () -> DocumentReference?, map: (DocumentSnapshot) -> T?): Loaded<T>? {
    var data by remember(key) { mutableStateOf<Loaded<T>?>(null) }
    DisposableEffect(key) {
        val r = ref()
        val reg = r?.addSnapshotListener { snap, err ->
            if (snap != null) data = Loaded(map(snap))
            else if (err != null) data = Loaded(null)
        }
        onDispose { reg?.remove() }
    }
    return data
}
