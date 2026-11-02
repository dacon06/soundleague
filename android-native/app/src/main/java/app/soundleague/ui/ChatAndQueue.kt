package app.soundleague.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Group
import app.soundleague.data.QueueItem
import app.soundleague.data.Rounds
import app.soundleague.data.Session
import app.soundleague.data.toMessage
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale

// ─── Gruppen-Chat ───

@Composable
fun ChatTab(groupId: String) {
    val uid = Session.uid ?: return
    val scope = rememberCoroutineScope()
    val messages = rememberQuery(groupId, {
        db.collection("groups").document(groupId).collection("messages")
            .orderBy("createdAt", Query.Direction.ASCENDING).limitToLast(100)
    }) { it.toMessage() }
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val timeFmt = remember { SimpleDateFormat("HH:mm", Locale.GERMANY) }

    LaunchedEffect(messages?.size) {
        val n = messages?.size ?: 0
        if (n > 0) listState.animateScrollToItem(n - 1)
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (messages == null) item { Loading() }
            else if (messages.isEmpty()) item {
                Dim("Noch keine Nachrichten — fang an zu chatten!", modifier = Modifier.fillMaxWidth().padding(24.dp), color = C.TextMuted)
            }
            else items(messages, key = { it.id }) { m ->
                val own = m.userId == uid
                val time = m.createdAt?.toDate()?.let { timeFmt.format(it) } ?: ""
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (own) Arrangement.End else Arrangement.Start,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    if (!own) {
                        Avatar(m.userId, m.userName, 28.dp)
                        HGap(8.dp)
                    }
                    Column(horizontalAlignment = if (own) Alignment.End else Alignment.Start, modifier = Modifier.widthIn(max = 280.dp)) {
                        if (!own) Text("${m.userName} · $time", fontSize = 11.sp, color = C.TextDim)
                        Text(
                            m.text,
                            modifier = Modifier
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (own) C.Accent else C.Surface2)
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            color = C.Text, fontSize = 14.sp,
                        )
                        if (own) Text(time, fontSize = 11.sp, color = C.TextDim)
                    }
                    if (own) {
                        HGap(8.dp)
                        Avatar(m.userId, m.userName, 28.dp)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().background(C.Surface).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = text,
                onValueChange = { if (it.length <= 500) text = it },
                placeholder = { Text("Nachricht schreiben…") },
                modifier = Modifier.weight(1f),
                colors = fieldColors(),
                maxLines = 4,
            )
            HGap(8.dp)
            RoundIconButton(
                onClick = {
                    val t = text.trim()
                    if (t.isNotEmpty() && !sending) {
                    sending = true
                    scope.launch {
                        try {
                            db.collection("groups").document(groupId).collection("messages").add(
                                hashMapOf(
                                    "text" to t,
                                    "userId" to uid,
                                    "userName" to Session.nameOrAnon,
                                    "createdAt" to FieldValue.serverTimestamp(),
                                )
                            ).await()
                            text = ""
                        } catch (_: Exception) {
                        } finally {
                            sending = false
                        }
                    }
                    }
                },
                background = if (text.isBlank()) C.Surface3 else C.Accent,
                size = 44.dp,
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Senden", tint = C.Text, modifier = Modifier.size(18.dp))
            }
        }
    }
}

// ─── Warteschlange bearbeiten ───

private fun parseImport(text: String): List<QueueItem> {
    val t = text.trim()
    if (t.startsWith("[")) {
        val arr = JSONArray(t)
        return (0 until arr.length()).mapNotNull { i ->
            when (val item = arr.get(i)) {
                is String -> QueueItem(item, "")
                is JSONObject -> QueueItem(
                    item.optString("name").ifEmpty { item.optString("kategorie") },
                    item.optString("description").ifEmpty { item.optString("beschreibung") },
                )
                else -> null
            }
        }.filter { it.name.isNotBlank() }
    }
    val quotes = Regex("^[\"']|[\"']$")
    return t.lines().map { it.trim() }.filter { it.isNotEmpty() }.map { line ->
        val sep = if (line.contains(';')) ';' else ','
        val parts = line.split(sep).map { it.trim().replace(quotes, "") }
        QueueItem(parts.getOrElse(0) { "" }, parts.getOrElse(1) { "" })
    }.filter { it.name.isNotBlank() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueEditorSheet(group: Group, onDismiss: () -> Unit, onStarted: (String) -> Unit) {
    val uid = Session.uid ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val items = remember { mutableStateListOf<QueueItem>().apply { addAll(group.categoryQueue) } }
    var newName by remember { mutableStateOf("") }
    var newDesc by remember { mutableStateOf("") }
    var insertAt by remember { mutableIntStateOf(-1) } // -1 = ans Ende
    var insertMenu by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmClear by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        error = null
        info = null
        try {
            val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
            val parsed = parseImport(text)
            items.addAll(parsed)
            info = "✓ ${parsed.size} Kategorien hinzugefügt"
        } catch (e: Exception) {
            error = "Fehler: ${e.localizedMessage}"
        }
    }

    fun addManual() {
        val name = newName.trim()
        if (name.isEmpty()) return
        val pos = if (insertAt < 0) items.size else insertAt.coerceIn(0, items.size)
        items.add(pos, QueueItem(name, newDesc.trim()))
        newName = ""
        newDesc = ""
        insertAt = -1
    }

    fun save() {
        saving = true
        scope.launch {
            try {
                val clean = items.filter { it.name.isNotBlank() }
                val currentRoundId = db.collection("groups").document(group.id).get().await().getString("currentRoundId")
                var autoStart = false
                if (clean.isNotEmpty()) {
                    autoStart = if (currentRoundId == null) true else {
                        val r = db.collection("rounds").document(currentRoundId).get().await()
                        !r.exists() || r.getString("status") == "results"
                    }
                }
                if (autoStart) {
                    val id = Rounds.createRound(group.id, clean.first(), uid, clean.drop(1))
                    onStarted(id)
                } else {
                    db.collection("groups").document(group.id).update("categoryQueue", clean.map { it.toMap() }).await()
                    onDismiss()
                }
            } catch (e: Exception) {
                error = "Fehler: ${e.localizedMessage}"
            } finally {
                saving = false
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = C.Surface,
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text("Warteschlange bearbeiten", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Gap(16.dp)

            // Manuell hinzufügen
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.Surface3)
                    .border(1.dp, C.Border2, RoundedCornerShape(10.dp)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SectionTitle("Thema manuell hinzufügen", Modifier.padding(0.dp))
                OutlinedTextField(newName, { newName = it }, placeholder = { Text("Thema (z.B. Guilty Pleasure)") }, singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(newDesc, { newDesc = it }, placeholder = { Text("Beschreibung (optional)") }, singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) {
                        GhostButton(
                            when {
                                insertAt < 0 -> "Ans Ende ▾"
                                insertAt == 0 -> "An den Anfang ▾"
                                else -> "Nach Position $insertAt ▾"
                            },
                            onClick = { insertMenu = true },
                        )
                        DropdownMenu(expanded = insertMenu, onDismissRequest = { insertMenu = false }) {
                            DropdownMenuItem(text = { Text("Ans Ende") }, onClick = { insertAt = -1; insertMenu = false })
                            DropdownMenuItem(text = { Text("An den Anfang") }, onClick = { insertAt = 0; insertMenu = false })
                            items.forEachIndexed { i, q ->
                                DropdownMenuItem(
                                    text = { Text("Nach Position ${i + 1} (${q.name})", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                    onClick = { insertAt = i + 1; insertMenu = false },
                                )
                            }
                        }
                    }
                    HGap(8.dp)
                    PrimaryButton("+ Hinzufügen", onClick = { addManual() }, enabled = newName.isNotBlank())
                }
            }
            Gap(12.dp)
            GhostButton(
                "📁 CSV oder JSON importieren",
                onClick = { picker.launch(arrayOf("text/*", "application/json", "application/octet-stream")) },
                modifier = Modifier.fillMaxWidth(),
            )
            Gap(10.dp)
            error?.let { ErrorBox(it) }
            info?.let { Text(it, color = C.Success, fontSize = 13.sp, modifier = Modifier.padding(bottom = 10.dp)) }

            if (items.isEmpty()) {
                Dim(
                    "Noch keine Kategorien — füge oben welche hinzu oder importiere eine Datei.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                )
            } else {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionTitle("${items.size} Kategorien · ~${items.size * 7} Tage", Modifier.weight(1f).padding(0.dp))
                    Text("Alle löschen", color = C.Danger, fontSize = 12.sp, modifier = Modifier.clickable { confirmClear = true }.padding(6.dp))
                }
                Gap(6.dp)
                items.forEachIndexed { i, item ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(8.dp)).background(C.Surface3)
                            .border(1.dp, C.Border2, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("${i + 1}", fontSize = 12.sp, color = C.TextMuted, modifier = Modifier.padding(end = 8.dp), textAlign = TextAlign.Center)
                        Column(Modifier.weight(1f)) {
                            Text(item.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (item.description.isNotEmpty()) Text(item.description, fontSize = 11.sp, color = C.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = { if (i > 0) { val x = items.removeAt(i); items.add(i - 1, x) } }, enabled = i > 0, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.KeyboardArrowUp, contentDescription = "Hoch", tint = if (i > 0) C.TextDim else C.TextMuted)
                        }
                        IconButton(onClick = { if (i < items.size - 1) { val x = items.removeAt(i); items.add(i + 1, x) } }, enabled = i < items.size - 1, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Runter", tint = if (i < items.size - 1) C.TextDim else C.TextMuted)
                        }
                        IconButton(onClick = { items.removeAt(i) }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Close, contentDescription = "Entfernen", tint = C.Danger)
                        }
                    }
                }
                Gap(16.dp)
                PrimaryButton(
                    if (saving) "…" else if (group.currentRoundId == null) "🚀 Speichern & erste Runde starten" else "Warteschlange speichern",
                    onClick = { save() },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (confirmClear) {
        ConfirmDialog(
            "Alle Kategorien entfernen?", "Die Liste wird geleert (erst beim Speichern übernommen).", "Alle löschen",
            onConfirm = { items.clear(); confirmClear = false }, onDismiss = { confirmClear = false }, danger = true,
        )
    }
}
