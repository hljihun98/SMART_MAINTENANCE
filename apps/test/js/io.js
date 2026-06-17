/* ===== io.js : 입출고 모달(submitIO 등) + 입출고 인증사진 ===== */
/* (원본 robot_inventory__44_.html 2577-2659 줄을 그대로 분리) */
// ════════════════════════════════════════
// IO MODAL
// ════════════════════════════════════════
function filtBOMSel(dir){
  const robot=document.getElementById(dir+'-robot').value;
  const parts=robot?bom.filter(b=>b.robot===robot):bom;
  const sel=document.getElementById(dir+'-part');
  sel.innerHTML='<option value="">부품 선택</option>'+parts.map(b=>`<option value="${b.partNo}">${b.name} (${b.partNo})</option>`).join('');
  sel.onchange=function(){const b2=bom.find(x=>x.partNo===this.value);if(b2){document.getElementById(dir+'-unit').value=b2.unit;document.getElementById(dir+'-bc').value=b2.partNo;}};
}

function normPN(s){return s.replace(/-/g,'').toUpperCase();}
function findBomByPN(code){
  const c=code.trim();
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
  const qty=parseInt(document.getElementById(dir+'-qty').value);
  const memo=document.getElementById(dir+'-memo').value.trim();
  const unit=document.getElementById(dir+'-unit').value||'EA';
  let robot=document.getElementById(dir+'-robot').value;
  if(!pn||!qty||qty<1){toast('⚠️','Part Number와 수량을 입력하세요','wa');return;}

  // 이상 여부 (입고 시)
  const statusEl=dir==='in'?document.querySelector('input[name="in-status"]:checked'):null;
  const status=statusEl?statusEl.value:'정상';
  const issue=dir==='in'?(document.getElementById('in-issue')?.value.trim()||''):'';

  let b2=findBomByPN(pn);
  if(!b2){
    if(dir==='out'){toast('❌','존재하지 않는 Part Number입니다','err');return;}
    if(!robot){toast('⚠️','신규 부품 등록을 위해 로봇을 선택하세요','wa');return;}
    b2={partNo:pn,name:pn,robot,unit,stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A'};
    bom.push(b2);
    toast('ℹ️',`신규 부품 (${pn}) BOM에 등록됨`,'ok');
  }
  if(dir==='out'&&b2.stock<qty){toast('❌',`재고 부족: ${b2.stock}${b2.unit}만 가능`,'err');return;}
  if(status!=='정상'&&dir==='in'){
    if(!confirm(`이상 여부: "${status}"\n${issue||'내용 없음'}\n\n계속 등록하시겠습니까?`))return;
  }
  b2.stock+=dir==='in'?qty:-qty;
  robot=b2.robot;
  const memoFull=[memo,status!=='정상'?`[${status}] ${issue}`:null].filter(Boolean).join(' | ');
  ioLogs.push({ts:Date.now(),type:dir.toUpperCase(),robot:b2.robot,partNo:b2.partNo,partName:b2.name,qty,unit:b2.unit,memo:memoFull||memo,status,issue,userId:CU.id,userName:CU.name,photos:dir==='in'?[...pendPh]:[]});
  logActivity(CU.id,CU.name,dir.toUpperCase(),`${b2.name}(${b2.partNo}) ${dir==='in'?'입고':'출고'} ${qty}${b2.unit}${status!=='정상'?' ['+status+']':''}${memo?' — '+memo:''}`);
  closeMo('mo-in');closeMo('mo-out');pendPh=[];rendAll();
  toast(dir==='in'?'✅':'📦',`${b2.name} ${dir==='in'?'입고':'출고'} ${qty}${b2.unit}${status!=='정상'?' ⚠️'+status:''} 완료`,'ok');
}

// ════════════════════════════════════════
// PHOTOS
// ════════════════════════════════════════
function addPh(e){
  Array.from(e.target.files).slice(0,6-pendPh.length).forEach(f=>{
    const r=new FileReader();r.onload=ev=>{pendPh.push(ev.target.result);rendPg();};r.readAsDataURL(f);
  });
  e.target.value='';
}
function rendPg(){
  const g=document.getElementById('in-pg2');if(!g)return;
  g.innerHTML=pendPh.map((p,i)=>`<div class="pw"><img src="${p}" onclick="openLB('${p}')"><button class="pd" onclick="pendPh.splice(${i},1);rendPg()">✕</button></div>`).join('')
    +(pendPh.length<6?`<div class="pa" onclick="document.getElementById('in-pfi').click()"><span style="font-size:18px">📷</span><span>추가</span></div>`:'');
}
function openLB(src){document.getElementById('li').src=src;document.getElementById('lb').classList.add('open');}
function closeLB(){document.getElementById('lb').classList.remove('open');}

