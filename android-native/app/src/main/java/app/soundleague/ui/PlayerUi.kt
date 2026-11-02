package app.soundleague.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.soundleague.player.Player

private fun fmt(sec: Float): String {
    val s = sec.toInt().coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}

/** Die unsichtbare WebView mit dem YouTube-Player — einmal ganz unten in der App eingebunden. */
@Composable
fun PlayerHost() {
    AndroidView(
        factory = { ctx -> Player.view(ctx) },
        modifier = Modifier.size(2.dp),
    )
}

/** Abspiel-Leiste für einen Song (in Karten). */
@Composable
fun SongPlayer(videoId: String, title: String, modifier: Modifier = Modifier) {
    if (videoId.isEmpty()) return
    val s by Player.state.collectAsState()
    val isCurrent = s.videoId == videoId
    var drag by remember(videoId) { mutableStateOf<Float?>(null) }

    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(C.Surface2)
            .border(1.dp, C.Border, RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(onClick = { Player.toggle(videoId, title) }, background = if (isCurrent && s.playing) C.YouTubeRed else C.Accent, size = 34.dp) {
            if (isCurrent && s.buffering && !s.playing) {
                CircularProgressIndicator(color = androidx.compose.ui.graphics.Color.White, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
            } else {
                PlayPauseIcon(playing = isCurrent && s.playing, color = androidx.compose.ui.graphics.Color.White)
            }
        }
        HGap(10.dp)
        if (isCurrent && s.duration > 0f) {
            Text(fmt(drag ?: s.position), fontSize = 11.sp, color = C.TextDim)
            Slider(
                value = (drag ?: s.position).coerceIn(0f, s.duration),
                onValueChange = { drag = it },
                onValueChangeFinished = { drag?.let { Player.seek(it) }; drag = null },
                valueRange = 0f..s.duration,
                modifier = Modifier.weight(1f).padding(horizontal = 6.dp),
                colors = SliderDefaults.colors(thumbColor = C.Accent, activeTrackColor = C.Accent, inactiveTrackColor = C.Surface3),
            )
            Text(fmt(s.duration), fontSize = 11.sp, color = C.TextDim)
        } else if (isCurrent && s.error != null) {
            Text(s.error ?: "", fontSize = 12.sp, color = C.Danger, modifier = Modifier.weight(1f))
        } else {
            Text(if (isCurrent) "Lädt…" else "Anhören", fontSize = 13.sp, color = C.TextDim, modifier = Modifier.weight(1f))
        }
    }
}

/** Mini-Player unten am Bildschirm, solange ein Song geladen ist. */
@Composable
fun MiniPlayer() {
    val s by Player.state.collectAsState()
    val id = s.videoId ?: return
    Column(Modifier.fillMaxWidth().background(C.Surface).border(1.dp, C.Border)) {
        if (s.duration > 0f) ProgressBar(s.position / s.duration)
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(onClick = { Player.toggle(id, s.title) }, size = 36.dp) {
                PlayPauseIcon(playing = s.playing, color = androidx.compose.ui.graphics.Color.White)
            }
            HGap(12.dp)
            Column(Modifier.weight(1f)) {
                Text(s.title.ifEmpty { "Soundleague" }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = C.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    s.error ?: if (s.playing) "Läuft" else if (s.buffering) "Lädt…" else "Pausiert",
                    fontSize = 11.sp,
                    color = if (s.error != null) C.Danger else C.TextDim,
                    maxLines = 1,
                )
            }
            IconButton(onClick = { Player.stop() }, modifier = Modifier.width(44.dp)) {
                Icon(Icons.Filled.Close, contentDescription = "Schließen", tint = C.TextDim)
            }
        }
    }
}
