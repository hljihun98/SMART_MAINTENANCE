/* ===== profile.js : 내 계정 모달 / 비밀번호 변경 / 본인 활동 로그 ===== */

function escHtml(v){
  return String(v ?? '').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function roleLabel(role){
  return role==='admin'?'관리자':'일반 사용자';
}

function openProfile(){
  if(!CU)return;
  const user=getUser(CU.id);
  document.getElementById('pf-av').textContent=CU.name?CU.name[0]:CU.id.slice(-2);
  document.getElementById('pf-id').textContent=CU.id;
  document.getElementById('pf-name').textContent=CU.name||'-';
  document.getElementById('pf-role').textContent=roleLabel(CU.role);
  ['pf-pw-current','pf-pw-new','pf-pw-confirm'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const inqBtn=document.getElementById('pf-inq-btn');
  if(inqBtn)inqBtn.style.display=CU.role==='admin'?'none':'inline-flex';
  renderProfileLog();
  openMo('mo-profile');
}

function renderProfileLog(){
  const box=document.getElementById('pf-log');
  if(!box||!CU)return;
  const logs=activityLog.filter(a=>a.userId===CU.id).slice(0,40);
  if(!logs.length){
    box.innerHTML='<div class="profile-empty">활동 로그가 없습니다.</div>';
    return;
  }
  box.innerHTML=logs.map(a=>`
    <div class="profile-log-row">
      <div class="profile-log-top">
        <span class="profile-log-type">${escHtml(a.type)}</span>
        <span class="profile-log-time">${escHtml(fd(a.ts))}</span>
      </div>
      <div class="profile-log-detail">${escHtml(a.detail)}</div>
    </div>
  `).join('');
}

function submitProfilePw(){
  if(!CU)return;
  const cur=document.getElementById('pf-pw-current').value;
  const next=document.getElementById('pf-pw-new').value;
  const confirm=document.getElementById('pf-pw-confirm').value;
  const user=getUser(CU.id);
  if(!cur||!next||!confirm){toast('⚠️','비밀번호 항목을 모두 입력하세요','wa');return;}
  if(!user||user.pw!==cur){toast('❌','현재 비밀번호가 올바르지 않습니다','err');return;}
  if(next.length<4){toast('⚠️','새 비밀번호는 4자 이상 입력하세요','wa');return;}
  if(next!==confirm){toast('⚠️','새 비밀번호 확인이 일치하지 않습니다','wa');return;}
  updateUser(CU.id,{pw:next});
  CU.pw=next;
  logActivity(CU.id,CU.name,'ACCOUNT','본인 비밀번호 변경');
  if(typeof saveState==='function')saveState();
  ['pf-pw-current','pf-pw-new','pf-pw-confirm'].forEach(id=>document.getElementById(id).value='');
  renderProfileLog();
  toast('✅','비밀번호가 변경되었습니다','ok');
}
