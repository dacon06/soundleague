package app.soundleague.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Group
import app.soundleague.data.Round
import app.soundleague.data.Rounds
import app.soundleague.data.Season
import app.soundleague.data.Session
import app.soundleague.data.Song
import app.soundleague.data.Submission
import app.soundleague.data.Vote
import app.soundleague.data.YouTube
import app.soundleague.data.toGroup
import app.soundleague.data.toRound
import app.soundleague.data.toSeason
import app.soundleague.data.toSubmission
import app.soundleague.data.toVote
import app.soundleague.player.Player
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoundScreen(groupId: String, roundId: String, onBack: () -> Unit) {
    val roundState = rememberDoc(roundId, { db.collection("rounds").document(roundId) }) { it.toRound() }
    val groupState = rememberDoc(groupId, { db.collection("groups").document(groupId) }) { it.toGroup() }
    val round = roundState?.value
    val group = groupState?.value

    // Falls beim Öffnen schon alle eingereicht/abgestimmt haben → weiterschalten
    LaunchedEffect(round?.id, round?.status, group?.members?.size) { Rounds.maybeAdvance(round, group) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            title = { Text(group?.name ?: "Runde", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = C.Bg),
        )
        when {
            roundState == null -> Loading()
            round == null -> EmptyState("🤷", "Runde nicht gefunden", "Vielleicht wurde sie gelöscht.")
            else -> {
                val header: @Composable () -> Unit = { RoundHeader(round) }
                when (round.status) {
                    "submission" -> SubmissionPhase(round, group, header)
                    "voting" -> VotingPhase(round, group, header)
                    else -> ResultsPhase(round, group, header)
                }
            }
        }
    }
}

@Composable
private fun RoundHeader(round: Round) {
    Column(Modifier.padding(bottom = 8.dp)) {
        RowCentered {
            when (round.status) {
                "submission" -> Badge("Einreichung läuft", BadgeKind.Green)
                "voting" -> Badge("Abstimmung läuft", BadgeKind.Amber)
                else -> Badge("Runde beendet", BadgeKind.Dim)
            }
            if (round.status != "results") Dim(Rounds.formatRunning(round), size = 11.sp, color = C.TextMuted)
        }
        Gap(8.dp)
        Text(round.prompt, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, lineHeight = 34.sp)
        if (round.description.isNotEmpty()) {
            Gap(8.dp)
            Dim(round.description, size = 15.sp, italic = true)
        }
    }
}

// ─── Alle Songs auf YouTube / Links kopieren ───
@Composable
private fun PlaylistButtons(submissions: List<Submission>) {
    if (submissions.isEmpty()) return
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    val url = YouTube.playlistUrl(submissions.map { it.videoId }.filter { it.isNotEmpty() })
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (url != null) {
            PrimaryButton(
                "▶ Alle auf YouTube",
                onClick = {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: Exception) {
                    }
                },
                color = C.YouTubeRed,
                modifier = Modifier.weight(2f),
            )
        }
        GhostButton(
            if (copied) "✓ Kopiert" else "📋 Links",
            onClick = {
                val text = submissions.joinToString("\n\n") { "${it.songTitle} - ${it.channelTitle}\nhttps://youtube.com/watch?v=${it.videoId}" }
                clipboard.setText(AnnotatedString(text))
                copied = true
            },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SongInfo(title: String, channel: String, thumbnail: String = "") {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (thumbnail.isNotEmpty()) {
            Thumbnail(thumbnail)
            HGap(12.dp)
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Dim(channel, size = 12.sp)
        }
    }
}

// ─── Einreichung ───
@Composable
private fun SubmissionPhase(round: Round, group: Group?, header: @Composable () -> Unit) {
    val uid = Session.uid ?: return
    val scope = rememberCoroutineScope()
    val subs = rememberQuery(round.id, { db.collection("submissions").whereEqualTo("roundId", round.id) }) { it.toSubmission() }
    val mine = subs?.find { it.userId == uid }

    var comment by remember(round.id) { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var editingComment by remember { mutableStateOf(false) }
    var pendingSong by remember { mutableStateOf<Song?>(null) }
    var showPrompt by remember { mutableStateOf(false) }
    var promptShown by remember(round.id) { mutableStateOf(false) } // die Rückfrage kommt nur einmal
    var error by remember { mutableStateOf<String?>(null) }
    var focusTick by remember { mutableIntStateOf(0) }
    val commentFocus = remember { FocusRequester() }

    LaunchedEffect(mine?.id, mine?.submissionComment) { if (mine != null) comment = mine.submissionComment }
    LaunchedEffect(focusTick) {
        if (focusTick > 0) {
            delay(150)
            try { commentFocus.requestFocus() } catch (_: Exception) { }
        }
    }

    fun submitSong(song: Song) {
        pendingSong = null
        submitting = true
        scope.launch {
            try {
                if (mine != null) db.collection("submissions").document(mine.id).delete().await()
                db.collection("submissions").add(
                    hashMapOf(
                        "roundId" to round.id,
                        "groupId" to round.groupId,
                        "userId" to uid,
                        "userName" to Session.nameOrAnon,
                        "videoId" to song.id,
                        "songTitle" to song.title,
                        "channelTitle" to song.channelTitle,
                        "thumbnail" to song.thumbnail,
                        "videoUrl" to song.videoUrl,
                        "submissionComment" to comment,
                        "createdAt" to FieldValue.serverTimestamp(),
                    )
                ).await()
                // Alle eingereicht? → automatisch zur Abstimmung
                Rounds.maybeAdvance(round, group)
            } catch (e: Exception) {
                error = "Fehler: ${e.localizedMessage}"
            } finally {
                submitting = false
            }
        }
    }

    fun handleSelect(song: Song) {
        showSearch = false
        if (pendingSong != null) { pendingSong = song; return }
        // Erste Abgabe ohne Kommentar → einmalig nachfragen
        if (mine == null && comment.isBlank() && !promptShown) {
            promptShown = true
            pendingSong = song
            showPrompt = true
            return
        }
        submitSong(song)
    }

    val total = group?.members?.size ?: 0
    val count = subs?.size ?: 0

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { header() }
        error?.let { e -> item { ErrorBox(e) } }
        item {
            Card(background = C.AccentDim, border = C.Accent.copy(alpha = 0.25f)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Eingereichte Songs", fontSize = 13.sp, color = C.Accent, modifier = Modifier.weight(1f))
                    Text("$count/$total", fontSize = 20.sp, color = C.Accent)
                }
                Gap(8.dp)
                ProgressBar(if (total > 0) count.toFloat() / total else 0f)
                Gap(8.dp)
                Dim("Songs bleiben bis zur Abstimmung anonym. Die Abstimmung startet automatisch, sobald alle eingereicht haben.", size = 11.sp, color = C.TextMuted)
            }
        }
        item {
            if (subs == null) {
                Loading()
            } else if (mine != null) {
                Card {
                    SectionTitle("Dein Song")
                    SongInfo(mine.songTitle, mine.channelTitle, mine.thumbnail)
                    Gap(10.dp)
                    SongPlayer(mine.videoId, mine.songTitle)
                    Gap(12.dp)
                    Dim("DEIN KOMMENTAR (OPTIONAL)", size = 11.sp)
                    Gap(6.dp)
                    if (editingComment) {
                        OutlinedTextField(
                            comment, { comment = it },
                            placeholder = { Text("Warum hast du diesen Song gewählt?") },
                            colors = fieldColors(), minLines = 3, modifier = Modifier.fillMaxWidth(),
                        )
                        Gap(8.dp)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PrimaryButton("Speichern", onClick = {
                                scope.launch {
                                    try {
                                        db.collection("submissions").document(mine.id).update("submissionComment", comment).await()
                                        editingComment = false
                                    } catch (e: Exception) {
                                        error = "Fehler: ${e.localizedMessage}"
                                    }
                                }
                            })
                            GhostButton("Abbrechen", onClick = { comment = mine.submissionComment; editingComment = false })
                        }
                    } else {
                        Text(
                            mine.submissionComment.ifEmpty { "Kommentar hinzufügen… ✏️" },
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.Surface2)
                                .border(1.dp, C.Border, RoundedCornerShape(10.dp)).clickable { editingComment = true }.padding(12.dp),
                            fontSize = 13.sp,
                            color = if (mine.submissionComment.isNotEmpty()) C.Text else C.TextMuted,
                        )
                    }
                    Gap(12.dp)
                    GhostButton("Song ändern", onClick = { showSearch = true }, enabled = !submitting)
                }
            } else {
                Card {
                    OutlinedTextField(
                        comment, { comment = it },
                        label = { Text("Kommentar zu deinem Song (optional)") },
                        placeholder = { Text("Warum wählst du diesen Song?") },
                        colors = fieldColors(), minLines = 2,
                        modifier = Modifier.fillMaxWidth().focusRequester(commentFocus),
                    )
                    Gap(16.dp)
                    val p = pendingSong
                    if (p != null) {
                        SectionTitle("Ausgewählter Song")
                        SongInfo(p.title, p.channelTitle, p.thumbnail)
                        Gap(14.dp)
                        PrimaryButton(if (submitting) "…" else "✓ Song einreichen", onClick = { submitSong(p) }, enabled = !submitting, modifier = Modifier.fillMaxWidth())
                        Gap(8.dp)
                        GhostButton("Anderen Song wählen", onClick = { showSearch = true }, enabled = !submitting)
                    } else {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("🎵", fontSize = 40.sp)
                            Gap(8.dp)
                            Text("Reiche deinen Song ein", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                            Gap(6.dp)
                            Dim("Kategorie: „${round.prompt}\"", modifier = Modifier.fillMaxWidth())
                            Gap(16.dp)
                            PrimaryButton(if (submitting) "…" else "🔍 Song suchen", onClick = { showSearch = true }, enabled = !submitting)
                        }
                    }
                }
            }
        }
        item {
            Card {
                SectionTitle("Mitglieder")
                group?.let { g ->
                    g.members.forEach { m ->
                        val done = subs?.any { it.userId == m } == true
                        RowCentered(Modifier.fillMaxWidth().padding(vertical = 8.dp), gap = 10.dp) {
                            Avatar(m, g.nameOf(m), 32.dp)
                            Text("${g.nameOf(m)}${if (m == uid) " (Du)" else ""}", fontSize = 14.sp, modifier = Modifier.weight(1f))
                            if (done) Badge("✓", BadgeKind.Green) else Badge("Ausstehend", BadgeKind.Dim)
                        }
                        HorizontalDivider(color = C.Border)
                    }
                }
            }
        }
        item { Gap(16.dp) }
    }

    if (showSearch) SongSearchSheet(round.groupId, onSelect = { handleSelect(it) }, onDismiss = { showSearch = false })

    if (showPrompt) {
        ConfirmDialog(
            title = "Ohne Kommentar einreichen?",
            text = "Du hast noch keinen Kommentar zu deinem Song geschrieben. Ein kurzer Satz, warum du ihn gewählt hast, macht die Auswertung deutlich spannender.",
            confirm = "Ohne Kommentar einreichen",
            onConfirm = { showPrompt = false; pendingSong?.let { submitSong(it) } },
            dismiss = "✏️ Kommentar schreiben",
            onDismiss = { showPrompt = false; focusTick++ },
        )
    }
}

// ─── Abstimmung ───
@Composable
private fun VotingPhase(round: Round, group: Group?, header: @Composable () -> Unit) {
    val uid = Session.uid ?: return
    val scope = rememberCoroutineScope()
    val subs = rememberQuery(round.id, { db.collection("submissions").whereEqualTo("roundId", round.id) }) { it.toSubmission() }
    val voters = rememberQuery(round.id, { db.collection("votes").whereEqualTo("roundId", round.id) }) { it.getString("voterId") }
    val voterCount = voters?.toSet()?.size ?: 0

    val myVotes = remember(round.id) { mutableStateMapOf<String, Int>() }
    val myComments = remember(round.id) { mutableStateMapOf<String, String>() }
    var existing by remember(round.id) { mutableStateOf<List<Vote>>(emptyList()) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var showPrompt by remember { mutableStateOf(false) }
    var promptShown by remember(round.id) { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var focusTick by remember { mutableIntStateOf(0) }
    val firstCommentFocus = remember { FocusRequester() }

    suspend fun loadMine() {
        val votes = db.collection("votes").whereEqualTo("roundId", round.id).whereEqualTo("voterId", uid).get().await()
            .documents.map { it.toVote() }
        existing = votes
        myVotes.clear()
        myComments.clear()
        votes.forEach { v ->
            if (v.points > 0) myVotes[v.submissionId] = v.points
            myComments[v.submissionId] = v.comment
        }
    }

    LaunchedEffect(round.id) {
        try { loadMine() } catch (_: Exception) { }
    }
    LaunchedEffect(focusTick) {
        if (focusTick > 0) {
            delay(150)
            try { firstCommentFocus.requestFocus() } catch (_: Exception) { }
        }
    }

    val totalMembers = group?.members?.size ?: 0
    val totalVotes = group?.votesPerMember ?: 3
    val used = myVotes.values.sum()
    val remaining = totalVotes - used
    val others = subs?.filter { it.userId != uid } ?: emptyList()
    val mySub = subs?.find { it.userId == uid }
    val hasAnyComment = others.any { (myComments[it.id] ?: "").isNotBlank() }
    val hasAnyInput = used > 0 || hasAnyComment

    fun saveVotes() {
        saving = true
        scope.launch {
            try {
                existing.forEach { db.collection("votes").document(it.id).delete().await() }
                others.filter { (myVotes[it.id] ?: 0) > 0 || (myComments[it.id] ?: "").isNotBlank() }.forEach { sub ->
                    db.collection("votes").add(
                        hashMapOf(
                            "roundId" to round.id,
                            "groupId" to round.groupId,
                            "voterId" to uid,
                            "submissionId" to sub.id,
                            "submitterUserId" to sub.userId,
                            "points" to (myVotes[sub.id] ?: 0),
                            "comment" to (myComments[sub.id] ?: ""),
                            "createdAt" to FieldValue.serverTimestamp(),
                        )
                    ).await()
                }
                existing = db.collection("votes").whereEqualTo("roundId", round.id).whereEqualTo("voterId", uid).get().await()
                    .documents.map { it.toVote() }
                saved = true
                // Alle abgestimmt? → automatisch zu den Ergebnissen
                Rounds.maybeAdvance(round, group)
            } catch (e: Exception) {
                error = "Fehler: ${e.localizedMessage}"
            } finally {
                saving = false
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { header() }
            error?.let { e -> item { ErrorBox(e) } }
            item { PlaylistButtons(subs ?: emptyList()) }
            item {
                Card(background = C.Accent2Dim, border = C.Accent2.copy(alpha = 0.25f)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Deine Stimmen", fontSize = 13.sp, color = C.Accent2, modifier = Modifier.weight(1f))
                        Text("$remaining verbleibend", fontSize = 18.sp, color = C.Accent2)
                    }
                    Gap(8.dp)
                    ProgressBar(if (totalVotes > 0) used.toFloat() / totalVotes else 0f, C.Accent2)
                    Gap(8.dp)
                    Dim("Verteile deine $totalVotes Stimmen. Mehrere auf einen Song möglich. Du kannst bei jedem Song kommentieren.", size = 11.sp, color = C.TextMuted)
                    if (totalMembers > 0) {
                        Gap(4.dp)
                        Dim("$voterCount/$totalMembers haben abgestimmt · Ergebnisse erscheinen automatisch, sobald alle abgestimmt haben.", size = 11.sp, color = C.TextMuted)
                    }
                }
            }
            if (subs == null) item { Loading() }
            items(others, key = { it.id }) { sub ->
                val mine = myVotes[sub.id] ?: 0
                Card {
                    SongInfo(sub.songTitle, sub.channelTitle)
                    Gap(10.dp)
                    SongPlayer(sub.videoId, sub.songTitle)
                    Gap(12.dp)
                    RowCentered(gap = 12.dp) {
                        GhostButton("−", onClick = {
                            val v = mine - 1
                            if (v <= 0) myVotes.remove(sub.id) else myVotes[sub.id] = v
                            saved = false
                        }, enabled = mine > 0)
                        Text("$mine", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
                        GhostButton("+", onClick = {
                            if (remaining > 0) { myVotes[sub.id] = mine + 1; saved = false }
                        }, enabled = remaining > 0)
                        Dim(if (mine > 0) "$mine Stimme${if (mine != 1) "n" else ""}" else "Keine Stimmen", size = 12.sp, color = C.TextMuted)
                    }
                    Gap(12.dp)
                    var m = Modifier.fillMaxWidth()
                    if (sub.id == others.firstOrNull()?.id) m = m.focusRequester(firstCommentFocus)
                    OutlinedTextField(
                        value = myComments[sub.id] ?: "",
                        onValueChange = { myComments[sub.id] = it; saved = false },
                        label = { Text("Kommentar (optional)") },
                        placeholder = { Text("Was denkst du über diesen Song?") },
                        colors = fieldColors(), minLines = 2, modifier = m,
                    )
                }
            }
            if (mySub != null) {
                item {
                    Card(background = C.AccentDim, border = C.Accent.copy(alpha = 0.3f)) {
                        Text("DEIN SONG", fontSize = 11.sp, color = C.Accent, letterSpacing = 1.sp)
                        Gap(8.dp)
                        SongInfo(mySub.songTitle, mySub.channelTitle)
                        Gap(10.dp)
                        SongPlayer(mySub.videoId, mySub.songTitle)
                        if (mySub.submissionComment.isNotEmpty()) {
                            Gap(10.dp)
                            Dim("„${mySub.submissionComment}\"", italic = true)
                        }
                    }
                }
            }
            item { Gap(8.dp) }
        }
        Row(Modifier.fillMaxWidth().background(C.Bg).padding(horizontal = 14.dp, vertical = 10.dp)) {
            PrimaryButton(
                when {
                    saving -> "…"
                    saved -> "✓ Gespeichert"
                    used > 0 -> "Stimmen abgeben ($used/$totalVotes)"
                    else -> "Kommentare speichern"
                },
                onClick = {
                    // Erstes Abgeben ganz ohne Kommentar → einmalig nachfragen
                    if (!hasAnyComment && existing.isEmpty() && !promptShown) {
                        promptShown = true
                        showPrompt = true
                    } else {
                        saveVotes()
                    }
                },
                enabled = !saving && hasAnyInput,
                color = if (saved) C.Surface3 else C.Accent,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showPrompt) {
        ConfirmDialog(
            title = "Ohne Kommentare abstimmen?",
            text = "Du hast noch zu keinem Song einen Kommentar geschrieben. Schon ein kurzes Feedback freut die Einreicher – am Ende sehen alle, wer was geschrieben hat.",
            confirm = "Ohne Kommentare abgeben",
            onConfirm = { showPrompt = false; saveVotes() },
            dismiss = "✏️ Kommentare schreiben",
            onDismiss = { showPrompt = false; focusTick++ },
        )
    }
}

// ─── Ergebnisse ───
@Composable
private fun ResultsPhase(round: Round, group: Group?, header: @Composable () -> Unit) {
    val uid = Session.uid ?: return
    var subs by remember(round.id) { mutableStateOf<List<Submission>?>(null) }
    var votes by remember(round.id) { mutableStateOf<List<Vote>>(emptyList()) }
    var season by remember(round.id) { mutableStateOf<Season?>(null) }

    LaunchedEffect(round.id) {
        try {
            val s = db.collection("submissions").whereEqualTo("roundId", round.id).get().await().documents.map { it.toSubmission() }
            votes = db.collection("votes").whereEqualTo("roundId", round.id).get().await().documents.map { it.toVote() }
            subs = s
        } catch (_: Exception) {
            subs = emptyList()
        }
    }
    LaunchedEffect(round.endsSeason) {
        val n = round.endsSeason ?: return@LaunchedEffect
        try {
            season = db.collection("seasons").document("${round.groupId}_$n").get().await().toSeason()
        } catch (_: Exception) {
        }
    }

    val results = (subs ?: emptyList())
        .map { s -> Triple(s, votes.filter { it.submissionId == s.id }, votes.filter { it.submissionId == s.id }.sumOf { it.points }) }
        .sortedByDescending { it.third }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { header() }
        season?.let { s ->
            item {
                Column {
                    SectionTitle("🎉 Saison ${s.seasonNumber} ist beendet")
                    SeasonCard(s, defaultOpen = true)
                }
            }
        }
        if (subs == null) item { Loading() }
        else item { PlaylistButtons(subs ?: emptyList()) }
        results.forEachIndexed { i, (sub, subVotes, points) ->
            item(key = sub.id) {
                Card(border = if (i == 0) C.Accent2.copy(alpha = 0.4f) else C.Border) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (i < 3) medal(i) else "#${i + 1}", fontSize = 24.sp, modifier = Modifier.weight(1f))
                        Column(horizontalAlignment = Alignment.End) {
                            Text("$points", fontSize = 28.sp, color = C.Accent, fontWeight = FontWeight.SemiBold)
                            Text("PUNKTE", fontSize = 10.sp, color = C.TextMuted)
                        }
                    }
                    Gap(10.dp)
                    SongInfo(sub.songTitle, sub.channelTitle, sub.thumbnail)
                    Gap(10.dp)
                    SongPlayer(sub.videoId, sub.songTitle)
                    Gap(12.dp)
                    RowCentered {
                        Avatar(sub.userId, sub.userName, 28.dp)
                        Text("von ${sub.userName}${if (sub.userId == uid) " (Du)" else ""}", fontSize = 13.sp, color = C.TextDim)
                    }
                    if (sub.submissionComment.isNotEmpty()) {
                        Gap(10.dp)
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(C.AccentDim)
                                .border(1.dp, C.Accent.copy(alpha = 0.2f), RoundedCornerShape(8.dp)).padding(10.dp)
                        ) {
                            Text("💬 VOM EINREICHER", fontSize = 10.sp, color = C.Accent)
                            Dim("„${sub.submissionComment}\"", italic = true, color = C.Text)
                        }
                    }
                    if (subVotes.isNotEmpty()) {
                        Gap(12.dp)
                        HorizontalDivider(color = C.Border)
                        Gap(12.dp)
                        SectionTitle("Wer hat abgestimmt")
                        subVotes.forEach { v ->
                            val voter = group?.nameOf(v.voterId) ?: "Anonym"
                            Row(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                                Avatar(v.voterId, voter, 28.dp)
                                HGap(10.dp)
                                Column(Modifier.weight(1f)) {
                                    RowCentered(gap = 6.dp) {
                                        Text("$voter${if (v.voterId == uid) " (Du)" else ""}", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Badge("${"♦".repeat(minOf(v.points, 5))} ${v.points}pt", BadgeKind.Amber)
                                    }
                                    if (v.comment.isNotEmpty()) {
                                        Gap(4.dp)
                                        Text(
                                            "„${v.comment}\"",
                                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(C.Surface2).padding(horizontal = 10.dp, vertical = 6.dp),
                                            fontSize = 13.sp, color = C.TextDim, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        item { Gap(16.dp) }
    }
}

// ─── Song-Suche ───
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SongSearchSheet(groupId: String, onSelect: (Song) -> Unit, onDismiss: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Song>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Song?>(null) }
    val used = remember { mutableStateMapOf<String, String>() }
    val previewed = remember { HashSet<String>() }
    val player by Player.state.collectAsState()

    // Welche Songs gab es in dieser Gruppe schon (und in welcher Runde)?
    LaunchedEffect(groupId) {
        try {
            val docs = db.collection("submissions").whereEqualTo("groupId", groupId).get().await().documents
            val prompts = HashMap<String, String>()
            docs.mapNotNull { it.getString("roundId") }.toSet().forEach { rid ->
                db.collection("rounds").document(rid).get().await().getString("prompt")?.let { prompts[rid] = it }
            }
            docs.forEach { d ->
                val vid = d.getString("videoId") ?: return@forEach
                val p = prompts[d.getString("roundId") ?: ""] ?: return@forEach
                used[vid] = p
            }
        } catch (_: Exception) {
        }
    }

    // Suche mit kurzer Verzögerung beim Tippen — ein kompletter YouTube-Link wird sofort geladen und ausgewählt (wie bei w2g)
    LaunchedEffect(query) {
        val linkId = YouTube.videoIdFromLink(query)
        if (linkId == null && query.trim().length < 3) {
            results = emptyList()
            return@LaunchedEffect
        }
        if (linkId == null) delay(500)
        loading = true
        error = ""
        try {
            if (linkId != null) {
                results = emptyList()
                val song = YouTube.video(linkId)
                results = listOf(song)
                selected = song
            } else {
                results = YouTube.search(query)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.localizedMessage ?: "Suche fehlgeschlagen"
        } finally {
            loading = false
        }
    }

    // Vorhören endet, wenn die Suche geschlossen wird
    DisposableEffect(Unit) {
        onDispose {
            val current = Player.state.value.videoId
            if (current != null && previewed.contains(current)) Player.stop()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = C.Surface,
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).padding(horizontal = 16.dp)) {
            Text("Song auswählen", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Gap(12.dp)
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text("Song, Künstler oder YouTube-Link…") },
                singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth(),
            )
            Gap(12.dp)
            if (error.isNotEmpty()) ErrorBox(error)
            if (loading) Loading()
            if (!loading && results.isEmpty() && query.trim().length >= 3 && error.isEmpty()) {
                Dim("Keine Ergebnisse für „$query\"", modifier = Modifier.fillMaxWidth().padding(24.dp))
            }
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(results, key = { it.id }) { song ->
                    val isSel = selected?.id == song.id
                    val wasUsed = used[song.id]
                    val isPreview = player.videoId == song.id
                    val shape = RoundedCornerShape(10.dp)
                    Column(
                        Modifier.fillMaxWidth().clip(shape)
                            .background(if (isSel) C.AccentDim else if (wasUsed != null) C.Accent2.copy(alpha = 0.07f) else C.Surface3)
                            .border(if (isSel) 2.dp else 1.dp, if (isSel) C.Accent else if (wasUsed != null) C.Accent2.copy(alpha = 0.3f) else C.Border2, shape)
                            .padding(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RoundIconButton(
                                onClick = { previewed.add(song.id); Player.toggle(song.id, song.title) },
                                background = if (isPreview && player.playing) C.YouTubeRed else C.Surface2,
                                size = 32.dp,
                            ) { PlayPauseIcon(playing = isPreview && player.playing, color = Color.White, size = 10.dp) }
                            HGap(10.dp)
                            Column(Modifier.weight(1f).clickable { selected = if (isSel) null else song }) {
                                Text(YouTube.cleanTitle(song.title), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                RowCentered(gap = 6.dp) {
                                    Text(song.channelTitle, fontSize = 12.sp, color = C.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                    if (wasUsed != null) Badge("↩ $wasUsed", BadgeKind.Amber)
                                }
                            }
                            if (isSel) Text("✓", color = C.Accent, fontSize = 18.sp)
                        }
                        if (isPreview) {
                            Gap(8.dp)
                            SongPlayer(song.id, song.title)
                        }
                    }
                }
            }
            selected?.let { s ->
                HorizontalDivider(color = C.Border2, modifier = Modifier.padding(vertical = 10.dp))
                SectionTitle("Ausgewählt")
                Text(YouTube.cleanTitle(s.title), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Dim(s.channelTitle, size = 12.sp)
                Gap(10.dp)
                PrimaryButton("Song einreichen", onClick = { onSelect(s) }, modifier = Modifier.fillMaxWidth())
                Gap(12.dp)
            }
        }
    }
}
