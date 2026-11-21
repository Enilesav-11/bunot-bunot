'use client'

import { Maximize } from 'lucide-react'

export function PresentationModeButton() {
  return <button className="fullscreen-button" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize size={15} /> Full screen</button>
}
