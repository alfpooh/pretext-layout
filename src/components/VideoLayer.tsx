/**
 * VideoLayer — renders a transparent WebM layer as a live <canvas>.
 *
 * The <video> element is owned by useVideoFrames (so it decodes once and is also
 * sampled for silhouette analysis); this component only paints it. We copy each
 * decoded frame onto a <canvas> with clearRect + drawImage, which preserves the
 * video's alpha channel — transparent regions stay transparent and the page
 * shows through, while the clip keeps playing. The canvas's intrinsic size is
 * the video's native resolution and CSS width scales it to the stage width, so
 * it behaves like an <img> for layout and dragging.
 */

import { useEffect, useRef } from 'react'
import type { AnalyzedLayer } from '../types'

interface VideoLayerProps {
  layer: AnalyzedLayer
  video: HTMLVideoElement | undefined
  onPointerDown: (e: React.PointerEvent<HTMLElement>, layer: AnalyzedLayer) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

export function VideoLayer({ layer, video, onPointerDown, onPointerMove, onPointerUp }: VideoLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !video) return

    let active = true
    let rafId = 0
    let vfcId = 0
    const rvfc = (
      video as unknown as { requestVideoFrameCallback?: (cb: () => void) => number }
    ).requestVideoFrameCallback?.bind(video)
    const cancelRvfc = (
      video as unknown as { cancelVideoFrameCallback?: (id: number) => void }
    ).cancelVideoFrameCallback?.bind(video)

    const paint = () => {
      if (!active) return
      const c = canvasRef.current
      if (c && video.videoWidth) {
        if (c.width !== video.videoWidth || c.height !== video.videoHeight) {
          c.width = video.videoWidth
          c.height = video.videoHeight
        }
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height)
          ctx.drawImage(video, 0, 0, c.width, c.height)
        }
      }
      schedule()
    }

    const schedule = () => {
      if (!active) return
      if (rvfc) vfcId = rvfc(paint)
      else rafId = requestAnimationFrame(paint)
    }

    // Event-driven first paint, so the layer shows even if rAF/rVFC are throttled
    // (e.g. a backgrounded tab); the loop then drives motion when foregrounded.
    const onFrame = () => paint()
    video.addEventListener('loadeddata', onFrame)
    video.addEventListener('seeked', onFrame)
    paint()
    schedule()

    return () => {
      active = false
      if (rafId) cancelAnimationFrame(rafId)
      if (vfcId && cancelRvfc) cancelRvfc(vfcId)
      video.removeEventListener('loadeddata', onFrame)
      video.removeEventListener('seeked', onFrame)
    }
  }, [video])

  return (
    <canvas
      ref={canvasRef}
      className="layer"
      data-layer-id={layer.id}
      onPointerDown={(e) => onPointerDown(e, layer)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ left: layer.x, top: layer.y, width: layer.width, zIndex: layer.z ?? 3 }}
    />
  )
}
