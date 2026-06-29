/**
 * App — wires the layout pipeline together:
 *   sources → useAnalyzedLayers (alpha) → flowText (pretext) → Stage render,
 * with the ControlPanel driving config, text, layers and export.
 *
 * `sources` is the editable layer list: users can upload transparent PNGs (each
 * treated as a pre-separated subject), drag figures around on the stage, or
 * remove/reset them. The layout pass is a pure function of (text, layers,
 * config), so it is simply recomputed with useMemo whenever any input changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage } from './components/Stage'
import { ControlPanel } from './components/ControlPanel'
import { useAnalyzedLayers } from './hooks/useAnalyzedLayers'
import { flowText } from './layout/flow'
import { exportStandaloneHtml } from './export/standalone'
import type { LayerSource, LayoutConfig } from './types'
import {
  COLUMN,
  ORIGINAL_IMAGE,
  SAMPLE_LAYERS,
  SAMPLE_TEXT,
  SAMPLE_TITLE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './data/sampleLayers'

const DEFAULT_CONFIG: LayoutConfig = {
  fontSize: 20,
  lineHeight: 30,
  shapeMargin: 18,
  alphaThreshold: 24,
  layoutWidth: 1040,
}

export default function App() {
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_CONFIG)
  const [text, setText] = useState(SAMPLE_TEXT)
  const [sources, setSources] = useState<LayerSource[]>(SAMPLE_LAYERS)
  const [keepAll, setKeepAll] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [exporting, setExporting] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  // Track object URLs we created so we can revoke them and avoid leaks.
  const objectUrls = useRef<Set<string>>(new Set())

  const { layers, loading, error } = useAnalyzedLayers(sources, config.alphaThreshold)

  const result = useMemo(
    () => flowText({ text, layers, config, column: COLUMN, keepAll }),
    [text, layers, config, keepAll],
  )

  const onConfigChange = useCallback((next: Partial<LayoutConfig>) => {
    setConfig((prev) => ({ ...prev, ...next }))
  }, [])

  const onLayerMove = useCallback((id: string, x: number, y: number) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)))
  }, [])

  const onAddImages = useCallback((files: FileList) => {
    const stamp = Date.now()
    const added: LayerSource[] = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((file, i) => {
        const url = URL.createObjectURL(file)
        objectUrls.current.add(url)
        return {
          id: `upload-${stamp}-${i}`,
          label: file.name,
          // Stagger uploads so they don't stack exactly on top of each other.
          src: url,
          x: 120 + (i % 3) * 260,
          y: 360 + Math.floor(i / 3) * 80,
          width: 320,
        }
      })
    if (added.length > 0) setSources((prev) => [...prev, ...added])
  }, [])

  const onRemoveLayer = useCallback((id: string) => {
    setSources((prev) => {
      const target = prev.find((s) => s.id === id)
      if (target && objectUrls.current.has(target.src)) {
        URL.revokeObjectURL(target.src)
        objectUrls.current.delete(target.src)
      }
      return prev.filter((s) => s.id !== id)
    })
  }, [])

  const onResetLayers = useCallback(() => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url)
    objectUrls.current.clear()
    setSources(SAMPLE_LAYERS)
  }, [])

  // Revoke any outstanding object URLs on unmount.
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const onExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportStandaloneHtml({
        layers,
        fragments: result.fragments,
        title: SAMPLE_TITLE,
        config,
        column: COLUMN,
        stageWidth: STAGE_WIDTH,
        stageHeight: STAGE_HEIGHT,
      })
    } finally {
      setExporting(false)
    }
  }, [layers, result.fragments, config])

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="kicker">Pretext · static editorial layout</div>
          <h1>분리된 이미지 요소를 피해 흐르는 텍스트 조판</h1>
          <p className="lede">
            투명 PNG 인물/소품 레이어를 스테이지에 배치하고, 각 레이어의 알파 마스크를 줄 단위로
            분석해 본문이 외곽을 피해 흐르도록 배치하는 실험적 레이아웃 제너레이터입니다. 이미지를
            업로드하고, 스테이지에서 직접 드래그해 배치를 바꿀 수 있습니다. 조판은{' '}
            <code>@chenglou/pretext</code>의 manual line-layout API로 계산합니다.
          </p>
        </div>
        <div className="badges">
          <span className="badge">Alpha mask</span>
          <span className="badge">pretext layout</span>
          <span className="badge">Drag &amp; reflow</span>
        </div>
      </header>

      <div className="layout-shell">
        <div className="stage-viewport">
          <Stage
            ref={stageRef}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            layers={layers}
            result={result}
            config={config}
            title={SAMPLE_TITLE}
            showDebug={showDebug}
            showLabels={showLabels}
            onLayerMove={onLayerMove}
          />
        </div>

        <ControlPanel
          config={config}
          onConfigChange={onConfigChange}
          text={text}
          onTextChange={setText}
          keepAll={keepAll}
          onKeepAllChange={setKeepAll}
          showDebug={showDebug}
          onShowDebugChange={setShowDebug}
          showLabels={showLabels}
          onShowLabelsChange={setShowLabels}
          sources={sources}
          onAddImages={onAddImages}
          onRemoveLayer={onRemoveLayer}
          onResetLayers={onResetLayers}
          onResetSample={() => {
            setText(SAMPLE_TEXT)
            setConfig(DEFAULT_CONFIG)
          }}
          onExport={onExport}
          exporting={exporting}
          result={result}
          layerCount={layers.length}
          loading={loading}
          error={error}
          originalImage={ORIGINAL_IMAGE}
        />
      </div>
    </div>
  )
}
