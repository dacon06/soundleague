package app.soundleague.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot

// Datenmodelle — exakt die Felder, die auch die Website in Firestore schreibt.

data class QueueItem(val name: String, val description: String = "") {
    fun toMap(): Map<String, Any> = mapOf("name" to name, "description" to description)
}

data class Group(
    val id: String,
    val name: String,
    val description: String,
    val createdBy: String,
    val members: List<String>,
    val memberNames: Map<String, String>,
    val inviteCode: String,
    val votesPerMember: Int,
    val currentRoundId: String?,
    val categoryQueue: List<QueueItem>,
    val seasonNumber: Int,
) {
    fun nameOf(uid: String?): String = memberNames[uid] ?: "Anonym"
}

data class Round(
    val id: String,
    val groupId: String,
    val seasonNumber: Int,
    val prompt: String,
    val description: String,
    val status: String,
    val createdBy: String,
    val createdAt: Timestamp?,
    val votingStartedAt: Timestamp?,
    val endsSeason: Int?,
)

data class Submission(
    val id: String,
    val roundId: String,
    val groupId: String,
    val userId: String,
    val userName: String,
    val videoId: String,
    val songTitle: String,
    val channelTitle: String,
    val thumbnail: String,
    val videoUrl: String,
    val submissionComment: String,
)

data class Vote(
    val id: String,
    val roundId: String,
    val voterId: String,
    val submissionId: String,
    val submitterUserId: String,
    val points: Int,
    val comment: String,
)

data class ChatMessage(
    val id: String,
    val text: String,
    val userId: String,
    val userName: String,
    val createdAt: Timestamp?,
)

data class Song(
    val id: String,
    val title: String,
    val channelTitle: String,
    val thumbnail: String,
    val videoUrl: String,
)

data class SeasonPerson(val userId: String, val name: String, val points: Int)
data class SeasonWinner(val userId: String, val name: String, val songTitle: String)
data class SeasonRound(val roundId: String, val prompt: String, val points: Int, val winners: List<SeasonWinner>)

data class Season(
    val id: String,
    val seasonNumber: Int,
    val roundCount: Int,
    val champions: List<SeasonPerson>,
    val standings: List<SeasonPerson>,
    val rounds: List<SeasonRound>,
    val closedAt: Timestamp?,
)

// ─── Umwandlung aus Firestore ───

private fun Any?.asInt(): Int? = (this as? Number)?.toInt()
private fun DocumentSnapshot.str(field: String): String = getString(field) ?: ""

fun toQueueItem(raw: Any?): QueueItem = when (raw) {
    is String -> QueueItem(raw, "")
    is Map<*, *> -> QueueItem(raw["name"] as? String ?: "", raw["description"] as? String ?: "")
    else -> QueueItem("", "")
}

fun DocumentSnapshot.toGroup(): Group? {
    if (!exists()) return null
    val names = (get("memberNames") as? Map<*, *>)
        ?.entries?.associate { (k, v) -> k.toString() to (v?.toString() ?: "Anonym") }
        ?: emptyMap()
    val members = (get("members") as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val queue = (get("categoryQueue") as? List<*>)?.map { toQueueItem(it) } ?: emptyList()
    return Group(
        id = id,
        name = str("name"),
        description = str("description"),
        createdBy = str("createdBy"),
        members = members,
        memberNames = names,
        inviteCode = str("inviteCode"),
        votesPerMember = get("votesPerMember").asInt() ?: 3,
        currentRoundId = getString("currentRoundId"),
        categoryQueue = queue,
        seasonNumber = get("seasonNumber").asInt() ?: 1,
    )
}

fun DocumentSnapshot.toRound(): Round? {
    if (!exists()) return null
    return Round(
        id = id,
        groupId = str("groupId"),
        // Runden aus der Zeit vor den Saisons zählen zu Saison 1
        seasonNumber = get("seasonNumber").asInt() ?: 1,
        prompt = str("prompt"),
        description = str("description"),
        status = str("status"),
        createdBy = str("createdBy"),
        createdAt = getTimestamp("createdAt"),
        votingStartedAt = getTimestamp("votingStartedAt"),
        endsSeason = get("endsSeason").asInt(),
    )
}

fun DocumentSnapshot.toSubmission(): Submission = Submission(
    id = id,
    roundId = str("roundId"),
    groupId = str("groupId"),
    userId = str("userId"),
    userName = getString("userName") ?: "Anonym",
    videoId = str("videoId"),
    songTitle = str("songTitle"),
    channelTitle = str("channelTitle"),
    thumbnail = str("thumbnail"),
    videoUrl = str("videoUrl"),
    submissionComment = str("submissionComment"),
)

fun DocumentSnapshot.toVote(): Vote = Vote(
    id = id,
    roundId = str("roundId"),
    voterId = str("voterId"),
    submissionId = str("submissionId"),
    submitterUserId = str("submitterUserId"),
    points = get("points").asInt() ?: 0,
    comment = str("comment"),
)

fun DocumentSnapshot.toMessage(): ChatMessage = ChatMessage(
    id = id,
    text = str("text"),
    userId = str("userId"),
    userName = getString("userName") ?: "Anonym",
    createdAt = getTimestamp("createdAt"),
)

private fun personOf(raw: Any?): SeasonPerson? {
    val m = raw as? Map<*, *> ?: return null
    return SeasonPerson(
        m["userId"] as? String ?: "",
        m["name"] as? String ?: "Anonym",
        (m["points"] as? Number)?.toInt() ?: 0,
    )
}

private fun seasonRoundOf(raw: Any?): SeasonRound? {
    val m = raw as? Map<*, *> ?: return null
    val winners = (m["winners"] as? List<*>)?.mapNotNull { w ->
        val wm = w as? Map<*, *>
        if (wm == null) null else SeasonWinner(
            wm["userId"] as? String ?: "",
            wm["name"] as? String ?: "Anonym",
            wm["songTitle"] as? String ?: "",
        )
    } ?: emptyList()
    return SeasonRound(
        roundId = m["roundId"] as? String ?: "",
        prompt = m["prompt"] as? String ?: "",
        points = (m["points"] as? Number)?.toInt() ?: 0,
        winners = winners,
    )
}

fun DocumentSnapshot.toSeason(): Season? {
    if (!exists()) return null
    val rounds = (get("rounds") as? List<*>)?.mapNotNull { seasonRoundOf(it) } ?: emptyList()
    return Season(
        id = id,
        seasonNumber = get("seasonNumber").asInt() ?: 1,
        roundCount = get("roundCount").asInt() ?: rounds.size,
        champions = (get("champions") as? List<*>)?.mapNotNull { personOf(it) } ?: emptyList(),
        standings = (get("standings") as? List<*>)?.mapNotNull { personOf(it) } ?: emptyList(),
        rounds = rounds,
        closedAt = getTimestamp("closedAt"),
    )
}
