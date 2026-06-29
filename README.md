# Pretext · Editorial Layout Generator

실험적 editorial layout generator. 인물/소품처럼 **투명 PNG 레이어로 분리된 이미지**와 **긴 본문 텍스트**를 입력으로 받아, 각 PNG의 alpha channel을 Canvas로 분석하고, 텍스트가 이미지 실루엣을 피해 흐르도록 **정적(static) 레이아웃**을 생성합니다. 줄 단위 폭 계산은 [`@chenglou/pretext`](https://www.npmjs.com/package/@chenglou/pretext)의 manual line-layout API로 수행합니다.

> MVP는 번들된 샘플 투명 PNG 레이어 3개로 **로드 즉시** 완성된 레이아웃을 렌더링합니다. 별도의 업로드나 백엔드가 필요 없습니다.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

## 파이프라인

```
separated PNG  →  alpha scan  →  line regions  →  pretext measure  →  static fragments
```

1. **세그멘테이션 (분리된 PNG 입력)** — MVP에서는 `src/data/sampleLayers.ts`의 샘플 레이어 3개를 사용합니다. 자동 분리는 `src/services/segmentationService.ts`에 인터페이스만 정의되어 있고 구현은 TODO로 남겨두었습니다 (SAM 2 / Grounded SAM / BiRefNet 류 서버 파이프라인 연결 지점).
2. **Alpha 분석** (`src/layout/alpha.ts`) — 각 PNG를 작은 오프스크린 캔버스로 다운샘플해 alpha 채널을 읽고, 행마다 실루엣의 좌/우 끝을 **정규화(normalized) 좌표**로 추출합니다. raw alpha는 이미지별로 캐시되므로 `alphaThreshold` 슬라이더를 움직여도 비싼 readback 없이 행 스캔만 다시 돕니다.
3. **점유/여백 구간 계산** (`src/layout/obstacles.ts`) — 각 텍스트 줄의 y 범위(band)에 대해 레이어들이 차지하는 x 구간을 구하고, `shapeMargin`을 더한 뒤 병합합니다. 콘텐츠 단(column)에서 이를 빼면 텍스트가 들어갈 **자유 구간**이 남습니다.
4. **텍스트 흐름** (`src/layout/flow.ts`) — pretext의 `prepareWithSegments` → `layoutNextLineRange` → `materializeLineRange`를 사용해, 줄마다 자유 구간 너비를 `maxWidth`로 넘기며 본문을 흘립니다. DOM reflow 없이 측정하므로 한 번의 동기 패스로 정적 결과가 나옵니다.
5. **렌더링** (`src/components/Stage.tsx`) — 결과를 `absolute` 포지션 이미지 레이어 + 텍스트 조각으로 그립니다. 이 구조가 곧 export 결과와 동일합니다.

## 컨트롤 패널

- 슬라이더: `fontSize`, `lineHeight`, `shapeMargin`, `alphaThreshold`, `layoutWidth`
- 토글: **점유 영역 보기**(obstacle debug overlay), **레이어 라벨**, **CJK 단어 유지**(`word-break: keep-all`)
- 액션: **샘플 복원**, **HTML 내보내기**

레이아웃은 `(text, layers, config)`의 순수 함수라 입력이 바뀔 때마다 `useMemo`로 즉시 재계산됩니다 — 별도 "생성" 버튼이 필요 없습니다.

## Standalone HTML 내보내기

`src/export/standalone.ts`는 **이미 계산된** 레이아웃을 단일 `.html` 파일로 직렬화합니다. 레이아웃이 정적이므로 내보낸 파일은 JS도, 레이아웃 엔진도 필요 없이 결과만 그립니다. 이미지는 base64 data URL로 인라인되어 완전히 포터블하며, 웹폰트 링크만 외부를 가리킵니다.

## 프로젝트 구조

```
src/
  layout/
    alpha.ts        # PNG alpha → 정규화 실루엣 프로파일
    obstacles.ts    # band별 점유/자유 x-구간 기하 계산
    flow.ts         # pretext 기반 줄 단위 텍스트 흐름 엔진
  services/
    segmentationService.ts   # 자동 분리 인터페이스 (구현 TODO)
  components/
    Stage.tsx       # 정적 레이아웃 캔버스 (이미지 레이어 + 텍스트 조각 + 디버그)
    ControlPanel.tsx# 텍스트 입력 · 슬라이더 · 토글 · export
  hooks/
    useAnalyzedLayers.ts     # 이미지 로드 + alphaThreshold 변화 시 프로파일 재계산
  export/
    standalone.ts   # self-contained HTML export
  data/
    sampleLayers.ts # 샘플 레이어 3개 · 스테이지/단 좌표 · 샘플 본문
  types.ts          # 좌표계/도메인 타입 (stage space, normalized space)
```

## 실서비스로 확장

`segmentationService.ts`의 stub을 실제 백엔드(예: SAM 2 / Grounded SAM / BiRefNet)로 교체해 단일 업로드 이미지에서 주체별 cut-out PNG를 받으면, 동일한 alpha 분석 → 흐름 엔진이 그대로 동작합니다. 레이아웃 엔진은 `LayerSource[]`에만 의존하므로 다른 단계 변경이 필요 없습니다.
