import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { useQrCode } from './hooks/useQrCode'
import {
  DEFAULT_SETTINGS,
  contrastRatio,
  effectiveEc,
  hasContent,
  type CornerSquareType,
  type DotType,
  type ErrorCorrectionLevel,
  type QrSettings,
  type WifiAuth,
} from './lib/qr'
import { validateScannability, type ScanResult } from './lib/validate'
import { Decoder } from './components/Decoder'

const DOT_STYLES: { value: DotType; label: string }[] = [
  { value: 'square', label: 'cuadrado' },
  { value: 'rounded', label: 'redondeado' },
  { value: 'dots', label: 'puntos' },
  { value: 'classy', label: 'elegante' },
  { value: 'classy-rounded', label: 'elegante_redondo' },
  { value: 'extra-rounded', label: 'extra_redondo' },
]

const CORNER_STYLES: { value: CornerSquareType; label: string }[] = [
  { value: 'square', label: 'cuadrada' },
  { value: 'dot', label: 'punto' },
  { value: 'extra-rounded', label: 'redondeada' },
]

const EC_LEVELS: { value: ErrorCorrectionLevel; label: string }[] = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H' },
]

const PALETTES = [
  { name: 'matrix', fg: '#36f5a0', bg: '#0a0d0e' },
  { name: 'ámbar', fg: '#ffb454', bg: '#0c0a06' },
  { name: 'cian', fg: '#4fd6ff', bg: '#06090d' },
  { name: 'magenta', fg: '#ff5d9e', bg: '#0d060a' },
  { name: 'mono', fg: '#e8f3ec', bg: '#0a0d0e' },
  { name: 'clásico', fg: '#0a0d0e', bg: '#ffffff' },
]

export default function App() {
  const [settings, setSettings] = useState<QrSettings>(DEFAULT_SETTINGS)
  const [copied, setCopied] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [mode, setMode] = useState<'forge' | 'decode'>('forge')
  const { stageRef, download, copyPng } = useQrCode(settings)

  function set<K extends keyof QrSettings>(key: K, value: QrSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }
  function setWifi<K extends keyof QrSettings['wifi']>(
    key: K,
    value: QrSettings['wifi'][K],
  ) {
    setSettings((s) => ({ ...s, wifi: { ...s.wifi, [key]: value } }))
  }

  function onLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('logo', reader.result as string)
    reader.readAsDataURL(file)
  }

  async function onCopy() {
    const ok = await copyPng()
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  // Debounced in-browser scannability check: actually decode the generated QR.
  useEffect(() => {
    if (!hasContent(settings)) {
      setScan(null)
      setChecking(false)
      return
    }
    setChecking(true)
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const result = await validateScannability(settings)
        if (!cancelled) setScan(result)
      } catch {
        if (!cancelled) setScan(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [settings])

  const ratio = contrastRatio(settings.fgColor, settings.bgColor)
  const lowContrast = ratio < 3
  const ready = hasContent(settings)

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-7">
      <Header />

      <div className="mt-6 flex justify-center">
        <div className="inline-flex rounded border border-edge bg-panel p-1">
          <button
            onClick={() => setMode('forge')}
            className={`rounded px-5 py-1.5 font-mono text-[13px] font-medium transition ${
              mode === 'forge' ? 'bg-acc/15 text-acc' : 'text-fg-dim hover:text-fg-bright'
            }`}
          >
            ⛏ forge
          </button>
          <button
            onClick={() => setMode('decode')}
            className={`rounded px-5 py-1.5 font-mono text-[13px] font-medium transition ${
              mode === 'decode' ? 'bg-acc/15 text-acc' : 'text-fg-dim hover:text-fg-bright'
            }`}
          >
            ⌖ decode
          </button>
        </div>
      </div>

      {/* Kept mounted (only hidden) so qr-code-styling's one-time SVG mount
          survives switching to the decoder and back. */}
      <main
        className={`mt-6 grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start ${
          mode === 'forge' ? '' : 'hidden'
        }`}
      >
        {/* ----- Preview ------------------------------------------------ */}
        <section className="panel rise lg:sticky lg:top-6" style={{ animationDelay: '60ms' }}>
          <WindowBar title="preview.svg" status="live" />
          <div className="p-5">
            <div className="glow relative rounded border border-edge bg-base p-4">
              <div className="qr-stage overflow-hidden rounded-sm" ref={stageRef} />
              {!ready && (
                <div className="absolute inset-4 flex items-center justify-center rounded-sm bg-base/90 text-center font-mono text-[13px] text-fg-dim">
                  // esperando input...
                </div>
              )}
            </div>

            {ready && (
              <div
                className="mt-3 flex items-center justify-center gap-2 font-mono text-[12px]"
                title={scan?.message ?? ''}
              >
                <span className="text-fg-dim">scan-check:</span>
                {checking || !scan ? (
                  <span className="text-fg-dim">comprobando…</span>
                ) : scan.status === 'ok' ? (
                  <span className="text-acc">✓ legible</span>
                ) : scan.status === 'risky' ? (
                  <span className="text-warn">⚠ ajustado</span>
                ) : (
                  <span className="text-[#ff6b6b]">✗ ilegible</span>
                )}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button className="btn btn-acc" onClick={() => download('png')} disabled={!ready}>
                ↧ descargar.png
              </button>
              <button className="btn btn-ghost" onClick={() => download('svg')} disabled={!ready}>
                ↧ descargar.svg
              </button>
            </div>
            <button className="btn btn-ghost mt-2.5 w-full" onClick={onCopy} disabled={!ready}>
              {copied ? '✓ copiado al portapapeles' : '⧉ copiar imagen'}
            </button>
            <p className="mt-3 text-center font-mono text-[11px] text-fg-dim">
              out: png/svg · 1024px · vectorial
            </p>
          </div>
        </section>

        {/* ----- Controls ----------------------------------------------- */}
        <div className="flex flex-col gap-6">
          {/* Content */}
          <section className="panel rise" style={{ animationDelay: '120ms' }}>
            <SectionTitle index="01" title="contenido" />
            <div className="p-5 pt-1">
              <div className="mb-5 inline-flex rounded border border-edge bg-base p-1">
                <Tab active={settings.contentType === 'url'} onClick={() => set('contentType', 'url')}>
                  url / texto
                </Tab>
                <Tab active={settings.contentType === 'wifi'} onClick={() => set('contentType', 'wifi')}>
                  wi-fi
                </Tab>
              </div>

              {settings.contentType === 'url' ? (
                <Field label="data">
                  <textarea
                    className="text-input min-h-[88px] resize-y"
                    value={settings.text}
                    placeholder="https://tu-web.com"
                    onChange={(e) => set('text', e.target.value)}
                  />
                </Field>
              ) : (
                <div className="grid gap-4">
                  <Field label="ssid">
                    <input
                      className="text-input"
                      value={settings.wifi.ssid}
                      placeholder="MiWiFi"
                      onChange={(e) => setWifi('ssid', e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="encryption">
                      <select
                        className="select-input"
                        value={settings.wifi.auth}
                        onChange={(e) => setWifi('auth', e.target.value as WifiAuth)}
                      >
                        <option value="WPA">WPA / WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">sin contraseña</option>
                      </select>
                    </Field>
                    <Field label="password">
                      <input
                        className="text-input"
                        type="text"
                        value={settings.wifi.password}
                        placeholder="••••••••"
                        disabled={settings.wifi.auth === 'nopass'}
                        onChange={(e) => setWifi('password', e.target.value)}
                      />
                    </Field>
                  </div>
                  <label className="flex w-fit cursor-pointer items-center gap-2.5 font-mono text-[13px] text-fg">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-acc"
                      checked={settings.wifi.hidden}
                      onChange={(e) => setWifi('hidden', e.target.checked)}
                    />
                    --hidden (red oculta)
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Style */}
          <section className="panel rise" style={{ animationDelay: '180ms' }}>
            <SectionTitle index="02" title="estilo" />
            <div className="p-5 pt-1">
              <Field label="palette">
                <div className="flex flex-wrap gap-2">
                  {PALETTES.map((p) => {
                    const active = settings.fgColor === p.fg && settings.bgColor === p.bg
                    return (
                      <button
                        key={p.name}
                        title={p.name}
                        onClick={() => setSettings((s) => ({ ...s, fgColor: p.fg, bgColor: p.bg }))}
                        className={`flex h-9 w-9 items-center justify-center rounded border transition ${
                          active
                            ? 'border-acc shadow-[0_0_14px_-3px_rgba(54,245,160,0.6)]'
                            : 'border-edge hover:border-edge-bright'
                        }`}
                        style={{ background: p.bg }}
                      >
                        <span className="h-4 w-4 rounded-[2px]" style={{ background: p.fg }} />
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ColorField label="fg (código)" value={settings.fgColor} onChange={(v) => set('fgColor', v)} />
                <ColorField label="bg (fondo)" value={settings.bgColor} onChange={(v) => set('bgColor', v)} />
              </div>

              {lowContrast && (
                <div className="mt-4 flex items-start gap-2.5 rounded border border-warn/40 bg-warn/10 px-3.5 py-3 font-mono text-[12px] text-warn">
                  <span aria-hidden>!</span>
                  <span>
                    warning: contraste bajo ({ratio.toFixed(1)}:1). Algunos lectores fallarán;
                    aumenta la diferencia entre fg y bg.
                  </span>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="dot-style">
                  <select
                    className="select-input"
                    value={settings.dotType}
                    onChange={(e) => set('dotType', e.target.value as DotType)}
                  >
                    {DOT_STYLES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="corner-style">
                  <select
                    className="select-input"
                    value={settings.cornerSquareType}
                    onChange={(e) => set('cornerSquareType', e.target.value as CornerSquareType)}
                  >
                    {CORNER_STYLES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </section>

          {/* Advanced */}
          <section className="panel rise" style={{ animationDelay: '240ms' }}>
            <SectionTitle index="03" title="avanzado" />
            <div className="p-5 pt-1">
              <Field label="logo (opcional)">
                {settings.logo ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={settings.logo}
                      alt="logo"
                      className="h-12 w-12 rounded border border-edge bg-base object-contain"
                    />
                    <button className="btn btn-ghost py-2" onClick={() => set('logo', null)}>
                      ✕ quitar logo
                    </button>
                  </div>
                ) : (
                  <label className="btn btn-ghost w-full cursor-pointer">
                    + subir imagen
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
                  </label>
                )}
              </Field>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="field-label">› error-correction</span>
                  {settings.logo && (
                    <span className="font-mono text-[10px] text-acc">// forzado a H por el logo</span>
                  )}
                </div>
                <div className="inline-flex rounded border border-edge bg-base p-1">
                  {EC_LEVELS.map((lv) => {
                    const active = effectiveEc(settings) === lv.value
                    return (
                      <button
                        key={lv.value}
                        disabled={!!settings.logo}
                        onClick={() => set('ecLevel', lv.value)}
                        className={`rounded px-3.5 py-1.5 font-mono text-xs transition disabled:opacity-40 ${
                          active ? 'bg-acc/15 text-acc' : 'text-fg-dim hover:text-fg-bright'
                        }`}
                      >
                        {lv.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field label={`margin · ${settings.margin}px`} className="mt-5">
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={settings.margin}
                  onChange={(e) => set('margin', Number(e.target.value))}
                  className="w-full accent-acc"
                />
              </Field>
            </div>
          </section>
        </div>
      </main>

      {mode === 'decode' && <Decoder />}

      <Footer />
    </div>
  )
}

/* ---- Small presentational helpers ------------------------------------ */
function WindowBar({ title, status }: { title: string; status?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-edge bg-panel-2 px-4 py-2.5">
      <span className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
      </span>
      <span className="ml-2 font-mono text-[11px] text-fg-dim">{title}</span>
      {status && (
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-acc">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acc" />
          {status}
        </span>
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="rise overflow-hidden rounded-md border border-edge bg-panel">
      <WindowBar title="nate@qr-forge: ~/new" status="local-only" />
      <div className="px-5 py-5 sm:px-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg-bright sm:text-[28px]">
          <span className="text-acc">$</span> qr_forge
          <span className="cursor text-acc">_</span>
        </h1>
        <p className="mt-1.5 font-mono text-[12px] text-fg-dim sm:text-[13px]">
          {'// generador de códigos QR — libre, sin paywall, 100% en tu navegador'}
        </p>
      </div>
    </header>
  )
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-edge px-5 py-3">
      <span className="text-acc">▌</span>
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-dim">
        {index}
      </span>
      <span className="font-mono text-[13px] font-semibold text-fg-bright">{title}</span>
    </div>
  )
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label mb-2 block">
        <span className="text-fg-dim/70">›</span> {label}
      </span>
      {children}
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2.5 rounded border border-edge bg-base px-2.5 py-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-edge bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-sm uppercase text-fg-bright outline-none"
        />
      </div>
    </Field>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-4 py-1.5 font-mono text-[13px] font-medium transition ${
        active ? 'bg-acc/15 text-acc' : 'text-fg-dim hover:text-fg-bright'
      }`}
    >
      {children}
    </button>
  )
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-edge pt-6 text-center font-mono text-[11px] text-fg-dim">
      <span className="text-acc">$</span> open-source · sin anuncios · sin tracking ·{' '}
      <span className="text-acc cursor">█</span>
    </footer>
  )
}
