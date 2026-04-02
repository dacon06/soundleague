import { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
  }, [])

  const register = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName,
      email,
      createdAt: serverTimestamp(),
      totalPoints: 0,
    })
    setUser({ ...cred.user, displayName })
    return cred.user
  }

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password)

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    const cred = await signInWithPopup(auth, provider)
    const profileDoc = await getDoc(doc(db, 'users', cred.user.uid))
    if (!profileDoc.exists()) {
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: cred.user.displayName || 'Unbekannt',
        email: cred.user.email,
        createdAt: serverTimestamp(),
        totalPoints: 0,
      })
    }
    return cred.user
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, register, login, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
