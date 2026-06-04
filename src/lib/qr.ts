import type {
  Options,
  DotType,
  CornerSquareType,
  ErrorCorrectionLevel,
} from 'qr-code-styling'

// Re-export the library's enums so the UI imports them from one place.
export type { DotType, CornerSquareType, ErrorCorrectionLevel }

export type ContentType = 'url' | 'wifi'
export type WifiAuth = 'WPA' | 'WEP' | 'nopass'

export interface WifiSettings {
  ssid: string
  password: string
  auth: WifiAuth
  hidden: boolean
}

export interface QrSettings {
  contentType: ContentType
  text: string
  wifi: WifiSettings
  fgColor: string
  bgColor: string
  dotType: DotType
  cornerSquareType: CornerSquareType
  ecLevel: ErrorCorrectionLevel
  logo: string | null // data URL
  margin: number
}

export const DEFAULT_SETTINGS: QrSettings = {
  contentType: 'url',
  text: 'https://github.com',
  wifi: { ssid: '', password: '', auth: 'WPA', hidden: false },
  fgColor: '#36f5a0',
  bgColor: '#0a0d0e',
  dotType: 'square',
  cornerSquareType: 'square',
  ecLevel: 'M',
  logo: null,
  margin: 16,
}

/** Escape reserved characters per the WIFI: QR specification. */
function wifiEscape(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

export function buildWifiString(w: WifiSettings): string {
  if (!w.ssid) return ''
  const ssid = wifiEscape(w.ssid)
  const hidden = w.hidden ? 'H:true;' : ''
  if (w.auth === 'nopass') {
    return `WIFI:T:nopass;S:${ssid};${hidden};`
  }
  return `WIFI:T:${w.auth};S:${ssid};P:${wifiEscape(w.password)};${hidden};`
}

export function buildData(s: QrSettings): string {
  if (s.contentType === 'wifi') return buildWifiString(s.wifi)
  return s.text.trim()
}

/** A logo in the centre covers modules, so force high error correction. */
export function effectiveEc(s: QrSettings): ErrorCorrectionLevel {
  return s.logo ? 'H' : s.ecLevel
}

export function hasContent(s: QrSettings): boolean {
  return buildData(s).length > 0
}

export function buildOptions(s: QrSettings, size: number): Options {
  return {
    width: size,
    height: size,
    type: 'svg',
    data: buildData(s) || ' ',
    margin: s.margin,
    image: s.logo ?? undefined,
    qrOptions: { errorCorrectionLevel: effectiveEc(s) },
    dotsOptions: { color: s.fgColor, type: s.dotType },
    backgroundOptions: { color: s.bgColor },
    cornersSquareOptions: { color: s.fgColor, type: s.cornerSquareType },
    cornersDotOptions: { color: s.fgColor },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 6,
      imageSize: 0.4,
      hideBackgroundDots: true,
    },
  }
}

/* ---- Scannability: relative-luminance contrast check ------------------ */
function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(channel(0)) + 0.7152 * lin(channel(2)) + 0.0722 * lin(channel(4))
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
