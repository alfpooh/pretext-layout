/**
 * useAnalyzedLayers — load each layer's PNG once, then derive its alpha
 * silhouette profile and stage geometry from the *current* source list.
 *
 * Images are decoded only when the set of source URLs changes (add/remove/
 * upload). Position changes (dragging x/y) and threshold changes do not reload
 * images — they only re-run the cheap, cached row scan — so dragging stays
 * smooth.
 */

import { useEffect, useMemo, useState } from 'react'
import type { AnalyzedLayer, LayerSource } from '../types'
import { analyzeAlpha, loadImage } from '../layout/alpha'

export function useAnalyzedLayers(
  sources: LayerSource[],
  alphaThreshold: number,
): { layers: AnalyzedLayer[]; loading: boolean; error: string | null } {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Only reload when the actual image URLs change, not on reposition/resize.
  const srcKey = sources.map((s) => `${s.id}:${s.src}`).join('|')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(
      sources.map(async (s) => [s.id, await loadImage(s.src)] as const),
    )
      .then((entries) => {
        if (cancelled) return
        setImages(Object.fromEntries(entries))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey])

  const layers = useMemo<AnalyzedLayer[]>(() => {
    return sources.flatMap((source) => {
      const img = images[source.id]
      if (!img) return [] // not decoded yet (e.g. just uploaded)
      const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1)
      return [
        {
          ...source,
          height: source.width * aspect,
          profile: analyzeAlpha(img, alphaThreshold),
        },
      ]
    })
  }, [sources, images, alphaThreshold])

  return { layers, loading, error }
}
