'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Application page failed', error?.digest) }, [error])
  return <main className="error-page"><section><p className="eyebrow eyebrow-dark"><span>✦</span> A SMALL PAUSE</p><h1>We couldn’t load that.</h1><p>Your names and saved draws are safe. Try again in a moment.</p><div><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-outline" href="/dashboard">Back to events</Link></div></section></main>
}
