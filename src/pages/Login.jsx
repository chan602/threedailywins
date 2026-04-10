import { useEffect } from 'react'
import { auth, provider, db } from '../firebase'
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists()) {
        navigate('/home')
      } else {
        navigate('/onboarding')
      }
    })
    return unsubscribe
  }, [navigate])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">

        {/* Icon + title */}
        <div className="login-hero">
          <img src="/icons/icon-192.png" alt="3W" className="login-icon" />
          <h1 className="login-title">threedailywins</h1>
          <p className="login-tagline">Your daily physical, mental, and spiritual wins — tracked, evaluated, and shared.</p>
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
            <span className="login-feature-text">Compete on streaks with friends</span>
          </div>
        </div>

        {/* Sign in */}
        <button className="google-btn" onClick={handleGoogleSignIn}>
          Continue with Google
        </button>

        <p className="login-footer">Free to use · No ads</p>

      </div>
    </div>
  )
}

export default Login
