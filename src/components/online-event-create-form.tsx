'use client'

import { useActionState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Download } from 'lucide-react'
import { createOnlineEvent, type CreateOnlineReply, type FormState } from '@/app/actions'

const initial: FormState = { error: '' }
const subscribe = () => () => {}
const clientTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila'
const serverTimeZone = () => 'Asia/Manila'

export function OnlineEventCreateForm() {
  const timeZone=useSyncExternalStore(subscribe,clientTimeZone,serverTimeZone)
  const [result,action,pending]=useActionState(async(_:CreateOnlineReply,form:FormData)=>createOnlineEvent(initial,form),{success:false,error:''} as CreateOnlineReply)
  const router=useRouter()
  if(result.success)return <section className="recovery-card" role="status"><p className="eyebrow eyebrow-dark">SAVE YOUR ORGANIZER RECOVERY CODE</p><p>This code restores event management access in another browser. Save it privately before continuing.</p><strong className="recovery-code">{result.recoveryCode}</strong><div className="recovery-actions"><button className="button button-outline" type="button" onClick={()=>{const url=URL.createObjectURL(new Blob([`Bunot-Bunot online exchange backup\nOrganizer page: ${window.location.origin}/sessions/${result.id}\nRecovery code: ${result.recoveryCode}\n\nKeep this file private.`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=`bunot-exchange-recovery-${result.id}.txt`;a.click();URL.revokeObjectURL(url)}}><Download size={16}/> Download backup</button><button className="button button-primary" onClick={()=>router.push(`/sessions/${result.id}`)}>Continue to event <ArrowUpRight size={16}/></button></div></section>
  return <form className="app-form online-event-form" action={action}>
    <label>Event name<input name="name" maxLength={120} required autoFocus placeholder="The Santos Family Gift Exchange"/></label>
    <label>Event description <span className="muted-label">(optional)</span><textarea name="description" rows={3} maxLength={2000} placeholder="A little note for everyone joining."/></label>
    <p className="event-timezone">Dates use your device time zone: <strong>{timeZone}</strong></p><input type="hidden" name="event_timezone" value={timeZone}/>
    <label>Registration deadline<input type="datetime-local" name="registration_deadline" required/></label>
    <label>Assignment release date and time<input type="datetime-local" name="assignment_release_at" required/></label>
    <label>Gift exchange date <span className="muted-label">(optional)</span><input type="datetime-local" name="event_date"/></label>
    <label>Gift budget in PHP <span className="muted-label">(optional)</span><input type="number" name="gift_budget" min="1" max="1000000" step="1" placeholder="500"/></label>
    <label>Exchange instructions <span className="muted-label">(optional)</span><textarea name="instructions" rows={3} maxLength={4000} placeholder="Share the rules, delivery details, or a theme."/></label>
    <label className="online-checkbox"><input type="checkbox" name="wishlists_enabled"/> Let participants share an optional wishlist with their gift giver.</label>
    {!result.success&&result.error&&<p className="form-message form-error" role="alert">{result.error}</p>}
    <button className="button button-primary" disabled={pending}>{pending?'Creating event…':'Create online gift exchange'} <ArrowUpRight size={17}/></button>
  </form>
}
