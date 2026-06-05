import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export type DecodedType = 'url' | 'wifi' | 'text'

export interface DecodedQr {
  text: string
  type: DecodedType
}

function detectType(text: string): DecodedType {
  if (/^WIFI:/i.test(text)) return 'wifi'
  if (/^https?:\/\//i.test(text)) return 'url'
  return 'text'
}

// The ZXing reader (WASM) is loaded lazily and self-hosted (privacy/offline)
// instead of the library's default jsDelivr CDN.
let readerPromise: Promise<typeof import('zxing-wasm/reader')> | null = null
function getReader(): Promise<typeof import('zxing-wasm/reader')> {
  if (!readerPromise) {
    readerPromise = import('zxing-wasm/reader').then((mod) => {
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? wasmUrl : prefix + path,
        },
      })
      return mod
    })
  }
  return readerPromise
}

async function runReader(source: Blob | ImageData): Promise<DecodedQr[]> {
  const mod = await getReader()
  const results = await mod.readBarcodes(source, {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 255,
  })
  const seen = new Set<string>()
  const out: DecodedQr[] = []
  for (const r of results) {
    if (!r.isValid || !r.text || seen.has(r.text)) continue
    seen.add(r.text)
    out.push({ text: r.text, type: detectType(r.text) })
  }
  return out
}

/** Decode every distinct QR code found in an uploaded image. */
export const decodeImageQRs = (source: Blob): Promise<DecodedQr[]> => runReader(source)

/** Decode every distinct QR code in a single camera frame (ImageData). */
export const decodeImageData = (frame: ImageData): Promise<DecodedQr[]> => runReader(frame)
