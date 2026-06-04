import QRCodeStyling from 'qr-code-styling'
import { buildData, buildOptions, type QrSettings } from './qr'

export type ScanStatus = 'ok' | 'risky' | 'fail'

export interface ScanResult {
  status: ScanStatus
  decoded: string | null
  message: string
}

// jsQR (~48 KB gzip) is loaded lazily so it never blocks first paint.
type JsQR = (typeof import('jsqr'))['default']
let jsQRPromise: Promise<JsQR> | null = null
function loadJsQR(): Promise<JsQR> {
  if (!jsQRPromise) jsQRPromise = import('jsqr').then((m) => m.default)
  return jsQRPromise
}

/** Render the QR for the given settings to ImageData at `size` px. */
async function renderImageData(settings: QrSettings, size: number): Promise<ImageData | null> {
  const qr = new QRCodeStyling({ ...buildOptions(settings, size), type: 'canvas' })
  const raw = await qr.getRawData('png')
  if (!raw) return null
  const blob = raw instanceof Blob ? raw : new Blob([raw], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return null
  }
  // Flatten onto the QR background colour to remove any transparency.
  ctx.fillStyle = settings.bgColor
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, 0, 0, size, size)
  bitmap.close()
  return ctx.getImageData(0, 0, size, size)
}

/** Decode a single QR from ImageData. `attemptBoth` handles light-on-dark codes. */
function decode(jsQR: JsQR, img: ImageData | null): string | null {
  if (!img) return null
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return code ? code.data : null
}

/**
 * Confirms the generated QR actually decodes, and gauges robustness by also
 * testing a small "stress" render (≈ how it survives being printed small).
 */
export async function validateScannability(settings: QrSettings): Promise<ScanResult> {
  const expected = buildData(settings)
  if (!expected) return { status: 'fail', decoded: null, message: 'sin contenido' }

  const jsQR = await loadJsQR()
  const normal = decode(jsQR, await renderImageData(settings, 320))
  if (!normal) {
    return { status: 'fail', decoded: null, message: 'ilegible — revisa el contraste y los colores' }
  }

  const matches = normal === expected
  const small = decode(jsQR, await renderImageData(settings, 110))
  if (small) {
    return {
      status: 'ok',
      decoded: normal,
      message: matches ? 'legible, incluso a tamaño pequeño' : 'legible (el contenido no coincide)',
    }
  }
  return {
    status: 'risky',
    decoded: normal,
    message: 'legible en grande; puede fallar impreso muy pequeño',
  }
}
