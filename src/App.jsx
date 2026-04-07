import { useState, useEffect } from 'react'
import { auth, provider } from './firebase'
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
  }

  if (loading) return <div className="loading">Loading...</div>

  if (!user) return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>threedailywins</h1>
        <p>Track your daily physical, mental, and spiritual wins.</p>
        <button className="google-btn" onClick={handleGoogleSignIn}>
          Continue with Google
        </button>
      </div>
    </div>
  )

  return (
    <div className="app">
      <h1>Welcome, {user.displayName}</h1>
      <button onClick={handleSignOut}>Sign out</button>
    </div>
  )
}

export default App