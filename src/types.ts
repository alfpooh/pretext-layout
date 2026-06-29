/**
 * Shared types for the editorial layout generator.
 *
 * Coordinate spaces used throughout:
 *  - "stage space": pixels inside the fixed-size layout canvas (#stage). All
 *    rendering and obstacle placement happens here.
 *  - "normalized space": a layer's own [0..1] x/y fractions, independent of how
 *    big the layer is drawn on stage. Alpha analysis is stored normalized so it
 *    survives resizing of the layer.
 */

/** A transparent PNG element placed on the stage. */
export interface LayerSource {
  id: string
  /** Human-readable label shown in the debug overlay / export. */
  label: string
  /** URL of the transparent PNG (relative to the app base). */
  src: string
  /** Left edge in stage space, px. */
  x: number
  /** Top edge in stage space, px. */
  y: number
  /** Rendered width in stage space, px. Height derives from the image aspect ratio. */
  width: number
  /** Optional z-index override; layers default to stacking in array order. */
  z?: number
}

/**
 * Per-row horizontal extent of a layer's opaque pixels, in normalized space.
 * `rows[i]` describes the silhouette at vertical fraction i / (rows.length - 1).
 * A `null` row means the layer is fully transparent at that height.
 */
export interface AlphaProfile {
  /** Number of analysis rows (analysis resolution along Y). */
  rowCount: number
  /** For each row: [leftFraction, rightFraction] in [0..1], or null if empty. */
  rows: ([number, number] | null)[]
  /** Source intrinsic size, kept for diagnostics. */
  naturalWidth: number
  naturalHeight: number
}

/** A layer that has been measured: its source plus alpha profile and stage height. */
export interface AnalyzedLayer extends LayerSource {
  profile: AlphaProfile
  /** Rendered height in stage space, px (derived from aspect ratio). */
  height: number
}

/** Tunable layout parameters, all driven by the control-panel sliders. */
export interface LayoutConfig {
  fontSize: number
  lineHeight: number
  /** Safety padding (px) added around each silhouette before flowing text. */
  shapeMargin: number
  /** Alpha value (0..255) at/above which a pixel counts as "occupied". */
  alphaThreshold: number
  /** Width of the editorial content column in stage space, px. */
  layoutWidth: number
}

/** A closed horizontal interval [left, right] in stage space. */
export type Interval = [number, number]

/** One positioned line fragment produced by the flow engine. */
export interface PlacedFragment {
  text: string
  /** Left edge in stage space, px. */
  x: number
  /** Baseline-independent top edge in stage space, px. */
  y: number
  /** Width of the column slot this fragment was flowed into, px. */
  slotWidth: number
  /** Measured width of the text itself, px. */
  textWidth: number
}

/** A debug rectangle marking an occupied (obstacle) band on one text line. */
export interface ObstacleRect {
  x: number
  y: number
  width: number
  height: number
}

/** Full result of a layout pass. */
export interface LayoutResult {
  fragments: PlacedFragment[]
  obstacles: ObstacleRect[]
  /** True if the text overflowed the available vertical space. */
  overflowed: boolean
  /** Number of source characters that were laid out. */
  placedChars: number
}
