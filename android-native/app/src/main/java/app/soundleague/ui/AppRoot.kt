package app.soundleague.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.soundleague.data.Session
import app.soundleague.push.PushTokens

@Composable
fun AppRoot(pendingUrl: String?, onUrlHandled: () -> Unit) {
    val context = LocalContext.current
    Box(Modifier.fillMaxSize().background(C.Bg)) {
        // Unsichtbarer YouTube-Player (liegt hinter allem)
        PlayerHost()

        if (!Session.ready) {
            Loading()
            return@Box
        }
        val uid = Session.uid
        if (uid == null) {
            LoginScreen()
            return@Box
        }

        // Push-Token bei jedem Start auffrischen (FCM kann ihn jederzeit wechseln)
        LaunchedEffect(uid) { PushTokens.refresh(context) }

        val nav = rememberNavController()

        // Angetippte Benachrichtigung → passende Runde öffnen
        LaunchedEffect(pendingUrl, uid) {
            val url = pendingUrl ?: return@LaunchedEffect
            val parts = url.trim('/').split('/')
            if (parts.size >= 2 && parts[0] == "group") {
                if (parts.size >= 4 && parts[2] == "round") nav.navigate("group/${parts[1]}/round/${parts[3]}")
                else nav.navigate("group/${parts[1]}")
            }
            onUrlHandled()
        }

        Column(Modifier.fillMaxSize().navigationBarsPadding().imePadding()) {
            Box(Modifier.weight(1f)) {
                NavHost(nav, startDestination = "home") {
                    composable("home") {
                        HomeScreen(openGroup = { nav.navigate("group/$it") })
                    }
                    composable("group/{groupId}") { entry ->
                        val groupId = entry.arguments?.getString("groupId") ?: ""
                        GroupScreen(
                            groupId = groupId,
                            onBack = { nav.popBackStack() },
                            openRound = { roundId -> nav.navigate("group/$groupId/round/$roundId") },
                        )
                    }
                    composable("group/{groupId}/round/{roundId}") { entry ->
                        val groupId = entry.arguments?.getString("groupId") ?: ""
                        val roundId = entry.arguments?.getString("roundId") ?: ""
                        RoundScreen(
                            groupId = groupId,
                            roundId = roundId,
                            onBack = {
                                if (!nav.popBackStack()) nav.navigate("group/$groupId")
                            },
                        )
                    }
                }
            }
            MiniPlayer()
        }
    }
}
