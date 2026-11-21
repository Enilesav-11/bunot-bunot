'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseParticipantNames } from '@/lib/participant-import'
import { callManagement, createManagementToken, getBunutanSession, hashSecret, isUuid, rateKey, recoverWithCode, refreshManagementCookie, setManagementCookie } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'

export type FormState = { error: string; message?: string }
const fail = (message = 'Could not save that change. Please try again.'): FormState => ({ error: message })
const clean = (value: FormDataEntryValue | null) => typeof value === 'string' ? value.trim() : ''

export type CreateReply = { success: false; error: string } | { success: true; id: string; recoveryCode: string }

export async function createSession(): Promise<CreateReply> {
  const token = await createManagementToken()
  const recoveryCode = randomBytes(10).toString('hex').toUpperCase().replace(/(.{4})/g, '$1-').replace(/-$/, '')
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
