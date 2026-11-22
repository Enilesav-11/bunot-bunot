import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ParolMark } from '@/components/parol-mark'
import { OnlineEventCreateForm } from '@/components/online-event-create-form'

export default function NewOnlineEventPage() {
  return <>
    <header className="app-header"><div className="app-header-inner"><Link className="brand app-brand" href="/"><ParolMark className="brand-mark"/> Bunot<span className="brand-dash">—</span>Bunot</Link><nav aria-label="Page navigation"><Link href="/">Home</Link></nav></div></header>
    <main className="app-shell narrow-shell"><Link className="back-link" href="/"><ArrowLeft size={16}/> Home</Link>
      <div className="page-heading-row"><div><p className="eyebrow eyebrow-dark"><span>✦</span> FOR EVERYWHERE YOUR FAMILY IS</p><h1>Create an online gift exchange.</h1><p className="page-intro">Invite everyone with private links. They can confirm and reveal their gift recipient on their own time. No account needed.</p></div></div>
      <section className="form-card"><OnlineEventCreateForm/></section>
    </main>
  </>
}
