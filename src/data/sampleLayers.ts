/**
 * Bundled demo content: one pre-separated transparent portrait layer plus the
 * sample editorial body (written in Markdown). These render a finished layout
 * the moment the app loads, with no upload or backend required.
 *
 * NOTE: `public/assets/portrait.png` currently holds a placeholder cut-out.
 * Drop the real transparent portrait there (same filename) to update the demo.
 */

import type { LayerSource } from '../types'

/** Fixed stage dimensions (stage space, px). */
export const STAGE_WIDTH = 1180
export const STAGE_HEIGHT = 1520

/** The editorial content column inside the stage. */
export const COLUMN = {
  left: 70,
  top: 110,
  bottom: 1440,
}

/** Default page colors (overridable from the control panel). */
export interface Theme {
  background: string
  text: string
}

export const DEFAULT_THEME: Theme = {
  background: '#f4efe6',
  text: '#15120f',
}

export const SAMPLE_LAYERS: LayerSource[] = [
  {
    id: 'portrait',
    label: 'portrait.png',
    kind: 'image',
    src: `${import.meta.env.BASE_URL}assets/portrait.png`,
    x: 560,
    y: 300,
    width: 600,
  },
]

/** Sample body text — Markdown is supported (headings, lists, quotes, emphasis). */
export const SAMPLE_TEXT = `# 요소 사이로 흐르는 텍스트

이미지와 텍스트가 한 화면에서 만날 때 가장 중요한 것은 **서로를 가리지 않는 관계**입니다. 이 레이아웃은 분리된 투명 PNG·WebM 레이어의 *알파 마스크* 외곽을 줄 단위로 분석해, 본문이 그 사이로 흐르도록 배치합니다.

## 작동 방식

- 투명 미디어의 \`alpha channel\`을 Canvas로 읽습니다
- 각 줄에서 이미지가 점유한 구간을 빼고 남은 폭을 계산합니다
- \`@chenglou/pretext\`의 rich-inline API로 줄마다 다른 maxWidth를 적용합니다

> 사각형 float가 아니라 실제 실루엣을 기준으로, 빈 공간에서는 길게 펼쳐지고 인물 근처에서는 자연스럽게 짧아집니다.

---

### 활용

기사형 스토리텔링, 인터랙티브 매거진, 브랜드 캠페인, 교육용 비주얼 에세이에 응용하기 좋습니다. 이미지 요소가 많아질수록 본문은 단순한 박스 레이아웃이 아니라, 시각 요소와 상호작용하는 정적인 조판 시스템처럼 작동합니다.

본문은 일반 텍스트로 써도 되고, 위처럼 **마크다운**으로 제목·목록·인용·강조를 섞어도 됩니다. 배경색과 글자색은 오른쪽 패널에서 바꿀 수 있습니다.`
