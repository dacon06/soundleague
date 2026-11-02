package app.soundleague.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import java.util.Calendar
import java.util.Date

// Rundenablauf — 1:1 wie src/rounds.js der Website, damit App und Website
// dieselben Daten schreiben und sich gegenseitig verstehen.
object Rounds {
    const val SEASON_LENGTH = 20

    private val db get() = FirebaseFirestore.getInstance()
    private fun actor(): String? = FirebaseAuth.getInstance().currentUser?.uid

    // ─── Kalender-Deadlines (nur noch für Erinnerungen) ───
    private fun calendarDeadlines(): Pair<Date, Date> {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        // Montag dieser Woche
        val dow = cal.get(Calendar.DAY_OF_WEEK) // 1=So … 7=Sa
        val daysSinceMonday = if (dow == Calendar.SUNDAY) 6 else dow - Calendar.MONDAY
        cal.add(Calendar.DAY_OF_MONTH, -daysSinceMonday)
        val saturday = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 5) }.time
        val mondayAfter = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 7) }.time
        return saturday to mondayAfter
    }

    // ─── „läuft seit X Tagen" ───
    fun formatRunning(round: Round): String {
        val start = if (round.status == "voting") (round.votingStartedAt ?: round.createdAt) else round.createdAt
        val ms = start?.toDate()?.time ?: return ""
        val days = maxOf(0L, (System.currentTimeMillis() - ms) / 86_400_000L)
        return if (days == 0L) "läuft seit heute" else "läuft seit $days Tag${if (days == 1L) "" else "en"}"
    }

    // ─── Runde anlegen ───
    suspend fun createRound(groupId: String, item: QueueItem, createdBy: String, remaining: List<QueueItem>): String {
        val (submissionDeadline, votingDeadline) = calendarDeadlines()
        val groupSnap = db.collection("groups").document(groupId).get().await()
        val seasonNumber = (groupSnap.get("seasonNumber") as? Number)?.toInt() ?: 1
        val ref = db.collection("rounds").add(
            hashMapOf(
                "groupId" to groupId,
                "seasonNumber" to seasonNumber,
                "prompt" to item.name,
                "description" to item.description,
                "status" to "submission",
                "submissionDeadline" to submissionDeadline,
                "votingDeadline" to votingDeadline,
                "playlistId" to null,
                "createdBy" to createdBy,
                "createdAt" to FieldValue.serverTimestamp(),
                "submissionNotificationSent" to false,
                "votingNotificationSent" to false,
                "fromQueue" to true,
            )
        ).await()
        db.collection("groups").document(groupId).update(
            mapOf(
                "currentRoundId" to ref.id,
                "categoryQueue" to remaining.map { it.toMap() },
            )
        ).await()
        Notify.round(ref.id, "round-start", actor())
        return ref.id
    }

    // ─── Nächste Runde aus der Warteschlange ───
    private suspend fun autoStartNext(finished: Round): Boolean {
        val g = db.collection("groups").document(finished.groupId).get().await().toGroup() ?: return false
        // Nur weiterschalten, wenn diese Runde noch die aktuelle ist (Schutz gegen doppeltes Starten)
        if (g.currentRoundId != null && g.currentRoundId != finished.id) return false
        val queue = g.categoryQueue
        if (queue.isEmpty()) return false
        createRound(finished.groupId, queue.first(), finished.createdBy, queue.drop(1))
        return true
    }

    // ─── Phasenwechsel ───
    suspend fun advanceToVoting(round: Round) {
        db.collection("rounds").document(round.id).update(
            mapOf("status" to "voting", "votingStartedAt" to FieldValue.serverTimestamp())
        ).await()
        Notify.round(round.id, "voting", actor())
    }

    suspend fun finishRound(round: Round) {
        db.collection("rounds").document(round.id).update("status", "results").await()
        // Saisonende zuerst prüfen; ein Fehler darf den Rundenwechsel nie blockieren
        try {
            closeSeasonIfComplete(round)
        } catch (_: Exception) {
        }
        val nextStarted = autoStartNext(round)
        if (!nextStarted) Notify.round(round.id, "results", actor())
    }

    // ─── Saison abschließen ───
    private suspend fun closeSeasonIfComplete(finished: Round): Int? {
        val groupRef = db.collection("groups").document(finished.groupId)
        val group = groupRef.get().await().toGroup() ?: return null
        val season = group.seasonNumber

        val seasonRounds = db.collection("rounds").whereEqualTo("groupId", finished.groupId).get().await()
            .documents.mapNotNull { it.toRound() }
            .filter { it.seasonNumber == season && it.status == "results" }
        if (seasonRounds.size < SEASON_LENGTH) return null

        val result = buildSeasonResult(group, seasonRounds)

        val closed = db.runTransaction { tx ->
            val fresh = tx.get(groupRef)
            val freshSeason = (fresh.get("seasonNumber") as? Number)?.toInt() ?: 1
            if (!fresh.exists() || freshSeason != season) {
                false
            } else {
                val data = HashMap<String, Any?>(result)
                data["groupId"] = finished.groupId
                data["seasonNumber"] = season
                data["closedAt"] = FieldValue.serverTimestamp()
                tx.set(db.collection("seasons").document("${finished.groupId}_$season"), data)
                tx.update(groupRef, "seasonNumber", season + 1)
                // Markiert die letzte Runde → dort wird der Champion angezeigt
                tx.update(db.collection("rounds").document(finished.id), "endsSeason", season)
                true
            }
        }.await()
        return if (closed) season else null
    }

    private suspend fun buildSeasonResult(group: Group, seasonRounds: List<Round>): Map<String, Any?> {
        val ordered = seasonRounds.sortedBy { it.createdAt?.toDate()?.time ?: 0L }
        val points = LinkedHashMap<String, Int>()
        val knownNames = HashMap<String, String>()
        val roundSummaries = ArrayList<Map<String, Any?>>()

        for (r in ordered) {
            val votes = db.collection("votes").whereEqualTo("roundId", r.id).get().await().documents.map { it.toVote() }
            val subs = db.collection("submissions").whereEqualTo("roundId", r.id).get().await().documents.map { it.toSubmission() }
            subs.forEach { if (it.userName.isNotEmpty()) knownNames[it.userId] = it.userName }

            val perSong = HashMap<String, Int>()
            votes.forEach { v ->
                if (v.submitterUserId.isEmpty()) return@forEach
                points[v.submitterUserId] = (points[v.submitterUserId] ?: 0) + v.points
                perSong[v.submissionId] = (perSong[v.submissionId] ?: 0) + v.points
            }
            val top = maxOf(0, perSong.values.maxOrNull() ?: 0)
            val winners = if (top > 0) subs.filter { perSong[it.id] == top }.map {
                mapOf(
                    "userId" to it.userId,
                    "name" to (group.memberNames[it.userId] ?: it.userName.ifEmpty { "Anonym" }),
                    "songTitle" to it.songTitle,
                )
            } else emptyList()
            roundSummaries.add(mapOf("roundId" to r.id, "prompt" to r.prompt, "points" to top, "winners" to winners))
        }

        fun nameOf(uid: String) = group.memberNames[uid] ?: knownNames[uid] ?: "Anonym"
        val standings = points.entries
            .map { (uid, pts) -> Triple(uid, nameOf(uid), pts) }
            .sortedByDescending { it.third }
        val best = standings.firstOrNull()?.third ?: 0
        fun asMap(t: Triple<String, String, Int>) = mapOf("userId" to t.first, "name" to t.second, "points" to t.third)

        return mapOf(
            "roundCount" to ordered.size,
            // Punktgleichstand an der Spitze → geteilter Sieg
            "champions" to (if (best > 0) standings.filter { it.third == best }.map { asMap(it) } else emptyList()),
            "standings" to standings.map { asMap(it) },
            "rounds" to roundSummaries,
        )
    }

    // ─── Fortschritt prüfen und ggf. weiterschalten ───
    suspend fun checkRoundCompletion(round: Round, memberCount: Int): Pair<Int, Int> {
        when (round.status) {
            "submission" -> {
                val done = db.collection("submissions").whereEqualTo("roundId", round.id).get().await()
                    .documents.mapNotNull { it.getString("userId") }.toSet().size
                if (memberCount > 0 && done >= memberCount) advanceToVoting(round)
                return done to memberCount
            }
            "voting" -> {
                val done = db.collection("votes").whereEqualTo("roundId", round.id).get().await()
                    .documents.mapNotNull { it.getString("voterId") }.toSet().size
                if (memberCount > 0 && done >= memberCount) finishRound(round)
                return done to memberCount
            }
        }
        return 0 to memberCount
    }

    suspend fun maybeAdvance(round: Round?, group: Group?) {
        if (round == null || group == null) return
        try {
            checkRoundCompletion(round, group.members.size)
        } catch (_: Exception) {
        }
    }
}
