import { getBunutanSession, isUuid } from '@/lib/session'
import { csvCell } from '@/lib/csv'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!isUuid(sessionId)) return new Response('Not found', { status: 404 })
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind !== 'participants' && kind !== 'results') return new Response('Not found', { status: 404 })
  const data = await getBunutanSession(sessionId)
  if (!data) return new Response('Not found', { status: 404 })
  const rows = kind === 'participants'
    ? [['Name', 'Status', 'Added'], ...data.participants.map((person) => [person.display_name, person.status, person.created_at])]
    : [['Round', 'Pick', 'Name', 'Drawn at'], ...data.rounds.flatMap((round) => round.results.map((result) => [round.round_number, result.draw_order, result.display_name, result.drawn_at]))]
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  return new Response(body, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="bunot-${kind}-${sessionId}.csv"`,
    'Cache-Control': 'private, no-store',
  } })
}
