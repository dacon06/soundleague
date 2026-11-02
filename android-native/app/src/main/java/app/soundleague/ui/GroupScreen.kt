package app.soundleague.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Group
import app.soundleague.data.Round
import app.soundleague.data.Rounds
import app.soundleague.data.Session
import app.soundleague.data.toGroup
import app.soundleague.data.toRound
import app.soundleague.data.toSeason
import app.soundleague.data.toVote
import app.soundleague.push.PushTokens
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private data class Standing(val uid: String, val name: String, val points: Int)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupScreen(groupId: String, onBack: () -> Unit, openRound: (String) -> Unit) {
    val uid = Session.uid ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val groupState = rememberDoc(groupId, { db.collection("groups").document(groupId) }) { it.toGroup() }
    val rounds = rememberQuery(groupId, {
        db.collection("rounds").whereEqualTo("groupId", groupId).orderBy("createdAt", Query.Direction.DESCENDING)
    }) { it.toRound() } ?: emptyList()
    val seasons = (rememberQuery(groupId, { db.collection("seasons").whereEqualTo("groupId", groupId) }) { it.toSeason() } ?: emptyList())
        .sortedByDescending { it.seasonNumber }

    var tab by rememberSaveable { mutableIntStateOf(0) }
    var dialog by remember { mutableStateOf<String?>(null) } // invite | queue | delete1 | delete2 | leave
    var skipRound by remember { mutableStateOf<Round?>(null) }
    var deleteRound by remember { mutableStateOf<Round?>(null) }
    var kickUid by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    val progress = remember(groupId) { mutableStateMapOf<String, Pair<Int, Int>>() }
    var leaderboard by remember(groupId) { mutableStateOf<List<Standing>>(emptyList()) }
    var unread by remember { mutableIntStateOf(0) }

    val group = groupState?.value

    // Ungelesene Chat-Nachrichten zählen
    DisposableEffect(groupId, tab) {
        val prefs = context.getSharedPreferences("soundleague", Context.MODE_PRIVATE)
        val key = "chat_seen_$groupId"
        if (tab == 3) {
            prefs.edit().putLong(key, System.currentTimeMillis()).apply()
            unread = 0
            onDispose { prefs.edit().putLong(key, System.currentTimeMillis()).apply() }
        } else {
            val reg = db.collection("groups").document(groupId).collection("messages").addSnapshotListener { snap, _ ->
                val seen = prefs.getLong(key, 0L)
                unread = snap?.documents?.count {
                    (it.getTimestamp("createdAt")?.toDate()?.time ?: 0L) > seen && it.getString("userId") != uid
                } ?: 0
            }
            onDispose { reg.remove() }
        }
    }

    // Fortschritt laden + weiterschalten, sobald alle eingereicht / abgestimmt haben
    LaunchedEffect(rounds, group?.members?.size) {
        val g = group ?: return@LaunchedEffect
        rounds.filter { it.status == "submission" || it.status == "voting" }.forEach { r ->
            try {
                progress[r.id] = Rounds.checkRoundCompletion(r, g.members.size)
            } catch (_: Exception) {
            }
        }
    }

    // Bestenliste der laufenden Saison
    LaunchedEffect(rounds, group?.seasonNumber, group?.memberNames) {
        val g = group ?: return@LaunchedEffect
        val points = LinkedHashMap<String, Int>()
        try {
            rounds.filter { it.status == "results" && it.seasonNumber == g.seasonNumber }.forEach { r ->
                db.collection("votes").whereEqualTo("roundId", r.id).get().await().documents.map { it.toVote() }.forEach { v ->
                    points[v.submitterUserId] = (points[v.submitterUserId] ?: 0) + v.points
                }
            }
            leaderboard = points.map { (k, v) -> Standing(k, g.nameOf(k), v) }.sortedByDescending { it.points }
        } catch (_: Exception) {
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") }
            },
            title = { Text(group?.name ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            actions = {
                if (group != null) {
                    IconButton(onClick = { dialog = "invite" }) { Icon(Icons.Filled.Share, contentDescription = "Einladen") }
                    Box {
                        IconButton(onClick = { menuOpen = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Mehr") }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            if (group.createdBy == uid) {
                                DropdownMenuItem(text = { Text("🗑 Gruppe löschen", color = C.Danger) }, onClick = { menuOpen = false; dialog = "delete1" })
                            } else {
                                DropdownMenuItem(text = { Text("🚪 Gruppe verlassen", color = C.Danger) }, onClick = { menuOpen = false; dialog = "leave" })
                            }
                        }
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = C.Bg),
        )

        if (groupState == null) {
            Loading()
            return@Column
        }
        if (group == null) {
            EmptyState("🤷", "Gruppe nicht gefunden", "Vielleicht wurde sie gelöscht oder du bist nicht mehr Mitglied.")
            return@Column
        }

        val isAdmin = group.createdBy == uid
        val queueLength = group.categoryQueue.size
        val seasonDone = rounds.count { it.status == "results" && it.seasonNumber == group.seasonNumber }

        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp, containerColor = C.Bg, contentColor = C.Text) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("🎵 Runden") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("⏭ Queue${if (queueLength > 0) " ($queueLength)" else ""}") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("🏆 Saison") })
            Tab(selected = tab == 3, onClick = { tab = 3 }, text = {
                Text(
                    "💬 Chat${if (unread > 0 && tab != 3) " (${if (unread > 9) "9+" else unread})" else ""}",
                    color = if (unread > 0 && tab != 3) C.Danger else androidx.compose.ui.graphics.Color.Unspecified,
                )
            })
        }

        if (tab == 3) {
            ChatTab(groupId)
            return@Column
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { GroupHeader(group, uid, isAdmin, onKick = { kickUid = it }) }

            when (tab) {
                // ── Runden ──
                0 -> {
                    item {
                        Column {
                            PrimaryButton("⏭ Warteschlange bearbeiten", onClick = { dialog = "queue" }, modifier = Modifier.fillMaxWidth())
                            Gap(16.dp)
                            Row(Modifier.fillMaxWidth()) {
                                Dim("🏁 Saison ${group.seasonNumber}", size = 12.sp, modifier = Modifier.weight(1f))
                                Dim("${minOf(seasonDone, Rounds.SEASON_LENGTH)}/${Rounds.SEASON_LENGTH} Runden", size = 12.sp)
                            }
                            Gap(6.dp)
                            ProgressBar(seasonDone.toFloat() / Rounds.SEASON_LENGTH, C.Accent2)
                            if (queueLength > 0) {
                                Gap(12.dp)
                                Text(
                                    "⏭ $queueLength Kategorie${if (queueLength != 1) "n" else ""} in der Warteschlange",
                                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.AccentDim).padding(12.dp),
                                    color = C.Accent, fontSize = 13.sp,
                                )
                            }
                        }
                    }
                    if (rounds.isEmpty()) {
                        item {
                            EmptyState(
                                "🎶", "Noch keine Runden",
                                if (isAdmin) "Füge Kategorien zur Warteschlange hinzu — die erste Runde startet automatisch." else "Der Admin startet bald die erste Runde.",
                            )
                        }
                    }
                    val bySeason = rounds.groupBy { it.seasonNumber }.toList().sortedByDescending { it.first }
                    bySeason.forEach { (season, list) ->
                        if (season >= group.seasonNumber) {
                            items(list, key = { it.id }) { r ->
                                RoundCard(r, list.size - list.indexOf(r), isAdmin, progress[r.id], { openRound(r.id) }, { skipRound = r }, { deleteRound = r })
                            }
                        } else {
                            item(key = "season-$season") {
                                PastSeason(season, list, isAdmin, progress, openRound, { skipRound = it }, { deleteRound = it })
                            }
                        }
                    }
                }
                // ── Warteschlange ──
                1 -> {
                    item { PrimaryButton("⏭ Warteschlange bearbeiten", onClick = { dialog = "queue" }, modifier = Modifier.fillMaxWidth()) }
                    if (queueLength == 0) {
                        item { EmptyState("⏭", "Warteschlange leer", "Noch keine Kategorien — füge welche hinzu oder importiere eine CSV- oder JSON-Datei.") }
                    } else {
                        item {
                            Card {
                                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                    Text("Nächste Runden", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    Dim("~${queueLength * 7} Tage gesamt", size = 12.sp)
                                }
                                group.categoryQueue.forEachIndexed { i, q ->
                                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text("${i + 1}", fontSize = 18.sp, color = C.TextMuted, modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
                                        Column(Modifier.weight(1f)) {
                                            Text(q.name, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                            if (q.description.isNotEmpty()) Dim(q.description, size = 12.sp, italic = true)
                                        }
                                    }
                                    if (i < queueLength - 1) HorizontalDivider(color = C.Border)
                                }
                            }
                        }
                    }
                }
                // ── Saison & Champions ──
                2 -> {
                    item {
                        Card {
                            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                                Text("Saison ${group.seasonNumber}", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Dim("${minOf(seasonDone, Rounds.SEASON_LENGTH)}/${Rounds.SEASON_LENGTH} Runden", size = 12.sp)
                            }
                            if (leaderboard.isEmpty()) {
                                Dim("In dieser Saison gibt es noch keine abgeschlossenen Runden.")
                            } else {
                                leaderboard.forEachIndexed { i, e ->
                                    RowCentered(Modifier.fillMaxWidth().padding(vertical = 8.dp), gap = 12.dp) {
                                        Text(medal(i), fontSize = 18.sp, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center)
                                        Avatar(e.uid, e.name, 36.dp)
                                        Text(
                                            "${e.name}${if (e.uid == uid) " (Du)" else ""}",
                                            fontSize = 14.sp,
                                            fontWeight = if (e.uid == uid) FontWeight.Bold else FontWeight.Normal,
                                            modifier = Modifier.weight(1f),
                                        )
                                        Text("${e.points} pts", fontSize = 18.sp, color = C.Accent, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }
                    item { Text("👑 Champions", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp)) }
                    if (seasons.isEmpty()) {
                        item { Card { Dim("Noch keine abgeschlossene Saison. Nach ${Rounds.SEASON_LENGTH} Runden wird hier der erste Champion gekürt.") } }
                    } else {
                        items(seasons, key = { it.id }) { SeasonCard(it) }
                    }
                }
            }
            item { Gap(24.dp) }
        }
    }

    // ─── Dialoge ───
    val g = group ?: return
    when (dialog) {
        "invite" -> InviteDialog(g.inviteCode) { dialog = null }
        "queue" -> QueueEditorSheet(
            group = g,
            onDismiss = { dialog = null },
            onStarted = { dialog = null; openRound(it) },
        )
        "delete1" -> ConfirmDialog(
            "Gruppe löschen?",
            "Alle Runden, Songs und Abstimmungen werden unwiderruflich gelöscht.",
            "Weiter", onConfirm = { dialog = "delete2" }, onDismiss = { dialog = null }, danger = true,
        )
        "delete2" -> ConfirmDialog(
            "Bist du sicher?",
            "Das kann nicht rückgängig gemacht werden.",
            "Endgültig löschen",
            onConfirm = {
                dialog = null
                scope.launch {
                    try {
                        deleteGroup(groupId)
                        onBack()
                    } catch (e: Exception) {
                        errorMsg = "Fehler beim Löschen: ${e.localizedMessage}"
                    }
                }
            },
            onDismiss = { dialog = null }, danger = true,
        )
        "leave" -> ConfirmDialog(
            "Gruppe verlassen?", "Du kannst später mit dem Einladungscode wieder beitreten.", "Verlassen",
            onConfirm = {
                dialog = null
                scope.launch {
                    try {
                        db.collection("groups").document(groupId).update(
                            mapOf("members" to FieldValue.arrayRemove(uid), "memberNames.$uid" to FieldValue.delete())
                        ).await()
                        onBack()
                    } catch (e: Exception) {
                        errorMsg = "Fehler: ${e.localizedMessage}"
                    }
                }
            },
            onDismiss = { dialog = null }, danger = true,
        )
    }

    skipRound?.let { r ->
        val sub = r.status == "submission"
        ConfirmDialog(
            title = if (sub) "⏭ Einreichung überspringen?" else "⏭ Abstimmung beenden?",
            text = if (sub) "Die Einreichungsphase wird sofort beendet und die Abstimmung beginnt. Songs, die noch nicht eingereicht wurden, können nicht mehr nachgereicht werden."
            else "Die Abstimmung wird sofort beendet und die Ergebnisse werden veröffentlicht. Nicht abgegebene Stimmen gehen verloren.",
            confirm = if (sub) "Ja, überspringen" else "Ja, beenden",
            onConfirm = {
                skipRound = null
                scope.launch {
                    try {
                        if (r.status == "submission") Rounds.advanceToVoting(r) else if (r.status == "voting") Rounds.finishRound(r)
                    } catch (e: Exception) {
                        errorMsg = "Fehler: ${e.localizedMessage}"
                    }
                }
            },
            onDismiss = { skipRound = null }, danger = true,
        )
    }

    deleteRound?.let { r ->
        ConfirmDialog(
            "Runde löschen?", "Diese Runde und alle Songs & Abstimmungen dazu werden gelöscht.", "Löschen",
            onConfirm = {
                deleteRound = null
                scope.launch {
                    try {
                        val batch = db.batch()
                        db.collection("submissions").whereEqualTo("roundId", r.id).get().await().documents.forEach { batch.delete(it.reference) }
                        db.collection("votes").whereEqualTo("roundId", r.id).get().await().documents.forEach { batch.delete(it.reference) }
                        batch.delete(db.collection("rounds").document(r.id))
                        batch.commit().await()
                    } catch (e: Exception) {
                        errorMsg = "Fehler: ${e.localizedMessage}"
                    }
                }
            },
            onDismiss = { deleteRound = null }, danger = true,
        )
    }

    kickUid?.let { k ->
        ConfirmDialog(
            "Mitglied entfernen?", "${g.nameOf(k)} wirklich aus der Gruppe entfernen?", "Entfernen",
            onConfirm = {
                kickUid = null
                scope.launch {
                    try {
                        db.collection("groups").document(groupId).update(
                            mapOf("members" to FieldValue.arrayRemove(k), "memberNames.$k" to FieldValue.delete())
                        ).await()
                    } catch (e: Exception) {
                        errorMsg = "Fehler beim Entfernen: ${e.localizedMessage}"
                    }
                }
            },
            onDismiss = { kickUid = null }, danger = true,
        )
    }

    errorMsg?.let { msg ->
        AlertDialog(
            onDismissRequest = { errorMsg = null },
            containerColor = C.Surface,
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { errorMsg = null }) { Text("OK", color = C.Accent) } },
        )
    }
}

private suspend fun deleteGroup(groupId: String) {
    val batch = db.batch()
    db.collection("rounds").whereEqualTo("groupId", groupId).get().await().documents.forEach { r ->
        db.collection("submissions").whereEqualTo("roundId", r.id).get().await().documents.forEach { batch.delete(it.reference) }
        db.collection("votes").whereEqualTo("roundId", r.id).get().await().documents.forEach { batch.delete(it.reference) }
        batch.delete(r.reference)
    }
    db.collection("seasons").whereEqualTo("groupId", groupId).get().await().documents.forEach { batch.delete(it.reference) }
    db.collection("groups").document(groupId).collection("messages").get().await().documents.forEach { batch.delete(it.reference) }
    batch.delete(db.collection("groups").document(groupId))
    batch.commit().await()
}

@Composable
private fun GroupHeader(group: Group, uid: String, isAdmin: Boolean, onKick: (String) -> Unit) {
    Column {
        if (group.description.isNotEmpty()) {
            Dim(group.description)
            Gap(12.dp)
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            group.members.forEach { m ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(52.dp)) {
                    Avatar(m, group.nameOf(m), 44.dp)
                    Gap(4.dp)
                    Text(
                        if (m == uid) "Du" else group.nameOf(m).split(" ").first(),
                        fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = if (m == uid) C.Accent else C.TextDim,
                    )
                    if (isAdmin && m != uid) {
                        Text("entfernen", fontSize = 9.sp, color = C.TextMuted, modifier = Modifier.clickable { onKick(m) }.padding(2.dp))
                    }
                }
            }
        }
        Gap(4.dp)
        Dim("${group.votesPerMember} Stimmen/Runde", size = 12.sp, color = C.TextMuted)
        Gap(12.dp)
        NotificationBanner()
    }
}

@Composable
private fun RoundCard(
    round: Round,
    number: Int,
    isAdmin: Boolean,
    progress: Pair<Int, Int>?,
    onOpen: () -> Unit,
    onSkip: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(onClick = onOpen) {
        Row {
            Column(Modifier.weight(1f)) {
                RowCentered {
                    Text("RUNDE $number", fontSize = 11.sp, color = C.TextMuted)
                    StatusBadge(round.status, dot = true)
                }
                Gap(6.dp)
                Text(round.prompt, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                if (round.description.isNotEmpty()) {
                    Gap(4.dp)
                    Dim(round.description, italic = true)
                }
                val p = progress?.takeIf { it.second > 0 }
                if (round.status == "submission") {
                    Gap(6.dp)
                    Dim("Einreichung · ${Rounds.formatRunning(round)}${if (p != null) " · ${p.first}/${p.second} eingereicht" else ""}", size = 12.sp)
                }
                if (round.status == "voting") {
                    Gap(6.dp)
                    Dim("Abstimmung · ${Rounds.formatRunning(round)}${if (p != null) " · ${p.first}/${p.second} abgestimmt" else ""}", size = 12.sp, color = C.Accent2)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = C.TextMuted)
                if (isAdmin && round.status != "results") {
                    Gap(4.dp)
                    Text(
                        "⏭ Skip", fontSize = 11.sp, color = C.TextDim,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, C.Border, RoundedCornerShape(8.dp))
                            .clickable(onClick = onSkip).padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                if (isAdmin && round.status == "results") {
                    Text("🗑", fontSize = 16.sp, modifier = Modifier.clickable(onClick = onDelete).padding(4.dp))
                }
            }
        }
        if (round.status != "results") {
            Gap(12.dp)
            ProgressBar(if (round.status == "submission") 0.33f else 0.66f, if (round.status == "voting") C.Accent2 else C.Accent)
            Gap(6.dp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Einreichung", fontSize = 10.sp, color = if (round.status == "submission") C.Accent else C.TextMuted)
                Text("Abstimmung", fontSize = 10.sp, color = if (round.status == "voting") C.Accent2 else C.TextMuted)
                Text("Ergebnisse", fontSize = 10.sp, color = C.TextMuted)
            }
        }
    }
}

@Composable
private fun PastSeason(
    season: Int,
    list: List<Round>,
    isAdmin: Boolean,
    progress: Map<String, Pair<Int, Int>>,
    openRound: (String) -> Unit,
    onSkip: (Round) -> Unit,
    onDelete: (Round) -> Unit,
) {
    // Vergangene Saisons sind eingeklappt, außer dort läuft noch eine Runde
    var open by rememberSaveable(season) { mutableStateOf(list.any { it.status != "results" }) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, C.Border2, RoundedCornerShape(10.dp)).padding(12.dp)
    ) {
        Row(Modifier.fillMaxWidth().clickable { open = !open }, verticalAlignment = Alignment.CenterVertically) {
            Text("🏁 Saison $season", fontSize = 13.sp, color = C.TextDim, modifier = Modifier.weight(1f))
            Dim("${list.size} Runde${if (list.size != 1) "n" else ""}", size = 12.sp, color = C.TextMuted)
            Icon(
                if (open) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null, tint = C.TextMuted,
            )
        }
        if (open) {
            list.forEachIndexed { i, r ->
                Gap(12.dp)
                RoundCard(r, list.size - i, isAdmin, progress[r.id], { openRound(r.id) }, { onSkip(r) }, { onDelete(r) })
            }
        }
    }
}

@Composable
private fun InviteDialog(code: String, onDismiss: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Surface,
        title = { Text("Einladen") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Dim("Teile diesen Code mit Freunden.")
                Gap(16.dp)
                Text(
                    code,
                    fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = 6.sp, color = C.Accent,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(C.AccentDim)
                        .clickable { clipboard.setText(AnnotatedString(code)); copied = true }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                )
                Gap(8.dp)
                Dim(if (copied) "✓ Kopiert!" else "Tippen zum Kopieren", size = 12.sp)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, "Komm in meine Soundleague-Gruppe! Einladungscode: $code")
                context.startActivity(Intent.createChooser(send, "Einladen"))
            }) { Text("Teilen", color = C.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Schließen", color = C.TextDim) } },
    )
}

@Composable
private fun NotificationBanner() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var granted by remember { mutableStateOf(PushTokens.hasPermission(context)) }
    var denied by remember { mutableStateOf(false) }
    var success by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        denied = !ok
        if (ok) {
            success = true
            scope.launch { PushTokens.refresh(context) }
        }
    }

    if (granted && !success) return
    val shape = RoundedCornerShape(10.dp)
    when {
        success -> Text(
            "✓ Benachrichtigungen aktiviert!",
            modifier = Modifier.fillMaxWidth().clip(shape).background(C.Success.copy(alpha = 0.1f)).padding(12.dp),
            color = C.Success, fontSize = 13.sp,
        )
        denied -> Row(
            Modifier.fillMaxWidth().clip(shape).background(C.Danger.copy(alpha = 0.08f)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Dim("🔕 Benachrichtigungen blockiert", size = 12.sp, modifier = Modifier.weight(1f))
            GhostButton("Einstellungen", onClick = {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                try { context.startActivity(intent) } catch (_: Exception) { }
            })
        }
        else -> Row(
            Modifier.fillMaxWidth().clip(shape).background(C.Surface2).border(1.dp, C.Border2, shape).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("🔔 Benachrichtigungen aktivieren", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Dim("Neue Runde, Start der Abstimmung & Erinnerungen", size = 12.sp)
            }
            PrimaryButton("Aktivieren", onClick = {
                if (Build.VERSION.SDK_INT >= 33) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            })
        }
    }
}

@Suppress("unused")
private val italic = FontStyle.Italic
