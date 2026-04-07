import { useEffect, useState } from 'react'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus('unauthenticated')
        return
      }
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (!userDoc.exists()) {
        setStatus('needs-onboarding')
      } else {
        setStatus('authenticated')
      }
    })
    return unsubscribe
  }, [])

  if (status === 'loading') return <div className="loading">Loading...</div>
  if (status === 'unauthenticated') return <Navigate to="/login" />
  if (status === 'needs-onboarding') return <Navigate to="/onboarding" />
  return children
}

export default ProtectedRoute