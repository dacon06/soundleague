package app.soundleague.data

import androidx.core.text.HtmlCompat
import app.soundleague.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder

object YouTube {
    // YouTube liefert Titel HTML-kodiert (z. B. &amp;)
    private fun decode(s: String): String = HtmlCompat.fromHtml(s, HtmlCompat.FROM_HTML_MODE_LEGACY).toString()

    suspend fun search(query: String): List<Song> = withContext(Dispatchers.IO) {
        if (query.trim().length < 3) return@withContext emptyList<Song>()
        val json = get(
            "search",
            "part" to "snippet",
            "q" to "$query official audio",
            "type" to "video",
            "videoCategoryId" to "10",
            "maxResults" to "15",
        )
        val items = json.optJSONArray("items") ?: return@withContext emptyList<Song>()
        (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val id = item.optJSONObject("id")?.optString("videoId").orEmpty()
            if (id.isEmpty()) null else toSong(id, item.optJSONObject("snippet"))
        }
    }

    /** Lädt genau ein Video (für eingefügte Links). */
    suspend fun video(videoId: String): Song = withContext(Dispatchers.IO) {
        val item = get("videos", "part" to "snippet", "id" to videoId)
            .optJSONArray("items")?.optJSONObject(0)
            ?: throw Exception("Video nicht gefunden")
        toSong(item.optString("id").ifEmpty { videoId }, item.optJSONObject("snippet"))
    }

    private val videoIdPattern = Regex("^[\\w-]{11}$")
    private val pathIdPattern = Regex("^/(shorts|embed|live|v)/([^/]+)")

    /**
     * Erkennt YouTube-Links (watch, youtu.be, shorts, embed, live, music.youtube)
     * und gibt die Video-ID zurück — sonst null.
     */
    fun videoIdFromLink(input: String): String? {
        val text = input.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return null
        val uri = try {
            URI(if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(text)) text else "https://$text")
        } catch (_: Exception) {
            return null
        }
        val host = uri.host?.lowercase()?.removePrefix("www.")?.removePrefix("m.")?.removePrefix("music.") ?: return null
        val path = uri.path.orEmpty()
        val id = when (host) {
            "youtu.be" -> path.removePrefix("/").substringBefore('/')
            "youtube.com", "youtube-nocookie.com" ->
                if (path == "/watch") {
                    uri.rawQuery.orEmpty().split('&')
                        .firstOrNull { it.startsWith("v=") }?.removePrefix("v=")
                } else {
                    pathIdPattern.find(path)?.groupValues?.get(2)
                }
            else -> null
        }
        return id?.takeIf { videoIdPattern.matches(it) }
    }

    private fun toSong(id: String, snippet: JSONObject?): Song {
        val sn = snippet ?: JSONObject()
        val thumbs = sn.optJSONObject("thumbnails")
        val thumb = thumbs?.optJSONObject("medium")?.optString("url")
            ?: thumbs?.optJSONObject("default")?.optString("url") ?: ""
        return Song(
            id = id,
            title = decode(sn.optString("title")),
            channelTitle = decode(sn.optString("channelTitle")),
            thumbnail = thumb,
            videoUrl = "https://www.youtube.com/watch?v=$id",
        )
    }

    private fun get(endpoint: String, vararg params: Pair<String, String>): JSONObject {
        fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
        val query = (params.toList() + ("key" to BuildConfig.YOUTUBE_API_KEY))
            .joinToString("&") { (k, v) -> "$k=${enc(v)}" }

        val conn = URL("https://www.googleapis.com/youtube/v3/$endpoint?$query").openConnection() as HttpURLConnection
        // Falls der API-Schlüssel auf die Website beschränkt ist
        conn.setRequestProperty("Referer", "${BuildConfig.WEB_BASE}/")
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        val json = if (text.isNotEmpty()) JSONObject(text) else JSONObject()
        if (code !in 200..299) {
            val msg = json.optJSONObject("error")?.optString("message").orEmpty()
            throw Exception(msg.ifEmpty { "YouTube API Fehler ($code)" })
        }
        return json
    }

    private val cleanups = listOf(
        Regex("\\(official (video|audio|music video|lyric video|visualizer)\\)", RegexOption.IGNORE_CASE),
        Regex("\\[official (video|audio|music video|lyric video|visualizer)]", RegexOption.IGNORE_CASE),
        Regex("official (video|audio|music video|lyric video|visualizer)", RegexOption.IGNORE_CASE),
        Regex("\\(lyrics?\\)", RegexOption.IGNORE_CASE),
        Regex("\\[lyrics?]", RegexOption.IGNORE_CASE),
        Regex("\\(hd\\)", RegexOption.IGNORE_CASE),
        Regex("\\(4k\\)", RegexOption.IGNORE_CASE),
        Regex("\\bvevo\\b", RegexOption.IGNORE_CASE),
    )

    /** Entfernt „(Official Video)" & Co. aus Titeln — nur für die Anzeige in der Suche. */
    fun cleanTitle(title: String): String {
        var t = title
        cleanups.forEach { t = it.replace(t, "") }
        return t.replace(Regex("\\s+"), " ").trim()
    }

    fun playlistUrl(videoIds: List<String>): String? =
        if (videoIds.isEmpty()) null else "https://www.youtube.com/watch_videos?video_ids=${videoIds.joinToString(",")}"
}
