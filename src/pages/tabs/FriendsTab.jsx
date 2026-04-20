// ── FRIENDS TAB ──────────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

import { useState } from 'react'

export default function FriendsTab({
  isGuest,
  navigate,
  uid,
  friendSearch,
  setFriendSearch,
  friendSearchError,
  setFriendSearchError,
  searchedUser,
  setSearchedUser,
  sendRequestStatus,
  setSendRequestStatus,
  friendsList,
  incomingRequests,
  searchUser,
  sendFriendRequest,
  acceptRequest,
  declineRequest,
  removeFriend,
  sendNudge,
  sendChallenge,
}) {
  const [challengeOpen, setChallengeOpen] = useState(null)  // uid of friend with open challenge box
  const [challengeText, setChallengeText] = useState('')
  const [challengeDest, setChallengeDest] = useState('today') // 'today' | 'weekly'
  const [challengeSending, setChallengeSending] = useState(false)
  const [challengeSent, setChallengeSent] = useState({})    // { [uid]: true }

  async function handleChallenge(friend) {
    if (!challengeText.trim() || challengeSending) return
    setChallengeSending(true)
    try {
      await sendChallenge(friend.uid, challengeText.trim(), challengeDest)
      setChallengeSent(prev => ({ ...prev, [friend.uid]: true }))
      setChallengeOpen(null)
      setChallengeText('')
      setChallengeDest('today')
      setTimeout(() => setChallengeSent(prev => ({ ...prev, [friend.uid]: false })), 3000)
    } catch (e) {
      console.error('challenge error:', e)
    }
    setChallengeSending(false)
  }

  if (isGuest) {
    return (
      <div className="friends-screen">
        <div className="guest-locked">
          <p className="guest-locked-icon">👥</p>
          <p className="guest-locked-title">Friends require an account</p>
          <p className="guest-locked-body">Sign up to add friends, see their streaks, and compete on leaderboards.</p>
          <button className="guest-locked-btn" onClick={() => navigate('/login')}>Create account</button>
        </div>
      </div>
    )
  }

  return (
    <div className="friends-screen">

      {/* Search header */}
      <div className="friends-header-row">
        <div>
          <p className="friends-title">Find people</p>
          <p className="friends-sub">Search by username to add as a friend.</p>
        </div>
        <button
          className="friends-share-btn"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'threedailywins',
                text: 'Track your daily physical, mental, and spiritual wins.',
                url: 'https://threedailywins.com'
              }).catch(() => {})
            } else {
              navigator.clipboard.writeText('https://threedailywins.com')
              alert('Link copied to clipboard!')
            }
          }}
          title="Invite friends"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="friends-share-icon">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="friends-search-row">
        <span className="friends-at">@</span>
        <input
          className="friends-input"
          placeholder="username"
          value={friendSearch}
          onChange={e => {
            setFriendSearch(e.target.value)
            setFriendSearchError('')
            setSearchedUser(null)
            setSendRequestStatus('')
          }}
          onKeyDown={e => e.key === 'Enter' && searchUser()}
        />
        <button className="friends-search-btn" onClick={searchUser}>Search</button>
      </div>
      {friendSearchError && <p className="friends-error">{friendSearchError}</p>}

      {/* Search result */}
      {searchedUser && (
        <div className="friends-result">
          <div className="friends-result-identity">
            <div className="lb-avatar">
              {searchedUser.photoURL
                ? <img src={searchedUser.photoURL} alt="" className="profile-avatar-img" />
                : <span className="profile-avatar-initial">{searchedUser.username[0].toUpperCase()}</span>
              }
            </div>
            <span className="friends-result-name" onClick={() => navigate(`/u/${searchedUser.username}`)}>
              @{searchedUser.username}
            </span>
          </div>
          <div className="friends-result-actions">
            {searchedUser.uid === uid ? (
              <span className="friends-status-msg">That's you</span>
            ) : friendsList.some(f => f.uid === searchedUser.uid) ? (
              <span className="friends-status-msg friends-status-green">Already friends</span>
            ) : sendRequestStatus === 'sent' ? (
              <span className="friends-status-msg friends-status-green">Request sent!</span>
            ) : sendRequestStatus === 'already_sent' ? (
              <span className="friends-status-msg">Request already sent</span>
            ) : (
              <button
                className="friends-add-btn"
                onClick={sendFriendRequest}
                disabled={sendRequestStatus === 'sending'}
              >
                {sendRequestStatus === 'sending' ? 'Sending…' : '+ Add friend'}
              </button>
            )}
            <button className="friends-view-btn" onClick={() => navigate(`/u/${searchedUser.username}`)}>
              View profile
            </button>
          </div>
        </div>
      )}

      <div className="friends-divider" />

      {/* Incoming requests */}
      {incomingRequests.length > 0 && (
        <div className="friends-section">
          <p className="friends-section-title">
            Friend requests
            <span className="friends-badge">{incomingRequests.length}</span>
          </p>
          {incomingRequests.map(req => (
            <div key={req.id} className="friends-request-row">
              <div className="lb-avatar">
                {req.photoURL
                  ? <img src={req.photoURL} alt="" className="profile-avatar-img" />
                  : <span className="profile-avatar-initial">{(req.username || '?')[0].toUpperCase()}</span>
                }
              </div>
              <span className="friends-req-name" onClick={() => navigate(`/u/${req.username}`)}>
                @{req.username}
              </span>
              <div className="friends-req-actions">
                <button className="friends-accept-btn" onClick={() => acceptRequest(req.uid, req.username, req.photoURL)}>Accept</button>
                <button className="friends-decline-btn" onClick={() => declineRequest(req.uid)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Friends list */}
      <div className="friends-section">
        <p className="friends-section-title">Friends ({friendsList.length})</p>
        {friendsList.length === 0 ? (
          <p className="friends-empty">No friends yet — search for someone to add.</p>
        ) : (
          friendsList.map(f => (
            <div key={f.id} className="friends-list-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                <div className="lb-avatar">
                  {f.photoURL
                    ? <img src={f.photoURL} alt="" className="profile-avatar-img" />
                    : <span className="profile-avatar-initial">{(f.username || '?')[0].toUpperCase()}</span>
                  }
                </div>
                <span className="friends-list-name" onClick={() => navigate(`/u/${f.username}`)}>
                  @{f.username}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {challengeSent[f.uid] ? (
                  <span className="friends-status-msg friends-status-green" style={{ fontSize: '0.75rem' }}>Sent!</span>
                ) : (
                  <button
                    className="friends-view-btn"
                    onClick={() => {
                      setChallengeOpen(challengeOpen === f.uid ? null : f.uid)
                      setChallengeText('')
                      setChallengeDest('today')
                    }}
                  >
                    {challengeOpen === f.uid ? 'Cancel' : '⚡ Challenge'}
                  </button>
                )}
                <button className="friends-remove-btn" onClick={() => removeFriend(f.uid)}>Remove</button>
              </div>
              {challengeOpen === f.uid && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <input
                    className="friends-input"
                    placeholder="Challenge task (e.g. 100 push ups)..."
                    value={challengeText}
                    onChange={e => setChallengeText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChallenge(f)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Add to:</span>
                    <button
                      className={`eval-mode-btn${challengeDest === 'today' ? ' active' : ''}`}
                      onClick={() => setChallengeDest('today')}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >Today</button>
                    <button
                      className={`eval-mode-btn${challengeDest === 'weekly' ? ' active' : ''}`}
                      onClick={() => setChallengeDest('weekly')}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >Weekly</button>
                    <button
                      className="friends-search-btn"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => handleChallenge(f)}
                      disabled={challengeSending || !challengeText.trim()}
                    >
                      {challengeSending ? '…' : 'Send ⚡'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  )
}
