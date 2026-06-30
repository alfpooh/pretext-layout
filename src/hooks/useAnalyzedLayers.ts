/**
 * useAnalyzedLayers — derive each layer's alpha silhouette profile + stage
 * geometry from the current source list.
 *
 * PNG layers load as <img> once (decode cached). WebM layers get their drawable
 * from `videoFrames` (see useVideoFrames), which refreshes ~1 Hz as the clip
 * plays — so the analysis, and therefore the text flow, tracks the moving
 * silhouette. Both kinds run through the same analyzeAlpha path.
 *
 * Threshold changes and position drags do not re-decode media; they only re-run
 * the cheap row scan (cached per drawable), keeping interaction smooth.
 */

import { useEffect, useMemo, useState } from 'react'
import type { AnalyzedLayer, LayerSource } from '../types'
import { analyzeAlpha, loadImage } from '../layout/alpha'
import type { VideoFrame } from './useVideoFrames'

interface LoadedImage {
  img: HTMLImageElement
  width: number
  height: number
}

export function useAnalyzedLayers(
  sources: LayerSource[],
  alphaThreshold: number,
  videoFrames: Record<string, VideoFrame>,
): { layers: AnalyzedLayer[]; loading: boolean; error: string | null } {
  const [images, setImages] = useState<Record<string, LoadedImage>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const imageSources = sources.filter((s) => s.kind !== 'video')
  // Only reload when the actual image URLs change, not on reposition/resize.
  const srcKey = imageSources.map((s) => `${s.id}:${s.src}`).join('|')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.allSettled(
      imageSources.map(async (s): Promise<[string, LoadedImage]> => {
        const img = await loadImage(s.src)
        return [s.id, { img, width: img.naturalWidth || 1, height: img.naturalHeight || 1 }]
      }),
    ).then((results) => {
      if (cancelled) return
      const ok: [string, LoadedImage][] = []
      const failures: string[] = []
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(r.value)
        else failures.push(`${imageSources[i]?.label ?? '?'}: ${String(r.reason?.message ?? r.reason)}`)
      })
      setImages(Object.fromEntries(ok))
      setError(failures.length ? failures.join('; ') : null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey])

  const layers = useMemo<AnalyzedLayer[]>(() => {
    return sources.flatMap((source) => {
      if (source.kind === 'video') {
        const frame = videoFrames[source.id]
        if (!frame) return [] // first frame not captured yet
        const aspect = (frame.height || 1) / (frame.width || 1)
        return [
          {
            ...source,
            height: source.width * aspect,
            profile: analyzeAlpha(frame.canvas, frame.width, frame.height, alphaThreshold),
          },
        ]
      }
      const loaded = images[source.id]
      if (!loaded) return [] // not decoded yet
      const aspect = (loaded.height || 1) / (loaded.width || 1)
      return [
        {
          ...source,
          height: source.width * aspect,
          profile: analyzeAlpha(loaded.img, loaded.width, loaded.height, alphaThreshold),
        },
      ]
    })
  }, [sources, images, videoFrames, alphaThreshold])

  return { layers, loading, error }
}
