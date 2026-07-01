# Pretext · Editorial Layout Generator

실험적 editorial layout generator. 인물/소품처럼 **투명 PNG 레이어로 분리된 이미지**나 **투명 배경 WebM 동영상**과 **긴 본문 텍스트**를 입력으로 받아, 각 미디어의 alpha channel을 Canvas로 분석하고, 텍스트가 실루엣을 피해 흐르도록 **정적(static) 레이아웃**을 생성합니다. 줄 단위 폭 계산은 [`@chenglou/pretext`](https://www.npmjs.com/package/@chenglou/pretext)의 manual line-layout API로 수행합니다.

## WebM(투명 동영상) 지원

투명 배경 WebM(VP8/VP9 alpha)을 업로드하면:

- **실루엣 분석 (1Hz 추적)**: `useVideoFrames` 훅이 레이어마다 `<video>` 하나를 소유해 재생하고, **초당 1회** 현재 프레임을 Canvas로 캡처합니다. 캡처된 프레임의 alpha로 obstacle을 다시 계산하므로, 영상이 움직이면 텍스트(pretext) 레이아웃도 약 1초 간격으로 따라 흐릅니다. (첫 프레임은 `loadeddata` 이벤트로 즉시 캡처.)
- **렌더링**: 같은 `<video>`를 매 프레임 `<canvas>`에 `clearRect` + `drawImage`로 복사해, 알파를 보존한 채 움직이는 영상을 투명하게 합성합니다. (브라우저가 `<video>`의 알파를 검은 박스로 합성하는 문제를 피하기 위한 방식입니다.)
- **분리된 책임**: 표시용 canvas는 `requestVideoFrameCallback`/rAF로 ~60fps 부드럽게 그리고, 레이아웃 재계산은 1Hz로 제한해 본문 재flow 비용을 억제합니다.
- **Export**: standalone HTML은 정적 산출물이므로, 비디오 레이어는 그 실루엣 프레임을 투명 PNG로 구워 넣어 self-contained 상태를 유지합니다.

> MVP는 번들된 샘플 투명 PNG 레이어 3개로 **로드 즉시** 완성된 레이아웃을 렌더링합니다. 별도의 업로드나 백엔드가 필요 없습니다.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

## 두 개의 진입점

| 경로 | 내용 |
| --- | --- |
| `/` (`index.html`) | GA4/GTM 계측이 포함된 **정적 아티클** — `article.html`을 그대로 서빙합니다. |
| `/app.html` | 레이아웃을 생성·수정·export 하는 **React 저작 도구**. |

`article.html`은 저작 도구의 "HTML 내보내기" 결과에 추적 태그를 붙인 self-contained 파일이라, Vite의 HTML 파이프라인(parse5 파싱·HMR 주입)을 거치지 않고 [vite.config.ts](vite.config.ts)의 작은 플러그인이 **원문 그대로** `/`에 서빙하고 빌드 시 `dist/index.html`로 복사합니다. 저작 도구는 `app.html`을 진입점으로 빌드되어 `dist/app.html`이 됩니다. 새 아티클을 배포하려면 `/app.html`에서 export한 HTML로 `article.html`을 교체하세요.

## 파이프라인

```
separated PNG / WebM  →  alpha scan  →  line regions  →  pretext measure  →  static fragments
```

1. **미디어 입력** — MVP에서는 `src/data/sampleLayers.ts`의 기본 포트레이트 레이어 1개(`public/assets/portrait.png`)를 사용합니다. 컨트롤 패널에서 투명 PNG나 알파 채널 WebM을 업로드하면 레이어로 추가됩니다. 자동 분리는 `src/services/segmentationService.ts`에 인터페이스만 정의되어 있고 구현은 TODO로 남겨두었습니다 (SAM 2 / Grounded SAM / BiRefNet 류 서버 파이프라인 연결 지점).
2. **Alpha 분석** (`src/layout/alpha.ts`) — PNG는 HTMLImageElement로, WebM은 HTMLVideoElement(첫 프레임)로 로드해 작은 오프스크린 캔버스로 다운샘플한 후 alpha 채널을 읽습니다. 행마다 실루엣의 좌/우 끝을 **정규화(normalized) 좌표**로 추출합니다. raw alpha는 미디어별로 캐시되므로 `alphaThreshold` 슬라이더를 움직여도 비싼 readback 없이 행 스캔만 다시 돕니다.
3. **점유/여백 구간 계산** (`src/layout/obstacles.ts`) — 각 텍스트 줄의 y 범위(band)에 대해 레이어들이 차지하는 x 구간을 구하고, `shapeMargin`을 더한 뒤 병합합니다. 콘텐츠 단(column)에서 이를 빼면 텍스트가 들어갈 **자유 구간**이 남습니다.
4. **텍스트 흐름** (`src/layout/flow.ts`) — pretext의 `prepareWithSegments` → `layoutNextLineRange` → `materializeLineRange`를 사용해, 줄마다 자유 구간 너비를 `maxWidth`로 넘기며 본문을 흘립니다. DOM reflow 없이 측정하므로 한 번의 동기 패스로 정적 결과가 나옵니다.
5. **렌더링** (`src/components/Stage.tsx`) — 결과를 `absolute` 포지션 이미지 레이어 + 텍스트 조각으로 그립니다. 이 구조가 곧 export 결과와 동일합니다.

## 컨트롤 패널

### 이미지 · 비디오 레이어
- **미디어 업로드** — 투명 PNG 또는 알파 채널 WebM 파일을 추가합니다.
- **레이어 목록** — 각 레이어의 썸네일, 파일명, 현재 좌표(x,y), 제거 버튼을 표시합니다.
- **샘플 레이어로** — 기본 포트레이트 1개로 리셋합니다.

### 본문 텍스트 (Markdown)
- 입력 텍스트는 **마크다운**으로 해석됩니다: `# / ## / ###` 제목, `- / 1.` 목록, `>` 인용, `---` 구분선, `**굵게**` · `*기울임*` · `` `코드` `` 인라인 강조.
- 인라인 강조는 글자 크기는 그대로 두고 **굵기/기울임/모노스페이스**만 바꿔, 한 줄 안의 모든 run이 같은 베이스라인을 공유합니다.
- 파싱은 `src/layout/markdown.ts`(의존성 없는 미니 파서), 스타일별 조판은 pretext **rich-inline** API로 수행합니다.

### 색상
- **배경색 / 글자색** 컬러 피커로 스테이지 배경과 본문 색을 지정합니다. (export에도 반영)

### 레이아웃 제어
- **슬라이더** — `fontSize`, `lineHeight`, `shapeMargin`, `alphaThreshold`, `layoutWidth`
- **토글** — **점유 영역 보기**(obstacle debug overlay), **레이어 라벨**
- **액션** — **샘플로 복원**, **HTML 내보내기**

레이아웃은 `(text, layers, config)`의 순수 함수라 입력이 바뀔 때마다 `useMemo`로 즉시 재계산됩니다 — 별도 "생성" 버튼이 필요 없습니다.

### 스테이지 상호작용
- **드래그** — 스테이지의 이미지/비디오 레이어를 마우스로 끌어 이동합니다. 배치가 바뀌면 본문이 즉시 다시 흐릅니다.
- **비디오 재생** — WebM 레이어는 자동재생·무음·반복 설정으로 배치됩니다.

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
