const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/spotify/callback`

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ')

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return values.reduce((acc, x) => acc + possible[x % possible.length], '')
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function initiateSpotifyAuth() {
  const codeVerifier = generateRandomString(64)
  const codeChallenge = base64encode(await sha256(codeVerifier))
  localStorage.setItem('spotify_code_verifier', codeVerifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    show_dialog: 'true',
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCodeForToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier')
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })
  const data = await response.json()
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token)
    localStorage.setItem('spotify_refresh_token', data.refresh_token)
    localStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000)
    localStorage.removeItem('spotify_code_verifier')
    return data.access_token
  }
  throw new Error(data.error_description || 'Spotify-Authentifizierung fehlgeschlagen')
}

export async function refreshSpotifyToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token')
  if (!refreshToken) return null

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await response.json()
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token)
    localStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000)
    if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token)
    return data.access_token
  }
  disconnectSpotify()
  return null
}

export async function getSpotifyToken() {
  const expiry = Number(localStorage.getItem('spotify_token_expiry'))
  const token = localStorage.getItem('spotify_access_token')
  if (!token) return null
  if (Date.now() < expiry - 60_000) return token
  return refreshSpotifyToken()
}

export function isSpotifyConnected() {
  return !!localStorage.getItem('spotify_access_token')
}

export function disconnectSpotify() {
  localStorage.removeItem('spotify_access_token')
  localStorage.removeItem('spotify_refresh_token')
  localStorage.removeItem('spotify_token_expiry')
  localStorage.removeItem('spotify_code_verifier')
}

// --- API calls --- only add Content-Type for non-GET requests
async function spotifyFetch(endpoint, options = {}) {
  const token = await getSpotifyToken()
  if (!token) throw new Error('Nicht mit Spotify verbunden')

  const isGet = !options.method || options.method === 'GET'
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(isGet ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers,
  })

  if (response.status === 204) return null
  const data = await response.json()
  if (!response.ok) {
    console.error('Spotify API error:', data)
    throw new Error(data.error?.message || 'Spotify API Fehler ' + response.status)
  }
  return data
}

export async function searchTracks(query) {
  const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=10&market=from_token`)
  return data.tracks.items
}

export async function getSpotifyUser() {
  return spotifyFetch('/me')
}

export async function createPlaylist(userId, name, description) {
  return spotifyFetch(`/me/playlists`, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: true }),
  })
}

export async function addTracksToPlaylist(playlistId, trackUris) {
  return spotifyFetch(`/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ uris: trackUris }),
  })
}
