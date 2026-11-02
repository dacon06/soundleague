package app.soundleague.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Season
import java.text.SimpleDateFormat
import java.util.Locale

fun medal(rank: Int): String = when (rank) {
    0 -> "🥇"
    1 -> "🥈"
    2 -> "🥉"
    else -> "${rank + 1}"
}

/** Eine abgeschlossene Saison: Champion(s), aufklappbar Endstand und Rundensieger. */
@Composable
fun SeasonCard(season: Season, defaultOpen: Boolean = false) {
    var open by remember(season.id) { mutableStateOf(defaultOpen) }
    val closed = season.closedAt?.toDate()?.let { SimpleDateFormat("dd.MM.yyyy", Locale.GERMANY).format(it) }

    Card(border = if (season.champions.isNotEmpty()) C.Accent2.copy(alpha = 0.4f) else C.Border2) {
        Row(Modifier.fillMaxWidth()) {
            Text("SAISON ${season.seasonNumber}", fontSize = 11.sp, color = C.TextDim, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
            Text("${season.roundCount} Runden${if (closed != null) " · beendet am $closed" else ""}", fontSize = 11.sp, color = C.TextDim)
        }
        if (season.champions.isEmpty()) {
            Gap(12.dp)
            Dim("Kein Champion — in dieser Saison wurden keine Stimmen vergeben.")
        } else {
            season.champions.forEach { c ->
                Gap(14.dp)
                RowCentered(gap = 12.dp) {
                    Text("🏆", fontSize = 26.sp)
                    Avatar(c.userId, c.name, 40.dp)
                    Column(Modifier.weight(1f)) {
                        Text(c.name, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        Dim(if (season.champions.size > 1) "Geteilter Sieg" else "Champion", size = 12.sp)
                    }
                    Text("${c.points} pts", fontSize = 18.sp, color = C.Accent, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Gap(12.dp)
        GhostButton(if (open) "Details ausblenden" else "Endstand & Rundensieger", onClick = { open = !open })

        if (open) {
            if (season.standings.isNotEmpty()) {
                Gap(14.dp)
                SectionTitle("Endstand")
                season.standings.forEachIndexed { i, s ->
                    // Bei Punktgleichheit teilen sich Nutzer den Rang
                    val rank = season.standings.indexOfFirst { it.points == season.standings[i].points }
                    RowCentered(Modifier.fillMaxWidth().padding(vertical = 6.dp), gap = 10.dp) {
                        Text(medal(rank), fontSize = 16.sp, modifier = Modifier.width(28.dp))
                        Avatar(s.userId, s.name, 30.dp)
                        Text(s.name, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text("${s.points}", fontSize = 16.sp, color = C.Accent)
                    }
                }
            }
            if (season.rounds.isNotEmpty()) {
                Gap(16.dp)
                SectionTitle("Rundensieger")
                season.rounds.forEachIndexed { i, r ->
                    Column(Modifier.padding(vertical = 8.dp)) {
                        Text("Runde ${i + 1} · ${r.prompt}", fontSize = 11.sp, color = C.TextDim)
                        if (r.winners.isEmpty()) {
                            Text("Keine Stimmen vergeben", fontSize = 12.sp, color = C.TextMuted, fontStyle = FontStyle.Italic)
                        } else {
                            r.winners.forEach { w ->
                                Text(
                                    "${w.name}${if (w.songTitle.isNotEmpty()) " — ${w.songTitle}" else ""} · ${r.points} pts",
                                    fontSize = 13.sp,
                                )
                            }
                        }
                    }
                    if (i < season.rounds.size - 1) HorizontalDivider(color = C.Border)
                }
            }
        }
    }
}
