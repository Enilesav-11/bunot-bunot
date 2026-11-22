import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from './supabase/admin'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const cookieName = (id: string) => `bunot-manage-${id}`
const participantIdCookie = 'bunot-participant-id'
const participantTokenCookie = 'bunot-participant-token'

export type DrawResult = { id: string; participant_id: string; display_name: string; draw_order: number; drawn_at: string }
export type BunutanSession = {
  session: { id: string; session_name: string; description: string | null; public_id: string; status: 'active' | 'archived'; is_online_event: boolean; event_status: string | null; created_at: string; expires_at: string }
  participants: { id: string; display_name: string; status: 'active' | 'removed'; created_at: string }[]
  rounds: { id: string; round_number: number; status: 'in_progress' | 'completed'; started_at: string; participant_count: number; results: DrawResult[] }[]
  online?: OnlineEventDashboard
}
export type PublicBunutan = { session_name: string; status: 'active' | 'archived'; round_number: number | null; round_status: 'in_progress' | 'completed' | null; latest_name: string | null; draw_order: number | null; remaining_count: number; participant_count: number }
export type OnlineEventStatus = 'draft' | 'inviting' | 'registration_open' | 'registration_closed' | 'roster_locked' | 'assignments_generated' | 'completed' | 'cancelled'
export type OnlineParticipant = { id: string; display_name: string; registration_status: 'pending' | 'confirmed' | 'declined' | 'revoked'; invitation_claimed_at: string | null; confirmed_at: string | null; declined_at: string | null; link_issued: boolean }
export type OnlineEventDashboard = {
  session: { id: string; session_name: string; description: string | null; public_id: string; event_status: OnlineEventStatus; event_timezone: string; registration_deadline: string; registration_due: boolean; assignment_release_at: string; event_date: string | null; gift_budget: number | null; instructions: string | null; wishlists_enabled: boolean; expires_at: string }
  participants: OnlineParticipant[]
  counts: { invited: number; confirmed: number; pending: number; declined: number; percent: number }
  rounds: { id: string; round_number: number; status: 'ready' | 'completed' | 'voided'; participant_count: number; revealed_count: number; generated_at: string; completed_at: string | null }[]
}
export type ParticipantPortal = {
  event: { session_name: string; description: string | null; event_status: OnlineEventStatus; event_timezone: string; registration_deadline: string; assignment_release_at: string; event_date: string | null; gift_budget: number | null; instructions: string | null; wishlists_enabled: boolean }
  participant: { id: string; display_name: string; registration_status: OnlineParticipant['registration_status']; confirmed_at: string | null }
  wishlist: { preferences: Record<string, string>; message: string | null; updated_at: string } | null
  assignment_available: boolean
  registration_open: boolean
  my_assignment: { recipient_name: string; revealed_at: string; recipient_wishlist?: { preferences: Record<string, string>; message: string | null } | null } | null
}
export type PublicOnlineEvent = ParticipantPortal['event'] & { confirmed_count: number }

export const isUuid = (value: string) => uuid.test(value)
export const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex')

export async function rateKey() {
  const secret = process.env.RATE_LIMIT_SECRET
  if (!secret) throw new Error('Rate limit secret is missing.')
  const requestHeaders = await headers()
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER || (process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : '')
  const forwarded = trustedHeader ? requestHeaders.get(trustedHeader) : null
  if (process.env.NODE_ENV === 'production' && !forwarded) throw new Error('Trusted client IP header is missing.')
  const address = forwarded?.split(',')[0].trim() || 'local'
  return createHmac('sha256', secret).update(address).digest('hex')
}

export const createManagementToken = () => randomBytes(32).toString('base64url')

export async function setManagementCookie(id: string, token: string) {
  const store = await cookies()
  store.set(cookieName(id), token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  store.set('bunot-last-session', id, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
}

export async function getLastSessionId() {
  const id = (await cookies()).get('bunot-last-session')?.value
  return id && isUuid(id) ? id : null
}

async function capability(id: string) {
  if (!isUuid(id)) return null
  return (await cookies()).get(cookieName(id))?.value ?? null
}

export async function refreshManagementCookie(id: string) {
  const token = await capability(id)
  if (token) await setManagementCookie(id, token)
}

export async function getBunutanSession(id: string): Promise<BunutanSession | null> {
  const token = await capability(id)
  if (!token) return null
  const { data, error } = await createAdminClient().rpc('get_bunutan_session', {
    p_session_id: id, p_capability: token, p_rate_key: await rateKey(),
  })
  if (error?.code === 'P0002' && error.message === 'session_not_found') return null
  if (error) throw new Error('Could not verify bunutan access.')
  const session = data as BunutanSession | null
  if (!session?.session.is_online_event) return session
  const { data: online, error: onlineError } = await createAdminClient().rpc('get_online_event_dashboard', {
    p_session_id: id, p_capability: token, p_rate_key: await rateKey(),
  })
  if (onlineError || !online) throw new Error('Could not load this online exchange.')
  return { ...session, online: online as OnlineEventDashboard }
}

export async function getPublicBunotan(publicId: string): Promise<PublicBunutan | null> {
  const { data, error } = await createAdminClient().rpc('get_public_bunutan', { p_public_id: publicId, p_rate_key: await rateKey() })
  return error ? null : data as PublicBunutan | null
}

export async function getPublicOnlineEvent(publicId: string): Promise<PublicOnlineEvent | null> {
  const { data, error } = await createAdminClient().rpc('get_public_online_event', { p_public_id: publicId, p_rate_key: await rateKey() })
  return error || !data ? null : data as PublicOnlineEvent
}

export async function setParticipantCookie(id: string, token: string) {
  const store = await cookies()
  // shortcut: browser cookies cap near 400 days; the database still ends access at session expiry.
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/participant', maxAge: 60 * 60 * 24 * 400 }
  store.set(participantIdCookie, id, options)
  store.set(participantTokenCookie, token, options)
}

export async function clearParticipantCookie() {
  const store = await cookies()
  store.set(participantIdCookie, '', { path: '/participant', maxAge: 0 })
  store.set(participantTokenCookie, '', { path: '/participant', maxAge: 0 })
}

export async function getParticipantPortal(): Promise<ParticipantPortal | null> {
  const store = await cookies()
  const id = store.get(participantIdCookie)?.value
  const token = store.get(participantTokenCookie)?.value
  if (!id || !isUuid(id) || !token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null
  const { data, error } = await createAdminClient().rpc('get_gift_invite_portal', { p_token_hash: hashSecret(token), p_rate_key: await rateKey() })
  return error || !data ? null : data as ParticipantPortal
}

export async function callParticipant<T = unknown>(functionName: string, params: Record<string, unknown> = {}) {
  const token = (await cookies()).get(participantTokenCookie)?.value
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { data: null as T | null, error: new Error('participant_not_found') }
  const { data, error } = await createAdminClient().rpc(functionName, { ...params, p_token_hash: hashSecret(token), p_rate_key: await rateKey() })
  return { data: data as T | null, error }
}

export async function callManagement<T = unknown>(id: string, functionName: string, params: Record<string, unknown>) {
  const token = await capability(id)
  if (!token || !isUuid(id)) return { data: null as T | null, error: new Error('session_not_found') }
  const { data, error } = await createAdminClient().rpc(functionName, {
    ...params, p_session_id: id, p_capability: token, p_rate_key: await rateKey(),
  })
  return { data: data as T | null, error }
}

export async function recoverWithCode(id: string, code: string, token: string) {
  if (!isUuid(id)) return false
  const { error } = await createAdminClient().rpc('recover_bunutan_session', {
    p_session_id: id, p_recovery_hash: hashSecret(code.trim().toUpperCase()),
    p_management_hash: hashSecret(token), p_rate_key: await rateKey(),
  })
  return !error
}
