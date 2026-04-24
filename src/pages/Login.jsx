import { useEffect, useState, useRef } from 'react'
import { auth, provider, db } from '../firebase'
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

const DIMS = [
  { cls: 'physical',  img: '/icons/wins/physical_achieved.png',  label: 'Physical',  desc: 'Body & movement' },
  { cls: 'mental',    img: '/icons/wins/mental_achieved.png',    label: 'Mental',    desc: 'Mind & learning' },
  { cls: 'spiritual', img: '/icons/wins/spiritual_achieved.png', label: 'Spiritual', desc: 'Soul & presence' },
]

const TAGLINE = 'Most people end the day feeling behind.\nThree Daily Wins helps you close it\nfeeling like you showed up.'

function StarCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let stars = []
    let frame = 0
    let animId

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    function makeStars(n) {
      stars = []
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.1 + 0.2,
          alpha: Math.random() * 0.5 + 0.1,
          speed: Math.random() * 0.4 + 0.1,
          phase: Math.random() * Math.PI * 2,
        })
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++
      for (const s of stars) {
        const flicker = s.alpha + Math.sin(frame * s.speed * 0.04 + s.phase) * 0.18
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220,235,255,${Math.max(0, Math.min(1, flicker))})`
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    const handleResize = () => { resize(); makeStars(160) }
    resize()
    makeStars(160)
    draw()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="login-star-canvas" />
}

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
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError('Sign in failed. If you are on iPhone, try opening in Chrome.')
      }
      setSigningIn(false)
    }
  }

  return (
    <div className="login-v2-screen">
      <StarCanvas />
      <div className="login-v2-orb login-v2-orb-purple" />
      <div className="login-v2-orb login-v2-orb-amber" />
      <div className="login-v2-orb login-v2-orb-green" />

      <div className="login-v2-card">

        {/* Floating hero icon */}
        <div className="login-v2-hero-wrap">
          <div className="login-v2-halo" />
          <img className="login-v2-hero-img" src="/icons/icon-192.png" alt="3W" />
          <div className="login-v2-glow" />
        </div>

        {/* Wordmark */}
        <div className="login-v2-wordmark-wrap">
          <h1 className="login-v2-wordmark" data-text="threedailywins">threedailywins</h1>
        </div>

        {/* Tagline */}
        <p className="login-v2-tagline" style={{ whiteSpace: 'pre-line' }}>{TAGLINE}</p>

        {/* Dimension cards */}
        <div className="login-v2-dims">
          {DIMS.map(d => (
            <div key={d.cls} className={`login-v2-dim-card ${d.cls}`}>
              <img className="login-v2-dim-img" src={d.img} alt={d.label} />
              <span className="login-v2-dim-label">{d.label}</span>
              <span className="login-v2-dim-desc">{d.desc}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="login-v2-cta">
          {error && <p className="error-text">{error}</p>}
          <button className="login-v2-btn-google" onClick={handleGoogleSignIn} disabled={signingIn}>
            {signingIn ? (
              <div className="login-v2-spinner" />
            ) : (
              <>
                <svg className="login-v2-g-icon" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.4l-6.5-5.5C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.6 5.1C9.5 39.5 16.3 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.5C41.8 35.8 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
          <button className="login-v2-btn-guest" onClick={() => navigate('/guest')}>
            Try without an account
          </button>
        </div>

        {/* Footer */}
        <div className="login-v2-footer">
          <span className="login-v2-footer-item">Free to use</span>
          <span className="login-v2-footer-dot" />
          <span className="login-v2-footer-item">No ads</span>
          <span className="login-v2-footer-dot" />
          <span className="login-v2-footer-item">Works best in Chrome</span>
        </div>

        {/* Divider */}
        <div className="login-v2-divider">
          <div className="login-v2-divider-line" />
          <span className="login-v2-divider-text">About</span>
          <div className="login-v2-divider-line" />
        </div>

        {/* About */}
        <div className="login-v2-about">
          <p className="login-v2-about-text">
            Most productivity systems optimize for output. Three Daily Wins focuses on balance —
            progress across the physical, mental, and spiritual dimensions of life, evaluated
            daily by Claude AI based on your personal definitions of each win.
          </p>
          <a href="https://chan602.com/threewins.html" target="_blank" rel="noopener noreferrer" className="login-v2-about-link">
            Read about the philosophy →
          </a>
        </div>

      </div>
    </div>
  )
}

export default Login
