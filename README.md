# 🎵 Soundleague

Eine Music League-ähnliche Web-App zum gemeinsamen Musik entdecken, einreichen und bewerten.

## Features
- 🔐 Email/Passwort + Google Login
- 👥 Gruppen erstellen & beitreten per Einladungscode
- 🎵 Runden mit Kategorien (z.B. "Guilty Pleasure")
- ▶️ Songsuche über YouTube – inkl. Vorhören direkt in der Suche
- 🗳️ Anonymes Abstimmen + Kommentare, Reveal am Ende
- 🏆 Bestenliste über alle Runden
- 💬 Echtzeit Gruppen-Chat
- 🔔 Push-Benachrichtigungen bei neuer Runde, Start der Abstimmung & Erinnerungen
- 📱 Funktioniert als PWA auf iOS, Android und Desktop

## Setup

### 1) Firebase
- firebase.google.com → Neues Projekt
- Authentication: Email/Passwort + Google aktivieren
- Firestore Database erstellen
- `firestore.rules` aus dem Repo deployen
- Web-App Config kopieren

### 2) YouTube Data API
- Google Cloud Console → APIs & Services → Credentials → API Key erstellen
- YouTube Data API v3 aktivieren

### 3) .env.local befüllen
```
cp .env.example .env.local
```
Dann alle `VITE_*` Variablen eintragen.

## Lokal starten
```
npm install && npm run dev
```
Benötigt Node 20.19+ (Vite 8).

## Deploy (Vercel)
1. Repo auf GitHub pushen
2. Vercel → New Project → Repo importieren
3. Env-Vars setzen: alle `VITE_*` **plus** die Server-Variablen aus
   `.env.example` (VAPID + Firebase Admin + `CRON_SECRET`)
4. Der Cron aus `vercel.json` (`/api/send-notifications`) läuft danach automatisch

## Benachrichtigungen

Alles über Web Push (VAPID):

| Auslöser | Wann | Woher |
|---|---|---|
| „Neue Runde gestartet" | Runde wird angelegt (auch automatisch aus der Warteschlange) | `POST /api/notify-round` |
| „Abstimmung läuft" | alle Mitglieder haben eingereicht | `POST /api/notify-round` |
| „Ergebnisse sind da" | alle haben abgestimmt und keine Folgerunde startet | `POST /api/notify-round` |
| Erinnerung | < 24h bis Deadline, nur an Mitglieder die noch nicht dran waren | Cron `/api/send-notifications` |

Die Rundenwechsel passieren im Client; der Server prüft den Zustand aber selbst in
Firestore nach und setzt einen Merker im Runden-Dokument, damit jede Benachrichtigung
höchstens einmal rausgeht. Benachrichtigt werden nur Mitglieder der jeweiligen Gruppe,
nie alle Nutzer.

### VAPID-Keys erzeugen
```
npx web-push generate-vapid-keys
```
Public Key → `VITE_VAPID_PUBLIC_KEY`, Private Key → `VAPID_PRIVATE_KEY`.

### Wichtig für iOS
Auf iPhone/iPad funktioniert Web Push **nur**, wenn die App über „Zum Home-Bildschirm"
installiert wurde — im normalen Safari-Tab gibt es keine Push-Benachrichtigungen.
