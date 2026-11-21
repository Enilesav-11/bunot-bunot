import Link from 'next/link'
import { ParolMark } from '@/components/parol-mark'

export default function NotFound() {
  return <main className="error-page"><section><ParolMark className="not-found-mark" /><p className="eyebrow eyebrow-dark"><span>✦</span> WRONG TURN IN THE PAROL LIGHTS</p><h1>We can’t find that page.</h1><p>This link may have expired or may be incorrect.</p><Link className="button button-primary" href="/">Back home</Link></section></main>
}
