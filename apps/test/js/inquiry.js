/* ===== inquiry.js : 사용자 문의/답변 ===== */
/* (원본 robot_inventory__44_.html 4536-4572 줄을 그대로 분리) */
// ════════════════════════════════════════
// INQUIRY
// ════════════════════════════════════════
function submitInq(){
  const type=document.getElementById('inq-type').value;
  const title=document.getElementById('inq-title').value.trim();
  const body=document.getElementById('inq-body').value.trim();
  if(!title||!body){toast('⚠️','제목과 내용을 입력하세요','wa');return;}
  inquiries.push({id:Date.now(),from:CU.id,fromName:CU.name,type,title,body,ts:Date.now(),reply:null,status:'new'});
  closeMo('mo-inq');updateInqDots();toast('✅','문의가 전송되었습니다','ok');
}
function rendInqAdmin(){
  const cont=document.getElementById('inq-admin-list');
  if(!inquiries.length){cont.innerHTML='<div class="t-mu t-sm" style="text-align:center;padding:12px">문의가 없습니다</div>';return;}
  cont.innerHTML=inquiries.map((q,i)=>`<div class="inq-item">
    <div class="inq-head">
      <div class="inq-from"><span class="inq-badge ${q.type==='수정요청'?'ib-new':'ib-done'}">${q.type}</span>${q.fromName} <span class="t-m t-sm">(${q.from})</span> — ${q.title}</div>
      <div style="display:flex;gap:7px;align-items:center"><span class="inq-badge ${q.status==='new'?'ib-new':'ib-done'}">${q.status==='new'?'미답변':'답변완료'}</span><span class="inq-time">${fd(q.ts)}</span></div>
    </div>
    <div class="t-mu t-sm" style="line-height:1.6">${q.body}</div>
    ${q.reply?`<div class="inq-reply">💬 <b>답변:</b> ${q.reply}</div>`:''}
    ${q.status==='new'?`<div style="margin-top:7px"><button class="btn b-pr b-sm" onclick="openReply(${i})">답변 작성</button></div>`:''}
  </div>`).join('');
}
function openReply(i){document.getElementById('reply-idx').value=i;document.getElementById('reply-sub').textContent=inquiries[i].title;document.getElementById('reply-body').value='';openMo('mo-reply');}
function submitReply(){
  const i=parseInt(document.getElementById('reply-idx').value);
  const body=document.getElementById('reply-body').value.trim();
  if(!body){toast('⚠️','답변 내용을 입력하세요','wa');return;}
  inquiries[i].reply=body;inquiries[i].status='done';
  closeMo('mo-reply');rendInqAdmin();updateInqDots();toast('✅','답변이 전송되었습니다','ok');
}
function updateInqDots(){
  const hasNew=inquiries.some(q=>q.status==='new');
  ['inq-dot','inq-dot2'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=hasNew?'inline-block':'none';});
}

