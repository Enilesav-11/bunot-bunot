import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
  const { data, error } = await createAdminClient().rpc('purge_expired_bunutan_sessions')
  if (error) return Response.json({ error: 'Cleanup failed.' }, { status: 500 })
  return Response.json({ deleted: data })
}
