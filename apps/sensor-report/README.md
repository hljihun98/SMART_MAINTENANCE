# 센서 보고서

PARKIE 로봇의 LiDAR·카메라 센서 점검 데이터를 수집하고 PDF 보고서를 생성합니다.

## 주요 기능

- 호기별 LiDAR·카메라 센서 점검 결과 입력 (정상·경미한 손상·심각한 손상·교체 필요)
- 작업 전/후 사진 첨부 (센서당 최대 4장)
- 전체 상태 평가: 정상 / 경미한 손상 / 교체 필요 / 긴급 점검
- jsPDF 기반 PDF 보고서 생성 (한국어 텍스트 Canvas PNG 변환 방식)
- 점검 이력 localStorage 저장·복원
- 반응형 UI (현장 스마트폰 사용 최적화)

## 데이터 저장

점검 데이터는 `localStorage['parkie_sensor_v3']`에 JSON으로 저장됩니다.
메인 포털 → 데이터 관리에서 초기화할 수 있습니다.

## 아키텍처 노트

- `LOGO_SRC` 상수(`../../logo.png`)로 상단바와 PDF에 로고 삽입
- `generatePDF()` — jsPDF로 직접 PDF 렌더링
- `textToPng()` — 한국어 텍스트를 Canvas PNG로 변환해 PDF에 삽입
- Supabase 연동 코드는 현재 비활성화 (`saveToServer()`는 안내 알림만 표시)

## 파일 구조

```
sensor-report/
└── index.html   # 전체 앱 (HTML·CSS·JS 단일 파일)
```
