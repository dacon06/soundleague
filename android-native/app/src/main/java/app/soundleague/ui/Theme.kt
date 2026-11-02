package app.soundleague.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Farben wie auf der Website (src/styles/global.css)
object C {
    val Bg = Color(0xFF09090C)
    val Surface = Color(0xFF1C1C22)
    val Surface2 = Color(0xFF242430)
    val Surface3 = Color(0xFF2C2C3A)
    val Border = Color(0xFF383848)
    val Border2 = Color(0xFF48485A)
    val Accent = Color(0xFF7C6AF5)
    val Accent2 = Color(0xFFF5A623)
    val AccentDim = Color(0x247C6AF5)
    val Accent2Dim = Color(0x21F5A623)
    val Text = Color(0xFFF5F4FF)
    val TextDim = Color(0xFF8A8AA0)
    val TextMuted = Color(0xFF5A5A6E)
    val Danger = Color(0xFFF06060)
    val Success = Color(0xFF48D597)
    val YouTubeRed = Color(0xFFFF0000)
}

private val scheme = darkColorScheme(
    primary = C.Accent,
    onPrimary = Color.White,
    primaryContainer = C.AccentDim,
    onPrimaryContainer = C.Text,
    secondary = C.Accent2,
    onSecondary = Color.Black,
    background = C.Bg,
    onBackground = C.Text,
    surface = C.Bg,
    onSurface = C.Text,
    surfaceVariant = C.Surface2,
    onSurfaceVariant = C.TextDim,
    surfaceContainerLowest = C.Bg,
    surfaceContainerLow = C.Surface,
    surfaceContainer = C.Surface,
    surfaceContainerHigh = C.Surface2,
    surfaceContainerHighest = C.Surface3,
    outline = C.Border2,
    outlineVariant = C.Border,
    error = C.Danger,
    onError = Color.White,
)

@Composable
fun SoundleagueTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
