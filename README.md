# SMART MAINTENANCE Platform

로봇 엔지니어링(측정·계산·점검 보고)용 경량 웹 애플리케이션 모음입니다. 설계자와 현장 작업자가 함께 씁니다. 별도의 설치나 빌드 없이 브라우저에서 바로 실행됩니다.

## 앱 목록

| 앱 | 경로 | 설명 | 상태 |
|---|---|---|---|
| 센서 보고서 | `apps/sensor-report/` | PARKIE 로봇 라이다·카메라 센서 점검 및 PDF 보고서 생성 | 사용 가능 |
| 벨트 장력계 | `apps/belt-tension/` | 마이크 음파 분석으로 컨베이어 벨트 장력(N) 측정 | 사용 가능 |
| ROBOSTOCK | `apps/robostock/` | 로봇 부품 재고·BOM·공수산정·작업인원 일정 통합 관리 | 테스트 중 |
| 벨트 장력계 2.0 | `apps/belt-tension-2.0/` | 음파 FFT 분석으로 벨트 장력(N) 측정 · 노이즈 저감 · CSV/PDF 보고서 | 사용 가능 |
| Torque Tak! | `apps/torque-tak/` | 볼트 권장 체결토크 계산 · 체결부 성립 검토(VDI 2230) | 사용 가능 |

## 기술 스택

- 순수 HTML / CSS / JavaScript (빌드 도구 없음)
- Web Audio API — 마이크 입력 및 FFT 주파수 분석
- jsPDF 2.5.1 — 클라이언트 측 PDF 생성 (`assets/vendor/`에 포함)
- SheetJS 0.20.3 — Excel 가져오기·내보내기 (`assets/vendor/`에 포함)
- localStorage — 앱 상태·설정 영속성
- IndexedDB — 첨부 사진 저장 (센서 보고서, ROBOSTOCK)

## 공유 리소스

| 파일 | 설명 |
|---|---|
| `index.html` | 앱 목록 포털 (APPS 배열 하나만 편집하면 카드·카운트·푸터 자동 갱신) + 데이터 관리 |
| `logo.png` | HL Robotics 공식 로고 (모든 앱이 `../../logo.png`로 참조) |
| `assets/favicon/` | 파비콘 — HL 그룹 아이콘(hlmando.com과 같은 파일). 새 앱을 추가하면 `<title>` 아래에 같은 `<link rel="icon">` 묶음을 넣는다 |
| `assets/vendor/` | 외부 라이브러리 사본 — CDN이 막히거나 끊겨도 동작하도록 저장소에 포함. 버전을 올릴 때는 파일명의 버전도 함께 바꾼다 |
| `assets/js/utils.js`, `assets/css/common.css` | 공통 유틸·스타일 (현재 벨트 장력계 2.0이 사용) |

## 저장 데이터

모든 앱이 같은 출처(origin)라 localStorage 한도(약 5 MB)를 나눠 씁니다. 그래서 큰 데이터(사진)는 IndexedDB에 따로 저장합니다.
새 앱이 데이터를 저장하면 포털 `index.html`의 `APP_KEYS`에 키를 등록해야 **데이터 관리**에서 용량 확인·초기화가 됩니다.

| 앱 | localStorage 키 | IndexedDB |
|---|---|---|
| 센서 보고서 | `parkie_sensor_v3` (손상 시 백업 `parkie_sensor_v3_corrupt_backup`) | `parkie_sensor_photos` |
| 벨트 장력계 | `beltTension_classic_v1` | — |
| 벨트 장력계 2.0 | `beltTension_v1` | — |
| ROBOSTOCK | `robostock_state_v1` (손상 시 백업 `robostock_state_v1_corrupt_backup`) | `robostock_images` |
| Torque Tak! | `torque-tak/v2` | — |

## 앱 추가 방법

1. `apps/<new-app>/index.html` 파일을 생성합니다.
2. 루트 `index.html`의 `APPS` 배열에 항목 하나를 추가합니다.
3. 카드, 카운트("앱 N개"), 푸터("N apps")가 자동으로 갱신됩니다.

## 버전 관리

각 버전은 번호 태그(`v주.부.수`)와 날짜 태그(`vYY.MM.DD`, 배포일) 두 이름을 함께 가집니다.

| 번호 태그 | 날짜 태그 | 내용 |
|---|---|---|
| `v2.0.6` | `v26.10.20.4` | 앱 순서 변경 · 벨트 장력계 1.0 이전 버전 표시 · Torque Tak! 불필요한 저장 수정 |
| `v2.0.5` | `v26.10.20.3` | 포털 제목·칩 문구 기기별 표시 · Torque Tak! 코드 설명 주석 |
| `v2.0.4` | `v26.10.20.2` | 전체 코드 점검 1·2순위 결함 수정 · 모바일 알림 위치 수정 |
| `v2.0.3` | `v26.10.20.1` | 포털 머리글 '로봇 엔지니어링 도구'로 변경 |
| `v2.0.2` | `v26.10.20` | 포털 디자인 개선(앱 카드 색 구분·첫 화면 문구·시계 제거) · 앱 정보 주석 정리 |
| `v2.0.1` | `v26.10.19.1` | ROBOSTOCK 주소 변경(`apps/robostock/`) · 파비콘 · 로고 클릭 시 포털 이동 |
| `v2.0.0` | `v26.10.19` | 대규모 서비스 업데이트 · Torque Tak! 추가 · 전체 점검 결과 반영 |
| `v1.0.0` | `v26.08.06` | 메이저 업데이트 이전 안정 버전 |

- 버전별 상세 변경 내역은 [`CHANGELOG.md`](CHANGELOG.md)를 참고하세요.
- 이전 버전은 GitHub **Tags** 메뉴 또는 `git checkout <태그>`로 열어볼 수 있습니다.
- 포털 화면에는 날짜 버전만 표시됩니다(예: `v26.10.20`). 루트 `index.html`의 `VERSION` 상수 한 곳만 수정하며, 배포일(`date`)은 Merge하는 날로 맞춥니다.
