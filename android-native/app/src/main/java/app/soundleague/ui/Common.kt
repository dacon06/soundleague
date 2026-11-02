package app.soundleague.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Emojis
import coil.compose.AsyncImage

// ─── Bausteine, die überall vorkommen ───

@Composable
fun Card(
    modifier: Modifier = Modifier,
    border: Color = C.Border2,
    background: Color = C.Surface,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    var m = modifier
        .fillMaxWidth()
        .clip(shape)
        .background(background)
        .border(1.dp, border, shape)
    if (onClick != null) m = m.clickable(onClick = onClick)
    Column(m.padding(16.dp), content = content)
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier = modifier.padding(bottom = 10.dp),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.sp,
        color = C.TextDim,
    )
}

@Composable
fun Dim(text: String, size: TextUnit = 13.sp, color: Color = C.TextDim, italic: Boolean = false, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, fontSize = size, color = color, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal, lineHeight = size * 1.4f)
}

enum class BadgeKind { Green, Amber, Dim }

@Composable
fun Badge(text: String, kind: BadgeKind) {
    val (fg, bg) = when (kind) {
        BadgeKind.Green -> C.Success to C.Success.copy(alpha = 0.14f)
        BadgeKind.Amber -> C.Accent2 to C.Accent2Dim
        BadgeKind.Dim -> C.TextDim to C.Surface2
    }
    Text(
        text,
        modifier = Modifier
            .clip(RoundedCornerShape(100.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.3f), RoundedCornerShape(100.dp))
            .padding(horizontal = 9.dp, vertical = 3.dp),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = fg,
        maxLines = 1,
    )
}

@Composable
fun StatusBadge(status: String, dot: Boolean = false) {
    val p = if (dot) "● " else ""
    when (status) {
        "submission" -> Badge("${p}Einreichung", BadgeKind.Green)
        "voting" -> Badge("${p}Abstimmung", BadgeKind.Amber)
        "results" -> Badge("Ergebnisse", BadgeKind.Dim)
        else -> Badge(status, BadgeKind.Dim)
    }
}

@Composable
fun ProgressBar(fraction: Float, color: Color = C.Accent, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(C.Surface3)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(4.dp)
                .background(color)
        )
    }
}

@Composable
fun Avatar(uid: String?, name: String?, size: Dp = 36.dp) {
    LaunchedEffect(uid) { Emojis.load(uid) }
    val emoji = if (uid != null) Emojis.cache[uid] else null
    if (!emoji.isNullOrEmpty()) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(C.Surface2)
                .border(2.dp, C.Border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(emoji, fontSize = (size.value * 0.5f).sp)
        }
    } else {
        val n = name?.ifEmpty { null } ?: "?"
        val colors = listOf(0xFF1DB954, 0xFFE8A838, 0xFF7C3AED, 0xFF2563EB, 0xFFDC2626, 0xFF059669, 0xFFD97706)
        val bg = Color(colors[n[0].code % colors.size])
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(bg),
            contentAlignment = Alignment.Center,
        ) {
            Text(n[0].uppercase(), fontSize = (size.value * 0.4f).sp, fontWeight = FontWeight.Bold, color = Color.Black)
        }
    }
}

@Composable
fun Thumbnail(url: String, modifier: Modifier = Modifier) {
    if (url.isEmpty()) return
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .width(80.dp)
            .height(60.dp)
            .clip(RoundedCornerShape(8.dp)),
    )
}

@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = C.Accent, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
    }
}

@Composable
fun EmptyState(icon: String, title: String, text: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(icon, fontSize = 40.sp)
        Spacer(Modifier.height(12.dp))
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = C.Text)
        Spacer(Modifier.height(6.dp))
        Dim(text, modifier = Modifier.fillMaxWidth(), size = 13.sp)
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = C.Accent) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) { Text(text, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center) }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = C.TextDim) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, C.Border),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
    ) { Text(text, color = color, fontSize = 13.sp) }
}

@Composable
fun fieldColors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = C.Accent,
    unfocusedBorderColor = C.Border2,
    focusedContainerColor = C.Surface2,
    unfocusedContainerColor = C.Surface2,
    cursorColor = C.Accent,
    focusedLabelColor = C.Accent,
    unfocusedLabelColor = C.TextDim,
    focusedPlaceholderColor = C.TextMuted,
    unfocusedPlaceholderColor = C.TextMuted,
)

@Composable
fun ErrorBox(text: String) {
    Text(
        text,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(C.Danger.copy(alpha = 0.1f))
            .border(1.dp, C.Danger.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
            .padding(12.dp),
        color = C.Danger,
        fontSize = 13.sp,
    )
}

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    dismiss: String = "Abbrechen",
    danger: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text, color = C.TextDim, fontSize = 14.sp) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirm, color = if (danger) C.Danger else C.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(dismiss, color = C.TextDim) } },
        containerColor = C.Surface,
    )
}

// ─── Play-/Pause-Symbole (selbst gezeichnet) ───

@Composable
fun PlayPauseIcon(playing: Boolean, color: Color, size: Dp = 12.dp) {
    Canvas(Modifier.size(size)) {
        if (playing) {
            val w = this.size.width * 0.32f
            drawRect(color, topLeft = Offset(0f, 0f), size = Size(w, this.size.height))
            drawRect(color, topLeft = Offset(this.size.width - w, 0f), size = Size(w, this.size.height))
        } else {
            val p = Path().apply {
                moveTo(this@Canvas.size.width * 0.12f, 0f)
                lineTo(this@Canvas.size.width, this@Canvas.size.height / 2f)
                lineTo(this@Canvas.size.width * 0.12f, this@Canvas.size.height)
                close()
            }
            drawPath(p, color)
        }
    }
}

@Composable
fun RoundIconButton(
    onClick: () -> Unit,
    background: Color = C.Accent,
    size: Dp = 36.dp,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(background)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
fun Gap(h: Dp) = Spacer(Modifier.height(h))

@Composable
fun HGap(w: Dp) = Spacer(Modifier.width(w))

@Composable
fun RowCentered(modifier: Modifier = Modifier, gap: Dp = 8.dp, content: @Composable RowScope.() -> Unit) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap)) { content() }
}

fun ellipsis() = TextOverflow.Ellipsis
