/* ===== data.js : 전역 상태/데이터: CU·bom[]·changelogData·asmEntries·robotGoals 등 + 호기범위 헬퍼 ===== */
/* (원본 robot_inventory__44_.html 1420-1730 줄을 그대로 분리) */
// ════════════════════════════════════════
// DATA
// ════════════════════════════════════════
/* 계정 초기 시드는 js/config.accounts.js, 런타임 계정 관리는 js/accounts.js 에 있습니다.
   두 파일이 이 data.js 보다 먼저 로드되어야 합니다. (index.html 스크립트 순서 참고) */
let CU=null, loginTimes={}, pendPh=[], scanTarget='in', scannedCode=null, scanStream=null;
let bomFilter='PARKIE', calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
let asmCalYear=new Date().getFullYear(), asmCalMonth=new Date().getMonth();
let asmSelectedDate=null;  // 공수산정 달력 선택 날짜 (납기일 후보)

// ── 공수산정 달력 호기 등록 상태 ──────────────────────
// 각 로봇별 제작 예정 호기 범위 (from ~ to)
// 호기 번호는 로봇 간 중복 불가
let asmEntries={
  PARKIE:{from:null,to:null},
  CARRIE:{from:null,to:null},
  GOALIE:{from:null,to:null}
};

// 호기 범위 입력값 업데이트
function updAsmEntry(r){
  const rk=r==='PARKIE'?'pk':r==='CARRIE'?'ca':'go';
  const fEl=document.getElementById('asc-'+rk+'-from');
  const tEl=document.getElementById('asc-'+rk+'-to');
  const lbl=document.getElementById('asc-'+rk+'-label');
  const f=parseInt(fEl?.value)||null;
  const t=parseInt(tEl?.value)||null;
  asmEntries[r]={from:f,to:t};
  if(lbl){
    if(f&&t&&t>=f)lbl.textContent=`${t-f+1}대 (${f}~${t}호기)`;
    else if(f&&t&&t<f)lbl.textContent='⚠️ 끝 > 시작 필요';
    else lbl.textContent='미설정';
  }
}

// ────────────────────────────────────────────────────────
// 역산 시스템 핵심 상수
// 실제 제작 프로세스 기준 (주말 제외 평일만 계산)
// ────────────────────────────────────────────────────────
const PROC={
  GBC_DAYS:      10,  // GBC 센터: 구동모듈 조립 (2주)
  NEXTM_DAYS:    10,  // NEXT-M 센터: 로봇단 조립 (2주)
  EOL_DAYS:      10,  // EOL 테스트 / SM팀 (2주)
  PARALLEL_UNITS: 2,  // 동시 제작 가능 대수
  // 부품 준비: GBC·NEXT-M 병렬로 발주 가능 → 리드타임 겹침
  // 실제 착수 1주 전까지 부품 입고 완료 목표
  PARTS_LEAD:     5,  // 부품 준비 여유 (평일 5일 = 1주)
};

// 달력에 반영 (중복 검사 포함, 역산 결과도 업데이트)
function applyAsmEntries(showToast=true){
  ['PARKIE','CARRIE','GOALIE'].forEach(r=>updAsmEntry(r));
  const allNums={};let conflict=false;
  ['PARKIE','CARRIE','GOALIE'].forEach(r=>{
    const e=asmEntries[r];if(!e.from||!e.to||e.to<e.from)return;
    for(let u=e.from;u<=e.to;u++){
      if(allNums[u]){toast('❌',`${u}호기가 ${allNums[u]}와 중복됩니다`,'err');conflict=true;}
      allNums[u]=r;
    }
  });
  if(conflict)return;
  const sum=document.getElementById('asc-summary');
  if(sum){
    const parts=['PARKIE','CARRIE','GOALIE']
      .filter(r=>{const e=asmEntries[r];return e.from&&e.to&&e.to>=e.from;})
      .map(r=>`${r} ${asmEntries[r].from}~${asmEntries[r].to}호기`);
    sum.textContent=parts.length?'등록: '+parts.join(' · '):'미설정';
  }
  rendAsmCalendar();syncRevUnit();updRevCalc();
  if(showToast)toast('✅','달력에 반영되었습니다','ok');
}

// 선택 초기화
function clearAsmSelection(){
  asmEntries={PARKIE:{from:null,to:null},CARRIE:{from:null,to:null},GOALIE:{from:null,to:null}};
  ['pk','ca','go'].forEach(k=>{
    const f=document.getElementById('asc-'+k+'-from');const t=document.getElementById('asc-'+k+'-to');
    if(f)f.value='';if(t)t.value='';
    const lbl=document.getElementById('asc-'+k+'-label');if(lbl)lbl.textContent='미설정';
  });
  const sum=document.getElementById('asc-summary');if(sum)sum.textContent='미설정';
  rendAsmCalendar();
}

// 역산 패널 닫기
function closeReversePanel(){
  const p=document.getElementById('asm-reverse-panel');
  if(p)p.style.display='none';
}
// 이전 버전 호환용 stub (사용 안 함)

let inquiries=[], currentPDpartNo=null;
let robotGoals={PARKIE:0,CARRIE:0,GOALIE:0};
let robotDashShow={PARKIE:false,CARRIE:false,GOALIE:false};
let activeLaborRobot='PARKIE';
let togGoal={PARKIE:true,CARRIE:true,GOALIE:true};
let togLabor={PARKIE:true,CARRIE:true,GOALIE:true};
let activityLog=[];   // {ts, userId, userName, type, detail}
let actualRecords=[];  // {ts, robot, module, task, planH, actualH, memo, userId, userName}
let alertTabFilter='PARKIE';

function changelogVerParts(ver){
  const m=String(ver||'').match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  return m?[parseInt(m[1])||0,parseInt(m[2])||0,parseInt(m[3])||0]:[0,0,0];
}
function changelogCompare(a,b){
  const date=(b.date||'').localeCompare(a.date||'');
  if(date)return date;
  const av=changelogVerParts(a.ver),bv=changelogVerParts(b.ver);
  return (bv[0]-av[0])||(bv[1]-av[1])||(bv[2]-av[2]);
}
function latestChangelog(){
  return [...changelogData].sort(changelogCompare)[0]||null;
}
function nextChangelogVersion(){
  const latest=latestChangelog();
  const v=changelogVerParts(latest?.ver);
  return `v${v[0]||0}.${v[1]||1}.${(v[2]||0)+1}`;
}

// ────────────────────────────────────────────────────────
// 개발 로그 데이터
// AI가 새 작업을 완료하면 이 배열에 항목을 추가합니다.
// 새 세션에서 "개발 로그에 변경사항 추가해줘" 라고 요청하세요.
// ────────────────────────────────────────────────────────
let changelogData=[
  // ── 1일차 (4/23) ──────────────────────────────────────
  {date:'2026-04-23',ver:'v0.1.1',type:'기능추가',body:'프로젝트 초기 생성. 로그인(사번/비밀번호)·대시보드·BOM 관리·입출고 기본 구조 구현.',author:'Claude'},
  {date:'2026-04-23',ver:'v0.1.2',type:'기능추가',body:'BOM 이미지 드래그&드롭 업로드. 입출고 모달(입고/출고). 로봇별 현황 페이지(PARKIE/CARRIE/GOALIE).',author:'Claude'},
  {date:'2026-04-23',ver:'v0.1.3',type:'기능추가',body:'공수 산정 기본 구조. 모듈·작업 항목 관리. 하루 작업시간·인원·시작일 설정. 1대 소요일 자동 계산.',author:'Claude'},
  {date:'2026-04-23',ver:'v0.1.4',type:'기능추가',body:'작업 인원 일정관리 초기 버전. 주간 시간표 그리드. 작업 인원 추가·예약 등록 기능.',author:'Claude'},
  // ── 2일차 (4/24) ──────────────────────────────────────
  {date:'2026-04-24',ver:'v0.2.1',type:'기능추가',body:'공수산정 조립 달력 추가. 납기 역산 기능(달력 더블클릭). 호기별 완료 예상일 시각화.',author:'Claude'},
  {date:'2026-04-24',ver:'v0.2.2',type:'기능추가',body:'BOM Level 0~6 컬럼 추가. Rev.(버전) 컬럼 추가. 부품 상세 모달에서 레벨/Rev 수정 가능.',author:'Claude'},
  {date:'2026-04-24',ver:'v0.2.3',type:'UI개선',body:'재고 부족 알림에 PARKIE/CARRIE/GOALIE/전체 탭 필터 추가. 기본값 PARKIE. BOM 탭 순서 재정렬.',author:'Claude'},
  {date:'2026-04-24',ver:'v0.2.4',type:'기능추가',body:'직접 입력 이상여부 컬럼(정상/확인필요/이상). 신규 부품 일괄 엑셀 붙이기 테이블. Part Number 대시 무시 검색(normPN).',author:'Claude'},
  // ── 3일차 (4/25) ──────────────────────────────────────
  {date:'2026-04-25',ver:'v0.3.1',type:'기능추가',body:'작업 인원 일정 페이지 전면 개편. 월간 캘린더 + 날짜 클릭 시 하단 30분 드래그 타임그리드. 예약자 표시.',author:'Claude'},
  {date:'2026-04-25',ver:'v0.3.2',type:'보안',body:'사용자 관리(pg-admin) 관리자 전용 접근 제한. go() 함수에 role 체크 추가. 일반 사용자 접근 시 차단.',author:'Claude'},
  {date:'2026-04-25',ver:'v0.3.3',type:'보안',body:'BOM stock 직접 수정 차단. updPart()에서 stock 키 수정 시 오류 반환. 변경 내역 activityLog에 기록.',author:'Claude'},
  {date:'2026-04-25',ver:'v0.3.4',type:'버그수정',body:'공수산정 달력 더블클릭 역산 미작동 수정. new Date(str) 시간대 오프셋 버그 제거.',author:'Claude'},
  // ── 4일차 (4/26) ──────────────────────────────────────
  {date:'2026-04-26',ver:'v0.4.1',type:'버그수정',body:'작업 인원 드래그 함수 완전 재작성. startDrag2/moveDrag2/endDrag2 (data-* 속성 기반). 인용부호 충돌 해결.',author:'Claude'},
  {date:'2026-04-26',ver:'v0.4.2',type:'기능추가',body:'타임그리드 예약 더블클릭으로 취소(cancelBooking). 작업 인원 삭제 관리자 전용(deleteTech).',author:'Claude'},
  {date:'2026-04-26',ver:'v0.4.3',type:'기능추가',body:'월간 달력 날짜 범위 드래그 → 타임그리드 드래그 시 범위 전체 일괄 예약.',author:'Claude'},
  // ── 5일차 (4/27) ──────────────────────────────────────
  {date:'2026-04-27',ver:'v0.5.1',type:'데이터구조',body:'BOM parentPartNo 필드 추가. flattenTree() 재귀 함수로 부모→자식 순서 렌더링.',author:'Claude'},
  {date:'2026-04-27',ver:'v0.5.2',type:'기능추가',body:'공수산정 달력 호기 등록 UI 개편. 로봇별 시작~끝 호기 입력(중복 불가). 달력 태그 상세화.',author:'Claude'},
  {date:'2026-04-27',ver:'v0.5.3',type:'기능추가',body:'BOM 상세 모달 계층 패널. 상위/현재/하위 부품 카드 표시. mo-set-parent 모달로 상위 부품 변경.',author:'Claude'},
  // ── 6일차 (4/28) ──────────────────────────────────────
  {date:'2026-04-28',ver:'v0.6.1',type:'UI개선',body:'대시보드 입출고 버튼 제거. 로봇현황 카드 위치 변경. BOM 레벨 열 Lv뱃지+들여쓰기로 압축.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.2',type:'기능추가',body:'AI 개발 로그 블록 HTML 최상단 주석 삽입. 앱 내 개발 로그 뷰어 페이지 추가.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.3',type:'UI개선',body:'버전 changelogData 자동 표시. 개발로그·사용자관리 관리자 전용. 작업 시간 07-18시 22슬롯. PARKIE 배너 기본 ON.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.4',type:'UI개선',body:'납기역산 선택 로봇 카드만 표시. 호기별 조립 완료 예상 asmEntries 기반 변경.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.5',type:'버그수정',body:'중복 asmCalDblClick 제거. 개발 로그 ni-changelog onclick 따옴표 충돌 수정.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.6',type:'UI개선',body:'작업 인원 달력 Today=주황/선택=파랑 구분. 타임그리드 absolute 오버레이 방식 재작성.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.7',type:'UI개선',body:'공수산정 제작 호기+납기 역산 2열 통합 카드. 납기일 더블클릭 시 역산 결과 즉시 표시.',author:'Claude'},
  {date:'2026-04-28',ver:'v0.6.8',type:'UI개선',body:'버전 체계 SemVer 도입 전 마지막 내부 규칙 정리. 공수산정 설정 카드 로봇별 고유 색상 적용.',author:'Claude'},
  // ── 7일차 (4/29) ──────────────────────────────────────
  {date:'2026-04-29',ver:'v0.7.1',type:'UI개선',body:'버전 체계 재확정. changelogData 전체 재정비.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.2',type:'UI개선',body:'공수산정 호기 입력 납기 역산 설정 카드로 통합(2열). 로봇 중복 선택 버그 수정. syncRevUnit 추가.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.3',type:'기능추가',body:'laborModules 실제 공수 데이터 반영(PARKIE: 준비24h·기구·전장·외주케이블·공통6h). 외주/TBD 플래그. 대시보드 공정 완료 체크 UI. 월간 달력 과거날짜 회색·선택불가.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.4',type:'기능추가',body:'달력 반영 버튼 버그 수정. PROC 상수 도입(GBC 10일·NEXT-M 10일·EOL 10일·부품여유 5일). 역산 GBC→NEXT-M→EOL→GTC 프로세스 반영.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.5',type:'버그수정',body:'asmEntries 초기값 null로 변경(하드코딩 제거). 공수산정 달력 과거날짜 회색+선택불가. 클릭=납기일 선택, 더블클릭=역산 실행 분리.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.6',type:'기능추가',body:'역산 로직 재설계: GBC N대동시(10일)→NEXT-M 2대씩 배치순차(10일×배치수)→EOL(10일). 배치별 착수일 타임라인 표시.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.7',type:'기능추가',body:'납기역산 확정 시 confirmedSchedules 생성. 작업인원 월간달력 단계별 간트 바 시각화. 간트바 더블클릭 상세모달(납품처·메모·삭제).',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.8',type:'버그수정',body:'rendTechMonthGrid 간트바 data-scid 방식으로 따옴표 충돌 수정. rendCalendar confirmedSchedules 기반 교체. applyReverseSchedule에서 rendCalendar+rendDash 동기화 호출.',author:'Claude'},
  {date:'2026-04-29',ver:'v0.7.9',type:'버그수정',body:'confirmReverseSchedule: _reverseDeadline null 시 asmSelectedDate fallback. 호기범위 미입력 검증 추가. EOL SM·SW 검사 2대 동시 진행으로 단일 단계 통합.',author:'Claude'},
  // ── 8일차 (4/30) ──────────────────────────────────────
  {date:'2026-04-30',ver:'v0.8.1',type:'기능추가',body:'rendAsmCalendar 재작성: 확정일정(실선)+역산미리보기(점선) 동시 표시. updRevCalc 계산 시 달력 납기달로 자동이동.',author:'Claude'},
  {date:'2026-04-30',ver:'v0.8.2',type:'UI개선',body:'전체 코드 최적화: 빈 함수 4개 제거. 미사용 CSS 20개 제거. CSS 변수 추가(--am-dark --gn-dark --re-dark --ac-hover). b-re 버튼 클래스 추가. 깨진 CSS 수정.',author:'Claude'},
  {date:'2026-04-30',ver:'v0.8.3',type:'버그수정',body:'드래그 예약 즉시등록 → 모달 확인 후 등록(_pendingBooking 임시저장, closeMo 시 초기화). submitTechBook 범위선택 일괄등록 지원. 납기역산 달력 태그 단계별 크기/굵기 강조. 대시보드 공수효율(계획h/실적h) 복원.',author:'Claude'},
  {date:'2026-04-30',ver:'v0.8.4',type:'최적화',body:'미사용 함수 5개 제거(editReverseSchedule·getWeekDates·openTechBookFromCell·toggleSiblings·updRevUnitLabel). 미사용 변수 제거(techFilterActive·_reverseConfirmed). NEXT-M 배치 착수일 계산 버그 수정: 역순 루프를 순방향으로 수정하여 같은 배치 2대가 동일 착수·완료일 공유.',author:'Claude'},
  {date:'2026-04-30',ver:'v0.8.5',type:'버그수정',body:'setRevRobot ID맵 수정. 달력 반영 버튼 제거(호기 입력 자동반영). 역산결과 구동모듈 안착 제거. 달력 GBC착수·EOL착수 마커 제거. 대시보드 공수효율 재설계(큰 숫자+진행바+하루용량·효율 카드).',author:'Claude'},
  {date:'2026-05-08',ver:'v0.8.6',type:'버그수정',body:'updRevCalc for루프 닫는 brace 누락 수정(핵심 오류). CSS 중복 규칙 완전 제거(35KB->25KB). 미사용 함수 제거(clickBomImg·dropBomImg·setBomImg). 미사용 변수 제거(laborRobotShow·techDragState·asmReverseDeadline). 빈 catch 주석 처리.',author:'Claude'},
  {date:'2026-06-11',ver:'v0.8.7',type:'데이터구조',body:'계정 로직을 accounts.js 로 분리. DEFAULT_USERS 초기 시드와 런타임 계정 저장소를 분리하고, 관리자 사용자 추가/수정/삭제를 ACCOUNT 활동 로그로 기록하도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.8',type:'UI개선',body:'휴대폰 바타입·폴드·태블릿·데스크톱 환경별 responsive.css 추가. 모바일 상단 내비게이션, 카드/폼 그리드 재배치, 표·타임그리드 가로 스크롤 보정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.9',type:'기능추가',body:'모바일·폴드 화면에서 계정 프로필 클릭 시 내 계정 모달을 열도록 추가. 사번·성명·권한 표시, 현재 비밀번호 확인 기반 비밀번호 변경, 본인 활동 로그, 관리자 문의·로그아웃 진입 제공.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.10',type:'UI개선',body:'모바일·폴드 상단 메뉴가 자동으로 천천히 순환되도록 mobile-nav.js 추가. 사용자가 터치·스크롤·메뉴 선택 시 일시 정지 후 다시 흐르도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.11',type:'버그수정',body:'외부 XLSX CDN defer가 로컬 앱 스크립트 실행을 지연시켜 모바일 메뉴 순환이 시작되지 않을 수 있는 문제를 수정. CDN은 비동기 로드로 변경하고 메뉴 순환 초기화와 속도를 보정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.12',type:'버그수정',body:'로그인 전 숨겨진 앱 영역에서 모바일 메뉴 폭이 0으로 잡혀 순환이 체감되지 않을 수 있어, initApp 완료 후 startMobileNav를 명시 호출하도록 보정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.13',type:'UI개선',body:'모바일·폴드 상단 메뉴 순환을 끊김 없는 루프 방식으로 변경. 메뉴 복제본을 모바일에서만 붙이고, 항목 터치·클릭 시 5초 정지 후 다시 회전하도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.14',type:'UI개선',body:'모바일·폴드 공수산정 달력 전용 압축 스타일 추가. 날짜·배지·일정 태그 글자 크기와 패딩을 줄여 달력 칸이 텍스트 크기에 덜 의존하도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.15',type:'버그수정',body:'모바일 상단 메뉴 순환 복제본이 클릭 이벤트를 가진 채 동작할 수 있는 문제를 수정. 복제본 이벤트·id 제거, pointer-events 차단, 첫 복제본 offset 기준으로 순환 폭을 계산하도록 보정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.16',type:'UI개선',body:'모바일·폴드 작업 인원 일정관리 월간 드래그 예약 보드 전용 압축 스타일 추가. 날짜·상태 배지·간트바·작업자 pill 글자 크기와 패딩을 줄여 달력 셀을 작게 표시.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.17',type:'UI개선',body:'모바일·폴드 상단 메뉴 자동 순환 속도를 22px/s로 낮춰 목록 이동이 더 천천히 보이도록 조정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.18',type:'문서화',body:'SemVer 기준에 맞춰 개발로그 버전 표기를 vMAJOR.MINOR.PATCH 형식으로 정비하고, README와 AI 개발 로그 블록을 현재 기능·파일 구조 기준으로 업데이트.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.19',type:'UI개선',body:'반폭 데스크톱 구간에서 상단 메뉴 관리자 라벨이 세로로 찌그러지는 문제를 수정하고, 개발 로그 버전 카드 목록을 2열로 재배치해 중간 폭 화면 가독성을 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.20',type:'UI개선',body:'반폭 데스크톱과 태블릿 가로폭에서는 상단 메뉴 자동 순환을 비활성화하고, 더 작은 모바일 폭에서만 이어지는 목록 기능이 동작하도록 기준 폭을 760px로 조정.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.21',type:'버그수정',body:'로봇 상세의 "대시보드에 표시" 토글을 setRobotDashShow 함수로 분리해 즉시 저장되도록 보강하고, 깨진 토글 스위치 CSS 규칙을 수정해 활성 상태가 정상 표시되도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.22',type:'UI개선',body:'토글 스위치 ON 상태 색상을 초록색으로 조정해 사용자가 활성 상태를 더 직관적으로 인식할 수 있도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.23',type:'UI개선',body:'로봇 상세 화면의 빠른 액션 버튼을 rd-quick-actions 그룹으로 묶고, 좁은 폭에서 토글은 한 줄 전체를 사용하고 입고/출고 버튼은 같은 줄·같은 높이의 2열로 정렬되도록 개선.',author:'Codex'},
  {date:'2026-06-11',ver:'v0.8.24',type:'버그수정',body:'GitHub 배포 환경에서 js/config.accounts.js 누락 시 accounts.js 초기화가 깨지던 문제를 수정. 로그인 화면에 계정 파일 누락/빈 계정 상태를 구체적으로 안내하도록 보강.',author:'Codex'},
  // ── 버그 수정 배치 (6/11) ──────────────────────────────
  {date:'2026-06-11',ver:'v0.8.25',type:'버그수정',body:'[Critical] reset.css CSS 변수 자기참조 순환 수정 → --am-dark/--gn-dark/--re-dark/--ac-hover 실제 hex 값으로 교체. 색상 뱃지·버튼 전체 소실 문제 해결.',author:'Claude'},
  {date:'2026-06-11',ver:'v0.8.26',type:'버그수정',body:'[Critical] technician.js submitTechBook 단일 날짜 예약 TypeError 수정 → const dates 선언 후 재대입(dates=[date]) 불가 → dates.push(date) 로 교체.',author:'Claude'},
  {date:'2026-06-11',ver:'v0.8.27',type:'버그수정',body:'[High] bom.js flattenTree 순환 parentPartNo 참조 시 무한재귀(스택오버플로) 수정 → visited Set 패턴으로 사이클 감지. XSS 방어: b.partNo·b.name·b.robot·b.unit 인라인 핸들러·innerHTML에 escHtml 적용.',author:'Claude'},
  {date:'2026-06-11',ver:'v0.8.28',type:'버그수정',body:'[Medium] labor.js 공수효율 계산 분모 0 처리 → planH2>0&&accH>0 조건 추가(Infinity% → - 표시). bulk-entry.js 붙여넣기 메모 컬럼 오프셋 수정 tds[5]→tds[6]. persistence.js QuotaExceededError 토스트 알림 추가. auth.js 로그인 성공 시 잘못된 오류 텍스트 설정 코드 제거.',author:'Claude'},
  // ── 포털 통합 및 모바일 개선 (6/11) ──────────────────────
  {date:'2026-06-11',ver:'v0.9.0',type:'UI개선',body:'ROBOSTOCK 포털 상태 테스트→사용가능으로 변경. 사이드바 sb-nav에 "메인 포털" 링크 추가(데스크톱·모바일 모두 접근 가능). 모바일 mc padding-top 동적 조정(syncMcPadding) 추가. 520~980px 구간 sb-logo padding-right 보강으로 로고·유저배지 겹침 방지.',author:'Claude'},
  {date:'2026-06-11',ver:'v0.9.1',type:'버그수정',body:'[High] robotDashShow가 persistence.js snapshot에 누락되어 새로고침 시 "대시보드에 표시" 토글 상태가 초기화되던 버그 수정. [Medium] submitActual에서 laborModules[r][mi] 접근 시 null 안전성 없어 모듈 전체 삭제 후 크래시 가능성 → optional chaining + 유효성 검사 추가.',author:'Claude'},
];

// Technician
let technicians=[];
let techBookings=[];
let delayLogs=[];
let techCalYear=new Date().getFullYear(), techCalMonth=new Date().getMonth();
let techCalWeekOffset=0;

// ── 확정된 제작 일정 ─────────────────────────────────────
// 납기 역산 "이 납기일로 일정 확정" 시 생성
// 월간 달력에 간트 바로 시각화
let confirmedSchedules=[];

let bom=[
  // ════════════════════════════════════════
  // PARKIE BOM — 이미지 구조 참고
  // Level 0: 최상위 완성품 (ROBOT ASSY)
  // Level 1: 주요 서브어셈블리
  // Level 2: 세부 어셈블리
  // Level 3: 단위 부품
  // Level 4+: 세부 부품
  // ════════════════════════════════════════
  // L0 최상위
  {partNo:'RO-010-000',name:'ROBOT ASSY, PARKIE',   robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'TBD',parentPartNo:''},
  // L1 서브어셈블리
  {partNo:'RP-020-000',name:'BODY ASSEMBLY',        robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'B',parentPartNo:'RO-010-000'},
  {partNo:'RP-030-000',name:'ACTUATOR ASSY, WING MODULE LH',robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'B',parentPartNo:'RO-010-000'},
  {partNo:'RP-030-001',name:'ACTUATOR ASSY, WING MODULE RH',robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'B',parentPartNo:'RO-010-000'},
  // L2 RP-020-000 하위
  {partNo:'RP-300-017',name:'FRAME',                robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:2,rev:'C',parentPartNo:'RP-020-000'},
  {partNo:'RP-302-000',name:'BLOCK, TENSIONER',     robot:'PARKIE',unit:'EA',stock:5,minStock:2,price:35000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'RP-020-000'},
  {partNo:'RP-150-006',name:'SENSOR ASSY, 3D LIDAR FRT-2',robot:'PARKIE',unit:'EA',stock:3,minStock:2,price:450000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'RP-020-000'},
  {partNo:'RP-152-000',name:'PANEL ASSY, D-FRT',   robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:2,rev:'B',parentPartNo:'RP-020-000'},
  {partNo:'RP-152-001',name:'PANEL ASSY, D-RR',    robot:'PARKIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'RP-020-000'},
  // L3 RP-300-017 하위 (FRAME 구성 부품)
  {partNo:'RP-300-000',name:'FRAME, FRT(L)',        robot:'PARKIE',unit:'EA',stock:8,minStock:5,price:85000,imgs:[],perUnit:1,spec:'',level:3,rev:'D',parentPartNo:'RP-300-017'},
  {partNo:'RP-300-001',name:'FRAME, FRT(R)',        robot:'PARKIE',unit:'EA',stock:8,minStock:5,price:85000,imgs:[],perUnit:1,spec:'',level:3,rev:'C',parentPartNo:'RP-300-017'},
  {partNo:'RP-300-002',name:'FRAME, RR(L)',         robot:'PARKIE',unit:'EA',stock:8,minStock:5,price:82000,imgs:[],perUnit:1,spec:'',level:3,rev:'D',parentPartNo:'RP-300-017'},
  {partNo:'RP-300-003',name:'FRAME, RR(R)',         robot:'PARKIE',unit:'EA',stock:8,minStock:5,price:82000,imgs:[],perUnit:1,spec:'',level:3,rev:'C',parentPartNo:'RP-300-017'},
  {partNo:'RZ-902-037',name:'SOCKET HEAD BOLT, M5-25',robot:'PARKIE',unit:'EA',stock:200,minStock:50,price:300,imgs:[],perUnit:8,spec:'',level:3,rev:'A',parentPartNo:'RP-300-017'},
  // L3 RP-150-006 하위 (3D LIDAR 센서 구성)
  {partNo:'RZ-810-003',name:'3D LIDAR, MID360',    robot:'PARKIE',unit:'EA',stock:4,minStock:3,price:680000,imgs:[],perUnit:1,spec:'',level:3,rev:'A',parentPartNo:'RP-150-006'},
  {partNo:'RP-341-012',name:'SENSOR BRACKET, 3D LIDAR-2 FRT-LWR',robot:'PARKIE',unit:'EA',stock:6,minStock:3,price:45000,imgs:[],perUnit:1,spec:'',level:3,rev:'A',parentPartNo:'RP-150-006'},
  // L2 RP-030-000 하위 (윙 모듈 LH)
  {partNo:'RP-130-000',name:'WORM REDUCER, LH',    robot:'PARKIE',unit:'EA',stock:3,minStock:2,price:320000,imgs:[],perUnit:1,spec:'',level:2,rev:'B',parentPartNo:'RP-030-000'},
  {partNo:'RP-132-000',name:'WING ASSEMBLY, LH',   robot:'PARKIE',unit:'EA',stock:3,minStock:2,price:180000,imgs:[],perUnit:1,spec:'',level:2,rev:'C',parentPartNo:'RP-030-000'},
  // L3 RP-130-000 하위 (웜 감속기 LH 구성)
  {partNo:'RP-131-000',name:'WORM WHEEL ASSY, LH', robot:'PARKIE',unit:'EA',stock:4,minStock:2,price:95000,imgs:[],perUnit:1,spec:'',level:3,rev:'A',parentPartNo:'RP-130-000'},
  {partNo:'RP-490-000',name:'WORM SHAFT',          robot:'PARKIE',unit:'EA',stock:6,minStock:3,price:65000,imgs:[],perUnit:1,spec:'',level:3,rev:'A',parentPartNo:'RP-130-000'},
  {partNo:'RZ-401-000',name:'ROLLER BEARING, 32006',robot:'PARKIE',unit:'EA',stock:12,minStock:6,price:28000,imgs:[],perUnit:2,spec:'',level:3,rev:'A',parentPartNo:'RP-130-000'},
  // L4 RP-131-000 하위 (웜 휠 어셈블리)
  {partNo:'RP-443-000',name:'WORM WHEEL, BOSS',    robot:'PARKIE',unit:'EA',stock:8,minStock:4,price:42000,imgs:[],perUnit:1,spec:'',level:4,rev:'A',parentPartNo:'RP-131-000'},
  {partNo:'RP-443-001',name:'WORM WHEEL, LH',      robot:'PARKIE',unit:'EA',stock:8,minStock:4,price:55000,imgs:[],perUnit:1,spec:'',level:4,rev:'B',parentPartNo:'RP-131-000'},
  {partNo:'RZ-933-003',name:'POSITION PIN, WORM WHEEL (Ø6-20)',robot:'PARKIE',unit:'EA',stock:40,minStock:20,price:1200,imgs:[],perUnit:2,spec:'',level:4,rev:'A',parentPartNo:'RP-131-000'},
  // ════════════════════════════════════════
  // CARRIE BOM
  // ════════════════════════════════════════
  {partNo:'CR-ASSY-000',name:'ROBOT ASSY, CARRIE', robot:'CARRIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A',parentPartNo:''},
  {partNo:'CR-LIFT-000',name:'LIFT ASSEMBLY',      robot:'CARRIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'A',parentPartNo:'CR-ASSY-000'},
  {partNo:'CR-MT-001',name:'리프트모터',            robot:'CARRIE',unit:'EA',stock:6,minStock:4,price:145000,imgs:[],perUnit:2,spec:'',level:2,rev:'A',parentPartNo:'CR-LIFT-000'},
  {partNo:'CR-LF-001',name:'리프트암',             robot:'CARRIE',unit:'EA',stock:9,minStock:3,price:78000,imgs:[],perUnit:2,spec:'',level:2,rev:'B',parentPartNo:'CR-LIFT-000'},
  {partNo:'CR-SN-001',name:'하중센서',             robot:'CARRIE',unit:'EA',stock:2,minStock:6,price:35000,imgs:[],perUnit:4,spec:'',level:2,rev:'A',parentPartNo:'CR-LIFT-000'},
  {partNo:'CR-ELEC-000',name:'ELECTRIC ASSEMBLY', robot:'CARRIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'A',parentPartNo:'CR-ASSY-000'},
  {partNo:'CR-MC-001',name:'메인컨트롤러',         robot:'CARRIE',unit:'EA',stock:18,minStock:5,price:200000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'CR-ELEC-000'},
  {partNo:'CR-BT-001',name:'배터리팩(24V)',        robot:'CARRIE',unit:'EA',stock:11,minStock:3,price:220000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'CR-ELEC-000'},
  // ════════════════════════════════════════
  // GOALIE BOM
  // ════════════════════════════════════════
  {partNo:'GL-ASSY-000',name:'ROBOT ASSY, GOALIE', robot:'GOALIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A',parentPartNo:''},
  {partNo:'GL-SENS-000',name:'SENSOR ASSEMBLY',   robot:'GOALIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'A',parentPartNo:'GL-ASSY-000'},
  {partNo:'GL-CM-001',name:'PTZ카메라',           robot:'GOALIE',unit:'EA',stock:8,minStock:4,price:420000,imgs:[],perUnit:2,spec:'',level:2,rev:'A',parentPartNo:'GL-SENS-000'},
  {partNo:'GL-SN-001',name:'열화상센서',          robot:'GOALIE',unit:'EA',stock:4,minStock:4,price:680000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'GL-SENS-000'},
  {partNo:'GL-ELEC-000',name:'ELECTRIC ASSEMBLY', robot:'GOALIE',unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:1,rev:'A',parentPartNo:'GL-ASSY-000'},
  {partNo:'GL-MC-001',name:'메인컨트롤러',        robot:'GOALIE',unit:'EA',stock:15,minStock:5,price:195000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'GL-ELEC-000'},
  {partNo:'GL-SP-001',name:'스피커모듈',         robot:'GOALIE',unit:'EA',stock:20,minStock:5,price:28000,imgs:[],perUnit:2,spec:'',level:2,rev:'A',parentPartNo:'GL-ELEC-000'},
  {partNo:'GL-BT-001',name:'배터리팩(36V)',       robot:'GOALIE',unit:'EA',stock:1,minStock:3,price:260000,imgs:[],perUnit:1,spec:'',level:2,rev:'A',parentPartNo:'GL-ELEC-000'},
];
let ioLogs=[];

// Labor: modules per robot
let laborModules={
  PARKIE:[
    // ── 준비 단계 ─────────────────────────────────────────
    {name:'준비 단계',tasks:[
      {name:'부품 입고 검사',note:'기구/전장 부품 입고 시 기본 불량 검사 (웜 기동토크/조립상태/주요 치수, 윙 롤러/샤프트 치수, 전장품 동작성 확인 등)',hours:24,workers:2,category:'준비',inspection:true}
    ]},
    // ── 기구 조립 ─────────────────────────────────────────
    {name:'기구 조립',tasks:[
      {name:'프레임 ASSY',       note:'메인 프레임 어셈블리',         hours:4.5, workers:2, category:'기구'},
      {name:'좌측 윔',           note:'좌측 윔 어셈블리',             hours:3,   workers:2, category:'기구'},
      {name:'우측 윔',           note:'우측 윔 어셈블리',             hours:3.5, workers:2, category:'기구'},
      {name:'구동모듈 전방 ASSY',note:'구동모듈 전방 어셈블리',       hours:0.5, workers:1, category:'기구'},
      {name:'좌측 윙 액추에이터 (모터·유성감속기 등) ASSY', note:'좌측 윙 액추에이터', hours:1, workers:2, category:'기구'},
      {name:'좌측 풀리 조립',    note:'',                             hours:1,   workers:1, category:'기구'},
      {name:'우측 윙 액추에이터 (모터·유성감속기 등) ASSY', note:'우측 윙 액추에이터', hours:1, workers:2, category:'기구'},
      {name:'우측 풀리 조립',    note:'',                             hours:1,   workers:1, category:'기구'},
      {name:'구동모듈 후방 ASSY',note:'구동모듈 후방 어셈블리',       hours:0.5, workers:1, category:'기구'},
      {name:'E-BOX COVER (FRT·MID·RR)',note:'',                      hours:0.5, workers:1, category:'기구'},
      {name:'디자인 커버',       note:'',                             hours:0.5, workers:1, category:'기구'},
      // 구동모듈 제작 — 추후 업데이트 예정
      {name:'구동모듈 제작',     note:'⚠️ 공수시간 추후 업데이트 예정', hours:0, workers:2, category:'기구', tbd:true}
    ]},
    // ── 전장 조립 ─────────────────────────────────────────
    {name:'전장 조립',tasks:[
      {name:'E-BOX FRONT ASSY', note:'전장 박스 전면 조립',           hours:1,   workers:2, category:'전장', inspection:true, inspectionH:1},
      {name:'E-BOX REAR ASSY',  note:'전장 박스 후면 조립',           hours:1.5, workers:2, category:'전장', inspection:true, inspectionH:1},
      {name:'E-BOX MID ASSY',   note:'전장 박스 중간 조립',           hours:0.5, workers:2, category:'전장', inspection:true, inspectionH:1},
      {name:'Cable 최적화 작업', note:'케이블 정리 및 최적화',         hours:8,   workers:2, category:'전장'},
      {name:'전장 계통 점검 및 도통 test', note:'',                    hours:4,   workers:2, category:'전장', inspection:true, inspectionH:4},
      // ⚠️ 외주 케이블 제작 — 현재 외주업체 진행 중
      {name:'케이블 제작 (외주)',note:'⚠️ 현재 외주업체 진행 중 — 리드타임 별도 확인 필요. 검수 4MH + 조립 12MH',hours:16,workers:2,category:'전장',outsourced:true,inspectionH:4}
    ]},
    // ── 공통 ──────────────────────────────────────────────
    {name:'공통',tasks:[
      {name:'issue 대응 및 휴식시간', note:'조립 치수 불량, 부품류 파손 등 돌발 대응', hours:6, workers:2, category:'공통'}
    ]}
  ],
  CARRIE:[
    {name:'준비 단계',tasks:[
      {name:'부품 입고 검사',note:'기구/전장 부품 입고 검사',hours:12,workers:2,category:'준비',inspection:true}
    ]},
    {name:'기구 조립',tasks:[
      {name:'프레임 조립',note:'',hours:6,workers:2,category:'기구'},
      {name:'리프트 조립',note:'',hours:8,workers:2,category:'기구'},
      {name:'구동모듈 제작',note:'⚠️ 공수시간 추후 업데이트 예정',hours:0,workers:2,category:'기구',tbd:true}
    ]},
    {name:'전장 조립',tasks:[
      {name:'전장 배선',note:'',hours:5,workers:2,category:'전장'},
      {name:'케이블 제작 (외주)',note:'⚠️ 현재 외주업체 진행 중',hours:8,workers:2,category:'전장',outsourced:true}
    ]},
    {name:'검사',tasks:[
      {name:'소프트웨어 설정',note:'',hours:4,workers:1,category:'SW'},
      {name:'검사 및 테스트',note:'',hours:3,workers:1,category:'검사'}
    ]}
  ],
  GOALIE:[
    {name:'준비 단계',tasks:[
      {name:'부품 입고 검사',note:'기구/전장 부품 입고 검사',hours:12,workers:2,category:'준비',inspection:true}
    ]},
    {name:'기구 조립',tasks:[
      {name:'프레임 조립',note:'',hours:5,workers:2,category:'기구'},
      {name:'카메라 마운트',note:'',hours:4,workers:1,category:'기구'},
      {name:'구동모듈 제작',note:'⚠️ 공수시간 추후 업데이트 예정',hours:0,workers:2,category:'기구',tbd:true}
    ]},
    {name:'전장 및 소프트웨어',tasks:[
      {name:'센서 설치',note:'',hours:6,workers:1,category:'전장'},
      {name:'전장 배선',note:'',hours:5,workers:2,category:'전장'},
      {name:'케이블 제작 (외주)',note:'⚠️ 현재 외주업체 진행 중',hours:8,workers:2,category:'전장',outsourced:true},
      {name:'소프트웨어 설정',note:'',hours:5,workers:1,category:'SW'},
      {name:'검사 및 테스트',note:'',hours:4,workers:1,category:'검사'}
    ]}
  ]
};
let laborSettings={hpd:8,wk:3,startDate:''};
