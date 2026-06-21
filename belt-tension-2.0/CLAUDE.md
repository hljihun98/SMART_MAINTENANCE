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
- `#fs3`, `#fs5` 는 DOM에 없음 (JS 참조는 null-safe 처리됨)

### 데이터 흐름
```
호기 추가 → robots[] 에 push → saveState()
측정 시작 → initRobotIfNeeded() → analyzeLoop()
측정 결과 → finalizeCollection() → updateResult()
저장 버튼 → saveCurrentSlot() → saveState()
```

### localStorage 키: `beltTension_v1`
저장 항목: `version, flowEnabled, robots, simpleHistory, filterStrength, adaptiveTrigger`
저장 안 되는 항목: `selectedDriveIds, selectedLiftingIds, inUnit.value, activeRobot, activeSlotIdx`

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
localStorage 저장 시 Date 객체를 `{__type:'Date', iso:...}` 형식으로 변환 (dateReplacer/dateReviver)

### iOS PDF 저장
`doc.save()` 대신 `window.open(blob URL)` 사용 (iOS Safari 다운로드 호환)

### 측정 루프 구조
```
analyzeLoop() (rAF 루프)
  ├─ adaptiveTrigger=true: RMS > 임계값 → 충격 감지 → collecting 구간 → finalizeCollection()
  └─ adaptiveTrigger=false: 신호 있으면 즉시 updateResult() (연속 업데이트)
```

### 프리셋 (BELT_PRESETS)
- `drive`: 구동모듈 벨트 170N ±20%, 2.8g/m
- `lifting`: 리프팅 벨트 500N ±10%, 4.2g/m
