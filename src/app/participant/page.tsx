import Link from 'next/link'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import { ParticipantPortalView } from '@/components/participant-portal'
import { getParticipantPortal } from '@/lib/session'

export const dynamic='force-dynamic'
export default async function ParticipantPage(){
  const data=await getParticipantPortal()
  if(!data)return <main className="app-shell narrow-shell"><section className="form-card join-card"><LockKeyhole className="card-heading-icon" size={25}/><p className="eyebrow eyebrow-dark">PRIVATE PARTICIPANT PORTAL</p><h1>Open your invitation link.</h1><p className="page-intro">Use the private link from the organizer on this device. No account or password is needed.</p><Link className="button button-primary" href="/"><ArrowUpRight size={16}/> Back to Bunot-Bunot</Link></section></main>
  return <ParticipantPortalView data={data}/>
}
