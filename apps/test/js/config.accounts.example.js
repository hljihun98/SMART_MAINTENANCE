/* ===== config.accounts.example.js : 계정 초기 시드 파일 '템플릿' =====
 *
 *  사용법 (계정을 비공개로 관리하고 싶을 때):
 *    1) 이 파일을 복사해서 같은 폴더에 'config.accounts.js' 라는 이름으로 저장
 *    2) 아래 값을 실제 사번/비밀번호로 수정
 *    3) .gitignore 에서 'js/config.accounts.js' 주석을 해제 (저장소에 안 올라가게)
 *
 *  이 example 파일은 저장소에 함께 올려서 "어떤 형식인지" 알려주는 용도입니다.
 *  실제 로그인에는 사용되지 않습니다.
 */
window.DEFAULT_USERS = {
  'R00001': { pw: '여기에_비밀번호', role: 'admin', name: '관리자이름' },
  'R00002': { pw: '여기에_비밀번호', role: 'user',  name: '사용자이름' }
};
