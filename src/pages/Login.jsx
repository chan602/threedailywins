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
}

export default Login