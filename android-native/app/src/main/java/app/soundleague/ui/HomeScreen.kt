package app.soundleague.ui

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Emojis
import app.soundleague.data.Session
import app.soundleague.data.toGroup
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private fun inviteCode(): String {
    val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return (1..6).map { chars.random() }.joinToString("")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(openGroup: (String) -> Unit) {
    val uid = Session.uid ?: return
    var dialog by remember { mutableStateOf<String?>(null) } // create | join | emoji | logout

    val groups = rememberQuery(uid, { db.collection("groups").whereArrayContains("members", uid) }) { it.toGroup() }
    val statuses = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(groups) {
        groups?.forEach { g ->
            val rid = g.currentRoundId ?: return@forEach
            try {
                db.collection("rounds").document(rid).get().await().getString("status")?.let { statuses[g.id] = it }
            } catch (_: Exception) {
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("SoundLeague", fontWeight = FontWeight.SemiBold) },
            actions = {
                Box(Modifier.clip(RoundedCornerShape(50)).clickable { dialog = "emoji" }.padding(6.dp)) {
                    Avatar(uid, Session.displayName, 30.dp)
                }
                IconButton(onClick = { dialog = "logout" }) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Abmelden", tint = C.TextDim)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = C.Bg),
        )

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Column {
                Text("Hey, ${Session.displayName.split(" ").first().ifEmpty { "Musikfan" }} 👋", fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
                Dim("Deine Gruppen & Runden")
                Gap(16.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BigAction("+", "Gruppe erstellen", C.Accent, Modifier.weight(1f)) { dialog = "create" }
                    BigAction("⊞", "Beitreten", C.Surface2, Modifier.weight(1f)) { dialog = "join" }
                }
                Gap(16.dp)
                SectionTitle("Deine Gruppen")
            } }
            when {
                groups == null -> item { Loading() }
                groups.isEmpty() -> item {
                    EmptyState("🎵", "Noch keine Gruppen", "Erstelle eine Gruppe oder tritt einer bei, um loszulegen.")
                }
                else -> items(groups, key = { it.id }) { g ->
                    Card(onClick = { openGroup(g.id) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                RowCentered {
                                    Text(g.name, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                                    val st = statuses[g.id]
                                    if (st != null) StatusBadge(st)
                                    if (g.currentRoundId == null) Badge("Keine Runde", BadgeKind.Dim)
                                }
                                if (g.description.isNotEmpty()) {
                                    Gap(4.dp)
                                    Dim(g.description)
                                }
                                Gap(8.dp)
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    g.members.take(8).forEach { m -> Avatar(m, g.nameOf(m), 24.dp) }
                                    if (g.members.size > 8) Dim("+${g.members.size - 8}", size = 11.sp)
                                }
                                Gap(4.dp)
                                Dim(
                                    "${g.members.size} ${if (g.members.size == 1) "Mitglied" else "Mitglieder"} · ${g.votesPerMember} Stimmen/Runde",
                                    size = 12.sp, color = C.TextMuted,
                                )
                            }
                            Icon(Icons.Filled.KeyboardArrowRight, contentDescription = null, tint = C.TextMuted)
                        }
                    }
                }
            }
            item { Gap(24.dp) }
        }
    }

    when (dialog) {
        "create" -> CreateGroupDialog(onDismiss = { dialog = null }, onCreated = { dialog = null; openGroup(it) })
        "join" -> JoinGroupDialog(onDismiss = { dialog = null }, onJoined = { dialog = null; openGroup(it) })
        "emoji" -> EmojiPickerDialog(
            current = Emojis.cache[uid],
            onSelect = { Emojis.setMine(uid, it); dialog = null },
            onDismiss = { dialog = null },
        )
        "logout" -> ConfirmDialog(
            title = "Abmelden?",
            text = "Du kannst dich jederzeit wieder anmelden.",
            confirm = "Abmelden",
            onConfirm = { dialog = null; Session.logout() },
            onDismiss = { dialog = null },
        )
    }
}

@Composable
private fun BigAction(icon: String, label: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .height(72.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(color)
            .border(1.dp, if (color == C.Accent) color else C.Border2, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(icon, fontSize = 20.sp, color = C.Text)
        Text(label, fontSize = 12.sp, color = C.Text)
    }
}

@Composable
private fun CreateGroupDialog(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    val uid = Session.uid ?: return
    var name by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var votes by remember { mutableIntStateOf(3) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Surface,
        title = { Text("Neue Gruppe") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (error.isNotEmpty()) ErrorBox(error)
                OutlinedTextField(name, { name = it }, label = { Text("Gruppenname") }, placeholder = { Text("z.B. Die Musiknerds") }, singleLine = true, colors = fieldColors())
                OutlinedTextField(desc, { desc = it }, label = { Text("Beschreibung (optional)") }, placeholder = { Text("Worum geht's hier?") }, singleLine = true, colors = fieldColors())
                Dim("Stimmen pro Person pro Runde", size = 12.sp)
                RowCentered(gap = 12.dp) {
                    GhostButton("−", onClick = { if (votes > 1) votes-- })
                    Text("$votes ${if (votes == 1) "Stimme" else "Stimmen"}", fontSize = 16.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    GhostButton("+", onClick = { if (votes < 10) votes++ })
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !loading && name.isNotBlank(),
                onClick = {
                    loading = true
                    scope.launch {
                        try {
                            val ref = db.collection("groups").document()
                            ref.set(
                                hashMapOf(
                                    "name" to name.trim(),
                                    "description" to desc.trim(),
                                    "createdBy" to uid,
                                    "members" to listOf(uid),
                                    "memberNames" to mapOf(uid to Session.nameOrAnon),
                                    "inviteCode" to inviteCode(),
                                    "votesPerMember" to votes,
                                    "currentRoundId" to null,
                                    "createdAt" to FieldValue.serverTimestamp(),
                                )
                            ).await()
                            onCreated(ref.id)
                        } catch (e: Exception) {
                            error = e.localizedMessage ?: "Fehler"
                        } finally {
                            loading = false
                        }
                    }
                },
            ) { Text(if (loading) "…" else "Gruppe erstellen", color = C.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen", color = C.TextDim) } },
    )
}

@Composable
private fun JoinGroupDialog(onDismiss: () -> Unit, onJoined: (String) -> Unit) {
    val uid = Session.uid ?: return
    var code by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Surface,
        title = { Text("Gruppe beitreten") },
        text = {
            Column {
                if (error.isNotEmpty()) ErrorBox(error)
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(6) },
                    label = { Text("Einladungscode") },
                    placeholder = { Text("z.B. ABC123") },
                    singleLine = true,
                    colors = fieldColors(),
                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 20.sp, letterSpacing = 3.sp, textAlign = TextAlign.Center, color = C.Text),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !loading && code.length == 6,
                onClick = {
                    loading = true
                    error = ""
                    scope.launch {
                        try {
                            val snap = db.collection("groups").whereEqualTo("inviteCode", code).get().await()
                            val doc = snap.documents.firstOrNull()
                            if (doc == null) {
                                error = "Ungültiger Einladungscode."
                            } else {
                                val members = (doc.get("members") as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
                                if (!members.contains(uid)) {
                                    db.collection("groups").document(doc.id).update(
                                        mapOf(
                                            "members" to FieldValue.arrayUnion(uid),
                                            "memberNames.$uid" to Session.nameOrAnon,
                                        )
                                    ).await()
                                }
                                onJoined(doc.id)
                            }
                        } catch (e: Exception) {
                            error = e.localizedMessage ?: "Fehler"
                        } finally {
                            loading = false
                        }
                    }
                },
            ) { Text(if (loading) "…" else "Beitreten", color = C.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen", color = C.TextDim) } },
    )
}

@Composable
fun EmojiPickerDialog(current: String?, onSelect: (String) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Surface,
        title = { Text("Dein Emoji wählen") },
        text = {
            Column {
                Dim("Dein Emoji erscheint überall, wo du in der App sichtbar bist.")
                Gap(12.dp)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(6),
                    modifier = Modifier.heightIn(max = 340.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(Emojis.all) { e ->
                        Box(
                            Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (e == current) C.AccentDim else C.Surface2)
                                .border(2.dp, if (e == current) C.Accent else C.Border, RoundedCornerShape(10.dp))
                                .clickable { onSelect(e) },
                            contentAlignment = Alignment.Center,
                        ) { Text(e, fontSize = 22.sp) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Schließen", color = C.TextDim) } },
    )
}
