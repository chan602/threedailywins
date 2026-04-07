import { useState } from 'react'
import { auth, db } from '../firebase'
import { doc, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

function Onboarding() {
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [physical, setPhysical] = useState('')
  const [mental, setMental] = useState('')
  const [spiritual, setSpritual] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleUsernameSubmit = async () => {
    if (!username.trim() || username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    setError('')
    setStep(2)
  }

  const handleFinish = async (useDefaults) => {
    const user = auth.currentUser
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      username: username.toLowerCase(),
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
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUsernameSubmit()}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="google-btn" onClick={handleUsernameSubmit}>
              Continue
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