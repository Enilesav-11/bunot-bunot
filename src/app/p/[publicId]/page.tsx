import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PresentationRefresh } from '@/components/presentation-refresh'
import { ParolMark } from '@/components/parol-mark'
import { PresentationModeButton } from '@/components/presentation-mode-button'
import { getPublicBunotan } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function PublicPresentationPage({ params }: PageProps<'/p/[publicId]'>) {
  const { publicId } = await params
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(publicId)) notFound()
  const event = await getPublicBunotan(publicId)
  if (!event) notFound()
  const hasRound = event.round_number !== null
  const label = !hasRound ? 'THE GATHERING' : event.latest_name ? 'THE NAME IS' : event.round_status === 'completed' ? 'SALAMAT, EVERYONE' : 'THE FIRST NAME IS WAITING'
  const reveal = event.latest_name ?? (event.round_status === 'completed' ? 'That’s a wrap!' : 'Maligayang Pasko')
  return <main className="presentation-page">
    <div className="presentation-top"><Link href="/"><ParolMark /><span>Bunot-Bunot</span></Link><div className="presentation-tools"><PresentationRefresh /><PresentationModeButton /></div></div>
    <section className="presentation-center"><p className="eyebrow"><span>✦</span> {event.session_name}{hasRound ? ` · ROUND ${event.round_number}` : ''}</p><p className="presentation-label">{label}</p><h1 aria-live="polite" aria-atomic="true">{reveal}</h1><p className="presentation-count">{event.remaining_count} {event.remaining_count === 1 ? 'name' : 'names'} left <span>·</span> {event.participant_count} in this round</p></section>
    <footer className="presentation-bottom"><span>Made for a little Paskong magic</span><span>Party display · read-only</span></footer>
  </main>
}
