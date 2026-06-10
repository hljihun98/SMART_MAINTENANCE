/* ===== navigation.js : 페이지 전환·관리자 접근차단(go) ===== */
/* (원본 robot_inventory__44_.html 1803-1830 줄을 그대로 분리) */
// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
function go(pg,el){
  // ── 관리자 전용 페이지 접근 차단 ──────────────────────
  if(pg==='admin' && CU.role!=='admin'){
    toast('🔒','관리자만 접근할 수 있습니다','err');
    return;
  }

  // ── 페이지 전환 ────────────────────────────────────────
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('act'));
  const p=document.getElementById('pg-'+pg);
  if(p) p.classList.add('act');
  if(el) el.classList.add('act');
  else document.querySelectorAll('.ni').forEach(n=>{ if(n.dataset&&n.dataset.pg===pg) n.classList.add('act'); });

  // ── 페이지별 렌더 함수 호출 ────────────────────────────
  if(pg==='changelog') rendChangelog();
  if(pg==='bom')   rendBOM();
  if(pg==='logs')  rendLogs();
  if(pg==='labor'){ syncLS(); rendLabor(); }
  if(pg==='tech')  rendTechPage();
  if(pg==='admin'){ rendAdmin(); rendInqAdmin(); rendActivityLog(); }
  if(pg.startsWith('r-')) rendRobotDetail(pg.replace('r-','').toUpperCase());
}

