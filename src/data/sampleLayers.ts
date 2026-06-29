/**
 * Bundled demo content: three pre-separated transparent PNG layers plus the
 * sample editorial body text. These let the app render a finished layout the
 * moment it loads, with no upload or backend required.
 */

import type { LayerSource } from '../types'

/** Fixed stage dimensions (stage space, px). */
export const STAGE_WIDTH = 1180
export const STAGE_HEIGHT = 1520

/** The editorial content column inside the stage. */
export const COLUMN = {
  left: 70,
  top: 300,
  bottom: 1440,
}

/** Default header copy rendered above the flowing body. */
export const SAMPLE_TITLE = {
  eyebrow: 'Object-aware editorial layout',
  heading: '요소 사이로\n텍스트가 흐르는 지면',
  standfirst:
    '사각형 float가 아니라 실제 알파 실루엣을 기준으로, 줄마다 남는 폭을 계산해 본문을 흘려보냅니다.',
}

export const SAMPLE_LAYERS: LayerSource[] = [
  {
    id: 'person-left',
    label: 'person_01.png',
    src: `${import.meta.env.BASE_URL}assets/person_left.png`,
    x: 16,
    y: 690,
    width: 372,
  },
  {
    id: 'person-center',
    label: 'person_02.png',
    src: `${import.meta.env.BASE_URL}assets/person_center.png`,
    x: 452,
    y: 300,
    width: 318,
  },
  {
    id: 'person-right',
    label: 'person_03.png',
    src: `${import.meta.env.BASE_URL}assets/person_right.png`,
    x: 792,
    y: 632,
    width: 392,
  },
]

export const ORIGINAL_IMAGE = `${import.meta.env.BASE_URL}assets/original.jpg`

export const SAMPLE_TEXT = `이미지와 텍스트가 한 화면에서 만날 때, 가장 중요한 것은 서로를 가리지 않는 관계를 만드는 것입니다. 이 레이아웃은 입력된 사진에서 인물 요소를 분리한 뒤, 각각을 독립적인 투명 PNG 레이어로 배치하고, 텍스트는 각 요소의 알파 마스크 외곽을 피해 흐르도록 계산합니다.

Pretext는 DOM의 reflow 없이 텍스트 줄을 계산하는 엔진으로 쓰고, 이미지 외곽은 Canvas에서 alpha mask를 읽어 줄별 점유 영역으로 변환합니다. 따라서 텍스트는 단순한 사각형을 피하는 것이 아니라 실제 인물의 실루엣 근처에서 자연스럽게 짧아지고, 빈 공간에서는 다시 길게 펼쳐집니다.

운영 환경에서는 Grounded SAM, SAM 2, BiRefNet 같은 세그멘테이션 모델을 서버에서 실행해 인물, 제품, 소품, 배경을 자동으로 분리합니다. 이 데모에서는 업로드된 예시 이미지를 세 개의 인물 레이어로 나누고, 각 레이어를 듬성듬성 재배치한 뒤 본문이 그 사이를 지나가도록 구성했습니다.

이 구조는 기사형 스토리텔링, 인터랙티브 매거진, 브랜드 캠페인, 교육용 비주얼 에세이, 제품 소개 페이지에 응용하기 좋습니다. 이미지 요소가 많아질수록 본문은 단순한 박스 레이아웃이 아니라 시각 요소와 상호작용하는 정적인 조판 시스템처럼 작동합니다.

세그멘테이션, 알파 분석, 줄 단위 폭 계산, 정적 배치라는 네 단계는 각각 독립적으로 교체할 수 있습니다. 자동 분리 단계만 실제 모델로 바꾸면, 동일한 조판 엔진이 임의의 사진과 긴 글에 대해서도 같은 방식으로 동작합니다.`
