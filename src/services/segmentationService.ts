/**
 * segmentationService — automatic image → transparent layer separation.
 *
 * In the MVP the demo ships with three pre-separated transparent PNGs (see
 * data/sampleLayers.ts), so this service is an interface + stub only. In a
 * production build, a server pipeline (Grounded SAM / SAM 2 / BiRefNet, etc.)
 * would take a single uploaded image and return one cut-out PNG per detected
 * subject, which the app would then treat exactly like the bundled samples.
 *
 * The rest of the app depends only on `LayerSource[]`, so swapping this stub for
 * a real implementation requires no changes to the layout engine.
 */

import type { LayerSource } from '../types'

export interface SegmentationRequest {
  /** Source image as a File (upload) or an already-resolved URL. */
  image: File | string
  /** Optional text prompts for open-vocabulary segmentation (Grounded SAM style). */
  prompts?: string[]
  /** Caller signal so long-running server calls can be cancelled. */
  signal?: AbortSignal
}

export interface SegmentationLayer {
  id: string
  label: string
  /** Object URL / data URL / remote URL of the cut-out transparent PNG. */
  pngUrl: string
  /** Detector confidence in [0..1], if available. */
  score?: number
  /** Suggested bounding box in source-image pixel space, if available. */
  bbox?: { x: number; y: number; width: number; height: number }
}

export interface SegmentationResult {
  layers: SegmentationLayer[]
  /** Clean background plate (inpainted), if the pipeline produced one. */
  backgroundUrl?: string
  sourceWidth: number
  sourceHeight: number
}

export interface SegmentationService {
  /** Run subject separation on an image and return transparent layers. */
  segment(request: SegmentationRequest): Promise<SegmentationResult>
}

/**
 * Map a raw segmentation result onto stage-space `LayerSource`s.
 *
 * TODO: tune the placement heuristics once a real pipeline is wired up — for now
 * this just lays subjects out left→right across the column at a uniform width.
 */
export function toLayerSources(
  result: SegmentationResult,
  opts: { stageWidth: number; defaultWidth?: number } = { stageWidth: 1180 },
): LayerSource[] {
  const width = opts.defaultWidth ?? Math.round(opts.stageWidth * 0.3)
  const gap = (opts.stageWidth - width * result.layers.length) / (result.layers.length + 1)
  return result.layers.map((layer, i) => ({
    id: layer.id,
    label: layer.label,
    src: layer.pngUrl,
    x: Math.round(gap * (i + 1) + width * i),
    y: 360,
    width,
  }))
}

/**
 * Stub implementation. Wire a real backend here.
 *
 * TODO: POST the image (and optional prompts) to a segmentation endpoint, e.g.
 *   const form = new FormData()
 *   form.append('image', request.image)
 *   const res = await fetch('/api/segment', { method: 'POST', body: form, signal: request.signal })
 *   return (await res.json()) as SegmentationResult
 */
export const segmentationService: SegmentationService = {
  async segment(): Promise<SegmentationResult> {
    throw new Error(
      'segmentationService is not implemented in the MVP. ' +
        'The demo uses the bundled sample layers; wire a SAM/BiRefNet backend here to enable auto-segmentation.',
    )
  },
}
