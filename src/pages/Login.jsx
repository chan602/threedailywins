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
            A structured framework for daily well-being — one physical, one mental, one spiritual win.
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
          {signingIn ? 'Signing in…' : 'Continue with Google'}
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
            href="https://chan602.com/devblog.html"
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
