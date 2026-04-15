// ── LEADERBOARD TAB ──────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

export default function LeaderboardTab({
  isGuest,
  navigate,
  uid,
  lbTab,
  setLbTab,
  lbEntries,
  lbLoading,
  friendsList,
}) {
  if (isGuest) {
    return (
      <div className="lb-screen">
        <div className="guest-locked">
          <p className="guest-locked-icon">🏆</p>
          <p className="guest-locked-title">Leaderboard requires an account</p>
          <p className="guest-locked-body">Sign up to track your streak, rank globally, and compete with friends.</p>
          <button className="guest-locked-btn" onClick={() => navigate('/login')}>Create account</button>
        </div>
      </div>
    )
  }

  return (
    <div className="lb-screen">

      {/* Sub-tabs */}
      <div className="lb-tabs">
        <button className={`lb-tab ${lbTab === 'streak' ? 'active' : ''}`} onClick={() => setLbTab('streak')}>Streak</button>
        <button className={`lb-tab ${lbTab === 'wins' ? 'active' : ''}`} onClick={() => setLbTab('wins')}>Total Wins</button>
        <button className={`lb-tab ${lbTab === 'friends' ? 'active' : ''}`} onClick={() => setLbTab('friends')}>Friends</button>
      </div>

      {/* Friends leaderboard */}
      {lbTab === 'friends' && (
        <div className="lb-list" style={{ padding: '0 1rem' }}>
          {friendsList.length === 0 ? (
            <p className="empty-msg" style={{ paddingTop: '1.5rem' }}>Add friends to see a friend leaderboard.</p>
          ) : (() => {
            const friendUids = new Set([...friendsList.map(f => f.uid), uid])
            const sorted = lbEntries
              .filter(e => friendUids.has(e.uid))
              .sort((a, b) => (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0))
            return sorted.map((entry, i) => {
              const isMe = entry.uid === uid
              const rank = i + 1
              return (
                <div key={entry.uid} className={`lb-row ${isMe ? 'me' : ''} ${rank <= 3 ? `lb-row-${rank}` : ''}`}
                  onClick={() => entry.username && navigate(`/u/${entry.username}`)}>
                  <span className={`lb-rank ${rank <= 3 ? `lb-rank-${rank}` : ''}`}>{rank}</span>
                  <div className="lb-avatar">
                    {entry.photoURL
                      ? <img src={entry.photoURL} alt="" className="profile-avatar-img" />
                      : <span className="profile-avatar-initial">{(entry.username || '?')[0].toUpperCase()}</span>
                    }
                  </div>
                  <span className="lb-username">
                    @{entry.username || '—'}
                    {isMe && <span className="lb-you"> you</span>}
                  </span>
                  <div className="lb-stats">
                    <span className="lb-stat-val">{entry.current ?? 0}</span>
                    <span className="lb-stat-label">streak</span>
                  </div>
                  <div className="lb-stats">
                    <span className="lb-stat-val">{entry.total ?? 0}</span>
                    <span className="lb-stat-label">wins</span>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Global leaderboard — streak or wins tab */}
      {(lbTab === 'streak' || lbTab === 'wins') && (
        <>
          {lbLoading && <p className="empty-msg">Loading…</p>}
          {!lbLoading && (() => {
            const sorted = [...lbEntries].sort((a, b) => {
              if (lbTab === 'streak') {
                return (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0)
              } else {
                return (b.total ?? 0) - (a.total ?? 0) || (b.current ?? 0) - (a.current ?? 0)
              }
            })

            const ownRank = sorted.findIndex(e => e.uid === uid) + 1
            const top = sorted.slice(0, 50)
            const selfEntry = sorted.find(e => e.uid === uid)
            const selfInTop = top.some(e => e.uid === uid)

            return (
              <div className="lb-list">
                {top.length === 0 && (
                  <p className="empty-msg">No entries yet — evaluate your wins to appear here.</p>
                )}
                {top.map((entry, i) => {
                  const isMe = entry.uid === uid
                  const rank = i + 1
                  return (
                    <div
                      key={entry.uid}
                      className={`lb-row ${isMe ? 'me' : ''} ${rank <= 3 ? `lb-row-${rank}` : ''}`}
                      onClick={() => entry.username && navigate(`/u/${entry.username}`)}
                    >
                      <span className={`lb-rank ${rank <= 3 ? `lb-rank-${rank}` : ''}`}>
                        {rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : rank}
                      </span>
                      <div className="lb-avatar">
                        {entry.photoURL
                          ? <img src={entry.photoURL} alt="" className="profile-avatar-img" />
                          : <span className="profile-avatar-initial">
                              {(entry.username || '?')[0].toUpperCase()}
                            </span>
                        }
                      </div>
                      <span className="lb-username">
                        @{entry.username || '—'}
                        {isMe && <span className="lb-you"> you</span>}
                      </span>
                      <div className="lb-stats">
                        <span className="lb-stat-val">{entry.current ?? 0}</span>
                        <span className="lb-stat-label">streak</span>
                      </div>
                      <div className="lb-stats">
                        <span className="lb-stat-val">{entry.total ?? 0}</span>
                        <span className="lb-stat-label">wins</span>
                      </div>
                    </div>
                  )
                })}

                {/* Show own row if outside top 50 */}
                {!selfInTop && selfEntry && (
                  <>
                    <div className="lb-gap">···</div>
                    <div className="lb-row me">
                      <span className="lb-rank">{ownRank}</span>
                      <div className="lb-avatar">
                        {selfEntry.photoURL
                          ? <img src={selfEntry.photoURL} alt="" className="profile-avatar-img" />
                          : <span className="profile-avatar-initial">
                              {(selfEntry.username || '?')[0].toUpperCase()}
                            </span>
                        }
                      </div>
                      <span className="lb-username">
                        @{selfEntry.username || '—'}
                        <span className="lb-you"> you</span>
                      </span>
                      <div className="lb-stats">
                        <span className="lb-stat-val">{selfEntry.current ?? 0}</span>
                        <span className="lb-stat-label">streak</span>
                      </div>
                      <div className="lb-stats">
                        <span className="lb-stat-val">{selfEntry.total ?? 0}</span>
                        <span className="lb-stat-label">wins</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}

    </div>
  )
}
