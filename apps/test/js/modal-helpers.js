/* ===== modal-helpers.js : 모달 열기/닫기 공통(openMo·closeMo) ===== */
/* (원본 robot_inventory__44_.html 4573-4617 줄을 그대로 분리) */
// ════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════
function openMo(id){
  document.getElementById(id)&&document.getElementById(id).classList.add('open');
  if(id==='mo-add-changelog'){
    // 오늘 날짜 자동 입력, 버전은 최신+0.1 제안
    const today=new Date().toISOString().slice(0,10);
    document.getElementById('cl-date').value=today;
    const latest=[...changelogData].sort((a,b)=>b.ver.localeCompare(a.ver))[0];
    const nextVer=latest?'v'+((parseFloat(latest.ver.replace('v',''))||4.8)+0.1).toFixed(1):'v4.9';
    document.getElementById('cl-ver').value=nextVer;
    document.getElementById('cl-body').value='';
    document.getElementById('cl-author').value=CU?.name||'사용자';
  }
  if(id==='mo-in'){
    pendPh=[];rendPg();filtBOMSel('in');
    ['in-bc','in-qty','in-memo'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('in-unit').value='';
    const okRad=document.getElementById('in-status-ok');if(okRad)okRad.checked=true;
    const wrap=document.getElementById('in-issue-wrap');if(wrap)wrap.style.display='none';
    const issueEl=document.getElementById('in-issue');if(issueEl)issueEl.value='';
  }
  if(id==='mo-out'){filtBOMSel('out');['out-bc','out-qty','out-memo'].forEach(x=>document.getElementById(x).value='');document.getElementById('out-unit').value='';}
  if(id==='mo-addlabor') updModuleSel();
  if(id==='mo-tech-book'||id==='mo-delay'){
    populateTechSels();
    if(id==='mo-tech-book'){
      document.getElementById('techbook-edit-id').value='';
      document.getElementById('techbook-title').textContent='작업 예약 등록';
      const today=new Date().toISOString().slice(0,10);
      if(!document.getElementById('tb-date').value)document.getElementById('tb-date').value=today;
    }
    if(id==='mo-delay'){
      const today=new Date().toISOString().slice(0,10);
      document.getElementById('dl-date').value=today;
    }
  }
}
function closeMo(id){
  document.getElementById(id)&&document.getElementById(id).classList.remove('open');
  // 드래그 임시 예약 취소 (모달 닫을 때)
  if(id==='mo-tech-book') _pendingBooking=null;
}

