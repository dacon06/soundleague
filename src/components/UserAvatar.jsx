// UserAvatar - fetches and displays the user's chosen emoji
// Use this everywhere you show a user's avatar
import { useState, useEffect } from 'react'
import { getUserEmoji } from '../hooks/useUserEmoji'
import Avatar from './Avatar'

export default function UserAvatar({ uid, name, size = 36 }) {
  const [emoji, setEmoji] = useState(null)

  useEffect(() => {
    if (!uid) return
    getUserEmoji(uid).then(setEmoji)
  }, [uid])

  return <Avatar name={name} uid={uid} emoji={emoji} size={size} />
}
