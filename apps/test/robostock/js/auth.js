/* ===== auth.js : 로그인/로그아웃/앱 초기화(doLogin·doLogout·initApp) + 로그인 입력 리스너 ===== */
/* (원본 robot_inventory__44_.html 1731-1802 줄을 그대로 분리) */
// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════
function doLogin(){
  const id=document.getElementById('inp-id').value.trim().toUpperCase();
  const pw=document.getElementById('inp-pw').value;
  const err=document.getElementById('l-err');
  if(USERS[id]&&USERS[id].pw===pw){
    CU={id,...USERS[id]};
    loginTimes[id]=new Date().toLocaleString('ko-KR');
    logActivity(id,USERS[id].name,'LOGIN',`로그인`);
    err.style.display='none';
    document.getElementById('ls').style.opacity='0';
    setTimeout(()=>{
      document.getElementById('ls').style.display='none';
      document.getElementById('app').style.display='block';
      initApp();
    },380);
  } else { err.style.display='block'; }
}
document.getElementById('inp-pw').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('inp-id').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('inp-pw').focus();});

function doLogout(){
  CU=null;
  document.getElementById('ls').style.opacity='1';
  document.getElementById('ls').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('inp-id').value='';
  document.getElementById('inp-pw').value='';
}

function initApp(){
  document.getElementById('sb-av').textContent=CU.name?CU.name[0]:CU.id.slice(-2);
  document.getElementById('sb-un').textContent=CU.name||CU.id;
  document.getElementById('sb-ui').textContent=CU.id;

  // 최신 버전 표시 (changelogData에서 자동 계산)
  const latestVer=[...changelogData].sort((a,b)=>b.date.localeCompare(a.date)||b.ver.localeCompare(a.ver))[0]?.ver||'';
  if(latestVer){
    const vEl=document.getElementById('app-version');
    if(vEl)vEl.textContent=latestVer+' · 재고관리 시스템';
    const fEl=document.getElementById('footer-version');
    if(fEl)fEl.textContent=latestVer;
    document.title=`ROBOSTOCK ${latestVer}`;
  }

  // 관리자 전용 메뉴: 개발로그 + 사용자관리
  if(CU.role==='admin'){
    document.getElementById('admin-ns').style.display='block';
    document.getElementById('ni-admin').style.display='flex';
    document.getElementById('ni-changelog').style.display='flex';
  } else {
    document.getElementById('inq-btn').style.display='block';
    // 개발로그, 사용자관리 메뉴 숨김 (일반 사용자)
    document.getElementById('ni-admin').style.display='none';
    document.getElementById('ni-changelog').style.display='none';
  }

  laborSettings.startDate=new Date().toISOString().slice(0,10);
  document.getElementById('l-sd').value=laborSettings.startDate;
  initITrows();
  initNProws();
  buildLaborRobotSel();
  const now=new Date();
  const dow=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));
  techCalWeekOffset=0;
  rendAll();
  go('dash');
}

