/**
 * Alpha-channel analysis.
 *
 * Each transparent layer (a PNG image, or a single decoded frame captured from a
 * transparent WebM video) is drawn into a small offscreen canvas and its alpha
 * channel is read back. We extract, for every analysis row, the left and right
 * edges of the opaque silhouette. The result is stored in normalized [0..1]
 * space (see types.ts) so it is independent of how large the layer is later
 * rendered, and so re-thresholding is cheap.
 *
 * Performance notes:
 *  - We downsample to at most ANALYSIS_MAX_H rows / ANALYSIS_MAX_W columns.
 *    Silhouette extents only need coarse resolution, and this keeps a full
 *    re-analysis well under a frame even for several megapixel-sized sources.
 *  - The raw alpha bytes are cached per drawable so moving the `alphaThreshold`
 *    slider only re-runs the cheap row scan, not the canvas readback.
 */

import type { AlphaProfile } from '../types'

const ANALYSIS_MAX_H = 240
const ANALYSIS_MAX_W = 200

/** Anything we can draw to a canvas and read alpha from. */
export type AlphaDrawable = HTMLImageElement | HTMLCanvasElement

/** Downsampled alpha readback for one drawable. */
interface AlphaData {
  width: number
  height: number
  /** Alpha byte per pixel, row-major. Length = width * height. */
  alpha: Uint8ClampedArray
  naturalWidth: number
  naturalHeight: number
}

const alphaCache = new WeakMap<AlphaDrawable, AlphaData>()

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

/**
 * Decode a transparent WebM video and capture its first available frame into a
 * canvas, preserving the alpha channel. This converts the video into a still,
 * analyzable form — the same shape as an image — so the rest of the pipeline is
 * codec-agnostic.
 *
 * The key correctness detail (which the naive approach gets wrong): we must wait
 * for a frame to actually be *decoded* before drawing, otherwise the canvas is
 * empty and the silhouette comes back blank. We prefer requestVideoFrameCallback
 * and fall back to seeking + the `seeked` event.
 */
export function captureVideoFrame(
  src: string,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = src

    let settled = false
    const cleanup = () => {
      video.onerror = null
      try {
        video.pause()
      } catch {
        /* ignore */
      }
    }

    const grab = () => {
      if (settled) return
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) {
        reject(new Error('Video has no decodable dimensions'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('2D canvas context unavailable'))
        return
      }
      // clearRect leaves the canvas transparent; drawImage of an alpha-channel
      // video frame keeps its transparency, so getImageData sees real alpha.
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(video, 0, 0, w, h)
      settled = true
      cleanup()
      resolve({ canvas, width: w, height: h })
    }

    video.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`Failed to load video: ${src}`))
    }

    const hasRVFC = typeof (video as unknown as { requestVideoFrameCallback?: unknown })
      .requestVideoFrameCallback === 'function'

    video.onloadeddata = () => {
      if (hasRVFC) {
        ;(
          video as unknown as { requestVideoFrameCallback: (cb: () => void) => number }
        ).requestVideoFrameCallback(() => grab())
        // play() drives the frame callback; muted autoplay is allowed.
        void video.play().catch(() => {
          // If autoplay is blocked, fall back to a seek to force a frame.
          video.currentTime = 0.04
        })
      } else {
        video.onseeked = () => grab()
        video.currentTime = 0.04
      }
    }

    // Safety net: if nothing fired within 2.5s, try grabbing whatever we have.
    setTimeout(() => {
      if (!settled && video.readyState >= 2) grab()
      else if (!settled) {
        settled = true
        cleanup()
        reject(new Error('Timed out decoding video frame'))
      }
    }, 2500)
  })
}

/** Draw a drawable into a downsampled canvas and read back its alpha channel. */
function extractAlphaData(drawable: AlphaDrawable, naturalWidth: number, naturalHeight: number): AlphaData {
  const cached = alphaCache.get(drawable)
  if (cached) return cached

  const nw = naturalWidth
  const nh = naturalHeight
  const scale = Math.min(1, ANALYSIS_MAX_W / nw, ANALYSIS_MAX_H / nh)
  const w = Math.max(1, Math.round(nw * scale))
  const h = Math.max(1, Math.round(nh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(drawable, 0, 0, w, h)

  const rgba = ctx.getImageData(0, 0, w, h).data
  const alpha = new Uint8ClampedArray(w * h)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0

  const data: AlphaData = { width: w, height: h, alpha, naturalWidth: nw, naturalHeight: nh }
  alphaCache.set(drawable, data)
  return data
}

/**
 * Build a normalized silhouette profile for a drawable at a given alpha
 * threshold. Cheap to call repeatedly (alpha readback is cached).
 */
export function analyzeAlpha(
  drawable: AlphaDrawable,
  naturalWidth: number,
  naturalHeight: number,
  alphaThreshold: number,
): AlphaProfile {
  const { width, height, alpha } = extractAlphaData(drawable, naturalWidth, naturalHeight)
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
