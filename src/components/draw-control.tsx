'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { drawNext, type DrawReply } from '@/app/actions'

export function DrawControl({ sessionId, roundId, remaining, complete, initialResult }: { sessionId: string; roundId: string; remaining: number; complete: boolean; initialResult: NonNullable<DrawReply['result']> | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reply, setReply] = useState<DrawReply | null>(() => initialResult ? { error: '', result: initialResult } : null)
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const storageKey = `bunot-draw-${roundId}`
  function draw() {
    let key = requestKey
    try { key = sessionStorage.getItem(storageKey) ?? key; sessionStorage.setItem(storageKey, key) } catch {}
    startTransition(async () => {
      try {
        const result = await drawNext(sessionId, roundId, key)
        setReply(result)
        if (!result.error) {
          try { sessionStorage.removeItem(storageKey) } catch {}
          setRequestKey(crypto.randomUUID())
          router.refresh()
        }
      } catch {
        setReply({ error: 'Connection interrupted. Retry to check whether the draw was saved.' })
      }
    })
  }
  const name = reply?.result?.display_name
  return <div className="draw-console">
    <div className="draw-reveal" aria-live="polite" aria-atomic="true">
      {name ? <><span className="reveal-kicker">THE NAME IS</span><strong>{name}</strong><span className="reveal-order">Pick #{reply?.result?.draw_order}</span></> : <><Sparkles size={24} /><strong>{complete ? 'Round complete' : 'Ready when you are'}</strong><span>{complete ? 'Everyone has had their moment.' : 'The next name will appear here.'}</span></>}
    </div>
    {reply?.error && <p className="form-message form-error" role="alert">{reply.error}</p>}
    <button className="button button-primary draw-button" onClick={draw} disabled={complete || pending || remaining < 1}>
      <Sparkles size={18} aria-hidden="true" /> {pending ? 'Drawing…' : complete ? 'Round complete' : 'Draw a name'}
    </button>
    <p className="draw-footnote">The result is saved before it appears.</p>
  </div>
}
