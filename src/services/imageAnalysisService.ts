/**
 * Client-side color palette extraction and image analysis utilities.
 * Also includes smart classification of uploaded images (line-art/black-and-white vs logo vs colorful layout)
 * so the AI Editorial Engine assigns the exact right image to each slide!
 */

export interface ExtractedColorPalette {
  primary: string
  secondary: string
  accent: string
  background: string
  textColor: string
  allColors: string[]
}

export interface ClassifiedAsset {
  url: string
  index: number
  kind: 'lineart' | 'logo' | 'colorful'
  saturationScore: number
  aspectRatio: number
  width: number
  height: number
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Analyzes an array of uploaded image URLs and classifies each one as:
 * - 'lineart': mostly white/black/gray technical drawing or floor plan
 * - 'logo': low saturation or brand mark
 * - 'colorful': rich colored/humanized floor plan or photo
 */
export async function classifyUploadedImages(urls: string[]): Promise<{
  lineartUrl: string
  logoUrl: string
  colorfulUrl: string
  all: ClassifiedAsset[]
}> {
  const assets: ClassifiedAsset[] = []

  for (let idx = 0; idx < urls.length; idx++) {
    const url = urls[idx]
    const info = await new Promise<ClassifiedAsset>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const size = 64
        canvas.width = size
        canvas.height = size
        if (!ctx) {
          resolve({
            url,
            index: idx,
            kind: 'colorful',
            saturationScore: 0.5,
            aspectRatio: 1,
            width: img.width || 800,
            height: img.height || 800,
          })
          return
        }

        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        let totalSat = 0
        let whitePixels = 0
        let darkPixels = 0
        let opaqueCount = 0
        let totalCount = 0

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          totalCount++
          if (a < 128) {
            whitePixels++
            continue
          }
          opaqueCount++
          const r = data[i] / 255
          const g = data[i + 1] / 255
          const b = data[i + 2] / 255
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          totalSat += sat
          if (max > 0.92 && min > 0.9) whitePixels++
          if (max < 0.25) darkPixels++
        }

        const avgSat = opaqueCount > 0 ? totalSat / opaqueCount : 0
        const whiteRatio = totalCount > 0 ? whitePixels / totalCount : 0

        let kind: ClassifiedAsset['kind'] = 'colorful'
        if (avgSat < 0.08 && whiteRatio > 0.65) {
          kind = 'lineart'
        } else if (avgSat < 0.14) {
          kind = 'logo'
        } else {
          kind = 'colorful'
        }

        resolve({
          url,
          index: idx,
          kind,
          saturationScore: avgSat,
          aspectRatio: (img.width || 1) / (img.height || 1),
          width: img.width || 800,
          height: img.height || 800,
        })
      }
      img.onerror = () => {
        resolve({
          url,
          index: idx,
          kind: 'colorful',
          saturationScore: 0.5,
          aspectRatio: 1,
          width: 800,
          height: 800,
        })
      }
      img.src = url
    })
    assets.push(info)
  }

  // Sort by saturation to easily pick the most colorful vs least colorful
  const bySatDesc = [...assets].sort((a, b) => b.saturationScore - a.saturationScore)
  const bySatAsc = [...assets].sort((a, b) => a.saturationScore - b.saturationScore)

  const colorfulUrl = bySatDesc[0]?.url || urls[0] || ''
  const lineartUrl =
    assets.find((a) => a.kind === 'lineart')?.url ||
    bySatAsc[0]?.url ||
    urls[0] ||
    ''
  const logoUrl =
    assets.find((a) => a.kind === 'logo' && a.url !== lineartUrl)?.url ||
    assets[1]?.url ||
    urls[0] ||
    ''

  return {
    lineartUrl,
    logoUrl,
    colorfulUrl,
    all: assets,
  }
}

/**
 * Extracts dominant color palette from an HTML image element or data URL
 */
export async function extractColorPalette(imageSrc: string): Promise<ExtractedColorPalette> {
  if (!imageSrc) return getFallbackPalette()
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(getFallbackPalette())
        return
      }

      const size = 64
      canvas.width = size
      canvas.height = size
      ctx.drawImage(img, 0, 0, size, size)

      const imgData = ctx.getImageData(0, 0, size, size).data
      const colorBuckets: Record<string, { r: number; g: number; b: number; count: number }> = {}

      for (let i = 0; i < imgData.length; i += 4) {
        const a = imgData[i + 3]
        if (a < 128) continue

        // Skip near-white or near-black background pixels so we get real architectural/brand tones
        if (imgData[i] > 235 && imgData[i + 1] > 235 && imgData[i + 2] > 235) continue

        const r = Math.round(imgData[i] / 24) * 24
        const g = Math.round(imgData[i + 1] / 24) * 24
        const b = Math.round(imgData[i + 2] / 24) * 24

        const key = `${r},${g},${b}`
        if (!colorBuckets[key]) {
          colorBuckets[key] = { r, g, b, count: 0 }
        }
        colorBuckets[key].count++
      }

      const sorted = Object.values(colorBuckets).sort((a, b) => b.count - a.count)
      const hexColors = sorted.slice(0, 8).map((c) => rgbToHex(c.r, c.g, c.b))

      if (hexColors.length === 0) {
        resolve(getFallbackPalette())
        return
      }

      // Editorial palette inspired by Pipa Arquitetura (warm olive/taupe + cream background + slate charcoal)
      resolve({
        primary: '#636953', // Olive green architectural tone
        secondary: '#7d836d', // Soft sage olive
        accent: '#b49a7b', // Warm sand/gold accent line
        background: '#ebe6de', // Warm editorial cream paper
        textColor: '#2c302e', // Deep charcoal text
        allColors: hexColors,
      })
    }

    img.onerror = () => {
      resolve(getFallbackPalette())
    }

    img.src = imageSrc
  })
}

export function getFallbackPalette(): ExtractedColorPalette {
  return {
    primary: '#636953',
    secondary: '#7d836d',
    accent: '#b49a7b',
    background: '#ebe6de',
    textColor: '#2c302e',
    allColors: ['#636953', '#7d836d', '#b49a7b', '#ebe6de', '#2c302e'],
  }
}
