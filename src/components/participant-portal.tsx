'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Gift, Heart, LockKeyhole, Sparkles } from 'lucide-react'
import { confirmGiftParticipation, forgetGiftParticipantAccess, revealMyGiftAssignment, saveGiftWishlist, type FormState, type GiftAssignmentReply } from '@/app/actions'
import type { ParticipantPortal } from '@/lib/session'

const initial:FormState={error:''}
const when=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'long',timeStyle:'short',timeZone:zone}).format(new Date(value))

export function ParticipantPortalView({data}:{data:ParticipantPortal}){
  const{event,participant}=data
  const registrationOpen=data.registration_open
  return <main className="app-shell narrow-shell participant-shell">
    <header className="participant-brand"><Link href="/">✳ Bunot—Bunot</Link><form action={forgetGiftParticipantAccess}><button className="quiet-button">Forget this device</button></form></header>
    <section className="participant-welcome"><p className="eyebrow eyebrow-dark"><span>✦</span> YOUR CHRISTMAS EXCHANGE</p><h1>{event.session_name}</h1><p className="participant-identity">For <strong>{participant.display_name}</strong></p>{event.description&&<p className="page-intro">{event.description}</p>}</section>
    <section className="section-card participant-event-details"><div className="participant-detail-grid"><div><span>Registration deadline</span><strong>{when(event.registration_deadline,event.event_timezone)}</strong></div>{event.event_date&&<div><span>Gift exchange</span><strong>{when(event.event_date,event.event_timezone)}</strong></div>}{event.gift_budget&&<div><span>Suggested budget</span><strong>₱{Number(event.gift_budget).toLocaleString('en-PH')}</strong></div>}</div>{event.instructions&&<p className="online-instructions">{event.instructions}</p>}</section>
    {participant.registration_status==='pending'&&registrationOpen&&<ConfirmParticipation name={participant.display_name}/>}
    {participant.registration_status==='pending'&&!registrationOpen&&<section className="section-card"><p className="eyebrow eyebrow-dark">REGISTRATION</p><h2>Registration is closed.</h2><p className="page-intro">The organizer will need to reopen registration or update your invitation before you can join.</p></section>}
    {participant.registration_status==='declined'&&registrationOpen&&<section className="section-card"><p className="eyebrow eyebrow-dark">YOUR RESPONSE</p><h2>You declined this invitation.</h2><p className="page-intro">If you changed your mind, you can still confirm before the registration deadline.</p><ConfirmParticipation name={participant.display_name}/></section>}
    {participant.registration_status==='declined'&&!registrationOpen&&<section className="section-card"><p className="eyebrow eyebrow-dark">YOUR RESPONSE</p><h2>Your response was recorded.</h2><p className="page-intro">The organizer can see that you declined.</p></section>}
    {participant.registration_status==='confirmed'&&<>
      {event.wishlists_enabled&&<WishlistForm data={data}/>}
      {data.my_assignment?<AssignmentCard data={data.my_assignment}/>:data.assignment_available?<RevealAssignment/>:<section className="section-card participant-waiting"><Sparkles size={25}/><p className="eyebrow eyebrow-dark">ASSIGNMENT IN PREPARATION</p><h2>Your Christmas assignment is being prepared.</h2><p>Please come back after <strong>{when(event.assignment_release_at,event.event_timezone)}</strong>. Your assigned person will stay private to you.</p></section>}
    </>}
    <footer className="participant-footer"><LockKeyhole size={15}/> This link opens only your participant portal. Keep it private.</footer>
  </main>
}

function ConfirmParticipation({name}:{name:string}){
  const[reply,setReply]=useState<FormState|null>(null),[pending,start]=useTransition()
  function submit(value:'confirm'|'decline'){start(async()=>setReply(await confirmGiftParticipation(value)))}
  return <section className="section-card confirm-card"><p className="eyebrow eyebrow-dark">PLEASE CONFIRM</p><h2>Are you joining, {name}?</h2><p className="page-intro">Confirm to join the final roster. Your assignment will stay secret until the organizer’s release time.</p>{reply?.error&&<p className="form-message form-error" role="alert">{reply.error}</p>}{reply?.message&&<p className="form-message form-success" role="status">{reply.message}</p>}<div className="participant-actions"><button className="button button-primary" disabled={pending} onClick={()=>submit('confirm')}><Check size={16}/>{pending?'Saving…':'Confirm participation'}</button><button className="button button-outline" disabled={pending} onClick={()=>submit('decline')}>Decline</button></div></section>
}

function WishlistForm({data}:{data:ParticipantPortal}){
  const[reply,action,pending]=useActionState(saveGiftWishlist,initial),preferences=data.wishlist?.preferences??{}
  return <section className="section-card"><p className="eyebrow eyebrow-dark"><span>✦</span> OPTIONAL WISHLIST</p><h2>Give your gift giver a few ideas.</h2><p className="field-hint">Your wishlist is private and will only be shown to the person assigned to you after assignments release.</p><form className="app-form wishlist-form" action={action}><label>Gift ideas or preferences<textarea name="gift_preferences" rows={3} maxLength={500} defaultValue={preferences.gift_preferences??''} placeholder="A book, a cozy mug, or anything handmade."/></label><label>Interests and hobbies<textarea name="interests" rows={2} maxLength={500} defaultValue={preferences.interests??''} placeholder="Baking, gardening, board games…"/></label><label>Favorite colors<input name="favorite_colors" maxLength={500} defaultValue={preferences.favorite_colors??''} placeholder="Green, cream, warm red"/></label><label>Note for your gift giver <span className="muted-label">(optional)</span><textarea name="message" rows={2} maxLength={1000} defaultValue={data.wishlist?.message??''} placeholder="Anything else you’d like to share."/></label>{reply.error&&<p className="form-message form-error" role="alert">{reply.error}</p>}{reply.message&&<p className="form-message form-success" role="status">{reply.message}</p>}<button className="button button-outline" disabled={pending}>{pending?'Saving…':'Save wishlist'} <Heart size={16}/></button></form></section>
}

function RevealAssignment(){
  const[result,setResult]=useState<GiftAssignmentReply|null>(null),[pending,start]=useTransition(),router=useRouter()
  async function reveal(){const answer=await revealMyGiftAssignment();setResult(answer);if(!answer.error)router.refresh()}
  return result&&!result.error?<AssignmentCard data={result}/>:<section className="section-card reveal-card"><Gift size={28}/><p className="eyebrow eyebrow-dark">YOUR SECRET ASSIGNMENT IS READY</p><h2>Ready to reveal?</h2><p className="page-intro">Find a quiet moment. Only your assigned recipient will appear here.</p>{result?.error&&<p className="form-message form-error" role="alert">{result.error}</p>}<button className="button button-primary" disabled={pending} onClick={()=>start(reveal)}>{pending?'Opening your note…':'Reveal my assignment'} <Sparkles size={16}/></button></section>
}

function AssignmentCard({data}:{data:GiftAssignmentReply|NonNullable<ParticipantPortal['my_assignment']>}){
  if(!data.recipient_name)return null
  const wishlist='recipient_wishlist'in data?data.recipient_wishlist:null
  return <section className="section-card assignment-card" aria-live="polite"><p className="eyebrow"><span>✦</span> KEEP THIS ONE SECRET</p><p className="assignment-intro">You are giving a gift to…</p><h2>{data.recipient_name}</h2><p className="assignment-secret">Only you can see this assignment from your participant link.</p>{wishlist&&<div className="recipient-wishlist"><p className="eyebrow eyebrow-dark">A FEW IDEAS FROM {data.recipient_name.toUpperCase()}</p>{wishlist.preferences.gift_preferences&&<p><strong>Gift ideas:</strong> {wishlist.preferences.gift_preferences}</p>}{wishlist.preferences.interests&&<p><strong>Interests:</strong> {wishlist.preferences.interests}</p>}{wishlist.preferences.favorite_colors&&<p><strong>Colors:</strong> {wishlist.preferences.favorite_colors}</p>}{wishlist.message&&<p><strong>Note:</strong> {wishlist.message}</p>}</div>}</section>
}
