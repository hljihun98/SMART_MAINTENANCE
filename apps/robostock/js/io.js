/* ===== io.js : 입출고 모달(submitIO 등) + 입출고 인증사진 ===== */
/* (원본 robot_inventory__44_.html 2577-2659 줄을 그대로 분리) */
// ════════════════════════════════════════
// IO MODAL
// ════════════════════════════════════════
function filtBOMSel(dir){
  const robot=document.getElementById(dir+'-robot').value;
  const parts=robot?bom.filter(b=>b.robot===robot):bom;
  const sel=document.getElementById(dir+'-part');
  sel.innerHTML='<option value="">부품 선택</option>'+parts.map(b=>`<option value="${escHtml(b.partNo)}">${escHtml(b.name)} (${escHtml(b.partNo)})</option>`).join('');
  sel.onchange=function(){const b2=bom.find(x=>x.partNo===this.value);if(b2){document.getElementById(dir+'-unit').value=b2.unit;document.getElementById(dir+'-bc').value=b2.partNo;}};
}

function normPN(s){return String(s ?? '').replace(/-/g,'').toUpperCase();}
function findBomByPN(code){
  const c=String(code ?? '').trim();
  if(!c)return undefined;
  return bom.find(x=>x.partNo===c)||bom.find(x=>normPN(x.partNo)===normPN(c));
}

function lookupPN(dir,code){
  const b2=findBomByPN(code);
  if(b2){
    document.getElementById(dir+'-robot').value=b2.robot;
    filtBOMSel(dir);
    document.getElementById(dir+'-part').value=b2.partNo;
    document.getElementById(dir+'-unit').value=b2.unit;
  }
}

function quickIO(type,pn){
  if(type==='in'){openMo('mo-in');setTimeout(()=>{document.getElementById('in-bc').value=pn;lookupPN('in',pn);},50);}
  else{openMo('mo-out');setTimeout(()=>{document.getElementById('out-bc').value=pn;lookupPN('out',pn);},50);}
}

function submitIO(dir){
  const pn=(document.getElementById(dir+'-bc').value.trim()||document.getElementById(dir+'-part').value);
  const qty=parsePosInt(document.getElementById(dir+'-qty').value);
  const memo=document.getElementById(dir+'-memo').value.trim();
  const unit=document.getElementById(dir+'-unit').value||'EA';
  let robot=normRobot(document.getElementById(dir+'-robot').value);
  if(!pn||!qty){toast('⚠️','Part Number와 수량(1 이상의 정수)을 입력하세요','wa');return;}
  if(dir==='in'&&pendPhBusy>0){toast('⏳','사진을 처리 중입니다. 잠시 후 다시 등록하세요.','wa');return;}

  // 이상 여부 (입고 시)
  const statusEl=dir==='in'?document.querySelector('input[name="in-status"]:checked'):null;
  const status=statusEl?statusEl.value:'정상';
  const issue=dir==='in'?(document.getElementById('in-issue')?.value.trim()||''):'';

  let b2=findBomByPN(pn);
  let isNewPart=false;
  if(!b2){
    if(dir==='out'){toast('❌','존재하지 않는 Part Number입니다','err');return;}
    if(!robot){toast('⚠️','신규 부품 등록을 위해 로봇을 선택하세요','wa');return;}
    b2={partNo:pn,name:pn,robot,unit,stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A',parentPartNo:''};
    bom.push(b2);
    isNewPart=true;
  }
  if(dir==='out'&&!(b2.stock>=qty)){toast('❌',`재고 부족: ${b2.stock}${b2.unit}만 가능`,'err');return;}
  if(status!=='정상'&&dir==='in'){
    if(!confirm(`이상 여부: "${status}"\n${issue||'내용 없음'}\n\n계속 등록하시겠습니까?`)){
      if(isNewPart){const k=bom.indexOf(b2);if(k>=0)bom.splice(k,1);}   // 취소 시 방금 만든 신규 부품도 되돌림
      return;
    }
  }
  b2.stock+=dir==='in'?qty:-qty;
  robot=b2.robot;
  const memoFull=[memo,status!=='정상'?`[${status}] ${issue}`:null].filter(Boolean).join(' | ');
  ioLogs.push({ts:Date.now(),type:dir.toUpperCase(),robot:b2.robot,partNo:b2.partNo,partName:b2.name,qty,unit:b2.unit,memo:memoFull||memo,status,issue,userId:CU.id,userName:CU.name,photos:dir==='in'?[...pendPh]:[]});
  logActivity(CU.id,CU.name,dir.toUpperCase(),`${b2.name}(${b2.partNo}) ${dir==='in'?'입고':'출고'} ${qty}${b2.unit}${status!=='정상'?' ['+status+']':''}${memo?' — '+memo:''}`);
  if(dir==='in')pendPh=[];   // 등록된 사진은 ioLogs 가 참조 → 삭제하지 않고 목록만 비움
  closeMo('mo-in');closeMo('mo-out');rendAll();
  toast(dir==='in'?'✅':'📦',`${isNewPart?'[신규 부품 등록] ':''}${b2.name} ${dir==='in'?'입고':'출고'} ${qty}${b2.unit}${status!=='정상'?' ⚠️'+status:''} 완료`,'ok');
}

// ════════════════════════════════════════
// PHOTOS
// ════════════════════════════════════════
// 입고 인증사진: 리사이즈 후 IndexedDB 저장, pendPh 에는 참조(id)만 보관 (images.js)
let pendPhBusy=0;   // 처리 중인 사진 수 (처리 중 등록 방지)
const PEND_PH_MAX=6;
function addPh(e){
  const files=Array.from(e.target.files||[]);
  e.target.value='';
  const room=PEND_PH_MAX-pendPh.length-pendPhBusy;
  if(room<=0){toast('⚠️',`사진은 최대 ${PEND_PH_MAX}장까지 첨부할 수 있습니다`,'wa');return;}
  const pick=files.slice(0,room);
  pendPhBusy+=pick.length;rendPg();
  ImgStore.addFiles(pick).then(refs=>{
    pendPhBusy=Math.max(0,pendPhBusy-pick.length);
    refs.forEach(r=>pendPh.push(r));
    rendPg();
  });
}
function removePendPh(i){
  const removed=pendPh.splice(i,1);
  // 아직 입출고에 등록되지 않은 사진이므로 저장소에서도 삭제 (다른 기록이 쓰는 참조는 남김 — persistence.js)
  if(typeof releaseImageRefs==='function')releaseImageRefs(removed);
  rendPg();
}
// 입고 모달을 새로 열 때: 등록하지 않고 남은 첨부 사진 정리
function discardPendPh(){
  if(pendPh.length){const removed=pendPh.splice(0);if(typeof releaseImageRefs==='function')releaseImageRefs(removed);}
  rendPg();
}
function rendPg(){
  const g=document.getElementById('in-pg2');if(!g)return;
  g.innerHTML=pendPh.map((p,i)=>`<div class="pw"><img ${imgAttrs(p)} onclick="openLBFromImg(this)"><button class="pd" onclick="removePendPh(${i})">✕</button></div>`).join('')
    +(pendPhBusy?`<div class="pa" style="cursor:default"><span style="font-size:18px">⏳</span><span>처리 중</span></div>`:'')
    +(pendPh.length+pendPhBusy<PEND_PH_MAX?`<div class="pa" onclick="document.getElementById('in-pfi').click()"><span style="font-size:18px">📷</span><span>추가</span></div>`:'');
}
// 라이트박스: 이미지 참조(id) 또는 data URL
function openLB(ref){
  const li=document.getElementById('li');
  li.removeAttribute('src');
  document.getElementById('lb').classList.add('open');
  ImgStore.get(ref).then(url=>{if(url)li.src=url;});
}
function openLBFromImg(img){
  if(!img)return;
  openLB(img.dataset.imgRef||img.getAttribute('src'));
}
function closeLB(){document.getElementById('lb').classList.remove('open');}

