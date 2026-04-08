import { useState } from 'react'
import { auth, db } from '../firebase'
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

function Onboarding() {
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [physical, setPhysical] = useState('')
  const [mental, setMental] = useState('')
  const [spiritual, setSpritual] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const navigate = useNavigate()

  const handleUsernameSubmit = async () => {
    const trimmed = username.trim().toLowerCase()
    if (!trimmed || trimmed.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    setChecking(true)
    setError('')

    try {
      const q = query(collection(db, 'users'), where('username', '==', trimmed))
      const snap = await getDocs(q)
      if (!snap.empty) {
        setError('That username is already taken — try another.')
        setChecking(false)
        return
      }
    } catch (e) {
      console.error('Username check failed:', e)
      setError('Something went wrong — please try again.')
      setChecking(false)
      return
    }

    setChecking(false)
    setStep(2)
  }

  const handleFinish = async (useDefaults) => {
    const user = auth.currentUser
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      username: username.trim().toLowerCase(),
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      winsDefinition: {
        physical: useDefaults ? 'Any meaningful physical activity — climbing, gym, run, MMA, workout, sports.' : physical,
        mental: useDefaults ? 'Academic, professional, or goal-directed work — studying, researching, building, solving.' : mental,
        spiritual: useDefaults ? 'Broad and personal — journaling, meditation, prayer, sleeping 9+ hrs, meaningful conversation, reflection.' : spiritual,
      },
      visibility: {
        todo: 'friends',
        archive: 'friends',
        stats: 'public'
      },
      createdAt: Date.now()
    })
    navigate('/home')
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">

        {step === 1 && (
          <>
            <h2>Choose a username</h2>
            <p>This is how others will find and recognize you.</p>
            <input
              className="text-input"
              type="text"
              placeholder="e.g. nategoup"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && !checking && handleUsernameSubmit()}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="google-btn" onClick={handleUsernameSubmit} disabled={checking}>
              {checking ? 'Checking…' : 'Continue'}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Define your three wins</h2>
            <p>What counts as a win is personal to you. You can always change this later.</p>
            <div className="win-inputs">
              <label>Physical win</label>
              <input className="text-input" type="text" placeholder="e.g. Any workout, climb, or run" value={physical} onChange={e => setPhysical(e.target.value)} />
              <label>Mental win</label>
              <input className="text-input" type="text" placeholder="e.g. Study session, deep work" value={mental} onChange={e => setMental(e.target.value)} />
              <label>Spiritual win</label>
              <input className="text-input" type="text" placeholder="e.g. Journal, meditate, sleep early" value={spiritual} onChange={e => setSpritual(e.target.value)} />
            </div>
            <button className="google-btn" onClick={() => handleFinish(false)}>
              Save my definitions
            </button>
            <button className="skip-btn" onClick={() => handleFinish(true)}>
              Skip — use defaults
            </button>
          </>
        )}

      </div>
    </div>
  )
}

export default Onboarding
