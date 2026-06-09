# 센서 보고서

PARKIE 로봇의 진동·온도 센서 점검 데이터를 수집하고 PDF 보고서를 생성합니다.

## 주요 기능

- 호기(unit)별 진동 / 온도 / 전류 / 전압 측정값 입력
- 전체 상태 평가 (정상 / 경미한 손상 / 교체 필요 / 긴급 점검)
- 점검 이력 localStorage 저장 (`parkie_sensor_v3`)
- jsPDF 기반 PDF 보고서 생성 (한국어 텍스트-PNG 변환 방식)
- 사진 첨부 및 보고서 내 이미지 삽입

## 아키텍처 노트

- `LOGO_SRC` 상수 (`../../logo.png`)로 상단바와 PDF에 로고 삽입
- `getLogoImage()` — crossOrigin 없이 로고 로드 (jsPDF 용)
- `generatePDF()` — jsPDF로 직접 PDF 렌더링
- `textToPng()` — 한국어 텍스트를 Canvas PNG로 변환해 PDF에 삽입
- Supabase 연동 코드는 현재 비활성화; `saveToServer()`는 안내 알림만 표시

## 데이터 구조

점검 데이터는 `localStorage['parkie_sensor_v3']`에 JSON으로 저장됩니다.
