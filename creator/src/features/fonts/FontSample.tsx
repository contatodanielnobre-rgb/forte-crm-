import { useEffect, useState } from 'react'
import { ensureFont } from './reader'

/** Texto desenhado na fonte real (Google Fonts), carregada sob demanda */
export function FontSample({ family, weight, text = 'Aa Rag', className }: { family: string; weight: number; text?: string; className?: string }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { let live = true; ensureFont(family, weight).then((r) => { if (live) setOk(r.ok) }); return () => { live = false } }, [family, weight])
  return <span className={className} style={{ fontFamily: ok ? `"${family}", system-ui, sans-serif` : 'system-ui, sans-serif', fontWeight: weight, opacity: ok ? 1 : 0.4 }}>{text}</span>
}
