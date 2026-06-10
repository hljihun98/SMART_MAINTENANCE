/* ===== labor.js : 공수 산정(모듈·계획vs실제·역산 계산) ===== */
/* (원본 robot_inventory__44_.html 3893-4235 줄을 그대로 분리) */
// ════════════════════════════════════════
// LABOR (공수산정)
// ════════════════════════════════════════
function syncLS(){
  laborSettings.hpd=parseInt(document.getElementById('l-hpd').value)||8;
  laborSettings.wk=parseInt(document.getElementById('l-wk').value)||3;
  laborSettings.startDate=document.getElementById('l-sd').value;
}
function recalcLabor(){syncLS();rendLabor();rendDash();}

function buildLaborRobotSel(){
  const cont=document.getElementById('lb-robot-sel');
  if(!cont)return;
  const robots=['PARKIE','CARRIE','GOALIE'];
  // 로봇별 고유 색상 — 파란색 일색 탈피
  const rColor={
    PARKIE:{act:'background:var(--pk);color:#fff;border-color:var(--pk)',idle:'background:var(--pkl);color:var(--pk);border-color:var(--pk)'},
    CARRIE:{act:'background:var(--ca);color:#fff;border-color:var(--ca)',idle:'background:var(--cal);color:var(--ca);border-color:var(--ca)'},
    GOALIE:{act:'background:var(--go);color:#fff;border-color:var(--go)',idle:'background:var(--gol);color:var(--go);border-color:var(--go)'},
  };
  cont.innerHTML=robots.map(r=>{
    const isActive=r===activeLaborRobot;
    const style=isActive?rColor[r].act:rColor[r].idle;
    return`<button id="lbrbtn-${r}" onclick="setLaborRobot('${r}')"
      style="${style};border:1.5px solid;border-radius:8px;padding:7px 20px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;font-family:var(--fn)">${r}</button>`;
  }).join('');
}

function setLaborRobot(r){
  activeLaborRobot=r;
  buildLaborRobotSel();
  rendLaborModules();
}

function rendLabor(){
  syncLS();
  buildLaborRobotSel();
  rendLaborModules();
  rendLaborSummary();
  // 달력 로봇/호기 선택 UI 초기화
  if(document.getElementById('asc-units')) rendAsmUnitBtns();
}

function rendLaborModules(){
  const r=activeLaborRobot;
  const modules=laborModules[r];
  const hpd=laborSettings.hpd,wk=laborSettings.wk;
  const sd=laborSettings.startDate?new Date(laborSettings.startDate):new Date();
  const clr={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'}[r];

  document.getElementById('lb-modules').innerHTML=modules.map((mod,mi)=>{
    const taskRows=mod.tasks.map((t,ti)=>`
      <div class="lb-task-row" id="ltr-${r}-${mi}-${ti}" ondblclick="toggleLaborEdit('${r}',${mi},${ti})">
        <div class="lt-left">
          <div class="lt-name">${t.name}</div>
          ${t.note?`<div class="lt-note">${t.note}</div>`:''}
        </div>
        <div class="lt-right">
          <span class="lt-h">${t.hours}h</span>
          <span class="lt-w">${t.workers}인</span>
          <button onclick="event.stopPropagation();delLaborTask('${r}',${mi},${ti})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;padding:2px 4px" title="삭제">✕</button>
        </div>
      </div>
      <div class="lt-edit-panel" id="lep-${r}-${mi}-${ti}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input class="lt-ei" placeholder="작업명" value="${t.name}" oninput="laborModules['${r}'][${mi}].tasks[${ti}].name=this.value;document.getElementById('ltr-${r}-${mi}-${ti}').querySelector('.lt-name').textContent=this.value;rendLaborSummary()">
          <div style="display:flex;gap:6px"><input class="lt-ei lt-ei-sm" type="number" placeholder="h" value="${t.hours}" step="0.5" min="0.5" oninput="laborModules['${r}'][${mi}].tasks[${ti}].hours=parseFloat(this.value)||0;recalcLabor()"><input class="lt-ei lt-ei-sm" type="number" placeholder="인원" value="${t.workers}" min="1" oninput="laborModules['${r}'][${mi}].tasks[${ti}].workers=parseInt(this.value)||1;recalcLabor()"></div>
        </div>
        <textarea class="lt-ei" placeholder="메모 (작업 상세, 주의사항 등)" style="min-height:52px;resize:vertical" oninput="laborModules['${r}'][${mi}].tasks[${ti}].note=this.value;rendLaborModules()">${t.note||''}</textarea>
        <div style="text-align:right"><button class="btn b-se b-sm" onclick="toggleLaborEdit('${r}',${mi},${ti})">닫기</button></div>
      </div>`).join('');
    const modTotal=mod.tasks.reduce((a,t)=>a+t.hours,0);
    return`<div class="lb-module">
      <div class="lb-mod-head">
        <div class="lb-mod-title" style="color:${clr};display:flex;align-items:center;gap:8px">
          <div style="display:flex;flex-direction:column;gap:2px">
            <button onclick="moveModule('${r}',${mi},-1)" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:10px;padding:0 3px;line-height:1" title="위로">▲</button>
            <button onclick="moveModule('${r}',${mi},1)" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:10px;padding:0 3px;line-height:1" title="아래로">▼</button>
          </div>
          <span id="mname-${r}-${mi}" ondblclick="startRenameModule('${r}',${mi})" style="cursor:pointer" title="더블클릭으로 이름 변경">${mod.name}</span>
          <span class="t-sm t-mu" style="font-weight:400">(${mod.tasks.length}개 작업)</span>
        </div>
        <div class="bg">
          <span class="lb-mod-title" style="color:var(--ac)">${modTotal}h</span>
          <button class="btn b-se b-sm" onclick="delModule('${r}',${mi})">모듈 삭제</button>
        </div>
      </div>
      ${taskRows}
      <div class="lb-total"><span class="lb-total-l">모듈 소계</span><span class="lb-total-v">${modTotal}h</span></div>
    </div>`;
  }).join('')||`<div class="t-mu t-sm" style="text-align:center;padding:20px">작업 항목이 없습니다. "+ 작업 항목" 버튼으로 추가하세요.</div>`;
}

function toggleLaborEdit(r,mi,ti){
  const ep=document.getElementById(`lep-${r}-${mi}-${ti}`);
  ep.classList.toggle('open');
}

function delLaborTask(r,mi,ti){
  laborModules[r][mi].tasks.splice(ti,1);
  recalcLabor();
}
function delModule(r,mi){
  if(!confirm('이 모듈을 삭제하시겠습니까?'))return;
  laborModules[r].splice(mi,1);
  recalcLabor();
}

function moveModule(r,mi,dir){
  const arr=laborModules[r];
  const ni=mi+dir;
  if(ni<0||ni>=arr.length)return;
  [arr[mi],arr[ni]]=[arr[ni],arr[mi]];
  recalcLabor();
}

function startRenameModule(r,mi){
  const span=document.getElementById(`mname-${r}-${mi}`);
  if(!span)return;
  const cur=laborModules[r][mi].name;
  const inp=document.createElement('input');
  inp.value=cur;inp.style.cssText='background:#fff;border:1.5px solid var(--ac);border-radius:5px;padding:2px 7px;font-size:13px;font-family:var(--fn);outline:none;width:160px';
  inp.onblur=inp.onkeydown=function(e){if(e.type==='keydown'&&e.key!=='Enter'&&e.key!=='Escape')return;if(e.key==='Escape'){rendLaborModules();return;}const v=inp.value.trim();if(v)laborModules[r][mi].name=v;rendLaborModules();};
  span.replaceWith(inp);inp.focus();inp.select();
}

function rendLaborSummary(){
  // ── 호기별 조립 완료 예상 테이블 ──────────────────────
  // asmEntries(납기역산 달력에서 확정한 호기 범위)를 기반으로 표시
  // robotGoals(목표 대수 설정)가 아닌 asmEntries.from~to 를 사용
  const robots=['PARKIE','CARRIE','GOALIE'];
  const hpd=laborSettings.hpd,wk=laborSettings.wk;
  const sd=laborSettings.startDate?new Date(laborSettings.startDate):new Date();
  const doneMap={
    PARKIE:parseInt(document.getElementById('lb-done-pk')?.value)||0,
    CARRIE:parseInt(document.getElementById('lb-done-ca')?.value)||0,
    GOALIE:parseInt(document.getElementById('lb-done-go')?.value)||0
  };
  const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const unitCont=document.getElementById('lb-unit-tables');
  if(!unitCont)return;

  let allUnits=[];
  robots.forEach(r=>{
    const total=laborModules[r].flatMap(m=>m.tasks).reduce((a,t)=>a+t.hours,0);
    const dpu=total>0?Math.ceil(total/(hpd*wk)):0;
    // asmEntries 우선 사용, 없으면 robotGoals fallback
    const ae=asmEntries[r];
    const fromU=ae&&ae.from?ae.from:1;
    const toU=ae&&ae.to?ae.to:(robotGoals[r]||0);
    if(!toU)return; // 설정 없으면 skip
    const done=Math.min(doneMap[r],toU);
    for(let u=fromU;u<=toU;u++){
      const isDone=u<=done;
      const seq=u-fromU;
      let startDate=null,endDate=null;
      if(!isDone&&dpu>0){
        startDate=addWD(sd,dpu*seq);
        endDate=addWD(sd,dpu*(seq+1));
      }
      allUnits.push({robot:r,unit:u,dpu,isDone,startDate,endDate,total});
    }
  });

  if(!allUnits.length){
    unitCont.innerHTML=`<div style="text-align:center;padding:24px;color:var(--t2);font-size:13px">
      호기 범위가 설정되지 않았습니다.<br>
      <span style="font-size:12px">공수산정 달력 → 호기 등록에서 로봇별 제작 호기를 입력하세요.</span>
    </div>`;
    rendAsmCalendar();return;
  }

  allUnits.sort((a,b)=>{
    if(a.isDone&&!b.isDone)return -1;if(!a.isDone&&b.isDone)return 1;
    if(!a.endDate||!b.endDate)return 0;
    return a.endDate-b.endDate;
  });

  const rows=allUnits.map(u=>{
    const rclr=cmap[u.robot];
    const sStr=u.isDone?'-':u.startDate?u.startDate.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'-';
    const eStr=u.isDone?'조립 완료':u.endDate?u.endDate.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'-';
    const accH=actualRecords.filter(a=>a.robot===u.robot).reduce((s,a)=>s+a.actualH,0);
    const planH2=actualRecords.filter(a=>a.robot===u.robot).reduce((s,a)=>s+a.planH,0);
    const eff=planH2>0?`${Math.round((planH2/accH)*100)}%`:'-';
    return`<tr style="${u.isDone?'opacity:.6':''}">
      <td><span class="rb ${rbc(u.robot)}">${u.robot}</span></td>
      <td class="t-m t-sm" style="font-weight:700;color:${rclr}">${u.unit}호기</td>
      <td class="t-m t-sm">${sStr}</td>
      <td class="t-m t-sm" style="font-weight:600;color:${u.isDone?'var(--gn)':'var(--ac)'}">${eStr}</td>
      <td class="t-m t-sm">${u.total}h</td>
      <td class="t-sm t-mu">${eff}</td>
      <td><span class="sb2 ${u.isDone?'s-ok':'s-low'}">${u.isDone?'완료':'예정'}</span></td>
    </tr>`;
  }).join('');

  const th=k=>`<th style="padding:8px 14px;text-align:left;font-size:10px;color:var(--t2);letter-spacing:1.2px;text-transform:uppercase;font-family:var(--fm);background:var(--s2);border-bottom:1px solid var(--bd)">${k}</th>`;
  unitCont.innerHTML=`<table style="width:100%;border-collapse:collapse">
    <thead><tr>${['로봇','호기','착수','완료 예상','공수','효율','상태'].map(th).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  rendAsmCalendar();
  rendActualTable();
}

// asmCal vars declared above
function asmCalPrev(){asmCalMonth--;if(asmCalMonth<0){asmCalMonth=11;asmCalYear--;}rendAsmCalendar();}
function asmCalNext(){asmCalMonth++;if(asmCalMonth>11){asmCalMonth=0;asmCalYear++;}rendAsmCalendar();}

function rendAsmCalendar(){
  const cal=document.getElementById('asm-cal-grid');if(!cal)return;
  const title=document.getElementById('asm-cal-title');
  if(title)title.textContent=`${asmCalYear}년 ${asmCalMonth+1}월`;
  const today=new Date();
  const evMap={};
  const addEv=(dateObj,ev)=>{
    if(!dateObj||isNaN(dateObj))return;
    const k=`${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
    if(!evMap[k])evMap[k]=[];
    evMap[k].push(ev);
  };

  // ① 확정 일정 표시 (진한 색)
  confirmedSchedules.forEach(sc=>{
    sc.phases.forEach(ph=>{
      if(ph.start) addEv(new Date(ph.start),{
        type:ph.type,label:ph.label,robot:sc.robot,
        unitFrom:sc.unitFrom,unitTo:sc.unitTo,
        color:ph.color,bgColor:ph.bgColor,textColor:ph.textColor,confirmed:true
      });
      if((ph.type==='gtc')&&ph.end) addEv(new Date(ph.end),{
        type:'delivery',label:'🚚 납품',robot:sc.robot,
        unitFrom:sc.unitFrom,unitTo:sc.unitTo,
        color:'#10B981',bgColor:'#D1FAE5',textColor:'var(--gn-dark)',confirmed:true
      });
    });
  });

  // ② 역산 미리보기 (점선, 아직 미확정)
  const dl2=_reverseDeadline||asmSelectedDate;
  if(dl2){
    const rk2=_reverseRobot==='PARKIE'?'pk':_reverseRobot==='CARRIE'?'ca':'go';
    const pf=parseInt(document.getElementById('asc-'+rk2+'-from')?.value)||null;
    const pt=parseInt(document.getElementById('asc-'+rk2+'-to')?.value)||null;
    if(pf&&pt&&pt>=pf){
      const p2=dl2.split('-');
      const dlDate=new Date(parseInt(p2[0]),parseInt(p2[1])-1,parseInt(p2[2]));
      const batches2=Math.ceil((pt-pf+1)/PROC.PARALLEL_UNITS);
      const lastEolEnd2=new Date(dlDate);
      const lastEolStart2=subtractWD(new Date(lastEolEnd2),PROC.EOL_DAYS);
      const nextmStarts=[];
      for(let b=0;b<batches2;b++){
        nextmStarts.push(subtractWD(new Date(lastEolStart2),(batches2-b)*PROC.NEXTM_DAYS));
      }
      const gbcStart2=subtractWD(new Date(nextmStarts[0]),PROC.GBC_DAYS);
      const partsOrder2=subtractWD(new Date(gbcStart2),PROC.PARTS_LEAD);
      const rc2=_reverseRobot==='PARKIE'?'#0EA5E9':_reverseRobot==='CARRIE'?'#7C3AED':'#EC4899';
      const prv=(d,lbl)=>addEv(d,{type:'preview',label:lbl,robot:_reverseRobot,unitFrom:pf,unitTo:pt,color:rc2,bgColor:rc2+'15',textColor:rc2,confirmed:false});
      prv(partsOrder2,'📦 부품발주');
      prv(nextmStarts[0],'🤖 조립착수');
      // GBC착수·EOL착수는 달력에 표시 안 함
      addEv(dlDate,{type:'delivery',label:'🚚 납품예정',robot:_reverseRobot,unitFrom:pf,unitTo:pt,color:'#10B981',bgColor:'#D1FAE5',textColor:'var(--gn-dark)',confirmed:false});
    }
  }

  // ③ 셀 렌더링
  const first=new Date(asmCalYear,asmCalMonth,1).getDay();
  const last=new Date(asmCalYear,asmCalMonth+1,0).getDate();
  const dows=['일','월','화','수','목','금','토'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<first;i++) html+=`<div class="cal-d other"><div class="cal-dn">${new Date(asmCalYear,asmCalMonth,-(first-i-1)).getDate()}</div></div>`;

  for(let d=1;d<=last;d++){
    const dkStr=`${asmCalYear}-${String(asmCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isT=today.getFullYear()===asmCalYear&&today.getMonth()===asmCalMonth&&today.getDate()===d;
    const isPastAsm=new Date(asmCalYear,asmCalMonth,d)<new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const isSelAsm=asmSelectedDate===dkStr;
    const k=`${asmCalYear}-${asmCalMonth}-${d}`;
    const evs=evMap[k]||[];

    let cellBg=isPastAsm?'rgba(0,0,0,.03)':isSelAsm?'#EFF6FF':isT?'#FFF7ED':'var(--sf)';
    let cellBorder=isPastAsm?'var(--bd)':isSelAsm?'#3B5BF6':isT?'#F97316':evs.length?'#CBD5E1':'var(--bd)';

    const tags=evs.map(ev=>{
      const dash=ev.confirmed?'solid':'dashed';
      const unitLabel=ev.unitFrom===ev.unitTo?`${ev.unitFrom}호기`:`${ev.unitFrom}~${ev.unitTo}호기`;
      // 단계별 시각 강조: 납품>EOL착수>조립착수>GBC>부품
      const isBig = ev.type==='delivery'||ev.type==='gtc';
      const isMed = ev.type==='eol'||ev.type==='nextm';
      const fw = isBig?'800':isMed?'700':'600';
      const fs = isBig?'10px':isMed?'9px':'9px';
      const py = isBig?'3px':'1px';
      const borderW = isBig?'3px':ev.confirmed?'2px':'1px';
      return `<div style="background:${ev.bgColor};border-left:${borderW} ${dash} ${ev.color};border-radius:4px;padding:${py} 5px;font-size:${fs};font-weight:${fw};color:${ev.textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;${isBig?'box-shadow:0 1px 3px rgba(0,0,0,.1)':''}${ev.confirmed?'':'opacity:.82'}" title="${ev.robot} ${unitLabel} ${ev.label}">${ev.label}</div>`;
    }).join('');

    html+=`<div data-asm-dk="${dkStr}" onclick="${isPastAsm?'':` selectAsmDate('${dkStr}')`}" ondblclick="${isPastAsm?'':` asmCalDblClick('${dkStr}')`}" style="cursor:${isPastAsm?'not-allowed':'pointer'};min-height:56px;border-radius:7px;border:1.5px solid ${cellBorder};background:${cellBg};padding:5px 6px;transition:all .12s;${isPastAsm?'opacity:.35':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
        <div style="font-size:12px;font-weight:700;color:${isSelAsm?'#3B5BF6':isT?'#EA580C':isPastAsm?'var(--t3)':'var(--tx)'}">${d}</div>
        <div style="display:flex;gap:2px">
          ${isT?'<span style="font-size:7px;font-weight:800;background:#F97316;color:#fff;border-radius:2px;padding:1px 4px">TODAY</span>':''}
          ${isSelAsm?'<span style="font-size:7px;font-weight:800;background:#3B5BF6;color:#fff;border-radius:2px;padding:1px 4px">납기</span>':''}
        </div>
      </div>${tags}</div>`;
  }

  const rem=42-(first+last);
  for(let d=1;d<=rem;d++) html+=`<div class="cal-d other"><div class="cal-dn">${d}</div></div>`;
  cal.innerHTML=html;
}

function updModuleSel(){
  const r=document.getElementById('al-rb').value;
  const mods=laborModules[r];
  document.getElementById('al-mod').innerHTML=mods.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
}

function submitAddLabor(){
  const r=document.getElementById('al-rb').value;
  const mi=parseInt(document.getElementById('al-mod').value);
  const nm=document.getElementById('al-nm').value.trim();
  const note=document.getElementById('al-note').value.trim();
  const h=parseFloat(document.getElementById('al-h').value);
  const w=parseInt(document.getElementById('al-w').value)||1;
  if(!nm||!h){toast('⚠️','작업명과 시간을 입력하세요','wa');return;}
  laborModules[r][mi].tasks.push({name:nm,note,hours:h,workers:w});
  closeMo('mo-addlabor');
  activeLaborRobot=r;
  recalcLabor();
  toast('✅','작업 항목이 추가되었습니다','ok');
}

function submitAddModule(){
  const r=document.getElementById('am-rb').value;
  const nm=document.getElementById('am-nm').value.trim();
  if(!nm){toast('⚠️','모듈명을 입력하세요','wa');return;}
  laborModules[r].push({name:nm,tasks:[]});
  closeMo('mo-addmodule');
  activeLaborRobot=r;
  recalcLabor();
  toast('✅','모듈이 추가되었습니다','ok');
}

