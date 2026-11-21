'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PresentationRefresh() {
  const router = useRouter()
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [router])
  return <span className="live-status"><span /> Live party screen</span>
}
