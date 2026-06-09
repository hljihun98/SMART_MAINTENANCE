# 데시벨 측정기 (SoundGuard Pro)

마이크로 실시간 소음 레벨(dB SPL)을 측정하고 기록합니다.

## 주요 기능

- Web Audio API 기반 실시간 dB SPL 측정
- Chart.js 파형 차트 (최근 60초)
- 소음 수준별 상태 표시
- 측정 이력 테이블 (시각, 레벨, 평균, 피크, 상태)
- jsPDF 보고서 내보내기
- SheetJS Excel 내보내기
- PWA 지원 (오프라인 Service Worker)

## 소음 수준 기준

| 상태 | dB SPL 범위 |
|---|---|
| QUIET | ≤ 40 dB |
| NORMAL | ≤ 60 dB |
| MODERATE | ≤ 70 dB |
| LOUD | ≤ 80 dB |
| VERY LOUD | ≤ 90 dB |
| ⚠ DANGER | > 90 dB |

## 외부 라이브러리

- Chart.js 4.4.1
- SheetJS 0.18.5
- jsPDF 2.5.1 + AutoTable
