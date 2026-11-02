package app.soundleague.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.soundleague.data.Session
import kotlinx.coroutines.launch

@Composable
fun LoginScreen() {
    var mode by remember { mutableIntStateOf(0) } // 0 = Anmelden, 1 = Registrieren
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        error = ""
        if (mode == 1 && name.isBlank()) { error = "Bitte gib einen Namen ein."; return }
        if (email.isBlank() || password.isEmpty()) { error = "Bitte E-Mail und Passwort eingeben."; return }
        loading = true
        scope.launch {
            try {
                if (mode == 1) Session.register(email, password, name.trim()) else Session.login(email, password)
            } catch (e: Exception) {
                error = Session.errorText(e)
            } finally {
                loading = false
            }
        }
    }

    Box(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 380.dp).fillMaxWidth().padding(horizontal = 16.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Logo
            Box(
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(Brush.sweepGradient(listOf(C.Accent, C.Accent2, C.Accent))),
                contentAlignment = Alignment.Center,
            ) { Box(Modifier.size(28.dp).clip(CircleShape).background(C.Bg)) }
            Gap(16.dp)
            Text("Soundleague", fontSize = 34.sp, fontWeight = FontWeight.Light)
            Dim("Musik teilen. Abstimmen. Gewinnen.")
            Gap(36.dp)

            TabRow(selectedTabIndex = mode, containerColor = C.Surface, contentColor = C.Text) {
                Tab(selected = mode == 0, onClick = { mode = 0; error = "" }, text = { Text("Anmelden") })
                Tab(selected = mode == 1, onClick = { mode = 1; error = "" }, text = { Text("Registrieren") })
            }
            Gap(20.dp)
            if (error.isNotEmpty()) ErrorBox(error)

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (mode == 1) {
                    OutlinedTextField(
                        value = name, onValueChange = { name = it },
                        label = { Text("Name") }, placeholder = { Text("Dein Anzeigename") },
                        singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = email, onValueChange = { email = it },
                    label = { Text("E-Mail") }, placeholder = { Text("email@beispiel.de") },
                    singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text("Passwort") }, placeholder = { Text(if (mode == 1) "Mind. 6 Zeichen" else "••••••••") },
                    singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
            }
            Gap(20.dp)
            Row(Modifier.fillMaxWidth()) {
                PrimaryButton(
                    if (loading) "…" else if (mode == 0) "Anmelden" else "Account erstellen",
                    onClick = { submit() },
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
