import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore'

// Cache emojis in memory to avoid repeated Firestore reads
const emojiCache = {}

export function useUserEmoji() {
  const { user } = useAuth()
  const [emoji, setEmoji] = useState(() => emojiCache[user?.uid] || null)

  useEffect(() => {
    if (!user) return
    if (emojiCache[user.uid]) { setEmoji(emojiCache[user.uid]); return }

    return onSnapshot(doc(db, 'users', user.uid), snap => {
      const e = snap.data()?.emoji || null
      emojiCache[user.uid] = e
      setEmoji(e)
    })
  }, [user])

  const updateEmoji = async (newEmoji) => {
    if (!user) return
    emojiCache[user.uid] = newEmoji
    setEmoji(newEmoji)
    await updateDoc(doc(db, 'users', user.uid), { emoji: newEmoji })
  }

  return { emoji, updateEmoji }
}

// Fetch emoji for any user (for displaying other people's avatars)
export async function getUserEmoji(uid) {
  if (emojiCache[uid] !== undefined) return emojiCache[uid]
  const snap = await getDoc(doc(db, 'users', uid))
  const e = snap.data()?.emoji || null
  emojiCache[uid] = e
  return e
}

// Hook to get emojis for multiple users at once
export function useGroupEmojis(memberUids) {
  const [emojis, setEmojis] = useState({})

  useEffect(() => {
    if (!memberUids?.length) return
    const fetchAll = async () => {
      const result = {}
      await Promise.all(memberUids.map(async uid => {
        result[uid] = await getUserEmoji(uid)
      }))
      setEmojis(result)
    }
    fetchAll()
  }, [memberUids?.join(',')])

  return emojis
}
