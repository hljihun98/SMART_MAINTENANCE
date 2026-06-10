/* ===== calendar.js : 대시보드 월간 달력(rendCalendar) ===== */
/* (원본 robot_inventory__44_.html 2082-2179 줄을 그대로 분리) */
// ════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════
function rendCalendar(){
  const months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('cal-title').textContent=`${calYear}년 ${months[calMonth]}`;
  const first=new Date(calYear,calMonth,1).getDay();
  const last=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const rclr={PARKIE:{bg:'rgba(14,165,233,.15)',tx:'#0369A1',short:'PK'},
              CARRIE:{bg:'rgba(124,58,237,.15)',tx:'#5B21B6',short:'CA'},
              GOALIE:{bg:'rgba(236,72,153,.15)',tx:'#BE185D',short:'GO'}};

  // 확정 일정에서 납품 예정일만 추출해 달력에 표시
  const schedMap={};
  confirmedSchedules.forEach(sc=>{
    const dl=sc.deadline;
    if(!schedMap[dl])schedMap[dl]=[];
    schedMap[dl].push(sc);
    // 조립 착수일(첫 NEXT-M 시작)도 표시
    const nextmPhase=sc.phases.find(p=>p.type==='nextm');
    if(nextmPhase){
      const st=nextmPhase.start;
      if(!schedMap[st])schedMap[st]=[];
      schedMap[st].push({...sc,_markerType:'start'});
    }
    // 부품발주일
    const partsPhase=sc.phases.find(p=>p.type==='parts');
    if(partsPhase){
      const st=partsPhase.start;
      if(!schedMap[st])schedMap[st]=[];
      schedMap[st].push({...sc,_markerType:'parts'});
    }
  });

  const dows=['일','월','화','수','목','금','토'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<first;i++) html+=`<div class="cal-d other"><div class="cal-dn">${new Date(calYear,calMonth,-(first-i-1)).getDate()}</div></div>`;

  for(let d=1;d<=last;d++){
    const isToday=today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d;
    const dkStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    // 확정 일정 마커
    const scheds=schedMap[dkStr]||[];
    const hasMilestone=scheds.length>0;
    let cls='cal-d'+(isToday?' today':'')+(hasMilestone?' milestone':'');
    let tags=scheds.slice(0,3).map(sc=>{
      const r=sc.robot;
      const type=sc._markerType;
      if(type==='parts'){
        return`<span class="cal-tag" style="background:#F5F3FF;color:#6D28D9;border:1px solid #DDD6FE">📦${rclr[r].short} 발주</span>`;
      } else if(type==='start'){
        return`<span class="cal-tag" style="background:${rclr[r].bg};color:${rclr[r].tx}">▶${rclr[r].short}${sc.unitFrom}조립</span>`;
      } else {
        return`<span class="cal-tag" style="background:#D1FAE5;color:var(--gn-dark);border:1px solid #A7F3D0">🚚${rclr[r].short}${sc.unitFrom}~${sc.unitTo}납품</span>`;
      }
    }).join('');

    const tipTxt=scheds.length?scheds.map(sc=>{
      const type=sc._markerType;
      if(type==='parts')return `${sc.robot} 부품 발주`;
      if(type==='start')return `${sc.robot} ${sc.unitFrom}호기 조립 착수`;
      return `${sc.robot} ${sc.unitFrom}~${sc.unitTo}호기 납품`;
    }).join('\n'):'';

    html+=`<div class="${cls}" title="${tipTxt||'더블클릭: 공수산정 이동'}" ondblclick="go('labor')" style="cursor:pointer"><div class="cal-dn">${d}</div>${tags}</div>`;
  }

  const rem=42-(first+last);
  for(let d=1;d<=rem;d++) html+=`<div class="cal-d other"><div class="cal-dn">${d}</div></div>`;
  document.getElementById('cal-grid').innerHTML=html;
}
function calPrev(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}rendCalendar();}
function calNext(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}rendCalendar();}

function setAlertTab(r,el){
  alertTabFilter=r;
  document.querySelectorAll('#pg-dash .tabs .tab').forEach(t=>t.classList.remove('act'));
  if(el)el.classList.add('act');
  rendAlerts();
}

function rendAlerts(){
  const all=bom.filter(b=>b.stock<=b.minStock);
  const al=alertTabFilter==='ALL'?all:all.filter(b=>b.robot===alertTabFilter);
  document.getElementById('tb-alert').innerHTML=al.length
    ?al.map(b=>{const s=sts(b.stock,b.minStock);return`<tr><td><span class="rb ${rbc(b.robot)}">${b.robot}</span></td><td class="t-m t-sm">${b.partNo}</td><td>${b.name}</td><td><b style="color:${b.stock===0?'var(--re)':'var(--am)'}">${b.stock}</b></td><td>${b.minStock}</td><td><span class="sb2 ${s.c}">${s.t}</span></td></tr>`;}).join('')
    :'<tr><td colspan="6" style="text-align:center;color:var(--t2);padding:14px;font-size:12px">✅ 재고 부족 항목 없음</td></tr>';
}

function rendRecent(){
  const rec=[...ioLogs].sort((a,b)=>b.ts-a.ts).slice(0,8);
  document.getElementById('tb-recent').innerHTML=rec.length
    ?rec.map(l=>`<tr><td class="t-m t-sm">${fd(l.ts)}</td><td><span class="lb ${l.type==='IN'?'lb-in':'lb-out'}">${l.type==='IN'?'입고':'출고'}</span></td><td><span class="rb ${rbc(l.robot)}">${l.robot}</span></td><td>${l.partName}</td><td class="t-m">${l.qty} ${l.unit}</td><td class="t-sm">${l.userName}<span class="t-m t-mu" style="font-size:10px;margin-left:3px">(${l.userId})</span></td><td class="t-mu t-sm">${l.memo||'-'}</td><td>${pminis(l.photos,2)}</td></tr>`).join('')
    :'<tr><td colspan="8" style="text-align:center;color:var(--t2);padding:14px;font-size:12px">입출고 내역 없음</td></tr>';
}

