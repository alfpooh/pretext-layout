/**
 * Standalone HTML export.
 *
 * Serializes the *computed* layout — absolutely-positioned image layers and text
 * fragments — into a single self-contained .html file. Because the layout is
 * already static (pretext ran at export time), the exported file needs no
 * JavaScript and no layout engine: it just paints the result. Images are inlined
 * as data URLs so the file is portable; only the web-font link points outward.
 */

import type { AnalyzedLayer, LayoutConfig, PlacedFragment } from '../types'

export interface ExportTitle {
  eyebrow: string
  heading: string
  standfirst: string
}

export interface ExportParams {
  layers: AnalyzedLayer[]
  fragments: PlacedFragment[]
  title: ExportTitle
  config: LayoutConfig
  column: { left: number; top: number; bottom: number }
  stageWidth: number
  stageHeight: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Fetch a same-origin asset and return it as a base64 data URL. */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Build the standalone HTML string. `imageData` maps layer id → data URL. */
export function buildStandaloneHtml(params: ExportParams, imageData: Record<string, string>): string {
  const { layers, fragments, title, config, column, stageWidth, stageHeight } = params

  const layerEls = layers
    .map((l) => {
      const src = imageData[l.id] ?? l.src
      return `      <img class="layer" alt="${escapeHtml(l.label)}" src="${src}"
        style="left:${l.x}px;top:${l.y}px;width:${l.width}px" />`
    })
    .join('\n')

  const fragmentEls = fragments
    .map(
      (f) =>
        `      <span class="frag" style="left:${f.x}px;top:${f.y}px">${escapeHtml(f.text)}</span>`,
    )
    .join('\n')

  const headingHtml = escapeHtml(title.heading).replace(/\n/g, '<br/>')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Editorial Layout · Static Export</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;900&family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #dbd6ce; display: flex; justify-content: center; padding: 32px; }
  .stage {
    position: relative;
    width: ${stageWidth}px;
    height: ${stageHeight}px;
    overflow: hidden;
    background: radial-gradient(circle at 28% 8%, rgba(255,255,255,.96), rgba(255,255,255,0) 31%),
                linear-gradient(135deg,#fffaf0 0%,#f0e7da 48%,#ebe0d0 100%);
    border: 1px solid rgba(50,40,30,.14);
    box-shadow: 0 18px 52px rgba(24,19,14,.18);
  }
  .layer { position: absolute; height: auto; filter: drop-shadow(0 26px 28px rgba(20,18,15,.23)); user-select: none; }
  .title { position: absolute; left: ${column.left}px; top: 54px; width: ${config.layoutWidth}px; }
  .title .eyebrow { font-family: "Noto Sans KR", sans-serif; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; font-weight: 900; color: #dc3d32; }
  .title h2 { font-family: "Noto Serif KR", serif; font-size: 66px; line-height: .96; letter-spacing: -.07em; margin: 12px 0 10px; color: #15120f; }
  .title p { font-family: "Noto Sans KR", sans-serif; font-size: 14px; line-height: 1.65; color: #5c554d; max-width: 520px; margin: 0; }
  .frag {
    position: absolute;
    white-space: pre;
    color: rgba(18,16,14,.92);
    font-family: "Noto Serif KR", serif;
    font-size: ${config.fontSize}px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -.01em;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
  <section class="stage">
    <div class="title">
      <div class="eyebrow">${escapeHtml(title.eyebrow)}</div>
      <h2>${headingHtml}</h2>
      <p>${escapeHtml(title.standfirst)}</p>
    </div>
${layerEls}
${fragmentEls}
  </section>
</body>
</html>
`
}

/** Resolve image data URLs, build the HTML, and trigger a browser download. */
export async function exportStandaloneHtml(params: ExportParams): Promise<void> {
  const imageData: Record<string, string> = {}
  await Promise.all(
    params.layers.map(async (l) => {
      try {
        imageData[l.id] = await fetchAsDataUrl(l.src)
      } catch {
        // Fall back to the original URL reference if inlining fails.
        imageData[l.id] = l.src
      }
    }),
  )

  const html = buildStandaloneHtml(params, imageData)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'editorial-layout.html'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
