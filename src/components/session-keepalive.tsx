'use client'

import { useEffect } from 'react'
import { refreshSessionAccess } from '@/app/actions'

export function SessionKeepalive({ id }: { id: string }) {
  useEffect(() => {
    const refresh = () => { void refreshSessionAccess(id).catch(() => {}) }
    refresh()
    const timer = window.setInterval(refresh, 12 * 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [id])
  return null
}
