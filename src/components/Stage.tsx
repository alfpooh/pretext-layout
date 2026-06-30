/**
 * Stage — the fixed-size layout canvas. Renders, in stacking order:
 *   background + grid → title block → obstacle debug overlay → image layers →
 *   flowed text fragments → layer labels.
 *
 * Everything is absolutely positioned in stage space; this is the live preview
 * of the same static structure the standalone export produces. Image layers are
 * draggable — pointer deltas map 1:1 to stage pixels since the stage is rendered
 * at natural size — and moving a layer re-flows the text around its new spot.
 */

import { forwardRef, useRef } from 'react'
import type { AnalyzedLayer, LayoutConfig, LayoutResult } from '../types'
import type { Theme } from '../data/sampleLayers'
import { COLUMN } from '../data/sampleLayers'
import { VideoLayer } from './VideoLayer'

interface StageProps {
  width: number
  height: number
  layers: AnalyzedLayer[]
  result: LayoutResult
  config: LayoutConfig
  theme: Theme
  showDebug: boolean
  showLabels: boolean
  videos: Record<string, HTMLVideoElement>
  onLayerMove: (id: string, x: number, y: number) => void
}

interface DragState {
  id: string
  pointerX: number
  pointerY: number
  originX: number
  originY: number
  /** Latest committed position, coalesced via rAF. */
  pending: { x: number; y: number } | null
  frame: number | null
}

export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage(
  { width, height, layers, result, config, theme, showDebug, showLabels, videos, onLayerMove },
  ref,
) {
  const drag = useRef<DragState | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLElement>, layer: AnalyzedLayer) {
    e.preventDefault()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // Ignore if the pointer can't be captured (e.g. synthetic events in tests).
    }
    drag.current = {
      id: layer.id,
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: layer.x,
      originY: layer.y,
      pending: null,
      frame: null,
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.id !== layerIdOf(e)) return
    d.pending = {
      x: Math.round(d.originX + (e.clientX - d.pointerX)),
      y: Math.round(d.originY + (e.clientY - d.pointerY)),
    }
    // Coalesce rapid pointer events into one re-flow per animation frame.
    if (d.frame === null) {
      d.frame = requestAnimationFrame(() => {
        const cur = drag.current
        if (cur && cur.pending) onLayerMove(cur.id, cur.pending.x, cur.pending.y)
        if (cur) cur.frame = null
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    if (d.frame !== null) cancelAnimationFrame(d.frame)
    if (d.pending) onLayerMove(d.id, d.pending.x, d.pending.y)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore release errors for uncaptured/synthetic pointers.
    }
    drag.current = null
  }

  return (
    <section
      className="stage"
      ref={ref}
      style={{ width, height, background: theme.background }}
      aria-label="Editorial layout stage"
    >
      <div className="stage-grid" style={{ left: COLUMN.left, top: COLUMN.top, width: config.layoutWidth }} />

      {showDebug &&
        result.obstacles.map((o, i) => (
          <div
            key={i}
            className="obstacle-rect"
            style={{ left: o.x, top: o.y, width: o.width, height: o.height }}
          />
        ))}

      {result.rules.map((r, i) => (
        <div
          key={`rule-${i}`}
          className="rule-line"
          style={{ left: r.x, top: r.y, width: r.width, background: theme.text, opacity: 0.28 }}
        />
      ))}

      {layers.map((layer) =>
        layer.kind === 'video' ? (
          <VideoLayer
            key={layer.id}
            layer={layer}
            video={videos[layer.id]}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        ) : (
          <img
            key={layer.id}
            className="layer"
            data-layer-id={layer.id}
            src={layer.src}
            alt={layer.label}
            draggable={false}
            onPointerDown={(e) => handlePointerDown(e, layer)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ left: layer.x, top: layer.y, width: layer.width, zIndex: layer.z ?? 3 }}
          />
        ),
      )}

      {result.fragments.map((f, i) => (
        <span
          key={i}
          className="frag"
          style={{
            left: f.x,
            top: f.y,
            fontSize: f.style.fontSize,
            fontWeight: f.style.weight,
            fontStyle: f.style.italic ? 'italic' : 'normal',
            fontFamily: f.style.mono ? 'ui-monospace, "SFMono-Regular", Menlo, monospace' : undefined,
            lineHeight: 1,
            color: theme.text,
            opacity: f.style.muted ? 0.62 : 1,
          }}
        >
          {f.text}
        </span>
      ))}

      {showLabels &&
        layers.map((layer) => (
          <span
            key={`label-${layer.id}`}
            className="layer-label"
            style={{ left: layer.x + 12, top: layer.y - 26 }}
          >
            {layer.label}
          </span>
        ))}

      <div className="stage-footer" style={{ left: COLUMN.left }}>
        Generated layout · drag any figure to reposition · text reflows around alpha silhouettes
      </div>
    </section>
  )
})

/** Read the layer id off the element currently receiving a pointer event. */
function layerIdOf(e: React.PointerEvent<HTMLElement>): string {
  return e.currentTarget.dataset.layerId ?? ''
}
