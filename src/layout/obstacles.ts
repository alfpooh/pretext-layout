/**
 * Obstacle geometry: turn analyzed layers into per-line occupied/free x-intervals.
 *
 * For a given horizontal text band [yTop, yBottom] in stage space we ask each
 * layer which x-range its silhouette occupies, expand it by `shapeMargin`, merge
 * overlaps, and subtract the result from the content column to get the free
 * intervals the flow engine may write into.
 */

import type { AnalyzedLayer, Interval } from '../types'

/** Map a stage-space y to a fractional row index within a layer, or -1 if outside. */
function rowIndexAt(layer: AnalyzedLayer, stageY: number): number {
  if (stageY < layer.y || stageY > layer.y + layer.height) return -1
  const frac = (stageY - layer.y) / layer.height
  return frac * (layer.profile.rowCount - 1)
}

/**
 * Occupied x-intervals (stage space) for a single text band, across all layers.
 * Each interval already includes `shapeMargin` padding on both sides.
 */
export function occupiedIntervals(
  layers: AnalyzedLayer[],
  yTop: number,
  yBottom: number,
  shapeMargin: number,
): Interval[] {
  const out: Interval[] = []

  for (const layer of layers) {
    // Skip layers the band does not vertically intersect.
    if (yBottom < layer.y || yTop > layer.y + layer.height) continue

    const r0 = Math.max(0, Math.floor(rowIndexAt(layer, Math.max(yTop, layer.y))))
    const r1 = Math.min(
      layer.profile.rowCount - 1,
      Math.ceil(rowIndexAt(layer, Math.min(yBottom, layer.y + layer.height))),
    )
    if (r1 < r0) continue

    let leftFrac = Infinity
    let rightFrac = -Infinity
    for (let r = r0; r <= r1; r++) {
      const row = layer.profile.rows[r]
      if (!row) continue
      if (row[0] < leftFrac) leftFrac = row[0]
      if (row[1] > rightFrac) rightFrac = row[1]
    }
    if (leftFrac === Infinity) continue

    const left = layer.x + leftFrac * layer.width - shapeMargin
    const right = layer.x + rightFrac * layer.width + shapeMargin
    if (right > left) out.push([left, right])
  }

  return mergeIntervals(out)
}

/** Merge overlapping/touching intervals. Input need not be sorted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals.slice()
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0])
  const merged: Interval[] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = merged[merged.length - 1]!
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1])
    else merged.push([cur[0], cur[1]])
  }
  return merged
}

/**
 * Free intervals within [colLeft, colRight] after removing `occupied`.
 * Intervals narrower than `minWidth` are dropped (avoids 1–2 char slivers).
 */
export function freeIntervals(
  occupied: Interval[],
  colLeft: number,
  colRight: number,
  minWidth: number,
): Interval[] {
  const free: Interval[] = []
  let cursor = colLeft
  for (const [l, r] of occupied) {
    const left = Math.max(colLeft, l)
    const right = Math.min(colRight, r)
    if (right <= cursor) continue // fully left of / inside what we've passed
    if (left - cursor >= minWidth) free.push([cursor, left])
    cursor = Math.max(cursor, right)
    if (cursor >= colRight) break
  }
  if (colRight - cursor >= minWidth) free.push([cursor, colRight])
  return free
}
