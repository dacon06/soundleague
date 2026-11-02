package app.soundleague.data

import androidx.core.text.HtmlCompat
import app.soundleague.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object YouTube {
    // YouTube liefert Titel HTML-kodiert (z. B. &amp;)
    private fun decode(s: String): String = HtmlCompat.fromHtml(s, HtmlCompat.FROM_HTML_MODE_LEGACY).toString()

    suspend fun search(query: String): List<Song> = withContext(Dispatchers.IO) {
        if (query.trim().length < 3) return@withContext emptyList<Song>()
        fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
        val params = listOf(
            "part" to "snippet",
            "q" to "$query official audio",
            "type" to "video",
            "videoCategoryId" to "10",
            "maxResults" to "15",
            "key" to BuildConfig.YOUTUBE_API_KEY,
        ).joinToString("&") { (k, v) -> "$k=${enc(v)}" }

        val conn = URL("https://www.googleapis.com/youtube/v3/search?$params").openConnection() as HttpURLConnection
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
        val items = json.optJSONArray("items") ?: return@withContext emptyList<Song>()
        (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val id = item.optJSONObject("id")?.optString("videoId").orEmpty()
            if (id.isEmpty()) return@mapNotNull null
            val sn = item.optJSONObject("snippet") ?: JSONObject()
            val thumbs = sn.optJSONObject("thumbnails")
            val thumb = thumbs?.optJSONObject("medium")?.optString("url")
                ?: thumbs?.optJSONObject("default")?.optString("url") ?: ""
            Song(
                id = id,
                title = decode(sn.optString("title")),
                channelTitle = decode(sn.optString("channelTitle")),
                thumbnail = thumb,
                videoUrl = "https://www.youtube.com/watch?v=$id",
            )
        }
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
