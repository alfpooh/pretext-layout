/**
 * ControlPanel — text input, image-layer management, layout sliders, toggles and
 * export action. Purely controlled: it renders state passed from App and reports
 * changes up.
 */

import { useRef } from 'react'
import type { LayerSource, LayoutConfig, LayoutResult } from '../types'

interface SliderDef {
  key: keyof LayoutConfig
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const SLIDERS: SliderDef[] = [
  { key: 'fontSize', label: '본문 크기 · fontSize', min: 12, max: 34, step: 1, unit: 'px' },
  { key: 'lineHeight', label: '줄 높이 · lineHeight', min: 18, max: 56, step: 1, unit: 'px' },
  { key: 'shapeMargin', label: '여백 · shapeMargin', min: 0, max: 60, step: 1, unit: 'px' },
  { key: 'alphaThreshold', label: '알파 임계값 · alphaThreshold', min: 0, max: 200, step: 1 },
  { key: 'layoutWidth', label: '단 너비 · layoutWidth', min: 480, max: 1080, step: 10, unit: 'px' },
]

interface ControlPanelProps {
  config: LayoutConfig
  onConfigChange: (next: Partial<LayoutConfig>) => void
  text: string
  onTextChange: (next: string) => void
  keepAll: boolean
  onKeepAllChange: (next: boolean) => void
  showDebug: boolean
  onShowDebugChange: (next: boolean) => void
  showLabels: boolean
  onShowLabelsChange: (next: boolean) => void
  sources: LayerSource[]
  onAddImages: (files: FileList) => void
  onRemoveLayer: (id: string) => void
  onResetLayers: () => void
  onResetSample: () => void
  onExport: () => void
  exporting: boolean
  result: LayoutResult
  layerCount: number
  loading: boolean
  error: string | null
  originalImage: string
}

export function ControlPanel(props: ControlPanelProps) {
  const {
    config,
    onConfigChange,
    text,
    onTextChange,
    keepAll,
    onKeepAllChange,
    showDebug,
    onShowDebugChange,
    showLabels,
    onShowLabelsChange,
    sources,
    onAddImages,
    onRemoveLayer,
    onResetLayers,
    onResetSample,
    onExport,
    exporting,
    result,
    layerCount,
    loading,
    error,
    originalImage,
  } = props

  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="panel">
      <h3>이미지 레이어</h3>
      <p>
        투명 PNG를 업로드하면 분리된 요소 레이어로 추가됩니다. 스테이지에서 직접 드래그해 배치를
        바꾸면 본문이 즉시 다시 흐릅니다. 자동 분리는 SAM 계열 백엔드 연결 지점만 마련해 두었습니다.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp,image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onAddImages(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
      <div className="controls">
        <button className="primary" onClick={() => fileInputRef.current?.click()}>
          이미지 업로드
        </button>
        <button className="secondary" onClick={onResetLayers}>
          샘플 레이어로
        </button>
      </div>

      <ul className="layer-list">
        {sources.map((s) => (
          <li key={s.id} className="layer-item">
            <img src={s.src} alt="" className="layer-thumb" />
            <span className="layer-name" title={s.label}>
              {s.label}
            </span>
            <span className="layer-pos">
              {Math.round(s.x)},{Math.round(s.y)}
            </span>
            <button
              className="layer-remove"
              aria-label={`${s.label} 제거`}
              onClick={() => onRemoveLayer(s.id)}
            >
              ×
            </button>
          </li>
        ))}
        {sources.length === 0 && <li className="layer-empty">레이어가 없습니다. 이미지를 업로드하세요.</li>}
      </ul>

      <h3 className="section-gap">입력 텍스트</h3>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck={false}
        aria-label="본문 텍스트"
      />

      <div className="sliders">
        {SLIDERS.map((s) => (
          <label key={s.key} className="slider">
            <span className="slider-head">
              <span>{s.label}</span>
              <span className="slider-value">
                {config[s.key]}
                {s.unit ?? ''}
              </span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={config[s.key]}
              onChange={(e) => onConfigChange({ [s.key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>

      <div className="toggles">
        <label>
          <input type="checkbox" checked={showDebug} onChange={(e) => onShowDebugChange(e.target.checked)} />
          점유 영역 보기
        </label>
        <label>
          <input type="checkbox" checked={showLabels} onChange={(e) => onShowLabelsChange(e.target.checked)} />
          레이어 라벨
        </label>
        <label>
          <input type="checkbox" checked={keepAll} onChange={(e) => onKeepAllChange(e.target.checked)} />
          CJK 단어 유지 (keep-all)
        </label>
      </div>

      <div className="controls">
        <button className="secondary" onClick={onResetSample}>
          샘플 텍스트 복원
        </button>
        <button className="primary" onClick={onExport} disabled={exporting || loading}>
          {exporting ? '내보내는 중…' : 'HTML 내보내기'}
        </button>
      </div>

      <div className="status">
        {loading && <span className="status-chip">레이어 분석 중…</span>}
        {error && <span className="status-chip error">오류: {error}</span>}
        {!loading && !error && (
          <>
            <span className="status-chip">레이어 {layerCount}</span>
            <span className="status-chip">조판 {result.placedChars}자</span>
            <span className="status-chip">조각 {result.fragments.length}</span>
            {result.overflowed && <span className="status-chip warn">본문이 지면을 넘쳤습니다</span>}
          </>
        )}
      </div>

      <div className="meta">
        <strong>처리 구조</strong>
        <code>separated PNG → alpha scan → line regions → pretext measure → static fragments</code>
      </div>

      <div className="original">
        <img src={originalImage} alt="original uploaded image" />
        <span>원본 이미지 (분리 전)</span>
      </div>
    </aside>
  )
}
