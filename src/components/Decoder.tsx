import { useState, type ChangeEvent, type DragEvent } from 'react'
import { motion } from 'motion/react'
import { decodeImageQRs, type DecodedQr } from '../lib/decode'
import { QrResultsList } from './QrResults'

export function Decoder() {
  const [results, setResults] = useState<DecodedQr[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('El archivo no es una imagen.')
      return
    }
    setError(null)
    setBusy(true)
    setResults(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    try {
      setResults(await decodeImageQRs(file))
    } catch {
      setError('No se pudo procesar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  return (
    <motion.section
      className="panel mt-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="flex items-center gap-2 border-b border-edge bg-panel-2 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </span>
        <span className="ml-2 font-mono text-[11px] text-fg-dim">decode.img</span>
        <span className="ml-auto font-mono text-[11px] text-acc">local-only</span>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[300px_1fr]">
        {/* Dropzone + preview */}
        <div>
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-6 py-12 text-center transition ${
              dragOver ? 'border-acc bg-acc/5' : 'border-edge hover:border-edge-bright'
            }`}
          >
            <span className="text-2xl text-acc">⌖</span>
            <span className="font-mono text-sm text-fg-bright">
              arrastra una imagen o haz clic
            </span>
            <span className="font-mono text-[11px] text-fg-dim">
              detecta varios QR · png/jpg/webp · todo local
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onInput} />
          </label>

          {preview && (
            <div className="mt-4 overflow-hidden rounded border border-edge bg-base p-2">
              <img src={preview} alt="imagen subida" className="mx-auto max-h-64 w-auto rounded-sm" />
            </div>
          )}
        </div>

        {/* Results */}
        <div>
          {busy && (
            <p className="font-mono text-sm text-fg-dim">
              <span className="text-acc">▌</span> decodificando…
            </p>
          )}

          {!busy && error && (
            <p className="font-mono text-sm text-warn">! {error}</p>
          )}

          {!busy && !error && results && (
            <>
              <p className="mb-3 font-mono text-[12px] text-fg-dim">
                <span className="text-fg-bright">{results.length}</span>{' '}
                {results.length === 1 ? 'código detectado' : 'códigos detectados'}
              </p>

              {results.length === 0 ? (
                <p className="font-mono text-sm text-fg-dim">
                  // no se detectó ningún QR en la imagen
                </p>
              ) : (
                <QrResultsList results={results} />
              )}
            </>
          )}

          {!busy && !error && !results && (
            <p className="font-mono text-sm text-fg-dim">
              // sube una imagen para extraer sus códigos QR
            </p>
          )}
        </div>
      </div>
    </motion.section>
  )
}
