/* ===== bulk-entry.js : 직접입력 표·신규부품 일괄등록 + 이상여부 토글 리스너 ===== */
/* (원본 robot_inventory__44_.html 2698-2890 줄을 그대로 분리) */
// ════════════════════════════════════════
// INLINE TABLE (입출고 직접입력)
// ════════════════════════════════════════
function initITrows(){for(let i=0;i<5;i++)addITrow();}
function addITrow(){
  const tb=document.getElementById('it-tbody');
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><select class="it-sel"><option value="IN">입고</option><option value="OUT">출고</option></select></td>
    <td><input class="it-inp" placeholder="PKMC001 또는 PK-MC-001" oninput="itLookup(this)"></td>
    <td><input class="it-inp" placeholder="자동입력 (없으면 수동)"></td>
    <td><select class="it-sel"><option value="">-</option><option value="PARKIE">PARKIE</option><option value="CARRIE">CARRIE</option><option value="GOALIE">GOALIE</option></select></td>
    <td><input class="it-inp" type="number" placeholder="0" min="1" style="width:70px"></td>
    <td><select class="it-sel" style="width:90px"><option value="정상">✅ 정상</option><option value="확인필요">⚠️ 확인필요</option><option value="이상">❌ 이상</option></select></td>
    <td><input class="it-inp" placeholder="메모"></td>`;
  tb.appendChild(tr);
  tr.querySelectorAll('.it-inp')[0].addEventListener('paste',e=>handleITPaste(e,tr));
}
function itLookup(inp){
  const tr=inp.closest('tr');const pn=inp.value.trim();
  const b2=findBomByPN(pn);
  const nmField=tr.querySelectorAll('.it-inp')[1];
  const rbSel=tr.querySelectorAll('.it-sel')[1];
  if(b2){
    nmField.value=b2.name;nmField.style.color='var(--t2)';
    if(rbSel) rbSel.value=b2.robot;
    tr.style.background='';
  } else if(pn){
    if(nmField.value===''||nmField.style.color==='var(--t2)'){nmField.value='';nmField.style.color='var(--tx)';}
    tr.style.background='var(--gnl)';
  } else {
    tr.style.background='';
  }
  updNewPartPreview();
}

function updNewPartPreview(){
  const tb=document.getElementById('it-tbody');if(!tb)return;
  const preview=document.getElementById('new-part-preview');if(!preview)return;
  const newPNs=[];
  Array.from(tb.querySelectorAll('tr')).forEach(tr=>{
    const pn=tr.querySelectorAll('.it-inp')[0]?.value.trim();
    const nm=tr.querySelectorAll('.it-inp')[1]?.value.trim();
    const rb=tr.querySelectorAll('.it-sel')[1]?.value;
    if(pn&&!bom.find(b=>b.partNo===pn))newPNs.push({pn,nm,rb});
  });
  if(!newPNs.length){
    preview.innerHTML='<div class="t-mu t-sm" style="text-align:center;padding:10px">신규 등록 대상 부품이 없습니다</div>';
    return;
  }
  preview.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px">`+newPNs.map(({pn,nm,rb})=>`
    <div style="display:flex;align-items:center;gap:10px;background:var(--gnl);border:1px solid #A7F3D0;border-radius:8px;padding:10px 14px">
      <span style="font-size:10px;background:var(--gn);color:#fff;padding:2px 6px;border-radius:4px;font-family:var(--fm);font-weight:600">NEW</span>
      <span class="t-m t-sm" style="font-weight:600">${pn}</span>
      <span class="t-sm" style="flex:1">${nm||'부품명 미입력'}</span>
      <span class="rb ${rbc(rb||'PARKIE')}">${rb||'미지정'}</span>
      <button class="btn b-su b-sm" onclick="openNewPartDetail('${pn}','${nm||''}','${rb||'PARKIE'}')">상세 등록</button>
    </div>`).join('')+'</div>';
}

function openNewPartDetail(pn,nm,rb){
  document.getElementById('ap-pn').value=pn;
  document.getElementById('ap-nm').value=nm;
  document.getElementById('ap-rb').value=rb;
  document.getElementById('ap-st').value='0';
  document.getElementById('ap-ms').value='0';
  document.getElementById('ap-pr').value='0';
  openMo('mo-addpart');
}
function handleITPaste(e,startRow){
  e.preventDefault();
  const text=e.clipboardData.getData('text');
  const rows=text.trim().split(/\r?\n/);
  const tb=document.getElementById('it-tbody');
  const allRows=Array.from(tb.querySelectorAll('tr'));
  let si=allRows.indexOf(startRow);
  rows.forEach((row,ri)=>{
    const cells=row.split(/\t/);
    let tr=allRows[si+ri];
    if(!tr){addITrow();tr=tb.querySelectorAll('tr')[si+ri];}
    if(!tr)return;
    const tds=tr.querySelectorAll('td');
    if(cells[0]){const sel=tds[0].querySelector('select');const v=cells[0].trim().toUpperCase();if(v==='IN'||v==='입고')sel.value='IN';else if(v==='OUT'||v==='출고')sel.value='OUT';}
    if(cells[1]){tds[1].querySelector('input').value=cells[1].trim();itLookup(tds[1].querySelector('input'));}
    if(cells[2]){const q=tds[4].querySelector('input');if(q)q.value=cells[2].trim();}
    if(cells[3]){const m=tds[6].querySelector('input');if(m)m.value=cells[3].trim();}
  });
}
function submitIT(){
  const tb=document.getElementById('it-tbody');
  let ok=0,fail=0,skip=0,newParts=0;
  Array.from(tb.querySelectorAll('tr')).forEach(tr=>{
    const tds=tr.querySelectorAll('td');
    const type=tds[0].querySelector('select').value;
    const pn=tds[1].querySelector('input').value.trim();
    const nmVal=tds[2].querySelector('input').value.trim();
    const rbVal=tds[3].querySelector('select').value;
    const qty=parseInt(tds[4].querySelector('input').value);
    const statusVal=tds[5].querySelector('select')?.value||'정상';
    const memo=tds[6].querySelector('input').value.trim();
    if(!pn||!qty||isNaN(qty)){skip++;return;}
    let b2=findBomByPN(pn);
    if(!b2){
      if(type==='OUT'){fail++;return;}
      if(!nmVal||!rbVal){fail++;return;}
      b2={partNo:pn,name:nmVal,robot:rbVal,unit:'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A'};
      bom.push(b2);newParts++;
    }
    if(type==='OUT'&&b2.stock<qty){fail++;return;}
    b2.stock+=type==='IN'?qty:-qty;
    const mFull=[memo,statusVal!=='정상'?'['+statusVal+']':null].filter(Boolean).join(' ');
    ioLogs.push({ts:Date.now(),type,robot:b2.robot,partNo:b2.partNo,partName:b2.name,qty,unit:b2.unit,memo:mFull||'직접입력',status:statusVal,userId:CU.id,userName:CU.name,photos:[]});
    ok++;
  });
  rendAll();
  toast('✅',`${ok}건 반영${newParts?` (신규 ${newParts}건)`:''}${fail?` / ${fail}건 실패`:''}`,'ok');
}
function clearIT(){document.getElementById('it-tbody').innerHTML='';for(let i=0;i<5;i++)addITrow();}

// ════════════════════════════════════════
// NEWPART BULK TABLE
// ════════════════════════════════════════
function initNProws(){for(let i=0;i<3;i++)addNProw();}
function addNProw(){
  const tb=document.getElementById('newpart-tbody');if(!tb)return;
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input class="it-inp" placeholder="PK-XX-001"></td>
    <td><input class="it-inp" placeholder="부품명"></td>
    <td><select class="it-sel"><option value="PARKIE">PARKIE</option><option value="CARRIE">CARRIE</option><option value="GOALIE">GOALIE</option></select></td>
    <td><input class="it-inp" placeholder="EA" style="width:60px"></td>
    <td><select class="it-sel" style="width:60px">${[0,1,2,3,4,5,6].map(l=>`<option value="${l}">${l}</option>`).join('')}</select></td>
    <td><input class="it-inp" type="number" placeholder="0" style="width:60px"></td>
    <td><input class="it-inp" type="number" placeholder="0"></td>`;
  tb.appendChild(tr);
  tr.querySelectorAll('.it-inp')[0].addEventListener('paste',e=>handleNPpaste(e,tr));
}
function handleNPpaste(e,startRow){
  e.preventDefault();
  const text=e.clipboardData.getData('text');
  const rows=text.trim().split(/\r?\n/);
  const tb=document.getElementById('newpart-tbody');
  const allRows=Array.from(tb.querySelectorAll('tr'));
  let si=allRows.indexOf(startRow);
  rows.forEach((row,ri)=>{
    const cells=row.split(/\t/);
    let tr=allRows[si+ri];
    if(!tr){addNProw();tr=tb.querySelectorAll('tr')[si+ri];}
    if(!tr)return;
    const inps=tr.querySelectorAll('.it-inp');
    const sels=tr.querySelectorAll('.it-sel');
    if(cells[0])inps[0].value=cells[0].trim();
    if(cells[1])inps[1].value=cells[1].trim();
    if(cells[2]){const v=cells[2].trim().toUpperCase();if(['PARKIE','CARRIE','GOALIE'].includes(v))sels[0].value=v;}
    if(cells[3])inps[2].value=cells[3].trim();
    if(cells[4]){const lv=parseInt(cells[4]);if(lv>=0&&lv<=6)sels[1].value=lv;}
    if(cells[5])inps[3].value=cells[5].trim();
    if(cells[6])inps[4].value=cells[6].trim();
  });
}
function submitNP(){
  const tb=document.getElementById('newpart-tbody');if(!tb)return;
  let ok=0,skip=0,dup=0;
  Array.from(tb.querySelectorAll('tr')).forEach(tr=>{
    const inps=tr.querySelectorAll('.it-inp');
    const sels=tr.querySelectorAll('.it-sel');
    const pn=inps[0]?.value.trim();
    const nm=inps[1]?.value.trim();
    const rb=sels[0]?.value||'PARKIE';
    const unit=inps[2]?.value.trim()||'EA';
    const lv=parseInt(sels[1]?.value)||0;
    const ms=parseInt(inps[3]?.value)||0;
    const pr=parseInt(inps[4]?.value)||0;
    if(!pn||!nm){skip++;return;}
    if(bom.find(b=>b.partNo===pn)){dup++;return;}
    bom.push({partNo:pn,name:nm,robot:rb,unit,stock:0,minStock:ms,price:pr,imgs:[],perUnit:1,spec:'',level:lv,rev:'A'});
    ok++;
  });
  rendBOM();rendDash();
  toast('✅',`${ok}건 BOM 등록${dup?' (중복 '+dup+'건)':''}${skip?' (빈칸 '+skip+'건)':''}`,'ok');
}

// ════════════════════════════════════════
// 이상여부 toggle
// ════════════════════════════════════════
document.addEventListener('change',function(e){
  if(e.target&&e.target.name==='in-status'){
    const isIssue=e.target.value!=='정상';
    const wrap=document.getElementById('in-issue-wrap');
    if(wrap)wrap.style.display=isIssue?'block':'none';
  }
});

