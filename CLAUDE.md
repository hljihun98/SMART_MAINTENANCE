# SMART MAINTENANCE — Claude 작업 규칙

## 권한이 필요한 작업
- 푸시·태그·PR 병합·파일 삭제는 `.claude/settings.json`의 `ask` 규칙으로 실행 전에 사용자 확인을 받는다.
- 권한에 막히면 우회하지 않는다. 막힌 작업과 무관한 나머지를 먼저 끝까지 진행한 뒤, 무엇을 왜 해야 하는지 밝혀 사용자에게 허용을 요청한다. 허용을 받으면 그 작업을 이어서 진행한다.

## 남은 개선 과제
- 전체 점검에서 나왔지만 아직 고치지 않은 항목(낮음 등급 오류·최적화)은 [docs/BACKLOG.md](docs/BACKLOG.md)에 있다. 수정 작업을 시작할 때 먼저 읽는다.
- 고칠 때는 문서 맨 위의 "바뀌면 안 되는 것"(Torque Tak! 토크 값, 센서 사진 화질·PDF, 벨트 측정값·CSV·PDF, ROBOSTOCK 사진·엑셀)을 수정 전/후 비교로 확인한다.
- 고친 항목은 BACKLOG에서 지우고 CHANGELOG에 기록한다.

## 배포
- 사이트는 GitHub Pages가 `main` 브랜치에서 배포한다. `main`에 병합·푸시하면 공개 사이트가 바로 바뀐다.
- 버전·날짜 태그 규칙은 [README.md](README.md)의 "버전 관리"와 [CHANGELOG.md](CHANGELOG.md)를 따른다.
