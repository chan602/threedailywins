import { useEffect, useState } from 'react'
import { auth, provider, db } from '../firebase'
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      navigate(userDoc.exists() ? '/home' : '/onboarding')
    })
    return unsubscribe
  }, [navigate])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError('')
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      console.error('Sign in error:', err)
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed popup — not an error
      } else {
        setError('Sign in failed. If you are on iPhone, try opening in Chrome.')
      }
      setSigningIn(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">

        {/* Icon + title */}
        <div className="login-hero">
          <img src="/icons/icon-192.png" alt="3W" className="login-icon" />
          <h1 className="login-title">threedailywins</h1>
          <p className="login-tagline">
            Most people end the day feeling behind. Three Daily Wins helps you close it feeling like you showed up.
          </p>
        </div>

        {/* Feature list */}
        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-dot physical" />
            <span className="login-feature-text">Log daily tasks and track your progress</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-dot mental" />
            <span className="login-feature-text">Claude AI evaluates your three daily wins</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-dot spiritual" />
            <span className="login-feature-text">Build streaks and compete with friends</span>
          </div>
        </div>

        {/* Sign in */}
        {error && <p className="error-text">{error}</p>}
        <button
          className="google-btn"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
        >
          {!signingIn && (
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.4l-6.5-5.5C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.6 5.1C9.5 39.5 16.3 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.5C41.8 35.8 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z"/>
            </svg>
          )}
          {signingIn ? 'Signing in…' : 'Continue with Google'}
        </button>

        <button
          className="guest-btn"
          onClick={() => navigate('/guest')}
        >
          Try without an account
        </button>

        <p className="login-footer">Free to use · No ads · Works best in Chrome</p>

        {/* Philosophy / about */}
        <div className="login-about">
          <p className="login-about-text">
            Most productivity systems optimize for output. Three Daily Wins focuses on balance —
            the idea that a truly fulfilled day involves progress across the physical, mental, and
            spiritual dimensions of life, not just a completed task list. Each day, Claude AI
            reviews your completed tasks and determines whether you achieved your three wins,
            based on definitions personal to you.
          </p>
          <a
            href="https://chan602.com/threewins.html"
            target="_blank"
            rel="noopener noreferrer"
            className="login-learn-more"
          >
            Read about the philosophy →
          </a>
        </div>

      </div>
    </div>
  )
}

export default Login
