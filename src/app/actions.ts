'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseParticipantNames } from '@/lib/participant-import'
import { callManagement, callParticipant, clearParticipantCookie, createManagementToken, getBunutanSession, hashSecret, isUuid, rateKey, recoverWithCode, refreshManagementCookie, setManagementCookie, setParticipantCookie } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { zonedDateTimeToIso } from '@/lib/time-zone'

export type FormState = { error: string; message?: string }
const fail = (message = 'Could not save that change. Please try again.'): FormState => ({ error: message })
const clean = (value: FormDataEntryValue | null) => typeof value === 'string' ? value.trim() : ''
const newRecoveryCode = () => randomBytes(10).toString('hex').toUpperCase().replace(/(.{4})/g, '$1-').replace(/-$/, '')
const newCapability = () => randomBytes(32).toString('base64url')
const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/$/, '')
const invitationLink = (token: string) => `${siteOrigin()}/join#${token}`

export type CreateReply = { success: false; error: string } | { success: true; id: string; recoveryCode: string }
export type RecoveryCodeReply = { success: false; error: string } | { success: true; recoveryCode: string }
export type CreateOnlineReply = { success: false; error: string } | { success: true; id: string; recoveryCode: string }
export type GiftInviteReply = { error: string; message?: string; links?: { id: string; name: string; link: string }[] }
export type GiftAssignmentReply = { error: string; event_name?: string; recipient_name?: string; recipient_wishlist?: { preferences: Record<string, string>; message: string | null } | null; revealed_at?: string }

export async function createSession(): Promise<CreateReply> {
  const token = await createManagementToken()
  const recoveryCode = newRecoveryCode()
  try {
    const { data, error } = await createAdminClient().rpc('create_bunutan_session', {
      p_session_name: 'Christmas Party Bunutan', p_description: null,
      p_public_id: randomBytes(32).toString('base64url'), p_management_hash: hashSecret(token),
      p_recovery_hash: hashSecret(recoveryCode), p_rate_key: await rateKey(),
    })
    if (error || !data?.session_id) return { success: false, error: 'Could not start your bunutan. Please try again.' }
    try { await setManagementCookie(data.session_id, token) } catch {}
    return { success: true, id: data.session_id as string, recoveryCode }
  } catch { return { success: false, error: 'Could not start your bunutan. Please try again.' } }
}

export async function createOnlineEvent(_: FormState, form: FormData): Promise<CreateOnlineReply> {
  const name=clean(form.get('name')),description=clean(form.get('description')),instructions=clean(form.get('instructions'))
  const timeZone=clean(form.get('event_timezone'))||'Asia/Manila'
  const deadlineRaw=clean(form.get('registration_deadline')),releaseRaw=clean(form.get('assignment_release_at')),eventRaw=clean(form.get('event_date'))
  if(!name||name.length>120)return{success:false,error:'Event name must be 1–120 characters.'}
  if(description.length>2000||instructions.length>4000)return{success:false,error:'Description or instructions are too long.'}
  let deadline:string,release:string,eventDate:string|null
  try{deadline=zonedDateTimeToIso(deadlineRaw,timeZone);release=zonedDateTimeToIso(releaseRaw,timeZone);eventDate=eventRaw?zonedDateTimeToIso(eventRaw,timeZone):null}
  catch(error){return{success:false,error:error instanceof Error?error.message:'Choose valid event dates.'}}
  const now=Date.now(),deadlineMs=Date.parse(deadline),releaseMs=Date.parse(release),eventMs=eventDate?Date.parse(eventDate):null
  if(deadlineMs<=now)return{success:false,error:'Registration deadline must be in the future.'}
  if(releaseMs<deadlineMs)return{success:false,error:'Assignment release must be on or after the registration deadline.'}
  if(eventMs!==null&&eventMs<releaseMs)return{success:false,error:'The gift exchange date must be on or after the assignment release.'}
  const budgetText=clean(form.get('gift_budget')),budget=budgetText?Number(budgetText):null
  if(budget!==null&&(!Number.isFinite(budget)||budget<=0||budget>1_000_000))return{success:false,error:'Enter a gift budget between 1 and 1,000,000.'}
  const token=createManagementToken(),recoveryCode=newRecoveryCode()
  try{
    const{data,error}=await createAdminClient().rpc('create_online_bunutan_session',{
      p_session_name:name,p_description:description||null,p_registration_deadline:deadline,p_assignment_release_at:release,p_event_date:eventDate,
      p_event_timezone:timeZone,p_gift_budget:budget,p_instructions:instructions||null,p_wishlists_enabled:form.get('wishlists_enabled')==='on',
      p_public_id:randomBytes(32).toString('base64url'),p_management_hash:hashSecret(token),p_recovery_hash:hashSecret(recoveryCode),p_rate_key:await rateKey(),
    })
    if(error||!data?.session_id)return{success:false,error:'Could not create the event. Please try again.'}
    await setManagementCookie(data.session_id,token)
    return{success:true,id:data.session_id as string,recoveryCode}
  }catch{return{success:false,error:'Could not create the event. Please try again.'}}
}

export async function rotateRecoveryCode(id: string): Promise<RecoveryCodeReply> {
  if (!isUuid(id)) return { success: false, error: 'Refresh the page and try again.' }
  const recoveryCode = newRecoveryCode()
  try {
    const { data, error } = await callManagement<boolean>(id, 'rotate_bunutan_recovery_code', { p_recovery_hash: hashSecret(recoveryCode) })
    if (error || data !== true) return { success: false, error: 'Could not create a recovery backup. Try again.' }
    revalidatePath(`/sessions/${id}`)
    return { success: true, recoveryCode }
  } catch { return { success: false, error: 'Could not create a recovery backup. Try again.' } }
}

export async function refreshSessionAccess(id: string) {
  if (await getBunutanSession(id)) await refreshManagementCookie(id)
}

export async function updateSession(id: string, form: FormData): Promise<FormState> {
  const name = clean(form.get('name'))
  const description = clean(form.get('description'))
  if (!name || name.length > 120) return fail('Event name must be 1–120 characters.')
  if (description.length > 2000) return fail('Description must be 2,000 characters or fewer.')
  const { error } = await callManagement(id, 'update_bunutan_session', { p_session_name: name, p_description: description || null })
  if (error) return fail('Could not update this bunutan. Check that it is still active.')
  revalidatePath(`/sessions/${id}`)
  return { error: '', message: 'Event details saved.' }
}

export async function addParticipants(id: string, _: FormState, form: FormData): Promise<FormState> {
  const pasted = clean(form.get('names'))
  const file = form.get('csv')
  if (pasted && file instanceof File && file.size > 0) return fail('Paste names or upload a CSV, not both.')
  let source = pasted
  let csv = false
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) return fail('CSV must be under 1 MB.')
    if (!file.name.toLowerCase().endsWith('.csv')) return fail('Choose a .csv file.')
    source = await file.text()
    csv = true
  }
  let names: string[]
  try { names = parseParticipantNames(source, csv) }
  catch (error) { return fail(error instanceof Error ? error.message : 'Could not read that CSV.') }
  if (!names.length) return fail('Add at least one name.')
  if (names.length > 500) return fail('Add up to 500 names at a time.')
  if (names.some((name) => name.length > 120)) return fail('Each name must be 120 characters or fewer.')
  const { error } = await callManagement<number>(id, 'add_bunutan_participants', { p_names: names })
  if (error) return fail(error.message.includes('round_in_progress') ? 'Finish the current round before changing names.' : 'Names were not added. The session may be full or expired.')
  revalidatePath(`/sessions/${id}`)
  return { error: '', message: `Added ${names.length} ${names.length === 1 ? 'name' : 'names'}. Repeated names are kept as separate entries.` }
}

export async function updateParticipant(id: string, participantId: string, form: FormData): Promise<FormState> {
  const name = clean(form.get('display_name'))
  if (!isUuid(participantId)) return fail('Refresh the page and try again.')
  if (!name || name.length > 120) return fail('Name must be 1–120 characters.')
  const { error } = await callManagement(id, 'update_bunutan_participant', { p_participant_id: participantId, p_display_name: name })
  if (error) return fail('Could not update this name. Finish the current round first.')
  revalidatePath(`/sessions/${id}`)
  return { error: '', message: 'Name updated.' }
}

export async function removeParticipant(id: string, participantId: string): Promise<void> {
  if (!isUuid(participantId)) redirect(`/sessions/${id}?error=remove`)
  const { error } = await callManagement(id, 'remove_bunutan_participant', { p_participant_id: participantId })
  if (error) redirect(`/sessions/${id}?error=remove`)
  revalidatePath(`/sessions/${id}`)
}

export async function startRound(id: string): Promise<void> {
  const { data, error } = await callManagement<string>(id, 'start_bunutan_round', {})
  if (error || !data) redirect(`/sessions/${id}?error=round`)
  revalidatePath(`/sessions/${id}`)
  redirect(`/sessions/${id}#drawing`)
}

export type DrawReply = {
  error: string
  result?: { id: string; participant_id: string; display_name: string; draw_order: number; drawn_at: string }
  remaining_count?: number
  round_status?: 'in_progress' | 'completed'
  replayed?: boolean
}

export async function drawNext(id: string, roundId: string, requestKey: string): Promise<DrawReply> {
  if (!isUuid(roundId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return { error: 'Refresh the page and try again.' }
  const { data, error } = await callManagement<Omit<DrawReply, 'error'>>(id, 'draw_bunutan_next', { p_round_id: roundId, p_request_key: requestKey })
  if (error || !data) return { error: error?.message.includes('round_complete') ? 'This round is complete.' : 'The draw did not finish. Try again.' }
  revalidatePath(`/sessions/${id}`)
  return { error: '', ...data }
}

export async function archiveSession(id: string): Promise<void> {
  const { error } = await callManagement(id, 'archive_bunutan_session', {})
  if (error) redirect(`/sessions/${id}?error=archive`)
  revalidatePath(`/sessions/${id}`)
  redirect(`/sessions/${id}`)
}

export async function recoverSession(id: string, _: FormState, form: FormData): Promise<FormState> {
  const code = clean(form.get('recovery_code')).toUpperCase()
  if (!/^[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/.test(code)) return fail('Enter the five-part recovery code from your backup.')
  const token = await createManagementToken()
  if (!await recoverWithCode(id, code, token)) return fail('That recovery code was not accepted. Check it and try again.')
  await setManagementCookie(id, token)
  redirect(`/sessions/${id}`)
}

export async function addGiftInvites(id:string,_:FormState,form:FormData):Promise<GiftInviteReply>{
  const pasted=clean(form.get('names')),file=form.get('csv')
  if(pasted&&file instanceof File&&file.size>0)return{error:'Paste names or upload a CSV, not both.'}
  let source=pasted,csv=false
  if(file instanceof File&&file.size>0){if(file.size>1_000_000)return{error:'CSV must be under 1 MB.'};if(!file.name.toLowerCase().endsWith('.csv'))return{error:'Choose a .csv file.'};source=await file.text();csv=true}
  let names:string[]
  try{names=parseParticipantNames(source,csv)}catch(error){return{error:error instanceof Error?error.message:'Could not read that CSV.'}}
  if(!names.length)return{error:'Add at least one participant.'}
  if(names.length>500||names.some(name=>name.length>120))return{error:'Add up to 500 names, with each name 120 characters or fewer.'}
  const tokens=names.map(newCapability),tokenHashes=tokens.map(hashSecret)
  const{data,error}=await callManagement<{id:string;display_name:string;token_hash:string}[]>(id,'add_gift_exchange_invites',{p_names:names,p_token_hashes:tokenHashes})
  if(error||!data||data.length!==names.length)return{error:'Invitations were not created. Registration may be closed or the roster locked.'}
  const ids=new Map(data.map(row=>[row.token_hash,row]))
  const links=tokens.map((token,index)=>{const row=ids.get(tokenHashes[index]);return row?{id:row.id,name:row.display_name,link:invitationLink(token)}:null})
  if(links.some(link=>!link))return{error:'Invitations were created, but their links could not be prepared. Reissue links from the roster.'}
  revalidatePath(`/sessions/${id}`)
  return{error:'',message:`Created ${names.length} private invitation ${names.length===1?'link':'links'}. Save or copy these links now.`,links:links as {id:string;name:string;link:string}[]}
}

export async function updateGiftInvitation(id:string,participantId:string,form:FormData):Promise<FormState>{
  const name=clean(form.get('display_name'))
  if(!isUuid(participantId)||!name||name.length>120)return fail('Enter a name between 1 and 120 characters.')
  const{error}=await callManagement(id,'update_gift_invitation',{p_participant_id:participantId,p_name:name})
  if(error)return fail('This invitation cannot be changed after the roster is locked.')
  revalidatePath(`/sessions/${id}`);return{error:'',message:'Participant name updated.'}
}

export async function revokeGiftInvitation(id:string,participantId:string):Promise<void>{
  if(!isUuid(participantId))redirect(`/sessions/${id}?error=online`)
  const{error}=await callManagement(id,'revoke_gift_invitation',{p_participant_id:participantId})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function rotateGiftParticipantLink(id:string,participantId:string):Promise<GiftInviteReply>{
  if(!isUuid(participantId))return{error:'Refresh the page and try again.'}
  const token=newCapability(),{data,error}=await callManagement<{id:string;display_name:string}>(id,'rotate_gift_participant_token',{p_participant_id:participantId,p_token_hash:hashSecret(token)})
  if(error||!data)return{error:'Could not replace that participant link.'}
  revalidatePath(`/sessions/${id}`)
  return{error:'',links:[{id:data.id,name:data.display_name,link:invitationLink(token)}],message:'The previous participant link no longer works. Copy and send this replacement.'}
}

export async function rotateGiftParticipantLinks(id:string,participantIds:string[]):Promise<GiftInviteReply>{
  if(!Array.isArray(participantIds)||!participantIds.length||participantIds.length>5000||participantIds.some(value=>!isUuid(value))||new Set(participantIds).size!==participantIds.length)return{error:'Refresh the page and try again.'}
  const tokens=participantIds.map(newCapability),tokenHashes=tokens.map(hashSecret),payload=participantIds.map((participant_id,index)=>({participant_id,token_hash:tokenHashes[index]}))
  const{data,error}=await callManagement<{id:string;display_name:string;token_hash:string}[]>(id,'rotate_gift_participant_tokens',{p_tokens:payload})
  if(error||!data||data.length!==tokens.length)return{error:'Could not reissue every participant link. No links were copied.'}
  const byHash=new Map(data.map(row=>[row.token_hash,row]))
  const links=tokens.map((token,index)=>{const row=byHash.get(tokenHashes[index]);return row?{id:row.id,name:row.display_name,link:invitationLink(token)}:null})
  if(links.some(link=>!link))return{error:'Could not match every participant link.'}
  revalidatePath(`/sessions/${id}`)
  return{error:'',message:'All previous participant links were replaced. Copy and redistribute these links.',links:links as {id:string;name:string;link:string}[]}
}

export async function openGiftRegistration(id:string):Promise<void>{
  const{error}=await callManagement(id,'open_bunutan_registration',{})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function closeGiftRegistration(id:string):Promise<void>{
  const{error}=await callManagement(id,'close_bunutan_registration',{})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function lockGiftRoster(id:string):Promise<void>{
  const{error}=await callManagement(id,'lock_gift_roster',{})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function generateGiftAssignments(id:string):Promise<void>{
  const{error,data}=await callManagement(id,'generate_gift_assignments',{})
  if(error||!data)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function voidGiftAssignmentRound(id:string,roundId:string):Promise<void>{
  if(!isUuid(roundId))redirect(`/sessions/${id}?error=online`)
  const{error}=await callManagement(id,'void_gift_assignment_round',{p_round_id:roundId})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function cancelGiftExchange(id:string):Promise<void>{
  const{error}=await callManagement(id,'cancel_gift_exchange',{})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function completeGiftExchange(id:string):Promise<void>{
  const{error}=await callManagement(id,'complete_gift_exchange',{})
  if(error)redirect(`/sessions/${id}?error=online`)
  revalidatePath(`/sessions/${id}`)
}

export async function claimGiftInvitation(invitationToken:string):Promise<{error:string}>{
  if(!/^[A-Za-z0-9_-]{40,64}$/.test(invitationToken))return{error:'This invitation link is incomplete or invalid.'}
  const token=newCapability()
  try{
    const{data,error}=await createAdminClient().rpc('claim_gift_invitation',{p_invitation_hash:hashSecret(invitationToken),p_participant_hash:hashSecret(token),p_rate_key:await rateKey()})
    if(error||!data?.participant_id)return{error:error?.message.includes('registration_closed')?'Registration is closed for this event.':'This invitation has already been used or is no longer valid.'}
    await setParticipantCookie(data.participant_id,token)
    return{error:''}
  }catch{return{error:'Could not open this invitation. Please try again.'}}
}

export async function confirmGiftParticipation(response:'confirm'|'decline'):Promise<FormState>{
  const{data,error}=await callParticipant<string>('confirm_gift_participation',{p_response:response})
  if(error||!data)return fail(error?.message.includes('registration_closed')?'Registration is closed. Contact the organizer if you need help.':'Could not save your response.')
  revalidatePath('/participant');return{error:'',message:data==='confirmed'?'You are confirmed. Your assignment will appear on the release date.':'Your response was recorded.'}
}

export async function saveGiftWishlist(_:FormState,form:FormData):Promise<FormState>{
  const preferences={gift_preferences:clean(form.get('gift_preferences')),interests:clean(form.get('interests')),favorite_colors:clean(form.get('favorite_colors'))}
  if(Object.values(preferences).some(value=>value.length>500))return fail('Each wishlist field must be 500 characters or fewer.')
  const message=clean(form.get('message'));if(message.length>1000)return fail('Your note must be 1,000 characters or fewer.')
  const{data,error}=await callParticipant<boolean>('save_participant_wishlist',{p_preferences:preferences,p_message:message||null})
  if(error||data!==true)return fail('Could not save your wishlist. Try again.')
  revalidatePath('/participant');return{error:'',message:'Wishlist saved. Only your assigned gift giver can see it after the release.'}
}

export async function revealMyGiftAssignment():Promise<GiftAssignmentReply>{
  const{data,error}=await callParticipant<Omit<GiftAssignmentReply,'error'>>('reveal_gift_assignment')
  if(error||!data)return{error:error?.message.includes('assignment_not_available')?'Your assignment is not ready yet. Please return on the release date.':'Could not reveal your assignment. Try again.'}
  revalidatePath('/participant');return{error:'',...data}
}

export async function forgetGiftParticipantAccess():Promise<void>{await clearParticipantCookie();revalidatePath('/participant')}
