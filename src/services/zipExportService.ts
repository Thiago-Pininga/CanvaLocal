/**
 * zipExportService.ts
 *
 * Provides reliable Blob downloads (bypassing Chrome's 2MB data: URL limit),
 * pure-JS ZIP archive creation for downloading Carousel page blocks in a single .zip file,
 * and panoramic strip stitching for exporting a block of pages as a single composite image.
 */

export function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const parts = dataUrl.split(',')
  const mimeMatch = parts[0]?.match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const base64 = parts[1] || ''
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, mime }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const { bytes, mime } = dataUrlToUint8Array(dataUrl)
  return new Blob([bytes.buffer as ArrayBuffer], { type: mime })
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Precompute CRC32 table for standard ZIP format
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Packs multiple images into a single standard .ZIP archive Blob (STORE method, 0 dependencies)
 */
export function createZipFromDataUrls(files: Array<{ filename: string; dataUrl: string }>): Blob {
  const encoder = new TextEncoder()
  const localHeaders: Uint8Array[] = []
  const centralHeaders: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.filename)
    const { bytes: dataBytes } = dataUrlToUint8Array(file.dataUrl)
    const crc = crc32(dataBytes)
    const size = dataBytes.length

    // Local file header (30 bytes + nameBytes)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 flag
    lv.setUint16(8, 0, true) // compression: 0 (STORE)
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0x5421, true) // mod date
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    localHeaders.push(localHeader, dataBytes)

    // Central directory header (46 bytes + nameBytes)
    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true) // UTF-8 flag
    cv.setUint16(10, 0, true) // compression: 0 (STORE)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x5421, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    centralHeader.set(nameBytes, 46)

    centralHeaders.push(centralHeader)
    offset += localHeader.length + dataBytes.length
  }

  const centralSize = centralHeaders.reduce((acc, arr) => acc + arr.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // EOCD signature
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const parts: ArrayBuffer[] = [
    ...localHeaders.map((u) => u.buffer as ArrayBuffer),
    ...centralHeaders.map((u) => u.buffer as ArrayBuffer),
    eocd.buffer as ArrayBuffer,
  ]
  return new Blob(parts, { type: 'application/zip' })
}

/**
 * Stitches multiple page dataUrls side-by-side into a single panoramic Carousel Sheet Blob
 */
export async function createPanoramicStripBlob(
  dataUrls: string[],
  format: 'png' | 'jpeg' | 'webp' = 'png',
  gap = 0
): Promise<Blob> {
  const images = await Promise.all(
    dataUrls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
    )
  )

  if (images.length === 0) {
    throw new Error('Nenhuma página selecionada para exportar.')
  }

  const slideW = images[0].naturalWidth || images[0].width || 1080
  const slideH = images[0].naturalHeight || images[0].height || 1350
  const totalW = slideW * images.length + gap * Math.max(0, images.length - 1)

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = slideH
  const ctx = canvas.getContext('2d')!

  if (format === 'jpeg') {
    ctx.fillStyle = '#ebe6de'
    ctx.fillRect(0, 0, totalW, slideH)
  }

  images.forEach((img, idx) => {
    const x = idx * (slideW + gap)
    ctx.drawImage(img, x, 0, slideW, slideH)
  })

  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  const outDataUrl = canvas.toDataURL(mime, 0.95)
  return dataUrlToBlob(outDataUrl)
}

