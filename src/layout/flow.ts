/**
 * Text flow engine.
 *
 * Drives @chenglou/pretext's manual line-layout API to flow body text around
 * alpha-masked silhouettes. The strategy:
 *
 *   1. Split the source text into paragraphs (blank-line separated). Each
 *      paragraph starts on a fresh line and is measured independently, which
 *      keeps paragraph breaks clean instead of leaking onto a wrapped line.
 *   2. Walk the content column top→bottom one line-height at a time. For each
 *      line, compute the free x-intervals left by the obstacles and ask pretext
 *      to lay out the next run of text into each interval, left to right. This
 *      produces the around-the-silhouette wrap: text on the left of a figure,
 *      continuing on its right, then the next line.
 *
 * pretext measures with the browser's font engine but never touches the DOM, so
 * the whole pass is synchronous and reflow-free — exactly what we need to drive
 * a static, absolutely-positioned result.
 */

import {
  prepareWithSegments,
  layoutNextLineRange,
  materializeLineRange,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

import type { AnalyzedLayer, LayoutConfig, LayoutResult, ObstacleRect, PlacedFragment } from '../types'
import { occupiedIntervals, freeIntervals } from './obstacles'

export interface ColumnGeometry {
  left: number
  top: number
  bottom: number
}

export interface FlowInput {
  text: string
  layers: AnalyzedLayer[]
  config: LayoutConfig
  column: ColumnGeometry
  /** Whether to keep CJK runs unbroken (CSS word-break: keep-all). */
  keepAll?: boolean
}

const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

function cursorsEqual(a: LayoutCursor, b: LayoutCursor): boolean {
  return a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex
}

/** Build the CSS font shorthand pretext measures against. */
export function fontString(config: LayoutConfig): string {
  return `500 ${config.fontSize}px "Noto Serif KR", serif`
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
}

export function flowText(input: FlowInput): LayoutResult {
  const { layers, config, column } = input
  const colRight = column.left + config.layoutWidth
  const lineHeight = config.lineHeight
  // Drop intervals too narrow to hold a few glyphs; scales with font size.
  const minSlot = Math.max(24, config.fontSize * 2.4)
  // Vertical extent a text band occupies, used for obstacle sampling.
  const bandPad = Math.max(2, lineHeight * 0.12)

  const paragraphs = splitParagraphs(input.text)
  const opts = { whiteSpace: 'normal', wordBreak: input.keepAll ? 'keep-all' : 'normal' } as const

  const fragments: PlacedFragment[] = []
  const obstacles: ObstacleRect[] = []
  let placedChars = 0
  let overflowed = false

  let y = column.top
  const maxLines = 2000 // hard safety ceiling
  let lineGuard = 0

  for (let p = 0; p < paragraphs.length; p++) {
    const prepared: PreparedTextWithSegments = prepareWithSegments(paragraphs[p]!, fontString(config), opts)
    let cursor: LayoutCursor = START
    let exhausted = false

    while (!exhausted && y + lineHeight <= column.bottom && lineGuard < maxLines) {
      lineGuard++
      const occupied = occupiedIntervals(layers, y - bandPad, y + lineHeight + bandPad, config.shapeMargin)
      for (const [l, r] of occupied) {
        obstacles.push({ x: l, y, width: r - l, height: lineHeight })
      }

      const free = freeIntervals(occupied, column.left, colRight, minSlot)
      if (free.length === 0) {
        y += lineHeight // band fully blocked; let text resume below
        continue
      }

      let placedOnLine = false
      for (const [x0, x1] of free) {
        const maxW = x1 - x0
        const range = layoutNextLineRange(prepared, cursor, maxW)
        if (range === null) {
          exhausted = true
          break
        }
        if (cursorsEqual(range.end, cursor)) {
          // No forward progress possible at this width; abandon the slot.
          continue
        }
        const line = materializeLineRange(prepared, range)
        cursor = range.end
        const text = line.text.trim()
        if (text.length > 0) {
          fragments.push({ text, x: Math.round(x0), y: Math.round(y), slotWidth: maxW, textWidth: line.width })
          placedChars += text.length
          placedOnLine = true
        }
      }

      y += lineHeight
      // If nothing fit on a non-blocked line we still advanced y, so no spin.
      void placedOnLine
    }

    if (lineGuard >= maxLines || y + lineHeight > column.bottom) {
      // Ran out of vertical room; flag overflow if text remains.
      if (!exhausted) overflowed = true
      if (y + lineHeight > column.bottom) break
    }

    // Paragraph gap.
    y += Math.round(lineHeight * 0.55)
  }

  return { fragments, obstacles, overflowed, placedChars }
}
