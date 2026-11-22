'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Copy, Download, KeyRound, Plus } from 'lucide-react'
import { addParticipants, createSession, recoverSession, rotateRecoveryCode, updateSession, type FormState, type RecoveryCodeReply } from '@/app/actions'

const initial: FormState = { error: '' }

export function CreateSessionButton({ className = 'button button-primary' }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null)
  function start() {
    setError('')
    startTransition(async () => {
      const result = await createSession()
      if (!result.success) setError(result.error)
      else setCreated({ id: result.id, code: result.recoveryCode })
    })
  }
  function continueToSession() { if (created) router.push(`/sessions/${created.id}`) }
  return created ? <div className="recovery-card" role="status">
    <p className="eyebrow eyebrow-dark">SAVE YOUR RECOVERY CODE</p>
    <p>This one-time code can restore this bunutan in another browser. Keep it somewhere private.</p>
    <strong className="recovery-code">{created.code}</strong>
    <div className="recovery-actions"><BackupButton id={created.id} code={created.code} /><button className="button button-primary" onClick={continueToSession}>Continue <ArrowUpRight size={16} /></button></div>
  </div> : <div className="create-session-action">
    <button className={className} onClick={start} disabled={pending}>{pending ? 'Starting…' : 'Start a bunutan'} <ArrowUpRight size={18} /></button>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>
}

function BackupButton({ id, code }: { id: string; code: string }) {
  function download() {
    const text = `Bunot-Bunot recovery backup\nManagement page: ${window.location.origin}/sessions/${id}\nRecovery code: ${code}\n\nKeep this file private. The code can restore management access once.`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    link.download = `bunot-recovery-${id}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  return <button className="button button-outline" onClick={download}><Download size={16} /> Download backup</button>
}

export function SessionEditor({ id, name, description }: { id: string; name: string; description: string | null }) {
  const [state, action, pending] = useActionState(async (_: FormState, form: FormData) => updateSession(id, form), initial)
  return <form className="app-form event-editor" action={action}>
    <label>Event name<input name="name" maxLength={120} required defaultValue={name} /></label>
    <label>Note <span className="muted-label">(optional)</span><textarea name="description" rows={3} maxLength={2000} defaultValue={description ?? ''} /></label>
    {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}
    {state.message && <p className="form-message form-success" role="status">{state.message}</p>}
    <button className="button button-outline" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button>
  </form>
}

export function ParticipantImportForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addParticipants.bind(null, id), initial)
  return <form className="app-form import-form" action={action}>
    <label>Paste names <span className="muted-label">(one per line)</span><textarea name="names" rows={5} placeholder={'Mika Santos\nJose Reyes\nAna Cruz'} /></label>
    <label>Or upload CSV<input name="csv" type="file" accept=".csv,text/csv" /></label>
    <p className="field-hint">CSV uses the first column. A “Name” or “Participant” header is optional. Up to 500 names per import.</p>
    {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}
    {state.message && <p className="form-message form-success" role="status">{state.message}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? 'Adding…' : 'Add names'} <Plus size={16} /></button>
  </form>
}

export function RecoveryForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(recoverSession.bind(null, id), initial)
  return <form className="app-form" action={action}>
    <label>Recovery code<input name="recovery_code" autoComplete="off" required placeholder="1234-ABCD-5678-EF90-1234" /></label>
    <p className="field-hint">Enter the code from your downloaded backup. It works once. After restoring access, create and save a fresh code before leaving this browser.</p>
    {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? 'Restoring…' : 'Restore access'} <KeyRound size={16} /></button>
  </form>
}

export function RecoveryCodeControl({ id }: { id: string }) {
  const [result, setResult] = useState<RecoveryCodeReply | null>(null)
  const [pending, startTransition] = useTransition()
  function create() {
    setResult(null)
    startTransition(async () => setResult(await rotateRecoveryCode(id)))
  }
  return <div className="recovery-backup-control">
    <p className="field-hint">Create a fresh one-time code after restoring access or if you need a new backup. Replacing it invalidates the previous code.</p>
    {result?.success && <div className="recovery-card" role="status"><p className="eyebrow eyebrow-dark">SAVE YOUR NEW RECOVERY CODE</p><strong className="recovery-code">{result.recoveryCode}</strong><BackupButton id={id} code={result.recoveryCode} /></div>}
    {result && !result.success && <p className="form-message form-error" role="alert">{result.error}</p>}
    <button type="button" className="button button-outline" onClick={create} disabled={pending}>{pending ? 'Creating…' : result?.success ? 'Replace recovery code' : 'Create recovery code'} <KeyRound size={16} /></button>
  </div>
}

export function ShareButton({ publicId }: { publicId: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${publicId}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { setCopied(false) }
  }
  return <div className="share-control"><a className="share-url" href={`/p/${publicId}`}>/p/{publicId}</a><button type="button" className="button button-outline" onClick={copy}><Copy size={16} /> {copied ? 'Link copied' : 'Copy party link'}</button></div>
}
