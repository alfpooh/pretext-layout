/**
 * Alpha-channel analysis.
 *
 * Each transparent PNG layer is drawn into a small offscreen canvas and its
 * alpha channel is read back. We extract, for every analysis row, the left and
 * right edges of the opaque silhouette. The result is stored in normalized
 * [0..1] space (see types.ts) so it is independent of how large the layer is
 * later rendered, and so re-thresholding is cheap.
 *
 * Performance notes:
 *  - We downsample to at most ANALYSIS_MAX_H rows / ANALYSIS_MAX_W columns.
 *    Silhouette extents only need coarse resolution, and this keeps a full
 *    re-analysis well under a frame even for several megapixel-sized PNGs.
 *  - The raw alpha bytes are cached per image so moving the `alphaThreshold`
 *    slider only re-runs the cheap row scan, not the canvas readback.
 */

import type { AlphaProfile } from '../types'

const ANALYSIS_MAX_H = 240
const ANALYSIS_MAX_W = 200

/** Downsampled alpha readback for one image. */
interface AlphaData {
  width: number
  height: number
  /** Alpha byte per pixel, row-major. Length = width * height. */
  alpha: Uint8ClampedArray
  naturalWidth: number
  naturalHeight: number
}

const alphaCache = new WeakMap<HTMLImageElement, AlphaData>()

/** Load an image element and resolve once it has decoded. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/** Draw the image into a downsampled canvas and read back its alpha channel. */
function extractAlphaData(img: HTMLImageElement): AlphaData {
  const cached = alphaCache.get(img)
  if (cached) return cached

  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const scale = Math.min(1, ANALYSIS_MAX_W / nw, ANALYSIS_MAX_H / nh)
  const w = Math.max(1, Math.round(nw * scale))
  const h = Math.max(1, Math.round(nh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const rgba = ctx.getImageData(0, 0, w, h).data
  const alpha = new Uint8ClampedArray(w * h)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0

  const data: AlphaData = { width: w, height: h, alpha, naturalWidth: nw, naturalHeight: nh }
  alphaCache.set(img, data)
  return data
}

/**
 * Build a normalized silhouette profile for an image at a given alpha
 * threshold. Cheap to call repeatedly (alpha readback is cached).
 */
export function analyzeAlpha(img: HTMLImageElement, alphaThreshold: number): AlphaProfile {
  const { width, height, alpha, naturalWidth, naturalHeight } = extractAlphaData(img)
  const threshold = Math.max(0, Math.min(255, alphaThreshold))
  const rows: ([number, number] | null)[] = new Array(height)

  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    const base = y * width
    for (let x = 0; x < width; x++) {
      if (alpha[base + x]! > threshold) {
        if (left === -1) left = x
        right = x
      }
    }
    // Convert pixel column indices to fractions spanning the full layer width.
    // +1 on the right so a single opaque column still has positive extent.
    rows[y] = left === -1 ? null : [left / width, (right + 1) / width]
  }

  return { rowCount: height, rows, naturalWidth, naturalHeight }
}
