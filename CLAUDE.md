# SMART MAINTENANCE — Claude 작업 규칙

## 권한이 필요한 작업
- 푸시·태그·PR 병합·파일 삭제는 `.claude/settings.json`의 `ask` 규칙으로 실행 전에 사용자 확인을 받는다.
- 권한에 막히면 우회하지 않는다. 막힌 작업과 무관한 나머지를 먼저 끝까지 진행한 뒤, 무엇을 왜 해야 하는지 밝혀 사용자에게 허용을 요청한다. 허용을 받으면 그 작업을 이어서 진행한다.

## 배포
- 사이트는 GitHub Pages가 `main` 브랜치에서 배포한다. `main`에 병합·푸시하면 공개 사이트가 바로 바뀐다.
- 버전·날짜 태그 규칙은 [README.md](README.md)의 "버전 관리"와 [CHANGELOG.md](CHANGELOG.md)를 따른다.
