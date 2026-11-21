import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from './supabase/admin'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const cookieName = (id: string) => `bunot-manage-${id}`

export type DrawResult = { id: string; participant_id: string; display_name: string; draw_order: number; drawn_at: string }
export type BunutanSession = {
  session: { id: string; session_name: string; description: string | null; public_id: string; status: 'active' | 'archived'; created_at: string; expires_at: string }
  participants: { id: string; display_name: string; status: 'active' | 'removed'; created_at: string }[]
  rounds: { id: string; round_number: number; status: 'in_progress' | 'completed'; started_at: string; participant_count: number; results: DrawResult[] }[]
}
export type PublicBunutan = { session_name: string; status: 'active' | 'archived'; round_number: number | null; round_status: 'in_progress' | 'completed' | null; latest_name: string | null; draw_order: number | null; remaining_count: number; participant_count: number }

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
  return error ? null : data as BunutanSession
}

export async function getPublicBunotan(publicId: string): Promise<PublicBunutan | null> {
  const { data, error } = await createAdminClient().rpc('get_public_bunutan', { p_public_id: publicId, p_rate_key: await rateKey() })
  return error ? null : data as PublicBunutan | null
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
