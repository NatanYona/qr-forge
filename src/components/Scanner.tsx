import { useEffect, useRef, useState } from 'react'
import { decodeImageData, type DecodedQr } from '../lib/decode'
import { QrResultsList } from './QrResults'

type Status = 'idle' | 'requesting' | 'scanning' | 'denied' | 'error' | 'unsupported'

const SCAN_INTERVAL = 280 // ms between frame reads
const MAX_FRAME_WIDTH = 480 // downscale frames for fast decoding

export function Scanner() {
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<DecodedQr[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const scanningRef = useRef(false)

  function addResults(found: DecodedQr[]) {
    if (!found.length) return
    setResults((prev) => {
      const seen = new Set(prev.map((r) => r.text))
      const fresh = found.filter((r) => !seen.has(r.text))
      return fresh.length ? [...prev, ...fresh] : prev
    })
  }

  async function tick() {
    if (!scanningRef.current) return
    const video = videoRef.current
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      let canvas = canvasRef.current
      if (!canvas) {
        canvas = document.createElement('canvas')
        canvasRef.current = canvas
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h)
        try {
          addResults(await decodeImageData(ctx.getImageData(0, 0, w, h)))
        } catch {
          /* ignore per-frame decode errors */
        }
      }
    }
    if (scanningRef.current) timerRef.current = window.setTimeout(tick, SCAN_INTERVAL)
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {})
      }
      setStatus('scanning')
      scanningRef.current = true
      timerRef.current = window.setTimeout(tick, SCAN_INTERVAL)
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
    }
  }

  function stop() {
    scanningRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setStatus('idle')
  }

  // Always release the camera when the component unmounts (mode switch).
  useEffect(() => () => stop(), [])

  return (
    <section className="panel rise mt-6">
      <div className="flex items-center gap-2 border-b border-edge bg-panel-2 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </span>
        <span className="ml-2 font-mono text-[11px] text-fg-dim">scan.cam</span>
        <span className="ml-auto font-mono text-[11px] text-acc">local-only</span>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_1fr]">
        {/* Camera feed */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded border border-edge bg-base">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />

            {status === 'scanning' && (
              <>
                <div className="pointer-events-none absolute inset-10 rounded border-2 border-acc/60 shadow-[0_0_40px_-10px_rgba(54,245,160,0.6)]" />
                <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-base/70 px-2 py-1 font-mono text-[11px] text-acc">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acc" />
                  escaneando
                </span>
              </>
            )}

            {status !== 'scanning' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-base/95 p-6 text-center">
                {status === 'idle' && (
                  <>
                    <span className="text-3xl text-acc">⊡</span>
                    <button className="btn btn-acc" onClick={start}>
                      activar cámara
                    </button>
                    <span className="font-mono text-[11px] text-fg-dim">
                      los fotogramas no salen de tu dispositivo
                    </span>
                  </>
                )}
                {status === 'requesting' && (
                  <p className="font-mono text-sm text-fg-dim">
                    <span className="text-acc">▌</span> solicitando permiso de cámara…
                  </p>
                )}
                {status === 'denied' && (
                  <>
                    <p className="font-mono text-sm text-warn">! permiso de cámara denegado</p>
                    <p className="max-w-[18rem] font-mono text-[11px] text-fg-dim">
                      habilítalo en el icono de la barra de direcciones y vuelve a intentarlo.
                    </p>
                    <button className="btn btn-ghost" onClick={start}>
                      reintentar
                    </button>
                  </>
                )}
                {status === 'unsupported' && (
                  <p className="max-w-[18rem] font-mono text-sm text-warn">
                    ! tu navegador no permite acceso a la cámara (requiere HTTPS).
                  </p>
                )}
                {status === 'error' && (
                  <>
                    <p className="font-mono text-sm text-warn">! no se pudo abrir la cámara</p>
                    <button className="btn btn-ghost" onClick={start}>
                      reintentar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {status === 'scanning' && (
            <button className="btn btn-ghost mt-3 w-full" onClick={stop}>
              ✕ detener cámara
            </button>
          )}
        </div>

        {/* Results */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[12px] text-fg-dim">
              <span className="text-fg-bright">{results.length}</span>{' '}
              {results.length === 1 ? 'código detectado' : 'códigos detectados'}
            </p>
            {results.length > 0 && (
              <button
                onClick={() => setResults([])}
                className="font-mono text-[11px] text-fg-dim transition hover:text-acc"
              >
                limpiar
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <p className="font-mono text-sm text-fg-dim">
              // apunta la cámara a uno o varios códigos QR
            </p>
          ) : (
            <QrResultsList results={results} />
          )}
        </div>
      </div>
    </section>
  )
}
