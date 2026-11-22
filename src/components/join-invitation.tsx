'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import { claimGiftInvitation } from '@/app/actions'

const subscribeToHash=(callback:()=>void)=>{window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)}
const currentHash=()=>window.location.hash.slice(1)
const serverHash=()=>''

export function JoinInvitation(){
  const token=useSyncExternalStore(subscribeToHash,currentHash,serverHash)
  const[error,setError]=useState(''),[pending,start]=useTransition(),router=useRouter(),started=useRef(false)
  useEffect(()=>{
    if(started.current||!token)return
    started.current=true
    window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}`)
    start(async()=>{const result=await claimGiftInvitation(token);if(result.error)setError(result.error);else{router.replace('/participant');router.refresh()}})
  },[router,token])
  const message=error||(!token?'Open the complete private invitation link sent by the organizer.':'The invitation token is not shown or stored in the page address after opening.')
  return <main className="app-shell narrow-shell"><section className="form-card join-card"><LockKeyhole className="card-heading-icon" size={25}/><p className="eyebrow eyebrow-dark">YOUR PRIVATE INVITATION</p><h1>{pending?'Opening your invitation':error?'Invitation could not be opened':'Invitation link needed'}</h1><p className="page-intro">{pending?'This private link is being connected to your participant portal. No account is needed.':message}</p>{error&&<p className="form-message form-error" role="alert">{error}</p>}{!pending&&<Link className="button button-primary" href="/">Back to Bunot-Bunot <ArrowUpRight size={16}/></Link>}</section></main>
}
