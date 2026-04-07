import { auth, provider } from '../firebase'
import { signInWithPopup } from 'firebase/auth'

function Login() {
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