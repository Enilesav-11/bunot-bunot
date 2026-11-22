import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, Gift, UsersRound } from 'lucide-react'
import { ParolMark } from '@/components/parol-mark'
import { getPublicOnlineEvent } from '@/lib/session'

export const dynamic='force-dynamic'
const when=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'long',timeStyle:'short',timeZone:zone}).format(new Date(value))

export default async function PublicOnlineEventPage({params}:{params:Promise<{publicId:string}>}){
  const{publicId}=await params
  if(!/^[A-Za-z0-9_-]{32,80}$/.test(publicId))notFound()
  const event=await getPublicOnlineEvent(publicId)
  if(!event)notFound()
  return <main className="app-shell narrow-shell public-event-page"><header className="participant-brand"><Link className="brand" href="/"><ParolMark className="brand-mark"/> Bunot<span className="brand-dash">—</span>Bunot</Link><span>Public event page · read-only</span></header><section className="public-event-hero"><p className="eyebrow eyebrow-dark"><span>✦</span> PASKONG PINOY ONLINE EXCHANGE</p><h1>{event.session_name}</h1>{event.description&&<p className="page-intro">{event.description}</p>}<span className="status-pill status-active">{event.event_status.replaceAll('_',' ')}</span></section><section className="section-card"><div className="participant-detail-grid"><div><CalendarDays size={17}/><span>Registration deadline</span><strong>{when(event.registration_deadline,event.event_timezone)}</strong></div>{event.event_date&&<div><CalendarDays size={17}/><span>Gift exchange</span><strong>{when(event.event_date,event.event_timezone)}</strong></div>}{event.gift_budget&&<div><Gift size={17}/><span>Suggested budget</span><strong>₱{Number(event.gift_budget).toLocaleString('en-PH')}</strong></div>}<div><UsersRound size={17}/><span>Confirmed</span><strong>{event.confirmed_count}</strong></div></div>{event.instructions&&<p className="online-instructions">{event.instructions}</p>}{event.wishlists_enabled&&<p className="field-hint">Participants can add an optional wishlist. It is shared only with their assigned gift giver after assignments release.</p>}</section><p className="participant-footer"><Gift size={15}/> Invitation links are private and shared by the organizer.</p></main>
}
