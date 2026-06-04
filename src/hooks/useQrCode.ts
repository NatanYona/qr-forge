import { useCallback, useEffect, useRef } from 'react'
import QRCodeStyling from 'qr-code-styling'
import { buildOptions, type QrSettings } from '../lib/qr'

const PREVIEW_SIZE = 320

/**
 * Owns a single QRCodeStyling instance for the live preview and exposes
 * download / clipboard helpers that render fresh high-resolution copies.
 */
export function useQrCode(settings: QrSettings) {
  const stageRef = useRef<HTMLDivElement>(null)
  const qrRef = useRef<QRCodeStyling | null>(null)

  // Create the instance once and mount it into the stage.
  useEffect(() => {
    const qr = new QRCodeStyling(buildOptions(settings, PREVIEW_SIZE))
    qrRef.current = qr
    const stage = stageRef.current
    if (stage) {
      stage.replaceChildren()
      qr.append(stage)
    }
    return () => {
      qrRef.current = null
    }
    // Intentionally run once; updates are handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push setting changes into the existing instance.
  useEffect(() => {
    qrRef.current?.update(buildOptions(settings, PREVIEW_SIZE))
  }, [settings])

  const download = useCallback(
    async (extension: 'png' | 'svg', size = 1024) => {
      const exporter = new QRCodeStyling({
        ...buildOptions(settings, size),
        type: extension === 'svg' ? 'svg' : 'canvas',
      })
      await exporter.download({ name: 'qr-forge', extension })
    },
    [settings],
  )

  const copyPng = useCallback(
    async (size = 1024) => {
      const exporter = new QRCodeStyling({
        ...buildOptions(settings, size),
        type: 'canvas',
      })
      const raw = await exporter.getRawData('png')
      if (!raw || !navigator.clipboard || !('write' in navigator.clipboard)) {
        return false
      }
      const blob = raw instanceof Blob ? raw : new Blob([raw], { type: 'image/png' })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    },
    [settings],
  )

  return { stageRef, download, copyPng }
}
