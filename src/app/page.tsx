import { ArrowDown, ArrowUpRight, ListOrdered, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { CreateSessionButton } from '@/components/session-controls'
import { ParolMark } from '@/components/parol-mark'
import { getLastSessionId } from '@/lib/session'

const steps = [
  { number: '01', icon: UsersRound, title: 'Gather your people', description: 'Add names one by one or paste in your guest list.' },
  { number: '02', icon: ListOrdered, title: 'Set the moment', description: 'Bring everyone together for a simple, easy-to-follow draw.' },
  { number: '03', icon: ArrowUpRight, title: 'Reveal and celebrate', description: 'Let the name appear, share the cheer, and keep the party moving.' },
]

export default async function Home() {
  const lastSessionId = await getLastSessionId()
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Bunot-Bunot home"><ParolMark className="brand-mark" /><span>Bunot<span className="brand-dash">—</span>Bunot</span></Link>
        <nav className="main-nav" aria-label="Main navigation"><Link href="/">Home</Link><a href="#how-it-works">How it works</a><a href="#about">About</a></nav>
        <CreateSessionButton className="button button-small button-light" />
      </div>
    </header>

    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true">✳</span> Paskong Pinoy edition</p>
            <h1 id="hero-title">Bring the glow of Pasko to your <em>bunutan.</em></h1>
            <p className="hero-description">Gather your guest list, let the room hold its breath, and reveal one name at a time.</p>
            <div className="hero-actions"><CreateSessionButton /><a className="text-link" href="#how-it-works">See how it works <ArrowDown aria-hidden="true" size={16} /></a></div>
            <p className="hero-note"><span className="note-rule" /> No account. Just names, parols, and Pasko.</p>
            {lastSessionId && <Link className="resume-link" href={`/sessions/${lastSessionId}`}>Resume your last bunutan <ArrowUpRight size={15} /></Link>}
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-halo" /><div className="light-string light-string-one"><i /><i /><i /><i /><i /></div><div className="light-string light-string-two"><i /><i /><i /><i /></div>
            <ParolMark className="parol-small parol-small-left" /><ParolMark className="parol-small parol-small-right" /><ParolMark className="parol-main" />
            <div className="street-line" /><p className="art-caption"><span>01</span> THE NAMES GATHER. THE PAROL GLOWS.</p>
          </div>
        </div>
        <a className="scroll-cue" href="#how-it-works" aria-label="Scroll to how it works"><span /></a>
      </section>

      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading"><p className="eyebrow eyebrow-dark"><span aria-hidden="true">✳</span> A little ritual, made easy</p><h2 id="how-title">From a list of names<br />to a room full of cheers.</h2><p className="section-intro">Keep the setup simple, so the best part can take center stage.</p></div>
        <ol className="steps-list">{steps.map(({ number, icon: Icon, title, description }) => <li className="step" key={number}><div className="step-topline"><span className="step-number">{number}</span><Icon className="step-icon" aria-hidden="true" size={22} strokeWidth={1.6} /></div><h3>{title}</h3><p>{description}</p></li>)}</ol>
      </section>

      <section className="closing-cta" id="about" aria-labelledby="closing-title"><ParolMark className="closing-mark" /><div><p className="eyebrow"><span aria-hidden="true">✳</span> Let the good names roll</p><h2 id="closing-title">Ready to bring everyone into the moment?</h2></div><CreateSessionButton /></section>
    </main>

    <footer className="site-footer"><Link className="brand footer-brand" href="/" aria-label="Bunot-Bunot home"><ParolMark className="brand-mark" /><span>Bunot<span className="brand-dash">—</span>Bunot</span></Link><p>A brighter little tradition for your Christmas gathering.</p><a href="#how-it-works">How it works <ArrowUpRight aria-hidden="true" size={14} /></a></footer>
  </>
}
