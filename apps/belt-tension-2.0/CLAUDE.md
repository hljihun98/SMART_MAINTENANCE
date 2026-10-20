# 음파식 벨트 텐션 측정기 v2.0 — 개발 메모

이 파일은 AI가 다음 세션에서도 동일한 방향으로 수정을 이어갈 수 있도록 작성한 설계 기록입니다.

---

## 핵심 설계 원칙

- **현장 작업자 UX 우선**: 현장에서 장갑 낀 손으로 빠르게 쓸 수 있어야 함. 버튼 최소 44px, 중요 정보는 한눈에.
- **모바일 전용**: 실제 사용 기기는 스마트폰. 데스크탑 UI는 부차적.
- **높이 최소화**: 화면이 작으므로 카드/행의 세로 높이를 지속적으로 줄이는 방향으로 수정.
- **색상 최소화**: 기능적으로 필요한 색(OK 초록, NG 빨강)만 사용. 장식용 색상은 지양.

---

## 앱 구조 개요

### 파일
- `index.html` — 마크업 (Step 1~5 + waveform + assists)
- `style.css` — 스타일 (라이트 테마, 모바일 레이아웃)
- `app.js` — 전체 로직 (Web Audio API, FFT, 세션 관리, PDF 보고서)

### Step 구조 (setStep(n) 으로 전환)
- **Step 1 `#fs1`**: 호기 설정 (벨트 선택, 호기 번호 입력, 대기열)
- **Step 2 `#fs2`**: 실시간 분석 + 보정 후 장력 (두 섹션 통합)
- **Step 4 `#fs4`**: 보고서·세션 진행 (항상 표시)
- **Step 5 `#fs5`**: 측정 기록 표 + 초기화 — 단순 모드 기록 표도 여기 그리므로 단순 모드에서도 숨기지 말 것
- `#fs3` 는 DOM에 없음 (JS 참조는 null-safe 처리됨)
- 모바일(≤480px)은 활성 스텝만 표시하되 막다른 화면 방지 규칙이 있음(style.css): Step 4면 `#fs1` 표시(다음 호기 추가),
  Step 2가 아니면 `#fs5` 표시(단순 모드 `body[data-flow="off"]`는 항상), Step 2에서는 `#fs1` 머리글 한 줄('현재 호기 취소')만
- 모든 호기 완료(다음 대기 호기 없음) 시 `stopMeasure()`로 마이크 반납 → 다음 호기 추가 후 '측정 시작'이 바로 동작

### 데이터 흐름
```
호기 추가 → robots[] 에 push → saveState()
측정 시작 → initRobotIfNeeded() → analyzeLoop()
측정 결과 → finalizeCollection() → updateResult()
저장 버튼 → saveCurrentSlot() → saveState()
```

### localStorage 키: `beltTension_v1` (2.0 전용)
저장 항목: `version, flowEnabled, robots, simpleHistory, filterStrength, adaptiveTrigger, beltGeom`
저장 안 되는 항목: `selectedDriveIds, selectedLiftingIds, inUnit.value, activeRobot, activeSlotIdx`
- 1.0(`apps/belt-tension/`)은 스키마가 달라 **별도 키 `beltTension_classic_v1`** 사용 — 두 앱이 서로의 키를 쓰지 않도록 유지
- `loadState()`는 구조를 검증(`normRobot/normSlot/normValue/normSimple`)하고 알 수 없는 벨트 ID·비숫자 측정값은 버림
- `saveState()` 실패(용량 초과·차단) 시 토스트 1회 안내 — 조용히 삼키지 말 것

### 벨트 형상 (`beltGeom`)
- 새 호기 슬롯의 mass/width/span/cf는 **입력칸이 아니라 `beltGeom[타입]`** 에서 가져온다 (`buildActiveSlots`)
  - 과거 버그: 입력칸에 직전 슬롯(예: 리프팅) 형상이 남아 있어 구동 슬롯에 리프팅 형상이 복사됨 → 장력 7배 오차
- `saveCurrentSlot()`에서 해당 타입 슬롯을 저장할 때 실제 사용한 형상으로 `beltGeom[타입]` 갱신
- 복원 시 값이 없는(미측정) 슬롯은 해당 타입 형상으로 재설정

### 호기 번호
- 숫자 1~6자리만 허용(`UNIT_RE`), innerHTML 출력 시 반드시 `escapeHtml()` — 복원 데이터에 옛 값이 있을 수 있음

---

## UI 설계 결정 사항

### Step 1 — 호기 설정
- **호기 번호 입력행**: `PARKIE : [input] 호기 [추가 버튼]` 한 줄 (`.unit-input-row` flex)
- **대기열 카드 형식**: `${unit}호기` (예: `12호기`) — "PARKIE : 12 호기" 형식 X
- **대기열 카드 위치**: 측정 시작 스위치 행(sessionSwitchRow) 아래

### Step 2 — 실시간 분석 (통합 카드)
- **보정 후 장력 + 실시간 분석**을 하나의 `#fs2` 카드로 통합
  - 상단: 장력 수치(42px) + JUDGE 버튼 나란히, kgf, 게이지
  - `merged-sep` 구분선 후: 주파수 통계, CONFIDENCE ring + 신호강도 bar, 상태
- **호기/ID/횟수 표시 없음**: Step 4와 중복이므로 Step 2에서 제거
- **파란 활성 테두리 없음**: `#fs2.s-active`는 border-color/background 중립 (style.css에 오버라이드)

### 신호 표시
- **CONFIDENCE ring + 신호강도 bar**: `conf-signal-row` 에 flex 한 줄 배치
- ring 크기: 44px, 숫자 폰트: 16px (font-family: var(--mono), font-weight: 800)

### 적응형 충격 감지 (adaptiveTrigger)
- **기본값: OFF** (false)
- OFF 상태: 파형 가이드 숨김, 충격 감지 없이 주파수 직접 → 장력 실시간 업데이트 (V1 방식)
- ON 상태: 주변 RMS 기반 동적 임계값으로 충격 감지 후 1.5s 분석 (V2 방식)
- `applyAdaptiveTriggerUI()` 함수가 waveformSection 표시/숨김 처리

### 파형 타이밍 가이드 (guideActive)
- **적응형 충격 감지 ON일 때만 동작** — 기본값은 "적응형 ON이면 가이드 ON, OFF면 가이드 OFF"
  - 과거 버그: 연속 모드(기본)에서도 `guideActive=true`가 남아 숨겨진 가이드가 3초마다 880 Hz 비프 + 1.5초 수집 + "튕김이 감지되지 않았습니다" 토스트를 반복
- ON/OFF와 스위치·칩 동기화는 반드시 `setGuide(on)` 으로 (직접 `guideActive=` 대입 금지)
- `applyAdaptiveTriggerUI()` 는 **페이지 로드 시 항상** 호출 (저장 데이터 유무와 무관) → `setGuide(adaptiveTrigger)`
- `analyzeLoop()` / `drawWaveform()` 의 가이드 분기 조건은 `guideActive && adaptiveTrigger`
- `startMeasure()` 에서 `guideStartTs` 를 측정 시작 시각으로 리셋 — 안 하면 페이지 로드 후 경과된 위상 때문에 시작 직후 피크가 즉시 발화할 수 있음
- `stopMeasure()` 는 `setGuide(adaptiveTrigger)` 로 기본값 복귀
- `index.html` 의 `#swGuide`(`aria-pressed="true"`) 마크업 초기값은 적응형 ON 기준 — 로드 시 JS가 실제 상태로 맞춤

### 기본주파수 판정 (배음 오검출 방지)
- 대역 최대 피크 → `analyzePeak()` → `resolveFundamental()` 이 f/2, f/3(분석 범위 10~5000 Hz 안)에 유의미한 국소 피크가 있으면 기본파로 환산 (`subN`)
- 임계값(`SUBHARM_*`, `PEAK_MIN_PROM_DB`, `EDGE_BINS`)은 파일 상단 주석에 근거 기록 — 바꾸면 합성 신호로 정상 벨트 오환산 0건·느슨한 벨트 NG 판정을 다시 확인할 것
  - `SUBHARM_MIN_TOL_BINS`를 2 이상으로 넓히면 8192 FFT에서 60 Hz 험이 f/3 창에 걸려 정상 리프팅 벨트를 오판함(검증됨)
- **정상(定常) 톤 배제** (2026-10-20): 60/120 Hz 험·모터음이 f/2·f/3 자리에 있으면 정수배 검사를 통과해 기본파로 오인했음
  (360 Hz 과장력 벨트 + 120 Hz 험 → 120 Hz, 장력 1/9·반대 방향 NG)
  - `trackAmbient()`가 bin별 주변 레벨(`ambientDb`)을 추적: 조용한 프레임(충격 수집 중 아님 + 대역 피크 없음 또는 대역 피크가 이미 아는 정상 톤)에서만,
    오를 때 4 s·내릴 때 0.15 s 시정수. 시작 직후 `FFT 창 채움 + 0.2 s`는 무조건 빠르게(0.1 s) 학습(첫 프레임 무음·대역 안 험 대비)
  - `isStationaryTone()`: 주변 레벨에 그 bin(±1) 톤 피크가 있고 지금 레벨이 그보다 6 dB 미만으로만 큼 → 정상 톤
  - 적용 위치 3곳: ① `resolveFundamental` 기본파 후보 제외 ② `detectFundamentalBandpass` 대역 피크가 정상 톤이면 프레임 버림
    ③ 연속 경로에서 대역 피크가 정상 톤이거나 주변 레벨이 아직 안정 전(워밍업 후 조용한 프레임 1회 전)이면 검출 없음
  - 벨트가 울리는 프레임은 추적을 멈추므로 느슨한 벨트 환산·정상 벨트 측정값은 예전과 동일(합성 신호, 3가지 FFT 설정에서 프레임 단위 일치)
  - 한계: 측정 시작 ≈0.5 s 안(창 채움 중)에 튕긴 첫 타격은 연속 모드에서 한 번 무시됨, 시작 전부터 울리던 소리는 정상 톤으로 학습됨,
    느슨한 벨트의 f0가 험과 정확히 같은 주파수면 환산 못 함(예전엔 우연히 맞던 경우)
- 잠금 대역 경계 피크(`edge`) → 신뢰도 ≤30, 저장 차단, "고정 범위를 넓히거나 끄고 재측정" 안내
- 예상 주파수는 목표 장력·형상으로만 계산(`calcExpectedFreq`). 예전 k/Span(k=1000) 대체 경로·k 입력칸은 제거 — 10 Hz대 값이라 고정 대역을 엉뚱하게 좁혔음
- 측정 대상 고정 OFF면 충격 수집 구간도 분석 범위 전체 탐색 (숨은 '예상 ±30%' 대역 없음)
- 1.0(`apps/belt-tension/index.html` 인라인)에도 같은 함수·임계값이 복제되어 있음 — 한쪽을 바꾸면 다른 쪽도 맞출 것

### 저장 품질 (연속 측정 모드)
- 결과는 `stableFreq()`(이상치 제거 평균)로 계산 — EMA `dispFreq`는 화면 표시용
- 저장 조건: 5프레임 버퍼 가득 + 불안정 아님 + 신뢰도 ≥ `LIVE_SAVE_MIN_CONF`(50) + 경계 아님
- 저장 후 `startRearm()` → 신호가 `REARM_QUIET_MS`(300 ms) 이상 사라져야 다음 결과 갱신·저장 (한 번 튕겨 여러 회차 채우기 방지)

### 오디오 수명주기
- `startMeasure()` 는 `starting` 플래그 + `startToken` 으로 중복 시작 방지, 권한 대기 중 `stopMeasure()` 가 호출되면 얻은 스트림을 즉시 반납
- `stopMeasure()` 는 `resetCollection()` 으로 수집 상태 초기화 — 안 하면 재시작 첫 프레임에 이전 벨트 스냅샷으로 결과가 나옴
- `stopMeasure(true)` 는 오류 상태(권한 거부 등) 표시를 유지
- 백그라운드 전환(`visibilitychange`) 시 측정 중지 + 복귀 시 토스트 (숨은 탭에서는 rAF가 멈춰 분석 불가, 마이크만 열려 있었음)

### 측정대상 고정 (targetLock)
- **기본값: ON** (`let targetLock={enabled:true, widthPct:30}`)

### 주파수 스펙트럼 토글
- `#spectrumPanel` — JS 토글로 제어
- CSS에 `!important` 숨김 규칙 없어야 함 (과거에 있었다가 제거됨)

---

## 보고서 (PDF) 색상 팔레트

의도적으로 최소화한 색상 체계:

| 요소 | 색상 |
|---|---|
| 호기 배너 배경 | `(30,30,30)` 다크 그레이 |
| 컬럼 헤더 배경 | `(70,70,70)` 미디엄 그레이 |
| 교대 행 배경 | `(247,247,247)` 연회색 (파란 틴트 X) |
| 셀 테두리 | `(205,205,205)` 단일 회색 |
| OK 판정 | 연초록 배경 `(220,245,225)` + 초록 텍스트 `[20,110,50]` |
| NG 판정 | 연분홍 배경 `(255,228,228)` + 빨강 텍스트 `[160,20,20]` |
| 평균 행 | **행 전체 회색 배경**, 판정 셀만 OK/NG 색상 (전체 핑크 X) |

---

## 주요 버그 수정 이력

### 2026-10-20 감사 후속 (요약 — 상세는 README 변경 이력)
- 슬롯을 순서와 다르게 완료하면 TypeError/완료 슬롯 덮어쓰기 → 다음 슬롯 = `findIndex(s=>!s.completedAt)`, -1이면 호기 완료
- '현재 호기 취소'가 확인창 문구와 달리 호기·측정값을 삭제 → 미완료(일시중지)로 남김, 측정값 없으면 대기열로 복귀
- 정상 톤(험) 배제, 모바일 4단계 막다른 화면, 단순 모드 기록 표 숨김, k/Span 대체 경로 제거
- CSV·PDF 내보내기 코드는 변경 없음(같은 저장 데이터로 이전/이후 바이트·호출 순서 동일 확인)

### 2026-10-18 감사 결과 반영 (요약 — 상세는 README 변경 이력)
- Date 직렬화: replacer가 동작하지 않아 ISO 문자열로 저장되고 복원도 안 됨 → 새로고침 후 CSV/PDF 실패. `toDate()`로 알려진 날짜 필드 복원 + `fmtTime()` 방어
- 슬롯 형상 혼입(`beltGeom` 도입), 배음 오검출·경계 피크, stale `collecting`, 숨은 가이드, 시작 연타 누수, XSS, CSV 이스케이프, iOS PDF 팝업 차단, jsPDF 로컬화
- 제거한 데드코드: `setBeltCount`, `showNextRobotPrompt/startNextRobot/promptNextRobot`, `updateProgressChip`, `renderSessions`, `saveResult`(별칭), `held`, `measureStartTs`, `currentStep`, `dateReplacer/dateReviver`

### 세션 재개 버그 (initRobotIfNeeded)
- **증상**: 측정 중 메인으로 나갔다 오면 "호기를 추가하거나 호기 번호를 입력해주세요" 오류
- **원인**: `startedAt` 있지만 `completedAt` 없는 호기(중단된 세션)를 재개하는 로직 없음
- **수정**: `initRobotIfNeeded()` 에 2순위 체크 추가:
  ```js
  const inProgress = robots.find(r=>r.startedAt && !r.completedAt);
  if(inProgress){ activeRobot=inProgress; ... }
  ```

### 페이지 복원 시 데이터가 보이지 않는 버그
- **증상**: 메인에 나갔다 오면 측정 데이터가 사라진 것처럼 보임
- **원인**: `window.addEventListener('load')` 에서 `renderRobotProgress()`, `renderRobotQueuePreview()` 미호출
- **수정**: load 핸들러에 두 함수 추가

### saveCurrentSlot 데이터 유실 버그
- **증상**: 슬롯/호기 완료 시 completedAt, average, avgJudge 가 저장 안 됨
- **원인**: `saveState()` 가 slot 완료 플래그 설정 전에 호출됨
- **수정**: 각 분기(완료/미완료) 내부로 `saveState()` 이동

### 파형 가이드 섹션 위치
- `waveformSection` 은 `#fs2` 밖의 별도 `<section class="panel">` 으로 독립
- adaptive trigger OFF 시 `waveSection.style.display='none'` 으로 숨김

---

## 현장 UX 체크리스트 (수정 시 확인)

- [ ] 벨트 ID 버튼 (`.cnt-btn`) 패딩: `8px 14px` 이상 (터치 영역 44px)
- [ ] 주파수 수치: `var(--mono)`, 최소 20px 이상
- [ ] 장력 수치: `#fs2` 내 42px (`.tension-compact-readout #resTensionN`)
- [ ] CONFIDENCE 숫자: 16px (`.conf-center span`)
- [ ] 모바일에서 토스트가 하단 플로팅 바와 겹치지 않는지 (`@media max-width:480px` 의 `#toast` bottom 값)
- [ ] `body[data-step="2"] .gauge{display:none}` 규칙이 style.css 에 없어야 함 (gauge 는 #fs2 안에 있음)

---

## 기술 메모

### 날짜 직렬화
`JSON.stringify`는 replacer보다 `Date.toJSON()`을 먼저 호출하므로 Date는 **ISO 문자열**로 저장된다.
복원 시 `normRobot/normSlot/normValue`가 `createdAt·startedAt·completedAt·time` 을 `toDate()`로 되돌린다
(`toDate`는 Date·ISO 문자열·숫자·구형 `{__type:'Date',iso}` 모두 허용). 새 날짜 필드를 추가하면 norm 함수에도 추가할 것.

### iOS PDF 저장
클릭 직후(첫 `await` 전) `window.open('', '_blank')`로 빈 창을 먼저 열고, 생성이 끝나면 그 창에 blob URL을 넣는다
(생성 후에 `window.open`하면 사용자 제스처 만료로 팝업 차단). 창이 막히면 `doc.save()`로 대체. iPadOS(Mac UA + 터치)도 iOS로 판정.

### jsPDF
CDN이 아니라 저장소의 `../../assets/vendor/jspdf-2.5.1.umd.min.js` 사용. `downloadPDF()` 시작 시 `window.jspdf` 확인 후 없으면 안내.

### CSV
`toCsv()/csvCell()` 사용 — UTF-8 BOM, 따옴표 이스케이프, `= + - @ 탭 CR` 시작 문자열은 `'` 접두(숫자·음수는 그대로). 다운로드는 `smDownload()`.

### 측정 루프 구조
```
analyzeLoop() (rAF 루프)
  ├─ collecting: detectFundamentalBandpass() 스냅샷 → collectEndTs 경과 시 finalizeCollection()
  ├─ adaptiveTrigger=true: (가이드 ON이면 사인파 피크) 또는 RMS > 임계값 → 충격 감지 → collecting 시작
  └─ adaptiveTrigger=false: 유효 피크 → analyzePeak() → pushPeak() → stableFreq()로 updateResult(source:'live')
                            (rearmPending 동안은 결과 갱신 보류)
```

### 프리셋 (BELT_PRESETS)
- `drive`: 구동모듈 벨트 170N ±20%, 2.8 g/(m·mm), 폭 20 mm, 스팬 88 mm
- `lifting`: 리프팅 벨트 500N ±10%, 4.2 g/(m·mm), 폭 35 mm, 스팬 147 mm
- Mass는 **폭 1 mm당 단위 질량** g/(m·mm) — 공식이 Mass×Width를 곱하므로 벨트 전체 질량(g/m)을 넣으면 장력이 폭 배수만큼 과대
