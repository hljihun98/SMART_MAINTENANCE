# SMART MAINTENANCE Platform

설비 점검용 경량 웹 애플리케이션 모음입니다. 별도의 설치나 빌드 없이 브라우저에서 바로 실행됩니다.

## 앱 목록

| 앱 | 경로 | 설명 | 상태 |
|---|---|---|---|
| 센서 보고서 | `apps/sensor-report/` | PARKIE 로봇 진동·온도 센서 점검 및 PDF 보고서 생성 | 사용 가능 |
| 벨트 장력계 | `apps/belt-tension/` | 마이크 음파 분석으로 컨베이어 벨트 장력(N) 측정 | 사용 가능 |
| ROBOSTOCK | `apps/test/` | 로봇 부품 재고·BOM·공수산정·작업인원 일정 통합 관리 | 사용 가능 |
| 데시벨 측정 | `apps/decibel-meter/` | 실시간 소음 레벨(dB SPL) 측정 및 이력 기록 | 개발 중 |

## 기술 스택

- 순수 HTML / CSS / JavaScript (빌드 도구 없음)
- Web Audio API — 마이크 입력 및 FFT 주파수 분석
- jsPDF — 클라이언트 측 PDF 생성
- Chart.js — 실시간 파형 차트
- SheetJS — Excel 내보내기
- localStorage — 데이터 영속성

## 공유 리소스

| 파일 | 설명 |
|---|---|
| `index.html` | 앱 목록 포털 (APPS 배열 하나만 편집하면 카드·카운트·푸터 자동 갱신) |
| `logo.png` | HL Robotics 공식 로고 (모든 앱이 `../../logo.png`로 참조) |

## 앱 추가 방법

1. `apps/<new-app>/index.html` 파일을 생성합니다.
2. 루트 `index.html`의 `APPS` 배열에 항목 하나를 추가합니다.
3. 카드, 카운트("앱 N개"), 푸터("N apps")가 자동으로 갱신됩니다.
