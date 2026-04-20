const YT_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY

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

  return (data.items || []).map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    publishedAt: item.snippet.publishedAt,
    videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?autoplay=1`,
  }))
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
