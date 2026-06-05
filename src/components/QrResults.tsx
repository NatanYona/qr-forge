import { useState } from 'react'
import type { DecodedQr, DecodedType } from '../lib/decode'

const TYPE_BADGE: Record<DecodedType, { label: string; cls: string }> = {
  url: { label: 'url', cls: 'text-acc border-acc/40' },
  wifi: { label: 'wi-fi', cls: 'text-[#4fd6ff] border-[#4fd6ff]/40' },
  text: { label: 'texto', cls: 'text-fg-dim border-edge' },
}

/** Pull the SSID out of a WIFI: payload for a friendlier label. */
function wifiSsid(text: string): string | null {
  const m = text.match(/(?:^|;)S:((?:\\.|[^\\;])*)/i)
  return m ? m[1].replace(/\\(.)/g, '$1') : null
}

/** Shared list of decoded QR codes with per-item copy (used by Decoder & Scanner). */
export function QrResultsList({ results }: { results: DecodedQr[] }) {
  const [copied, setCopied] = useState<number | null>(null)

  async function copy(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(i)
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1400)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {results.map((r, i) => {
        const badge = TYPE_BADGE[r.type]
        const ssid = r.type === 'wifi' ? wifiSsid(r.text) : null
        return (
          <li key={r.text} className="rounded border border-edge bg-base p-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${badge.cls}`}
              >
                {badge.label}
              </span>
              <button
                onClick={() => copy(r.text, i)}
                className="font-mono text-[11px] text-fg-dim transition hover:text-acc"
              >
                {copied === i ? '✓ copiado' : '⧉ copiar'}
              </button>
            </div>

            {ssid && (
              <p className="mt-2 font-mono text-[13px] text-fg-bright">
                red: <span className="text-acc">{ssid}</span>
              </p>
            )}
            <p className="mt-1 break-all font-mono text-[12px] text-fg">{r.text}</p>

            {r.type === 'url' && (
              <a
                href={r.text}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-mono text-[11px] text-acc hover:underline"
              >
                abrir ↗
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
