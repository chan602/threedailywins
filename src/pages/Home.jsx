import { auth } from '../firebase'
import { signOut } from 'firebase/auth'

function Home() {
  return (
    <div className="app">
      <h1>Welcome home</h1>
      <p>Todo list goes here</p>
      <button onClick={() => signOut(auth)}>Sign out</button>
    </div>
  )
}

export default Home