# 🎵 Soundleague

Eine Music League-ähnliche Web-App zum gemeinsamen Musik entdecken, einreichen und bewerten.

## Features
- 🔐 Email/Passwort + Google Login
- 👥 Gruppen erstellen & beitreten per Einladungscode
- 🎵 Runden mit Kategorien (z.B. "Guilty Pleasure")
- 🟢 Spotify Integration – Songs suchen via OAuth PKCE
- 🗳️ Anonymes Abstimmen + Kommentare, Reveal am Ende
- 🏆 Bestenliste über alle Runden
- 💬 Echtzeit Gruppen-Chat
- 📱 Funktioniert auf iOS, Android und Desktop

## Setup: 3 Schritte

### 1) Firebase
- firebase.google.com → Neues Projekt
- Authentication: Email/Passwort + Google aktivieren
- Firestore Database erstellen
- firestore.rules aus dem Repo deployen
- Web-App Config kopieren

### 2) Spotify Developer
- developer.spotify.com/dashboard → Neue App
- Redirect URIs hinzufügen:
  - http://localhost:5173/spotify/callback
  - https://DEINE-APP.netlify.app/spotify/callback
- Client ID kopieren (kein Secret nötig – PKCE!)

### 3) .env.local befüllen
cp .env.example .env.local
# Dann alle VITE_* Variablen eintragen

## Lokal starten
npm install && npm run dev

## Netlify Deploy
1. Repo auf GitHub pushen
2. Netlify → New site from Git
3. Alle VITE_* Env-Vars in Netlify setzen
4. VITE_SPOTIFY_REDIRECT_URI auf Netlify-URL setzen
5. Netlify-URL in Spotify Dashboard als Redirect URI eintragen
# force rebuild
# updated

