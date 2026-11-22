import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, History, MonitorPlay, Play, Users } from 'lucide-react'
import { archiveSession, startRound } from '@/app/actions'
import { DrawControl } from '@/components/draw-control'
import { ParolMark } from '@/components/parol-mark'
import { ParticipantList } from '@/components/participant-list'
import { RecoveryForm, RecoveryCodeControl, SessionEditor, ShareButton, ParticipantImportForm } from '@/components/session-controls'
import { ResultsTable } from '@/components/results-table'
import { SessionKeepalive } from '@/components/session-keepalive'
import { getBunutanSession, isUuid } from '@/lib/session'

export default async function SessionPage({ params, searchParams }: PageProps<'/sessions/[sessionId]'>) {
  const { sessionId } = await params
  const query = await searchParams
  if (!isUuid(sessionId)) notFound()
  const data = await getBunutanSession(sessionId)
  if (!data) return <main className="app-shell narrow-shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Home</Link><section className="form-card"><p className="eyebrow eyebrow-dark">RESTORE A BUNUTAN</p><h1>Welcome back.</h1><p className="page-intro">This browser does not have management access. Enter the recovery code you saved when this bunutan was created.</p><RecoveryForm id={sessionId} /></section></main>

  const { session, participants, rounds } = data
  const active = participants.filter((person) => person.status === 'active')
  const round = rounds.find((item) => item.status === 'in_progress') ?? rounds[0]
  const snapshotCount = round?.participant_count ?? active.length
  const remaining = round ? Math.max(0, snapshotCount - round.results.length) : active.length
  const latestResult = round?.results[round.results.length - 1] ?? null
  const allResults = rounds.flatMap((item) => item.results.map((result) => ({ round: item.round_number, name: result.display_name, order: result.draw_order, drawnAt: result.drawn_at }))).sort((a, b) => a.round - b.round || a.order - b.order)
  const begin = startRound.bind(null, sessionId)
  const archive = archiveSession.bind(null, sessionId)
  const archived = session.status === 'archived'

  return <>
    <header className="app-header"><div className="app-header-inner"><Link className="brand app-brand" href="/"><ParolMark className="brand-mark" /> Bunot<span className="brand-dash">—</span>Bunot</Link><nav aria-label="Session navigation"><Link href="/">Home</Link><a href={`/p/${session.public_id}`} target="_blank" rel="noreferrer">Party screen</a></nav></div></header>
    <main className="app-shell">
      <SessionKeepalive id={sessionId} />
      <Link className="back-link" href="/"><ArrowLeft size={16} /> Home</Link>
      {query.error === 'round' && <p className="form-message form-error" role="alert">Add at least one name and finish any active round before starting another.</p>}
      {query.error === 'archive' && <p className="form-message form-error" role="alert">Finish the current round before archiving this bunutan.</p>}
      {query.error === 'remove' && <p className="form-message form-error" role="alert">This name could not be removed. The roster may be locked by a round.</p>}

      <div className="page-heading-row event-heading"><div><p className="eyebrow eyebrow-dark"><span>✦</span> YOUR PASKO GATHERING</p><h1>{session.session_name}</h1><p className="page-intro"><CalendarDays size={16} /> Created {new Date(session.created_at).toLocaleDateString('en-PH', { dateStyle: 'long' })}<span className="dot-separator">·</span>{active.length} active names</p></div><div className="heading-actions"><span className={`status-pill ${archived ? 'status-removed' : 'status-active'}`}>{archived ? 'Archived' : 'Active'}</span></div></div>

      <div className="workspace-grid">
        <section className="workspace-main">
          <div className="section-card"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">THE GUEST LIST</p><h2>{active.length} <span>active names</span></h2></div><Users className="card-heading-icon" size={22} /></div>
            {!archived && !round && <ParticipantImportForm id={sessionId} />}
            {round?.status === 'in_progress' && <p className="locked-note">Names are locked while round {round.round_number} is in progress.</p>}
            <ParticipantList eventId={sessionId} people={participants} locked={Boolean(round?.status === 'in_progress') || archived} />
            <div className="export-links"><a className="subtle-link" href={`/sessions/${sessionId}/export?kind=participants`}>Download guest list CSV ↓</a></div>
          </div>
          <div className="section-card history-card"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">DRAW HISTORY</p><h2>Every name, remembered.</h2></div><History className="card-heading-icon" size={22} /></div>
            <ResultsTable rows={allResults} exportHref={`/sessions/${sessionId}/export?kind=results`} />
          </div>
        </section>

        <aside className="workspace-side">
          <section className="section-card" id="drawing"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">THE BIG REVEAL</p><h2>{round ? `Round ${round.round_number}` : 'Ready when you are'}</h2></div><Play className="card-heading-icon" size={22} /></div>
            {round ? <><div className="round-stats"><div><strong>{snapshotCount}</strong><span>Names in round</span></div><div><strong>{remaining}</strong><span>Still to draw</span></div><span className={`status-pill ${round.status === 'completed' ? 'status-complete' : 'status-active'}`}>{round.status === 'completed' ? 'Complete' : 'In progress'}</span></div>
              {round.status === 'in_progress' && <DrawControl sessionId={sessionId} roundId={round.id} remaining={remaining} complete={false} initialResult={latestResult} />}
              {round.status === 'completed' && <p className="last-result-note">Everyone has had their moment. Start another round whenever you’re ready.</p>}
            </> : <><p className="section-intro side-intro">Add the guest list, then draw a name at a time. Each person is selected only once per round.</p><form action={begin}><button className="button button-primary" disabled={!active.length || archived}><Play size={17} /> Start drawing</button></form></>}
            {round && <div className="round-links"><a href={`/p/${session.public_id}`} target="_blank" rel="noreferrer"><MonitorPlay size={16} /> Open party screen</a>{round.status === 'completed' && !archived && <form action={begin}><button className="quiet-button">Start another round →</button></form>}</div>}
          </section>
          <section className="section-card"><p className="eyebrow eyebrow-dark">SHARE THE PARTY DISPLAY</p><p className="field-hint">Anyone with this link can see the latest reveal and remaining count. It cannot change your bunutan.</p><ShareButton publicId={session.public_id} /></section>
          <section className="section-card"><p className="eyebrow eyebrow-dark">EVENT DETAILS</p>{archived ? <p className="page-intro">{session.description || 'No event note.'}</p> : <SessionEditor id={sessionId} name={session.session_name} description={session.description} />}<p className="expiry-note">This bunutan is kept until {new Date(session.expires_at).toLocaleDateString('en-PH', { dateStyle: 'long' })}. Activity extends its life.</p>{!archived && <form action={archive}><button className="archive-button">Archive this bunutan</button></form>}</section>
          {!archived && <section className="section-card"><p className="eyebrow eyebrow-dark">SESSION RECOVERY</p><RecoveryCodeControl id={sessionId} /></section>}
        </aside>
      </div>
    </main>
  </>
}
