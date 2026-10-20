/* ===== modal-helpers.js : 모달 열기/닫기 공통(openMo·closeMo) ===== */
/* (원본 robot_inventory__44_.html 4573-4617 줄을 그대로 분리) */
// ════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════
function openMo(id){
  document.getElementById(id)&&document.getElementById(id).classList.add('open');
  if(id==='mo-add-changelog'){
    // 오늘 날짜(로컬) 자동 입력, 버전은 최신+0.1 제안
    const today=localDateStr();
    document.getElementById('cl-date').value=today;
    document.getElementById('cl-ver').value=nextChangelogVersion();
    document.getElementById('cl-body').value='';
    document.getElementById('cl-author').value=CU?.name||'사용자';
  }
  if(id==='mo-in'){
    discardPendPh();filtBOMSel('in');
    ['in-bc','in-qty','in-memo'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('in-unit').value='';
    const okRad=document.getElementById('in-status-ok');if(okRad)okRad.checked=true;
    const wrap=document.getElementById('in-issue-wrap');if(wrap)wrap.style.display='none';
    const issueEl=document.getElementById('in-issue');if(issueEl)issueEl.value='';
  }
  if(id==='mo-out'){filtBOMSel('out');['out-bc','out-qty','out-memo'].forEach(x=>document.getElementById(x).value='');document.getElementById('out-unit').value='';}
  if(id==='mo-addlabor') updModuleSel();
  // 실제 공수 기록: 열 때 선택된 로봇 기준으로 모듈·작업 목록과 계획 시간을 채움
  if(id==='mo-actual') updActualModSel();
  if(id==='mo-tech-book'||id==='mo-delay'){
    populateTechSels();
    if(id==='mo-tech-book'){
      document.getElementById('techbook-edit-id').value='';
      document.getElementById('techbook-title').textContent='작업 예약 등록';
      const tbDate=document.getElementById('tb-date');
      if(!tbDate.value)tbDate.value=localDateStr();
      // 드래그 없이 열린 경우(예비 경로): 시간 select 를 슬롯 값으로 기본 채움 (08:00~10:00)
      if(!_pendingBooking){
        tbDate.disabled=false;
        fillSlotSelect(document.getElementById('tb-start'),2);
        fillSlotSelect(document.getElementById('tb-end'),6);
      }
    }
    if(id==='mo-delay'){
      document.getElementById('dl-date').value=localDateStr();
    }
  }
}
function closeMo(id){
  document.getElementById(id)&&document.getElementById(id).classList.remove('open');
  // 드래그 임시 예약 취소 (모달 닫을 때)
  if(id==='mo-tech-book'){
    _pendingBooking=null;
    const tbDate=document.getElementById('tb-date');if(tbDate)tbDate.disabled=false;
  }
  // 입고 모달을 등록 없이 닫으면 첨부했던 사진 정리
  if(id==='mo-in'&&typeof discardPendPh==='function') discardPendPh();
}
