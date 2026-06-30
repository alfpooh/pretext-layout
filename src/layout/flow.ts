/**
 * Text flow engine (Markdown-aware).
 *
 * Parses the body Markdown into blocks (headings, paragraphs, lists, quotes,
 * rules), then flows each block around the alpha-masked silhouettes using
 * pretext's rich-inline API. rich-inline lets a single line mix styled runs
 * (bold / italic / code) measured with the browser font engine but without DOM
 * reflow, and — crucially — supports a different maxWidth per line, which is how
 * we wrap text around the figures.
 *
 * Strategy per block:
 *   1. Build one RichInlineItem per styled run (plus a bullet/number marker for
 *      list items). Inline emphasis only changes weight/style/family, never the
 *      font size, so every run on a line shares a baseline.
 *   2. Walk the column top→bottom by the block's line-height. For each line,
 *      compute the free x-intervals left by the obstacles and lay the next run
 *      of text into each interval left→right.
 */

import {
  prepareRichInline,
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  type RichInlineItem,
  type RichInlineCursor,
  type PreparedRichInline,
} from '@chenglou/pretext/rich-inline'

import type {
  AnalyzedLayer,
  FragmentStyle,
  LayoutConfig,
  LayoutResult,
  ObstacleRect,
  PlacedFragment,
  RuleLine,
} from '../types'
import { occupiedIntervals, freeIntervals } from './obstacles'
import { parseMarkdown, type BlockType, type MarkdownBlock } from './markdown'

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
}

const SERIF = '"Noto Serif KR", serif'
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace'

/** Per-block typographic parameters derived from the base config. */
function blockMetrics(type: BlockType, base: number) {
  switch (type) {
    case 'h1':
      return { size: Math.round(base * 2.0), weight: 800, italic: false, muted: false, indent: 0, gapBefore: base * 0.9, gapAfter: base * 0.2 }
    case 'h2':
      return { size: Math.round(base * 1.5), weight: 800, italic: false, muted: false, indent: 0, gapBefore: base * 0.7, gapAfter: base * 0.15 }
    case 'h3':
      return { size: Math.round(base * 1.2), weight: 700, italic: false, muted: false, indent: 0, gapBefore: base * 0.5, gapAfter: base * 0.1 }
    case 'li':
      return { size: base, weight: 500, italic: false, muted: false, indent: Math.round(base * 1.4), gapBefore: base * 0.1, gapAfter: base * 0.1 }
    case 'quote':
      return { size: base, weight: 500, italic: true, muted: true, indent: Math.round(base * 1.2), gapBefore: base * 0.3, gapAfter: base * 0.3 }
    default:
      return { size: base, weight: 500, italic: false, muted: false, indent: 0, gapBefore: base * 0.0, gapAfter: base * 0.55 }
  }
}

function fontString(size: number, weight: number, italic: boolean, mono: boolean): string {
  const family = mono ? MONO : SERIF
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`
}

function cursorsEqual(a: RichInlineCursor | undefined, b: RichInlineCursor | undefined): boolean {
  if (!a || !b) return false
  return a.itemIndex === b.itemIndex && a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex
}

/** Build pretext rich-inline items + a parallel style table for one block. */
function buildItems(block: MarkdownBlock, base: number): { items: RichInlineItem[]; styles: FragmentStyle[] } {
  const m = blockMetrics(block.type, base)
  const items: RichInlineItem[] = []
  const styles: FragmentStyle[] = []

  if (block.type === 'li' && block.marker) {
    items.push({ text: `${block.marker}  `, font: fontString(m.size, m.weight, false, false) })
    styles.push({ fontSize: m.size, weight: m.weight, italic: false, mono: false, muted: m.muted })
  }

  for (const run of block.runs) {
    const weight = run.bold ? Math.max(700, m.weight) : m.weight
    const italic = run.italic || m.italic
    const mono = run.code
    items.push({ text: run.text, font: fontString(m.size, weight, italic, mono) })
    styles.push({ fontSize: m.size, weight, italic, mono, muted: m.muted })
  }

  return { items, styles }
}

export function flowText(input: FlowInput): LayoutResult {
  const { layers, config, column } = input
  const base = config.fontSize
  const colRight = column.left + config.layoutWidth
  const ratio = config.lineHeight / base
  const minSlot = Math.max(24, base * 2.4)

  const blocks = parseMarkdown(input.text)

  const fragments: PlacedFragment[] = []
  const obstacles: ObstacleRect[] = []
  const rules: RuleLine[] = []
  let placedChars = 0
  let overflowed = false

  let y = column.top
  const maxLines = 4000
  let lineGuard = 0

  outer: for (const block of blocks) {
    const m = blockMetrics(block.type, base)
    const lineHeight = Math.max(base * 1.1, Math.round(m.size * ratio))
    const bandPad = Math.max(2, lineHeight * 0.12)
    const blockLeft = column.left + m.indent

    y += Math.round(m.gapBefore)

    if (block.type === 'hr') {
      if (y + lineHeight > column.bottom) {
        overflowed = true
        break
      }
      rules.push({ x: column.left, y: Math.round(y + lineHeight / 2), width: config.layoutWidth })
      y += lineHeight + Math.round(m.gapAfter)
      continue
    }

    const { items, styles } = buildItems(block, base)
    if (items.length === 0) continue
    const prepared: PreparedRichInline = prepareRichInline(items)
    let cursor: RichInlineCursor | undefined = undefined
    let started = false
    let exhausted = false

    while (!exhausted && y + lineHeight <= column.bottom && lineGuard < maxLines) {
      lineGuard++
      const occupied = occupiedIntervals(layers, y - bandPad, y + lineHeight + bandPad, config.shapeMargin)
      for (const [l, r] of occupied) obstacles.push({ x: l, y, width: r - l, height: lineHeight })

      const free = freeIntervals(occupied, blockLeft, colRight, minSlot)
      if (free.length === 0) {
        y += lineHeight
        continue
      }

      for (const [x0, x1] of free) {
        const maxW = x1 - x0
        const range = layoutNextRichInlineLineRange(prepared, maxW, started ? cursor : undefined)
        if (range === null) {
          exhausted = true
          break
        }
        started = true
        if (cursorsEqual(range.end, cursor)) continue // no forward progress at this width
        const line = materializeRichInlineLineRange(prepared, range)

        let xAccum = x0
        for (const frag of line.fragments) {
          const fragX = xAccum + frag.gapBefore
          const text = frag.text
          if (text.trim().length > 0) {
            fragments.push({
              text,
              x: Math.round(fragX),
              y: Math.round(y),
              lineHeight,
              style: styles[frag.itemIndex] ?? { fontSize: m.size, weight: m.weight, italic: m.italic, mono: false, muted: m.muted },
            })
            placedChars += text.length
          }
          xAccum = fragX + frag.occupiedWidth
        }
        cursor = range.end
      }

      y += lineHeight
    }

    if (!exhausted && y + lineHeight > column.bottom) {
      overflowed = true
      break outer
    }

    y += Math.round(m.gapAfter)
  }

  return { fragments, obstacles, rules, overflowed, placedChars }
}
