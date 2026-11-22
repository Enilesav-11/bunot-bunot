'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { CalendarDays, Check, Copy, LockKeyhole, RotateCcw, Send, UsersRound } from 'lucide-react'
import { addGiftInvites, cancelGiftExchange, closeGiftRegistration, completeGiftExchange, generateGiftAssignments, lockGiftRoster, openGiftRegistration, revokeGiftInvitation, rotateGiftParticipantLink, rotateGiftParticipantLinks, updateGiftInvitation, voidGiftAssignmentRound, type FormState, type GiftInviteReply } from '@/app/actions'
import type { OnlineEventDashboard, OnlineParticipant } from '@/lib/session'
import { SessionEditor, RecoveryCodeControl } from '@/components/session-controls'

const initial:FormState={error:''}
const dateLabel=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value))

export function OnlineEventManagement({id,data}:{id:string;data:OnlineEventDashboard}){
  const{session,participants,counts,rounds}=data
  const status=session.event_status
  const activeParticipants=participants.filter(person=>['pending','confirmed'].includes(person.registration_status))
  const canIssuePendingLinks=['draft','inviting','registration_open'].includes(status)
  const canRemoveConfirmed=status==='registration_closed'&&rounds.some(round=>round.status==='voided')
  const reissuableParticipants=activeParticipants.filter(person=>person.registration_status==='confirmed'||canIssuePendingLinks)
  const locked=['roster_locked','assignments_generated','completed','cancelled'].includes(status)
  const deadlinePassed=session.registration_due
  const currentRound=rounds.find(round=>round.status==='ready')
  return <div className="online-workspace">
    <div className="online-status-banner"><div><p className="eyebrow eyebrow-dark">REMOTE GIFT EXCHANGE</p><h2>{status.replaceAll('_',' ')}</h2><p>All participants join from their own private link. Assignments stay hidden from this organizer view.</p></div><span className={`status-pill ${status==='completed'?'status-complete':status==='cancelled'?'status-removed':'status-active'}`}>{status.replaceAll('_',' ')}</span></div>
    <section className="online-counts" aria-label="Registration progress"><div><strong>{counts.invited}</strong><span>Invited</span></div><div><strong>{counts.confirmed}</strong><span>Confirmed</span></div><div><strong>{counts.pending}</strong><span>Pending</span></div><div><strong>{counts.declined}</strong><span>Declined</span></div><div className="online-progress"><strong>{counts.percent}%</strong><span>Registration complete</span><div role="progressbar" aria-label="Registration complete" aria-valuemin={0} aria-valuemax={100} aria-valuenow={counts.percent}><i style={{width:`${counts.percent}%`}}/></div></div></section>
    <section className="section-card"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">EVENT TIMELINE</p><h2>Made for everyone’s schedule.</h2></div><CalendarDays className="card-heading-icon" size={22}/></div><div className="online-timeline"><div><span>Registration closes</span><strong>{dateLabel(session.registration_deadline,session.event_timezone)} <small>{session.event_timezone}</small></strong></div><div><span>Assignments release</span><strong>{dateLabel(session.assignment_release_at,session.event_timezone)} <small>{session.event_timezone}</small></strong></div>{session.event_date&&<div><span>Gift exchange</span><strong>{dateLabel(session.event_date,session.event_timezone)} <small>{session.event_timezone}</small></strong></div>}{session.gift_budget&&<div><span>Suggested budget</span><strong>₱{Number(session.gift_budget).toLocaleString('en-PH')}</strong></div>}</div>{session.instructions&&<p className="online-instructions">{session.instructions}</p>}</section>
    <section className="section-card"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">PRIVATE INVITATIONS</p><h2>{locked?'Roster locked':'Invite your people'}</h2></div><UsersRound className="card-heading-icon" size={22}/></div>{!locked&&status!=='registration_closed'&&<InviteForm id={id}/>}<ParticipantInvites id={id} people={participants} rosterLocked={locked} linkLocked={status==='completed'||status==='cancelled'} canIssuePendingLinks={canIssuePendingLinks} canRemoveConfirmed={canRemoveConfirmed}/>{reissuableParticipants.length>0&&status!=='completed'&&status!=='cancelled'&&<ReissueAll id={id} people={reissuableParticipants}/>}</section>
    <section className="section-card"><div className="card-heading"><div><p className="eyebrow eyebrow-dark">ROSTER AND ASSIGNMENTS</p><h2>One person for everyone.</h2></div><LockKeyhole className="card-heading-icon" size={22}/></div><p className="field-hint">The system saves the full one-to-one assignment privately. This page shows only progress, never who is gifting whom.</p><div className="online-stage-actions">
      {(status==='draft'||status==='inviting'||(status==='registration_closed'&&!deadlinePassed))&&<ActionButton label={status==='registration_closed'?'Reopen registration':'Open registration'} icon={<Send size={16}/>} run={()=>openGiftRegistration(id)}/>}
      {status==='registration_open'&&<ActionButton label="Close registration" run={()=>closeGiftRegistration(id)}/>}
      {(status==='registration_closed'||(deadlinePassed&&['registration_open','inviting'].includes(status)))&&<ActionButton label={`Lock roster (${counts.confirmed} confirmed)`} icon={<LockKeyhole size={16}/>} run={()=>lockGiftRoster(id)} disabled={counts.confirmed<2}/>}
      {status==='roster_locked'&&<ActionButton label={`Generate ${counts.confirmed} private assignments`} icon={<RotateCcw size={16}/>} run={()=>generateGiftAssignments(id)} disabled={counts.confirmed<2}/>}
      {currentRound&&<div className="online-round-progress"><strong>{currentRound.revealed_count} / {currentRound.participant_count}</strong><span>participants have revealed their own assignment</span><div role="progressbar" aria-label="Assignment reveals" aria-valuemin={0} aria-valuemax={currentRound.participant_count} aria-valuenow={currentRound.revealed_count}><i style={{width:`${Math.round(currentRound.revealed_count/currentRound.participant_count*100)}%`}}/></div></div>}
      {currentRound&&currentRound.revealed_count===currentRound.participant_count&&<ActionButton label="Mark exchange complete" run={()=>completeGiftExchange(id)}/>}
      {status==='assignments_generated'&&currentRound&&currentRound.revealed_count===0&&<ActionButton label="Void assignments and reopen roster" run={()=>voidGiftAssignmentRound(id,currentRound.id)} confirm="This invalidates every unrevealed assignment and unlocks the roster. Continue?"/>}
      {!['cancelled','completed'].includes(status)&&<ActionButton label="Cancel event" run={()=>cancelGiftExchange(id)} confirm="Cancel this exchange? Existing assignments will stay in the audit record and participants will lose access." danger/>}
    </div>{rounds.length>0&&<ul className="online-round-history">{rounds.map(round=><li key={round.round_number}>Round {round.round_number}<span>{round.participant_count} assigned · {round.revealed_count} revealed · {round.status}</span></li>)}</ul>}</section>
    <section className="section-card"><p className="eyebrow eyebrow-dark">EVENT DETAILS</p><SessionEditor id={id} name={session.session_name} description={session.description}/><p className="field-hint">Public event page: <a href={`/e/${session.public_id}`} target="_blank" rel="noreferrer">Open read-only event page</a></p></section>
    <section className="section-card"><p className="eyebrow eyebrow-dark">ORGANIZER RECOVERY</p><RecoveryCodeControl id={id}/></section>
  </div>
}

function ActionButton({label,icon,run,confirm,disabled=false,danger=false}:{label:string;icon?:ReactNode;run:()=>Promise<void>;confirm?:string;disabled?:boolean;danger?:boolean}){
  const[pending,start]=useTransition()
  return <button type="button" className={danger?'button button-danger':'button button-outline'} disabled={disabled||pending} onClick={()=>{if(confirm&&!window.confirm(confirm))return;start(async()=>{await run()})}}>{icon}{pending?'Working…':label}</button>
}

function InviteForm({id}:{id:string}){
  const[state,action,pending]=useActionState(addGiftInvites.bind(null,id),{error:''} as GiftInviteReply)
  return <form className="app-form online-invite-form" action={action}><label>Paste names <span className="muted-label">(one per line)</span><textarea name="names" rows={5} placeholder={'Rei\nJolo\nNehar'} /></label><label>Or upload a CSV<input name="csv" type="file" accept=".csv,text/csv"/></label><p className="field-hint">Up to 500 names per import. Repeated names remain separate people.</p>{state.error&&<p className="form-message form-error" role="alert">{state.error}</p>}{state.message&&<p className="form-message form-success" role="status">{state.message}</p>}<button className="button button-primary" disabled={pending}>{pending?'Creating links…':'Create private invitation links'}</button>{state.links&&<IssuedLinks links={state.links} />}</form>
}

function ParticipantInvites({id,people,rosterLocked,linkLocked,canIssuePendingLinks,canRemoveConfirmed}:{id:string;people:OnlineParticipant[];rosterLocked:boolean;linkLocked:boolean;canIssuePendingLinks:boolean;canRemoveConfirmed:boolean}){
  return <ul className="online-participant-list">{people.map(person=><ParticipantInvite key={person.id} id={id} person={person} rosterLocked={rosterLocked} linkLocked={linkLocked} canIssuePendingLinks={canIssuePendingLinks} canRemoveConfirmed={canRemoveConfirmed}/>)}</ul>
}

function ParticipantInvite({id,person,rosterLocked,linkLocked,canIssuePendingLinks,canRemoveConfirmed}:{id:string;person:OnlineParticipant;rosterLocked:boolean;linkLocked:boolean;canIssuePendingLinks:boolean;canRemoveConfirmed:boolean}){
  const[state,action,pending]=useActionState(async(_:FormState,form:FormData)=>updateGiftInvitation(id,person.id,form),initial)
  const[issued,setIssued]=useState<GiftInviteReply|null>(null),[busy,start]=useTransition()
  async function reissue(){setIssued(await rotateGiftParticipantLink(id,person.id))}
  const statusLabel=person.registration_status==='pending'&&person.invitation_claimed_at?'Opened link · awaiting confirmation':person.registration_status
  const removable=person.registration_status==='pending'||(canRemoveConfirmed&&person.registration_status==='confirmed')
  return <li><div className="online-person-name"><strong>{person.display_name}</strong><span className={`status-pill status-${person.registration_status==='confirmed'?'complete':person.registration_status==='revoked'?'removed':'active'}`}>{statusLabel}</span></div>{!rosterLocked&&person.registration_status!=='revoked'&&<form className="online-edit-name" action={action}><label className="sr-only" htmlFor={`name-${person.id}`}>Edit {person.display_name}</label><input id={`name-${person.id}`} name="display_name" defaultValue={person.display_name} maxLength={120}/><button className="quiet-button" disabled={pending}>Save</button>{state.error&&<span className="form-message form-error">{state.error}</span>}</form>}{removable&&!rosterLocked&&<form action={revokeGiftInvitation.bind(null,id,person.id)} onSubmit={event=>{if(!window.confirm(person.registration_status==='confirmed'?`Remove ${person.display_name} from the replacement roster?`:`Revoke ${person.display_name}’s invitation?`))event.preventDefault()}}><button className="quiet-button">{person.registration_status==='confirmed'?'Remove from roster':'Revoke invite'}</button></form>}{!linkLocked&&person.registration_status!=='revoked'&&(person.registration_status==='confirmed'||canIssuePendingLinks)&&<button className="quiet-button" type="button" disabled={busy} onClick={()=>start(async()=>reissue())}><RotateCcw size={14}/>{person.link_issued?'Replace link':'Create link'}</button>}{issued?.error&&<p className="form-message form-error" role="alert">{issued.error}</p>}{issued?.links&&<IssuedLinks links={issued.links}/>}</li>
}

function ReissueAll({id,people}:{id:string;people:OnlineParticipant[]}){
  const[reply,setReply]=useState<GiftInviteReply|null>(null),[pending,start]=useTransition()
  return <div className="reissue-all"><p className="field-hint">Lost the original links? Reissue all links to copy them again. Every previous link stops working.</p><button type="button" className="button button-outline" disabled={pending} onClick={()=>{if(!window.confirm('Replace every active participant link? Old links will stop working.'))return;start(async()=>setReply(await rotateGiftParticipantLinks(id,people.map(person=>person.id))))}}>{pending?'Replacing links…':'Reissue all links and copy'}</button>{reply?.error&&<p className="form-message form-error" role="alert">{reply.error}</p>}{reply?.links&&<IssuedLinks links={reply.links}/>}</div>
}

function IssuedLinks({links}:{links:NonNullable<GiftInviteReply['links']>}){
  const[copied,setCopied]=useState('')
  async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);setCopied(label);window.setTimeout(()=>setCopied(''),1800)}catch{setCopied('Clipboard permission denied')}}
  const all=links.map(({name,link})=>`${name}\t${link}`).join('\n')
  return <div className="issued-links"><div className="issued-links-heading"><strong>{links.length} private {links.length===1?'link':'links'}</strong><button type="button" className="button button-outline" onClick={()=>copy(all,'All links copied') }><Copy size={15}/>{copied==='All links copied'?'Copied all':`Copy all ${links.length}`}</button></div>{links.map(item=><div className="issued-link" key={item.id}><span>{item.name}</span><div><button type="button" className="quiet-button" onClick={()=>copy(item.link,`Copied ${item.name}`)}><Copy size={14}/>{copied===`Copied ${item.name}`?'Copied':'Copy link'}</button><button type="button" className="quiet-button" onClick={()=>copy(`Hi ${item.name}, you’re invited to a Christmas gift exchange on Bunot-Bunot. Confirm your participation privately here: ${item.link}`,`Reminder copied ${item.name}`)}><Check size={14}/>Copy reminder</button></div></div>)}{copied==='Clipboard permission denied'&&<span role="status">Clipboard permission was denied.</span>}</div>
}
