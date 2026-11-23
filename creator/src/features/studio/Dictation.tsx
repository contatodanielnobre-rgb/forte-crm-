import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { transcribeSegment } from './data'

/** Junta o texto ditado ao que já está escrito (espaço certo, sem duplicar pontuação) */
export function appendDictated(cur: string, add: string) {
  const a = add.trim()
  if (!a) return cur
  if (!cur.trim()) return a
  return /[\s\n]$/.test(cur) ? cur + a : cur + ' ' + a
}

type Phase = 'idle' | 'starting' | 'listening'

/**
 * Ditado por voz com transcrição de verdade (OpenAI gpt-4o-transcribe), frase a frase:
 * o microfone grava; a cada pausa de fala o trecho é enviado, transcrito (com pontuação e vocabulário da marca) e entra no campo na hora.
 */
export function useDictation({ onText, vocab }: { onText: (text: string) => void; vocab: string[] }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [pending, setPending] = useState(0)
  const s = useRef<{ stream?: MediaStream; ctx?: AudioContext; timer?: number; cur?: { rec: MediaRecorder; chunks: Blob[]; mime: string }; heard: number; lastVoice: number; segStart: number; noise: number; calib: number[]; stopping: boolean; tail: string; chain: Promise<void> }>({ heard: 0, lastVoice: 0, segStart: 0, noise: 0.01, calib: [], stopping: false, tail: '', chain: Promise.resolve() })
  const cb = useRef({ onText, vocab }); cb.current = { onText, vocab }
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  const send = (blob: Blob) => {
    setPending((n) => n + 1)
    s.current.chain = s.current.chain.then(async () => {
      try {
        const r = await transcribeSegment(blob, cb.current.vocab, s.current.tail)
        const text = r.text.trim()
        if (text) { s.current.tail = (s.current.tail + ' ' + text).slice(-300); cb.current.onText(text) }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não consegui transcrever este trecho.')
      } finally { setPending((n) => Math.max(0, n - 1)) }
    })
  }

  /** Fecha o trecho atual (envia se alguém falou) e, se ainda estiver ouvindo, abre outro na hora. Cada gravador guarda os próprios pedaços. */
  const cut = useCallback((final = false) => {
    const st = s.current
    const cur = st.cur
    if (!cur || cur.rec.state === 'inactive') return
    const voiced = st.heard
    cur.rec.onstop = () => {
      const blob = new Blob(cur.chunks, { type: cur.mime })
      if (voiced >= 4 && blob.size > 1500) send(blob)
    }
    cur.rec.stop()
    st.heard = 0; st.segStart = performance.now()
    st.cur = undefined
    if (!final && st.stream) startRecorder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRecorder = () => {
    const st = s.current
    if (!st.stream) return
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((x) => MediaRecorder.isTypeSupported?.(x))
    const rec = new MediaRecorder(st.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined)
    const cur = { rec, chunks: [] as Blob[], mime: rec.mimeType || type || 'audio/webm' }
    rec.ondataavailable = (e) => { if (e.data.size) cur.chunks.push(e.data) }
    rec.start(250)
    st.cur = cur
  }

  const stop = useCallback(() => {
    const st = s.current
    if (st.stopping) return
    st.stopping = true
    if (st.timer) window.clearInterval(st.timer)
    cut(true)
    st.stream?.getTracks().forEach((t) => t.stop())
    st.ctx?.close().catch(() => null)
    st.stream = undefined; st.ctx = undefined; st.cur = undefined
    setPhase('idle'); setLevel(0)
  }, [cut])

  const start = useCallback(async () => {
    if (!supported) return toast.error('Este navegador não permite gravar áudio. Use o Chrome ou o Edge.')
    const st = s.current
    st.stopping = false; st.tail = ''; st.heard = 0; st.calib = []
    setPhase('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      st.stream = stream
      const ctx = new AudioContext(); st.ctx = ctx
      const an = ctx.createAnalyser(); an.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      startRecorder()
      st.segStart = performance.now(); st.lastVoice = performance.now()
      const t0 = performance.now()
      st.timer = window.setInterval(() => {
        an.getByteTimeDomainData(buf)
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / buf.length)
        const now = performance.now()
        setLevel(Math.min(1, rms * 6))
        if (now - t0 < 600) { st.calib.push(rms); const sorted = [...st.calib].sort((x, y) => x - y); st.noise = sorted[Math.floor(sorted.length * 0.2)] ?? 0.01; return } // piso de ruído = percentil 20 (se a pessoa já começou a falar, não vira "ruído")
        const threshold = Math.min(0.035, Math.max(0.015, st.noise * 2.5))
        if (rms > threshold) { st.heard++; st.lastVoice = now }
        const dur = now - st.segStart
        const silent = now - st.lastVoice
        if (st.heard >= 4 && ((silent > 1100 && dur > 1500) || dur > 26000)) cut()
        else if (st.heard < 4 && dur > 12000) { st.heard = 0; cut() } // só silêncio/ruído: descarta e recomeça
      }, 60)
      setPhase('listening')
    } catch (e) {
      st.stream?.getTracks().forEach((t) => t.stop()); st.ctx?.close().catch(() => null); st.stream = undefined
      setPhase('idle')
      const name = (e as DOMException)?.name
      toast.error(name === 'NotAllowedError' ? 'O microfone está bloqueado. Clique no cadeado ao lado do endereço e permita o microfone.' : name === 'NotFoundError' ? 'Nenhum microfone encontrado neste computador.' : 'Não consegui abrir o microfone.')
    }
  }, [supported, cut])

  useEffect(() => () => { const st = s.current; if (st.timer) window.clearInterval(st.timer); st.stream?.getTracks().forEach((t) => t.stop()); st.ctx?.close().catch(() => null) }, [])
  return { phase, level, pending, start, stop, supported, listening: phase === 'listening' }
}

/** Botão de microfone para qualquer campo de texto: clique, fale, clique de novo para parar */
export function MicButton({ onText, vocab = [], className, title = 'Ditar com a voz' }: { onText: (text: string) => void; vocab?: string[]; className?: string; title?: string }) {
  const d = useDictation({ onText, vocab })
  const busy = d.phase === 'starting'
  return (
    <button type="button" onClick={() => (d.listening ? d.stop() : void d.start())} disabled={busy || !d.supported} data-testid="mic-button" data-listening={d.listening}
      title={d.listening ? 'Parar o ditado' : d.supported ? title : 'Este navegador não permite gravar áudio'}
      className={cn('relative inline-flex h-9 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition disabled:opacity-40',
        d.listening ? 'border-brand bg-brand px-3 text-white shadow-brand' : 'w-9 border-zinc-200 bg-white text-zinc-600 hover:border-ink hover:text-ink', className)}>
      {d.listening && <span className="absolute inset-0 rounded-full bg-brand/40" style={{ transform: `scale(${1 + d.level * 0.55})`, opacity: 0.25 + d.level * 0.5, transition: 'transform 80ms linear' }} />}
      <span className="relative flex items-center gap-1.5">
        {busy ? <Spinner className="h-4 w-4" /> : d.listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
        {d.listening && <span>Ouvindo… parar</span>}
        {d.pending > 0 && <Spinner className={cn('h-3.5 w-3.5', d.listening ? 'text-white' : 'text-brand')} />}
      </span>
    </button>
  )
}
