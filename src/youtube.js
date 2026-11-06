const YT_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY

// YouTube API gibt Titel als HTML-encoded zurück (z.B. &amp; statt &)
function decodeHtml(str) {
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}

function toSong(id, snippet) {
  return {
    id,
    title: decodeHtml(snippet.title),
    channelTitle: decodeHtml(snippet.channelTitle),
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    publishedAt: snippet.publishedAt,
    videoUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1`,
  }
}

// ─── Link ───
// Erkennt YouTube-Links (watch, youtu.be, shorts, embed, live, music.youtube) und gibt die Video-ID zurück
export function extractVideoId(input) {
  const text = input?.trim()
  if (!text || /\s/.test(text)) return null
  let url
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`) }
  catch { return null }

  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/)
      if (match) id = match[2]
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

export async function getVideoById(videoId) {
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key: YT_API_KEY })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
  const data = await res.json()

  if (!res.ok) {
    console.error('YouTube API error:', data)
    throw new Error(data.error?.message || 'YouTube API Fehler')
  }

  const item = data.items?.[0]
  if (!item) throw new Error('Video nicht gefunden')
  return toSong(item.id, item.snippet)
}

// ─── Search ───
export async function searchSongs(query) {
  if (!query || query.trim().length < 3) return []

  const params = new URLSearchParams({
    part: 'snippet',
    q: query + ' official audio',
    type: 'video',
    videoCategoryId: '10', // Music category
    maxResults: 15,
    key: YT_API_KEY,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  const data = await res.json()

  if (!res.ok) {
    console.error('YouTube API error:', data)
    throw new Error(data.error?.message || 'YouTube API Fehler')
  }

  return (data.items || []).map(item => toSong(item.id.videoId, item.snippet))
}

// ─── Playlist ───
// Creates a YouTube playlist URL from multiple video IDs
export function createYouTubePlaylistUrl(videoIds) {
  if (!videoIds.length) return null
  // YouTube doesn't allow creating playlists via API without OAuth,
  // but we can create a "watch later" style playlist URL
  const list = videoIds.join(',')
  return `https://www.youtube.com/watch_videos?video_ids=${list}`
}

// Alternative: create a playlist link with first video + list
export function createYouTubeQueueUrl(videoIds) {
  if (!videoIds.length) return null
  const [first, ...rest] = videoIds
  if (!rest.length) return `https://www.youtube.com/watch?v=${first}`
  return `https://www.youtube.com/watch?v=${first}&list=${videoIds.join(',')}`
}
