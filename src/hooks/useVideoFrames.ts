/**
 * useVideoFrames — owns one playing <video> element per WebM layer and samples
 * its current frame on a fixed cadence (default 1 Hz).
 *
 * Each sample is drawn to a *fresh* canvas and pushed into `frames` state, which
 * drives a re-analysis + text re-flow downstream. We deliberately allocate a new
 * canvas per sample so the alpha cache (keyed by drawable identity) treats it as
 * new pixels; the previous frame canvas becomes unreferenced and is GC'd.
 *
 * The same <video> element is handed to VideoLayer for smooth ~60fps display
 * painting, so a layer decodes its clip only once.
 */

import { useEffect, useState } from 'react'
import type { LayerSource } from '../types'

export interface VideoFrame {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/** How often the silhouette is re-sampled from the moving video. */
const SAMPLE_INTERVAL_MS = 1000

export function useVideoFrames(sources: LayerSource[]): {
  videos: Record<string, HTMLVideoElement>
  frames: Record<string, VideoFrame>
} {
  const [videos, setVideos] = useState<Record<string, HTMLVideoElement>>({})
  const [frames, setFrames] = useState<Record<string, VideoFrame>>({})

  const videoSources = sources.filter((s) => s.kind === 'video')
  // Re-create elements only when the set of video URLs changes (not on drag).
  const srcKey = videoSources.map((s) => `${s.id}:${s.src}`).join('|')

  useEffect(() => {
    // Drop frames/videos for sources that no longer exist.
    const liveIds = new Set(videoSources.map((s) => s.id))
    setFrames((prev) => {
      const next: Record<string, VideoFrame> = {}
      for (const id of Object.keys(prev)) if (liveIds.has(id)) next[id] = prev[id]!
      return next
    })

    if (videoSources.length === 0) {
      setVideos({})
      return
    }

    const els: Record<string, HTMLVideoElement> = {}
    for (const s of videoSources) {
      const v = document.createElement('video')
      v.src = s.src
      v.muted = true
      v.loop = true
      v.autoplay = true
      v.playsInline = true
      v.crossOrigin = 'anonymous'
      // Keep the element in the DOM (hidden) so playback is reliable across
      // browsers; it is never shown — VideoLayer paints it onto a canvas.
      v.setAttribute('data-video-layer-id', s.id)
      v.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.appendChild(v)
      void v.play().catch(() => {
        /* autoplay may defer; sampling still works once data is ready */
      })
      els[s.id] = v
    }
    setVideos(els)

    /** Capture the current frame of every video into a fresh canvas. */
    const captureAll = () => {
      setFrames((prev) => {
        const next = { ...prev }
        let changed = false
        for (const s of videoSources) {
          const v = els[s.id]
          if (!v || !v.videoWidth || !v.videoHeight) continue
          const c = document.createElement('canvas')
          c.width = v.videoWidth
          c.height = v.videoHeight
          const ctx = c.getContext('2d', { willReadFrequently: true })
          if (!ctx) continue
          ctx.clearRect(0, 0, c.width, c.height)
          ctx.drawImage(v, 0, 0, c.width, c.height)
          next[s.id] = { canvas: c, width: c.width, height: c.height }
          changed = true
        }
        return changed ? next : prev
      })
    }

    // Grab the first frame as soon as each video has data, then sample at 1 Hz.
    const onData = () => captureAll()
    for (const v of Object.values(els)) {
      v.addEventListener('loadeddata', onData)
      v.addEventListener('seeked', onData)
    }
    const kick = window.setTimeout(captureAll, 200)
    const interval = window.setInterval(captureAll, SAMPLE_INTERVAL_MS)

    return () => {
      window.clearTimeout(kick)
      window.clearInterval(interval)
      for (const v of Object.values(els)) {
        v.removeEventListener('loadeddata', onData)
        v.removeEventListener('seeked', onData)
        try {
          v.pause()
          v.removeAttribute('src')
          v.load()
          v.remove()
        } catch {
          /* ignore teardown errors */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey])

  return { videos, frames }
}
