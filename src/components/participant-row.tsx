'use client'

import { useActionState } from 'react'
import { removeParticipant, updateParticipant, type FormState } from '@/app/actions'

const initial: FormState = { error: '' }

export function ParticipantRow({ eventId, id, name, active, locked, duplicate = false }: { eventId: string; id: string; name: string; active: boolean; locked: boolean; duplicate?: boolean }) {
  const bound = updateParticipant.bind(null, eventId, id)
  const [state, action, pending] = useActionState(async (_: FormState, form: FormData) => bound(form), initial)
  return <li className="participant-row">
    <form className="participant-edit" action={action}>
      <label className="sr-only" htmlFor={`participant-${id}`}>Participant name</label>
      <input id={`participant-${id}`} name="display_name" defaultValue={name} maxLength={120} disabled={locked || !active} />
      {active && <button className="quiet-button" disabled={locked || pending}>{pending ? 'Saving…' : 'Save'}</button>}
      {state.error && <span className="inline-error" role="alert">{state.error}</span>}
    </form>
    <span className={`status-pill ${active ? 'status-active' : 'status-removed'}`}>{active ? 'Active' : 'Removed'}</span>
    {duplicate && <span className="duplicate-note">Repeated name · separate entry</span>}
    {active && <form action={removeParticipant.bind(null, eventId, id)}><button className="quiet-button remove-button" disabled={locked} aria-label={`Remove ${name}`}>Remove</button></form>}
  </li>
}
