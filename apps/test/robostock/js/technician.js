/* ===== technician.js : 작업 인원 일정: 월간캘린더·드래그예약·납기역산·간트 ===== */
/* (원본 robot_inventory__44_.html 2891-3879 줄을 그대로 분리) */
// ════════════════════════════════════════
// TECHNICIAN
// ════════════════════════════════════════
// ════════════════════════════════════════
// TECHNICIAN — monthly calendar + drag timegrid
// ════════════════════════════════════════
let techSelectedDate=null; // 'YYYY-MM-DD' // selected deadline date for reverse calc

function techMonthPrev(){techCalYear*=1;techCalMonth--;if(techCalMonth<0){techCalMonth=11;techCalYear--;}rendTechPage();}
function techMonthNext(){techCalYear*=1;techCalMonth++;if(techCalMonth>11){techCalMonth=0;techCalYear++;}rendTechPage();}

function rendTechPage(){
  // ── 날짜 미선택 시 오늘 날짜 자동 선택 ────────────────
  if(!techSelectedDate){
    techSelectedDate=new Date().toISOString().slice(0,10);
  }
  rendTechMonthGrid();
  rendTechTimeGrid(techSelectedDate);
  rendDelayTable();
}

// ── 월간 달력 날짜 범위 드래그 예약 상태 ──────────────
let _calDrag={active:false,startDk:null,endDk:null};

function calDragStart(dk){
  // 마우스 누름 → 드래그 시작
  _calDrag={active:true,startDk:dk,endDk:dk};
  highlightCalDrag(dk,dk);
}
function calDragMove(dk){
  // 마우스 이동 → 범위 끝 업데이트
  if(!_calDrag.active)return;
  _calDrag.endDk=dk;
  highlightCalDrag(_calDrag.startDk,_calDrag.endDk);
}
function calDragEnd(dk){
  // ── 마우스 뗌: 범위 확정 ─────────────────────────────
  if(!_calDrag.active)return;
  _calDrag.endDk=dk;
  _calDrag.active=false;
  clearCalDragHL();

  const sorted=[_calDrag.startDk,_calDrag.endDk].sort();
  const startDk=sorted[0], endDk=sorted[1];

  if(startDk===endDk){
    // 단일 날짜 클릭 → 해당 날짜 타임그리드 표시
    selectTechDate(startDk);
    return;
  }

  // ── 날짜 범위 선택: 타임그리드에서 드래그하면 전 날짜에 일괄 적용 ──
  // 범위 정보를 전역에 저장
  techDragRange={startDk, endDk};
  selectTechDate(startDk);

  // 기존 배너 제거 후 새 배너 삽입
  const oldBanner=document.getElementById('drag-range-banner');
  if(oldBanner)oldBanner.remove();
  const tg=document.getElementById('tech-timegrid');
  if(tg){
    const dates=[];
    let cur=new Date(startDk); const endD=new Date(endDk);
    while(cur<=endD){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
    const banner=document.createElement('div');
    banner.id='drag-range-banner';
    banner.style.cssText='background:var(--acl);border:1.5px solid var(--ac);border-radius:8px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px';
    banner.innerHTML=
      '<div style="font-size:13px;font-weight:700;color:var(--ac)">📅 '+startDk+' ~ '+endDk+' ('+dates.length+'일) 범위 선택됨</div>'+
      '<div style="font-size:12px;color:var(--t2)">아래 타임그리드에서 드래그하면 <b>'+dates.length+'일 전체</b>에 동일 예약이 일괄 적용됩니다</div>'+
      '<button class="btn b-se b-sm" onclick="clearTechDragRange()">범위 해제</button>';
    tg.parentNode.insertBefore(banner,tg);
  }
}

function highlightCalDrag(start,end){
  const s=[start,end].sort();
  document.querySelectorAll('[data-cal-dk]').forEach(el=>{
    const dk=el.dataset.calDk;
    el.style.background=dk>=s[0]&&dk<=s[1]?'var(--acl)':'';
  });
}
function clearCalDragHL(){
  document.querySelectorAll('[data-cal-dk]').forEach(el=>el.style.background='');
}
// mouseup 핸들러는 rendTechTimeGrid 앞에 통합 정의됨

function rendTechMonthGrid(){
  const mg=document.getElementById('tech-month-grid');if(!mg)return;
  const months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const titleEl=document.getElementById('tech-month-title');
  if(titleEl)titleEl.textContent=`${techCalYear}년 ${months[techCalMonth]} 월간 드래그 예약 보드`;
  const first=new Date(techCalYear,techCalMonth,1).getDay();
  const last=new Date(techCalYear,techCalMonth+1,0).getDate();
  const today=new Date();
  const dows=['일','월','화','수','목','금','토'];
  let html=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:6px">`
    +dows.map(d=>`<div style="text-align:center;font-size:10px;font-weight:600;color:var(--t2);font-family:var(--fm);padding:4px 0">${d}</div>`).join('')+'</div>';
  html+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;
  // empty cells
  for(let i=0;i<first;i++)html+=`<div style="min-height:76px;border-radius:8px"></div>`;
  for(let d=1;d<=last;d++){
    const dk=`${techCalYear}-${String(techCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=today.getFullYear()===techCalYear&&today.getMonth()===techCalMonth&&today.getDate()===d;
    const isSel=techSelectedDate===dk;
    const dayBookings=techBookings.filter(b=>b.date===dk);
    const hasBook=dayBookings.length>0;
    const techPills=[...new Set(dayBookings.map(b=>b.techId))].map(tid=>{
      const t=technicians.find(x=>x.id===tid);
      if(!t)return'';
      const h=dayBookings.filter(b=>b.techId===tid).reduce((s,b)=>s+(b.endSlot-b.startSlot)*0.5,0);
      return`<span style="display:inline-flex;align-items:center;gap:3px;background:${t.color}22;border-radius:4px;padding:1px 5px;margin-bottom:2px"><span style="width:6px;height:6px;border-radius:50%;background:${t.color};display:inline-block;flex-shrink:0"></span><span style="font-size:9px;color:${t.color};font-weight:600;font-family:var(--fm)">${t.name} ${h}h</span></span>`;
    }).join('');
    const isPast=new Date(dk)<new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const delayOnDayArr=delayLogs.filter(dl2=>dl2.date===dk);
    const hasDelay=delayOnDayArr.length>0;

    // 확정 일정 간트 바 (gantt:false 제외 — EOL·GTC는 표시 안 함)
    const ganttBars=confirmedSchedules.flatMap(sc=>
      sc.phases.filter(ph=>ph.start<=dk&&ph.end>=dk&&ph.gantt!==false).map(ph=>({sc,ph}))
    );
    const scId2html=(scid)=>scid.replace(/'/g,"\\'");
    const ganttHtml=ganttBars.map(function(item){
      const sc=item.sc, ph=item.ph;
      const sid=sc.id;
      return '<div data-scid="'+sid+'" ondblclick="event.stopPropagation();openScheduleDetail(this.dataset.scid)"'
        +' style="display:flex;align-items:center;gap:3px;background:'+ph.bgColor+';border-left:2px solid '+ph.color+';border-radius:3px;padding:1px 5px;margin-bottom:1px;cursor:pointer;font-size:9px;font-weight:600;color:'+ph.textColor+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap"'
        +' title="'+sc.robot+' '+sc.unitFrom+'~'+sc.unitTo+'호기 '+ph.label+'\n더블클릭: 상세 보기">'
        +ph.label+'</div>';
    }).join('');

    html+=`<div
      data-cal-dk="${dk}"
      onclick="${isPast?'':` selectTechDate('${dk}')`}"
      onmousedown="${isPast?'':` calDragStart('${dk}')`}"
      onmouseenter="${isPast?'':` calDragMove('${dk}')`}"
      onmouseup="${isPast?'':` calDragEnd('${dk}')`}"
      style="min-height:76px;border-radius:8px;border:1.5px solid ${isSel?'var(--ac)':isToday?'#F97316':'var(--bd)'};background:${isPast?'rgba(0,0,0,.04)':isSel?'var(--acl)':isToday?'#FFF7ED':'var(--sf)'};padding:6px 8px;cursor:${isPast?'not-allowed':'pointer'};transition:all .15s;user-select:none;${isPast?'opacity:.45':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:3px">
        <div style="font-size:13px;font-weight:700;color:${isPast?'var(--t3)':isSel?'var(--ac)':isToday?'#EA580C':'var(--tx)'}">${d}</div>
        <div style="display:flex;gap:3px;align-items:center">
          ${isToday?'<span style="font-size:8px;font-weight:800;background:#F97316;color:#fff;border-radius:3px;padding:1px 5px;letter-spacing:.3px">TODAY</span>':''}
          ${isSel&&!isPast?'<span style="font-size:8px;font-weight:700;background:var(--ac);color:#fff;border-radius:3px;padding:1px 4px">선택</span>':''}
          ${hasDelay&&!isPast?`<span title="${delayOnDayArr[0].title}" style="font-size:8px;background:var(--aml);color:var(--am-dark);border-radius:3px;padding:1px 4px">⚠️</span>`:''}
        </div>
      </div>
      ${ganttHtml}
      ${hasBook?`<div style="display:flex;flex-direction:column;gap:1px${ganttBars.length?';margin-top:2px':''}">${techPills}</div>`
        :ganttBars.length?''
        :isPast?`<div style="font-size:10px;color:var(--t3)">─</div>`:`<div style="font-size:10px;color:var(--t3)">예약 없음</div>`}
    </div>`;
  }
  html+=`</div>`;
  mg.innerHTML=html;
}

function selectTechDate(dk){
  techSelectedDate=dk;
  const [y,m,d]=dk.split('-');
  const label=document.getElementById('tech-selected-date-label');
  const sub=document.getElementById('tech-selected-date-sub');
  if(label)label.textContent=`${y}년 ${parseInt(m)}월 ${parseInt(d)}일 · 선택 날짜 30분 드래그 예약`;
  if(sub)sub.textContent='같은 작업 인원 행에서 드래그하여 시간대를 선택합니다. 이미 예약된 구간은 초록색으로 잠깁니다.';
  rendTechMonthGrid();
  rendTechTimeGrid(dk);
}

// ────────────────────────────────────────────────────────
// 타임그리드 30분 드래그 예약 함수들
// ────────────────────────────────────────────────────────
// ── 작업 슬롯 시스템: 07:00~18:00, 30분 단위 22슬롯 ───
// 슬롯 0=07:00, 1=07:30, 2=08:00 ... 21=17:30, 22=18:00
const WORK_START_H = 7;   // 07시 시작
const WORK_SLOTS   = 22;  // 07:00~18:00 = 22슬롯 (마지막 표시는 18:00)

function slotLabel24(s){
  // 슬롯 번호 → "HH:MM" 문자열
  const h = WORK_START_H + Math.floor(s/2);
  const m = s%2===0 ? '00' : '30';
  return String(h).padStart(2,'0')+':'+m;
}
function slotToH(s){return WORK_START_H+Math.floor(s/2);}  // 슬롯 → 정수 시간

// 드래그 상태 객체
var _drag={active:false,techId:null,startSlot:null,date:null};

function startDrag2(e){
  // 마우스 누름 → 드래그 시작
  var el=e.currentTarget||e.target;
  var techId=el.getAttribute('data-tech');
  var slot=parseInt(el.getAttribute('data-slot'));
  var dk=el.getAttribute('data-date');
  e.preventDefault();
  _drag={active:true,techId:techId,startSlot:slot,date:dk};
  hlDrag(techId,slot,slot);
}
function moveDrag2(e){
  // 마우스 이동 → 드래그 범위 업데이트
  if(!_drag.active)return;
  var el=e.currentTarget||e.target;
  if(el.getAttribute('data-tech')!==_drag.techId)return;
  hlDrag(_drag.techId,_drag.startSlot,parseInt(el.getAttribute('data-slot')));
}
function endDrag2(e){
  // 마우스 뗌 → 즉시 등록 대신 예약 모달 오픈 (사용자 확인 후 등록)
  if(!_drag.active)return;
  var el=e.currentTarget||e.target;
  if(el.getAttribute('data-tech')!==_drag.techId){_drag.active=false;clrDrag();return;}
  var slot=parseInt(el.getAttribute('data-slot'));
  var singleDk=el.getAttribute('data-date')||_drag.date;
  var s=Math.min(_drag.startSlot,slot);
  var en=Math.max(_drag.startSlot,slot)+1;
  _drag.active=false;clrDrag();
  if(en<=s||!singleDk)return;

  // 드래그 결과를 전역에 임시 저장 → 모달 확인 후 등록
  _pendingBooking={
    techId:_drag.techId,
    date:singleDk,
    startSlot:s, endSlot:en,
    dateRange:techDragRange&&techDragRange.startDk?{start:techDragRange.startDk,end:techDragRange.endDk}:null
  };

  // mo-tech-book 모달 열기 (시간 범위 표시, 작업 내용 입력 유도)
  var tech=technicians.find(function(t){return t.id===_drag.techId;});
  var dates=_pendingBooking.dateRange?_pendingBooking.dateRange.start+' ~ '+_pendingBooking.dateRange.end:singleDk;
  document.getElementById('techbook-title').textContent='작업 예약 등록';
  document.getElementById('mo-tech-book').querySelector('.md-s').textContent=
    (tech?tech.name:'작업 인원')+' · '+dates+' · '+slotLabel24(s)+'~'+slotLabel24(en);

  // 날짜/시간 미리 채우기
  var tbDate=document.getElementById('tb-date');
  var tbTech=document.getElementById('tb-tech');
  if(tbDate)tbDate.value=singleDk;
  if(tbTech){
    tbTech.innerHTML=technicians.map(function(t){
      return'<option value="'+t.id+'"'+(t.id===_drag.techId?' selected':'')+'>'+t.name+'</option>';
    }).join('');
  }
  // 시작/종료 슬롯 → 시간 select 업데이트
  var tbStart=document.getElementById('tb-start');
  var tbEnd=document.getElementById('tb-end');
  if(tbStart){
    tbStart.innerHTML=Array.from({length:WORK_SLOTS+1},function(_,i){
      return'<option value="'+i+'"'+(i===s?' selected':'')+'>'+slotLabel24(i)+'</option>';
    }).join('');
  }
  if(tbEnd){
    tbEnd.innerHTML=Array.from({length:WORK_SLOTS+1},function(_,i){
      return'<option value="'+i+'"'+(i===en?' selected':'')+'>'+slotLabel24(i)+'</option>';
    }).join('');
  }
  // 이전 입력 초기화
  var tbType=document.getElementById('tb-type');if(tbType)tbType.value='조립';
  var tbNote=document.getElementById('tb-note');if(tbNote)tbNote.value='';
  var tbRobot=document.getElementById('tb-robot');if(tbRobot)tbRobot.value='';
  var tbUnit=document.getElementById('tb-unit');if(tbUnit)tbUnit.value='';

  openMo('mo-tech-book');
}

// 드래그로 생성된 대기 예약 데이터
var _pendingBooking=null;

// 드래그 범위 해제
var techDragRange=null;
function clearTechDragRange(){
  techDragRange=null;
  var b=document.getElementById('drag-range-banner');if(b)b.remove();
  rendTechMonthGrid();
  toast('ℹ️','범위 선택이 해제되었습니다','ok');
}
function hlDrag(techId,s,e2){
  // 드래그 중 셀 하이라이트
  var mn=Math.min(s,e2),mx=Math.max(s,e2);
  var cells=document.querySelectorAll('[data-tech="'+techId+'"][data-slot]');
  cells.forEach(function(el){
    var sl=parseInt(el.getAttribute('data-slot'));
    el.style.background=sl>=mn&&sl<=mx?'var(--acl)':'';
  });
}
function clrDrag(){
  // 드래그 하이라이트 초기화
  document.querySelectorAll('[data-slot]').forEach(function(el){el.style.background='';});
}
// 마우스를 그리드 밖에서 뗐을 때도 드래그 해제
document.addEventListener('mouseup',function(){
  if(_drag.active){_drag.active=false;clrDrag();}
  if(_calDrag&&_calDrag.active){_calDrag.active=false;clearCalDragHL();}
});

function rendTechTimeGrid(dk){
  var tg=document.getElementById('tech-timegrid');
  if(!tg)return;
  if(!technicians.length){
    tg.innerHTML='<div style="text-align:center;padding:32px;color:var(--t2)">작업 인원을 먼저 추가하세요</div>';
    return;
  }
  var SLOTS=WORK_SLOTS;
  var COL_W=46;
  var ROW_H=58;
  var LABEL_W=100;
  // 헤더
  var hdr='<div style="display:flex;border-bottom:2px solid var(--bd);background:var(--s2);position:sticky;top:0;z-index:3">';
  hdr+='<div style="width:'+LABEL_W+'px;flex-shrink:0;font-size:11px;font-weight:600;color:var(--t2);padding:6px 8px;border-right:1px solid var(--bd)">작업 인원</div>';
  hdr+='<div style="display:flex">';
  for(var sh=0;sh<SLOTS;sh++){
    hdr+='<div style="width:'+COL_W+'px;flex-shrink:0;text-align:center;font-size:10px;color:var(--t2);padding:4px 0;border-left:1px solid '+(sh%2===0?'var(--bd)':'transparent')+'">'+(sh%2===0?slotLabel24(sh):'')+' </div>';
  }
  hdr+='</div></div>';
  var body='';
  technicians.forEach(function(tech){
    var dayB=techBookings.filter(function(b){return b.date===dk&&b.techId===tech.id;});
    var nameCell='<div style="width:'+LABEL_W+'px;flex-shrink:0;display:flex;align-items:center;gap:5px;padding:4px 8px;border-right:1px solid var(--bd);background:var(--s2);min-height:'+ROW_H+'px">';
    nameCell+='<span style="width:9px;height:9px;border-radius:50%;background:'+tech.color+';flex-shrink:0"></span>';
    nameCell+='<span style="font-size:12px;font-weight:600;white-space:nowrap">'+tech.name+'</span>';
    if(CU&&CU.role==='admin'){
      nameCell+='<button data-tid="'+tech.id+'" onclick="deleteTech(this.dataset.tid)" style="margin-left:auto;background:none;border:none;color:var(--t3);cursor:pointer;font-size:11px" title="삭제">✕</button>';
    }
    nameCell+='</div>';
    // 빈 슬롯 배경
    var bg='<div style="position:relative;display:flex;flex:1">';
    for(var sb=0;sb<SLOTS;sb++){
      bg+='<div style="width:'+COL_W+'px;flex-shrink:0;height:'+ROW_H+'px;border-left:1px solid '+(sb%2===0?'var(--bd)':'var(--s3)')+';cursor:crosshair" data-slot="'+sb+'" data-tech="'+tech.id+'" data-date="'+dk+'" onmousedown="startDrag2(event)" onmouseenter="moveDrag2(event)" onmouseup="endDrag2(event)" title="'+slotLabel24(sb)+'"></div>';
    }
    // 예약 오버레이
    dayB.forEach(function(b){
      var s2=b.startSlot, e2=b.endSlot;
      var lft=s2*COL_W;
      var wd=(e2-s2)*COL_W-2;
      var bt=b.task||b.type||'';
      var bn=b.userName||'-';
      var bNote=b.note||'';
      var bLog=b.log;
      var memo=bLog&&bLog.memo?bLog.memo:'';
      var unplanned=bLog&&bLog.unplanned?bLog.unplanned:'';
      var hasLog=bLog&&(bLog.memo||bLog.unplanned);
      var dur=e2-s2;
      bg+='<div style="position:absolute;left:'+lft+'px;top:3px;width:'+wd+'px;height:'+(ROW_H-8)+'px;background:'+tech.color+'20;border:2px solid '+tech.color+';border-radius:6px;padding:5px 8px;cursor:pointer;overflow:hidden;box-sizing:border-box;z-index:2" data-bid="'+b.id+'" onclick="openTechBookingDetail(this.dataset.bid)" ondblclick="cancelBooking(this.dataset.bid)">';
      bg+='<div style="font-size:10px;font-weight:700;color:'+tech.color+'">'+slotLabel24(s2)+' ~ '+slotLabel24(e2)+'</div>';
      if(bt)bg+='<div style="font-size:13px;font-weight:700;color:var(--tx);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+bt+'</div>';
      if(bn&&bn!=='-')bg+='<div style="font-size:10px;color:var(--t2);margin-top:1px">📋 '+bn+'</div>';
      if((bNote||memo)&&dur>=3)bg+='<div style="font-size:10px;color:var(--t2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">💬 '+(memo||bNote)+'</div>';
      if(unplanned)bg+='<div style="font-size:9px;color:var(--am);margin-top:1px">⚠️ '+unplanned.slice(0,30)+'</div>';
      if(hasLog)bg+='<span style="position:absolute;top:4px;right:5px;width:7px;height:7px;background:var(--gn);border-radius:50%;display:inline-block"></span>';
      bg+='</div>';
    });
    bg+='</div>';
    body+='<div style="display:flex;border-bottom:1px solid var(--bd)">'+nameCell+bg+'</div>';
  });
  var totals=technicians.map(function(t){
    var h=techBookings.filter(function(b){return b.date===dk&&b.techId===t.id;}).reduce(function(s3,b){return s3+(b.endSlot-b.startSlot)*0.5;},0);
    if(h>0)return '<span style="display:inline-flex;align-items:center;gap:4px;background:'+t.color+'18;border-radius:6px;padding:3px 10px"><span style="width:7px;height:7px;border-radius:50%;background:'+t.color+'"></span><span style="font-size:12px;font-weight:600;color:'+t.color+'">'+t.name+' '+h+'h</span></span>';
    return '';
  }).filter(Boolean).join('');
  tg.innerHTML=hdr+body+'<div style="padding:8px 6px;display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--bd)">'+(totals||'<span style="font-size:11px;color:var(--t3)">예약 없음</span>')+'</div>';
}

function submitDragBook(){toast('ℹ️','타임그리드에서 드래그하여 예약하세요','ok');}

// ────────────────────────────────────────────────────────
// 공수산정 달력 납기 역산
// 날짜 더블클릭 → 역산 패널 표시 → 확정 → startDate 업데이트
// ────────────────────────────────────────────────────────
let _reverseDeadline=null;   // 역산 기준 납기일 (YYYY-MM-DD)
let _reverseRobot='PARKIE';  // 역산 대상 로봇
// 역산 로봇 선택
function setRevRobot(r){
  _reverseRobot=r;
  const solid={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const idMap={PARKIE:'arb-pk',CARRIE:'arb-ca',GOALIE:'arb-go'};
  ['PARKIE','CARRIE','GOALIE'].forEach(x=>{
    const btn=document.getElementById(idMap[x]);
    if(!btn)return;
    if(x===r){
      btn.style.background=solid[x];btn.style.color='#fff';
      btn.style.borderColor=solid[x];btn.style.fontWeight='700';
    } else {
      btn.style.background='var(--sf)';btn.style.color='var(--t2)';
      btn.style.borderColor='var(--bd)';btn.style.fontWeight='600';
    }
  });
  syncRevUnit();
  updRevCalc();
}

// 호기 등록 입력 → 역산 호기 자동 동기화
function syncRevUnit(){
  const r=_reverseRobot;
  const rk=r==='PARKIE'?'pk':r==='CARRIE'?'ca':'go';
  const fv=document.getElementById('asc-'+rk+'-from')?.value||'';
  const tv=document.getElementById('asc-'+rk+'-to')?.value||'';
  const hf=document.getElementById('arp-unit-from');
  const ht=document.getElementById('arp-unit-to');
  if(hf)hf.value=fv;
  if(ht)ht.value=tv;
}

// 호기 범위 변경 시 결과 업데이트
// 역산 결과 계산 및 표시
function updRevCalc(){
  // ── 납기 역산 — 센터별 병렬/순차 프로세스 ──────────
  //
  // N대 기준:
  //   부품 발주·입고   : N대 일괄 (GBC+NEXT-M 동시 발주)
  //   GBC 구동모듈     : N대 동시 (10평일)
  //   NEXT-M 로봇단    : 2대씩 배치 → ceil(N/2)배치 × 10평일
  //                     (GBC 완료 후 착수, 배치들은 순차 진행)
  //   EOL(SM팀)        : 각 배치 완료 즉시 테스트 (10평일)
  //                     → 마지막 배치 EOL 완료 = 납기
  //   GTC 운영평가     : 납기
  //
  // 납기일 역산:
  //   마지막 배치 납기  = dl
  //   마지막 배치 EOL 시작 = dl - 10
  //   마지막 배치 NEXT-M 시작 = dl - 20
  //   첫 배치 NEXT-M 시작 = dl - 20 - (batches-1)*10
  //   GBC 시작 = NEXT-M 전체와 겹치거나 먼저, but GBC 완료 후 NEXT-M 착수이므로:
  //   GBC 시작 = 첫 배치 NEXT-M 시작 - GBC_DAYS
  //   부품 발주 = GBC 시작 - PARTS_LEAD

  if(!_reverseDeadline)return;
  const parts=_reverseDeadline.split('-');
  const dl=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));

  const rk=_reverseRobot==='PARKIE'?'pk':_reverseRobot==='CARRIE'?'ca':'go';
  const f=parseInt(document.getElementById('asc-'+rk+'-from')?.value)||null;
  const t2=parseInt(document.getElementById('asc-'+rk+'-to')?.value)||null;
  const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const cont=document.getElementById('arp-robots');if(!cont)return;

  if(!f||!t2||t2<f){
    cont.innerHTML='<div style="font-size:12px;color:var(--t2);padding:8px 0">호기 번호를 입력하면 일정이 계산됩니다</div>';
    return;
  }

  const count=t2-f+1;
  const batches=Math.ceil(count/PROC.PARALLEL_UNITS);  // NEXT-M: 2대씩

  // ── 날짜 역산 ────────────────────────────────────────
  // EOL: 마지막 배치 완료 = 납기일
  const lastEolEnd  = new Date(dl);
  const lastEolStart= subtractWD(new Date(lastEolEnd), PROC.EOL_DAYS);

  // NEXT-M: 마지막 배치 완료 = EOL 시작
  // 배치들은 순차 진행 (배치1 → 배치2 → ...)
  // 역산: 마지막 배치 완료 = EOL 시작 → 배치들을 거꾸로 쌓아 첫 배치 착수일 산출
  //
  // 마지막 배치 완료 = lastEolStart
  // (batches-1)번째 배치 착수 = lastEolStart - NEXTM_DAYS
  // (batches-2)번째 배치 착수 = lastEolStart - NEXTM_DAYS*2
  // ...
  // 0번째(첫) 배치 착수 = lastEolStart - NEXTM_DAYS*batches
  //
  // 같은 배치의 2대는 착수일·완료일이 동일

  const nextmBatchStart = [];
  const nextmBatchEnd   = [];
  for(let b=0;b<batches;b++){
    // 배치 b의 착수: lastEolStart - (batches-b) * NEXTM_DAYS
    const bStart=subtractWD(new Date(lastEolStart),(batches-b)*PROC.NEXTM_DAYS);
    // 배치 b의 완료: 착수 + NEXTM_DAYS
    const bEnd  =addWD(new Date(bStart),PROC.NEXTM_DAYS);
    nextmBatchStart.push(bStart);
    nextmBatchEnd.push(bEnd);
  }
  const firstNextmStart=nextmBatchStart[0];

  // GBC: 첫 배치 NEXT-M 시작 전에 완료 (N대 모두 동시)
  const gbcEnd  = new Date(firstNextmStart);
  const gbcStart= subtractWD(new Date(gbcEnd), PROC.GBC_DAYS);

  // 부품 발주: GBC 시작 전 1주
  const partsOrder = subtractWD(new Date(gbcStart), PROC.PARTS_LEAD);

  const fmt=d=>d.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'});
  const lc=cmap[_reverseRobot];
  const allTasks=laborModules[_reverseRobot].flatMap(m=>m.tasks);
  const hasOutsource=allTasks.some(t=>t.outsourced);

  // ── NEXT-M 배치 상세 행 ──────────────────────────────
  // 같은 배치의 2대는 착수일·완료일이 동일
  let nextmBatchRows='';
  for(let b=0;b<batches;b++){
    const u1=f+b*PROC.PARALLEL_UNITS;
    const u2=Math.min(f+(b+1)*PROC.PARALLEL_UNITS-1,t2);
    const label=u1===u2?`${u1}호기`:`${u1}·${u2}호기 (동시)`;
    const isMid=false; // 구동모듈 안착 표시 제거
    nextmBatchRows+=`
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0 3px 10px;border-left:2px solid ${lc}66;margin-bottom:1px">
        <span style="color:var(--t2)">배치 ${b+1} (${label})</span>
        <span style="font-weight:600;font-family:var(--fm)">${fmt(nextmBatchStart[b])} ~ ${fmt(nextmBatchEnd[b])}</span>
      </div>`;
  }  // for loop end

  cont.innerHTML=`
    <div style="margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:${lc}">
        ${_reverseRobot} ${f}~${t2}호기 · ${count}대
        <span style="font-size:11px;color:var(--t2);font-weight:400;margin-left:6px">동시 ${PROC.PARALLEL_UNITS}대 · ${batches}배치 · GBC(N대동시)+NEXT-M(2대씩)</span>
      </div>
    </div>
    ${hasOutsource?`<div style="background:#FEE2E2;color:#DC2626;border-radius:6px;padding:6px 11px;font-size:11px;font-weight:600;margin-bottom:10px">⚠️ 전장 케이블 제작 외주 진행 중 — 리드타임 별도 확인 필요</div>`:''}
    <div style="display:flex;flex-direction:column;gap:0">
      <div style="display:flex;align-items:stretch">
        <div style="width:3px;background:#8B5CF6;border-radius:2px 2px 0 0;flex-shrink:0;margin-left:10px"></div>
        <div style="flex:1;padding:7px 12px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;margin:2px 0 2px 8px">
          <div style="font-size:10px;font-weight:700;color:#8B5CF6;letter-spacing:.5px;margin-bottom:2px">📦 부품 발주 · 입고 (GBC + NEXT-M 동시)</div>
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--t2)">구동모듈 + 로봇단 ${count}대분 일괄 발주</span><span style="font-weight:700;font-family:var(--fm)">${fmt(partsOrder)}</span></div>
        </div>
      </div>
      <div style="width:3px;height:7px;background:var(--bd);margin-left:10px"></div>
      <div style="display:flex;align-items:stretch">
        <div style="width:3px;background:var(--ac);flex-shrink:0;margin-left:10px"></div>
        <div style="flex:1;padding:7px 12px;background:var(--acl);border:1px solid var(--ac)44;border-radius:8px;margin:2px 0 2px 8px">
          <div style="font-size:10px;font-weight:700;color:var(--ac);letter-spacing:.5px;margin-bottom:4px">🏭 GBC 센터 — 구동모듈 ${count}대 동시 (${PROC.GBC_DAYS}평일)</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span style="color:var(--t2)">구동모듈 부품 검사 · 조립 착수</span><span style="font-weight:600;font-family:var(--fm)">${fmt(gbcStart)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--t2)">구동모듈 조립 완료 (${count}대)</span><span style="font-weight:600;font-family:var(--fm)">${fmt(gbcEnd)}</span></div>
        </div>
      </div>
      <div style="width:3px;height:7px;background:var(--bd);margin-left:10px"></div>
      <div style="display:flex;align-items:stretch">
        <div style="width:3px;background:${lc};flex-shrink:0;margin-left:10px"></div>
        <div style="flex:1;padding:7px 12px;background:${lc}10;border:1px solid ${lc}44;border-radius:8px;margin:2px 0 2px 8px">
          <div style="font-size:10px;font-weight:700;color:${lc};letter-spacing:.5px;margin-bottom:6px">🤖 NEXT-M 센터 — 로봇단 2대씩 순차 (${batches}배치 × ${PROC.NEXTM_DAYS}평일)</div>
          ${nextmBatchRows}
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px"><span style="color:var(--t2)">전장 배선 · 조립 완료 (마지막 배치)</span><span style="font-weight:600;font-family:var(--fm)">${fmt(nextmBatchEnd[batches-1])}</span></div>
        </div>
      </div>
      <div style="width:3px;height:7px;background:var(--bd);margin-left:10px"></div>
      <div style="display:flex;align-items:stretch">
        <div style="width:3px;background:var(--am);flex-shrink:0;margin-left:10px"></div>
        <div style="flex:1;padding:7px 12px;background:var(--aml);border:1px solid #FDE68A;border-radius:8px;margin:2px 0 2px 8px">
          <div style="font-size:10px;font-weight:700;color:var(--am-dark);letter-spacing:.5px;margin-bottom:4px">🔍 EOL 테스트 — SM·SW 검사 2대 동시 (${PROC.EOL_DAYS}평일)</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span style="color:var(--am-dark)">SM 검사 · SW 검사 동시 착수</span><span style="font-weight:600;font-family:var(--fm)">${fmt(lastEolStart)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--am-dark)">EOL 완료 → GTC 이관</span><span style="font-weight:600;font-family:var(--fm)">${fmt(lastEolEnd)}</span></div>
        </div>
      </div>
      <div style="width:3px;height:7px;background:var(--bd);margin-left:10px"></div>
      <div style="display:flex;align-items:stretch">
        <div style="width:3px;background:var(--gn);border-radius:0 0 2px 2px;flex-shrink:0;margin-left:10px"></div>
        <div style="flex:1;padding:8px 12px;background:#D1FAE5;border:2px solid var(--gn);border-radius:8px;margin:2px 0 2px 8px">
          <div style="font-size:10px;font-weight:700;color:var(--gn-dark);letter-spacing:.5px;margin-bottom:2px">🚚 GTC 센터 — 운영 평가 · 납품</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700"><span style="color:var(--gn-dark)">납품 예정일</span><span style="color:var(--gn);font-family:var(--fm)">${fmt(dl)}</span></div>
        </div>
      </div>
    </div>`;

  // 달력 미리보기: 납기일이 포함된 달로 이동 후 즉시 반영
  asmCalYear=parseInt(_reverseDeadline.split('-')[0]);
  asmCalMonth=parseInt(_reverseDeadline.split('-')[1])-1;
  rendAsmCalendar();
}

function selectAsmDate(dk){
  // ── 공수산정 달력 날짜 클릭 → 납기일 후보로 표시 ─────
  asmSelectedDate=dk;
  rendAsmCalendar();
  // 납기일 라벨 즉시 업데이트
  const parts=dk.split('-');
  const dl=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const lbl=document.getElementById('arp-date-label');
  if(lbl)lbl.textContent=`${dl.getFullYear()}년 ${dl.getMonth()+1}월 ${dl.getDate()}일`;
}

function asmCalDblClick(dateStr){
  // ── 더블클릭 → 납기일 확정 + 역산 실행 ──────────────
  asmSelectedDate=dateStr;
  _reverseDeadline=dateStr;
  const parts=dateStr.split('-');
  const dl=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const lbl=document.getElementById('arp-date-label');
  if(lbl)lbl.textContent=`${dl.getFullYear()}년 ${dl.getMonth()+1}월 ${dl.getDate()}일`;
  rendAsmCalendar();
  setRevRobot(_reverseRobot||'PARKIE');
}

function subtractWD(date,days){
  // ── 평일만 카운트하여 날짜 역산 ──────────────────────
  let d=new Date(date); let sub=0;
  while(sub<days){
    d.setDate(d.getDate()-1);
    const dw=d.getDay();
    if(dw!==0&&dw!==6) sub++; // 토(6), 일(0) 제외
  }
  return d;
}

function confirmReverseSchedule(){
  // ── 납기일: _reverseDeadline 또는 asmSelectedDate 사용 ──
  const deadline=_reverseDeadline||asmSelectedDate;
  if(!deadline){
    toast('⚠️','납기일을 먼저 선택하세요 (달력에서 날짜 클릭 후 더블클릭)','wa');
    return;
  }
  _reverseDeadline=deadline; // 동기화

  // ── 호기 범위 확인 ────────────────────────────────────
  const rk=_reverseRobot==='PARKIE'?'pk':_reverseRobot==='CARRIE'?'ca':'go';
  const f=parseInt(document.getElementById('asc-'+rk+'-from')?.value)||null;
  const t2=parseInt(document.getElementById('asc-'+rk+'-to')?.value)||null;
  if(!f||!t2||t2<f){
    toast('⚠️','호기 범위를 먼저 입력하세요 (시작~끝 호기 번호)','wa');
    return;
  }

  const parts=deadline.split('-');
  const dl=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const count=t2-f+1;
  const batches=Math.ceil(count/PROC.PARALLEL_UNITS);

  // 날짜 계산 미리 보기용
  const lastEolEnd  =new Date(dl);
  const lastEolStart=subtractWD(new Date(lastEolEnd),PROC.EOL_DAYS);
  // 첫 배치 착수 = lastEolStart - batches * NEXTM_DAYS
  const firstNextmStart=subtractWD(new Date(lastEolStart),batches*PROC.NEXTM_DAYS);
  const gbcStart=subtractWD(new Date(firstNextmStart),PROC.GBC_DAYS);
  const partsOrder=subtractWD(new Date(gbcStart),PROC.PARTS_LEAD);

  document.getElementById('cs-sub').textContent='아래 내용으로 일정을 확정합니다';
  document.getElementById('cs-body').innerHTML=
    `로봇: <b>${_reverseRobot} ${f}~${t2}호기 (${count}대)</b><br>`+
    `납기일: <b>${dl.toLocaleDateString('ko-KR')}</b><br>`+
    `부품 발주: <b>${partsOrder.toLocaleDateString('ko-KR')}</b><br>`+
    `GBC 착수: <b>${gbcStart.toLocaleDateString('ko-KR')}</b><br>`+
    `NEXT-M 착수: <b>${firstNextmStart.toLocaleDateString('ko-KR')}</b> (${batches}배치)<br>`+
    `EOL 착수: <b>${lastEolStart.toLocaleDateString('ko-KR')}</b>`;
  openMo('mo-confirm-schedule');
}

function applyReverseSchedule(){
  const deadline=_reverseDeadline||asmSelectedDate;
  if(!deadline)return;
  const parts=deadline.split('-');
  const dl=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));

  // ── 호기 범위 읽기 (미입력 시 중단) ──────────────────
  const rk=_reverseRobot==='PARKIE'?'pk':_reverseRobot==='CARRIE'?'ca':'go';
  const f=parseInt(document.getElementById('asc-'+rk+'-from')?.value)||null;
  const t2=parseInt(document.getElementById('asc-'+rk+'-to')?.value)||null;
  if(!f||!t2||t2<f){
    toast('⚠️','호기 범위가 올바르지 않습니다','wa');
    return;
  }
  const count=t2-f+1;
  const batches=Math.ceil(count/PROC.PARALLEL_UNITS);

  // ── 날짜 계산 (updRevCalc와 동일 로직) ────────────────
  const lastEolEnd  = new Date(dl);
  const lastEolStart= subtractWD(new Date(lastEolEnd), PROC.EOL_DAYS);
  const nextmBatchEnd=[],nextmBatchStart=[];
  for(let b=0;b<batches;b++){
    const bStart=subtractWD(new Date(lastEolStart),(batches-b)*PROC.NEXTM_DAYS);
    const bEnd  =addWD(new Date(bStart),PROC.NEXTM_DAYS);
    nextmBatchStart.push(bStart);nextmBatchEnd.push(bEnd);
  }
  const firstNextmStart=nextmBatchStart[0];
  const gbcEnd  =new Date(firstNextmStart);
  const gbcStart=subtractWD(new Date(gbcEnd),PROC.GBC_DAYS);
  const partsOrder=subtractWD(new Date(gbcStart),PROC.PARTS_LEAD);

  // ── 작업 시작일 업데이트 ──────────────────────────────
  const sd=partsOrder.toISOString().slice(0,10);
  laborSettings.startDate=sd;
  const el=document.getElementById('l-sd');if(el)el.value=sd;

  // ── 확정 일정 생성 ────────────────────────────────────
  const cmap={PARKIE:'#0EA5E9',CARRIE:'#7C3AED',GOALIE:'#EC4899'};
  const phases=[];

  // 부품 발주·입고 단계
  phases.push({
    type:'parts', label:'부품 발주·입고',
    start:partsOrder.toISOString().slice(0,10),
    end:gbcStart.toISOString().slice(0,10),
    color:'#8B5CF6', bgColor:'#F5F3FF', textColor:'#6D28D9'
  });
  // GBC 센터 — 달력에는 표시 안 함 (상세모달에서만 확인)
  phases.push({
    type:'gbc', label:`GBC 구동모듈 (${count}대)`,
    start:gbcStart.toISOString().slice(0,10),
    end:gbcEnd.toISOString().slice(0,10),
    color:'#3B5BF6', bgColor:'#EEF1FF', textColor:'#3730A3',
    gantt:false
  });
  // NEXT-M 배치별
  for(let b=0;b<batches;b++){
    const u1=f+b*PROC.PARALLEL_UNITS;
    const u2=Math.min(f+(b+1)*PROC.PARALLEL_UNITS-1,t2);
    phases.push({
      type:'nextm', label:`NEXT-M ${u1}${u1!==u2?'~'+u2:''}호기`,
      start:nextmBatchStart[b].toISOString().slice(0,10),
      end:nextmBatchEnd[b].toISOString().slice(0,10),
      color:cmap[_reverseRobot], bgColor:cmap[_reverseRobot]+'18', textColor:cmap[_reverseRobot]
    });
  }
  // EOL·GTC — 상세 모달에는 표시하되 월간 달력 간트 바에는 미표시
  phases.push({
    type:'eol', label:'EOL (SM·SW 검사)',
    start:lastEolStart.toISOString().slice(0,10),
    end:lastEolEnd.toISOString().slice(0,10),
    color:'#F59E0B', bgColor:'#FEF3C7', textColor:'var(--am-dark)',
    gantt:false  // 월간 달력에 표시 안 함
  });
  phases.push({
    type:'gtc', label:'GTC 운영평가·납품',
    start:lastEolEnd.toISOString().slice(0,10),
    end:lastEolEnd.toISOString().slice(0,10),
    color:'#10B981', bgColor:'#D1FAE5', textColor:'var(--gn-dark)',
    gantt:false  // 월간 달력에 표시 안 함
  });

  const newSched={
    id:'SC'+Date.now(),
    robot:_reverseRobot, unitFrom:f, unitTo:t2,
    deadline:_reverseDeadline, phases,
    memo:'', deliveryTo:'',
    createdAt:new Date().toISOString(),
    userId:CU.id, userName:CU.name
  };
  confirmedSchedules.push(newSched);

  _reverseConfirmed=true;
  closeMo('mo-confirm-schedule');
  closeReversePanel();
  rendAsmCalendar();rendLaborSummary();
  rendCalendar();  // 대시보드 달력도 동기화
  rendDash();      // 대시보드 전체 갱신

  // ── 작업 인원 일정 페이지로 이동해 간트 표시 ──────────
  const techCal=document.getElementById('tech-month-grid');
  if(techCal){
    // 납기일이 포함된 달로 이동
    techCalYear=parseInt(parts[0]);
    techCalMonth=parseInt(parts[1])-1;
  }
  rendTechMonthGrid();

  logActivity(CU.id,CU.name,'LABOR',`납기 역산 확정: ${_reverseRobot} ${f}~${t2}호기 납기 ${_reverseDeadline}`);
  toast('✅',`일정 확정 — 작업 인원 월간 보드에 간트 차트가 표시됩니다`,'ok');
}

// ── 확정 일정 상세 모달 ──────────────────────────────────
function openScheduleDetail(id){
  const sc=confirmedSchedules.find(s=>s.id===id);if(!sc)return;
  document.getElementById('sd-id').value=id;
  document.getElementById('sd-title').textContent=
    `${sc.robot} ${sc.unitFrom}~${sc.unitTo}호기 · 납기 ${sc.deadline}`;
  document.getElementById('sd-robot').textContent=sc.robot;
  document.getElementById('sd-units').textContent=`${sc.unitFrom}~${sc.unitTo}호기 (${sc.unitTo-sc.unitFrom+1}대)`;
  document.getElementById('sd-deadline').textContent=sc.deadline;
  document.getElementById('sd-created').textContent=new Date(sc.createdAt).toLocaleString('ko-KR');
  document.getElementById('sd-memo').value=sc.memo||'';
  document.getElementById('sd-delivery').value=sc.deliveryTo||'';
  // 단계 타임라인
  const cmap={PARKIE:'#0EA5E9',CARRIE:'#7C3AED',GOALIE:'#EC4899'};
  const phaseHtml=sc.phases.map(ph=>`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bd)">
      <div style="width:8px;height:8px;border-radius:50%;background:${ph.color};flex-shrink:0"></div>
      <div style="flex:1;font-size:12px;font-weight:600;color:${ph.textColor}">${ph.label}</div>
      <div style="font-size:11px;color:var(--t2);font-family:var(--fm)">${ph.start}${ph.start!==ph.end?' ~ '+ph.end:''}</div>
    </div>`).join('');
  document.getElementById('sd-phases').innerHTML=phaseHtml;
  openMo('mo-schedule-detail');
}

function saveScheduleDetail(){
  const id=document.getElementById('sd-id').value;
  const sc=confirmedSchedules.find(s=>s.id===id);if(!sc)return;
  sc.memo=document.getElementById('sd-memo').value.trim();
  sc.deliveryTo=document.getElementById('sd-delivery').value.trim();
  logActivity(CU.id,CU.name,'LABOR',`일정 메모 수정: ${sc.robot} ${sc.unitFrom}~${sc.unitTo}호기`);
  closeMo('mo-schedule-detail');
  toast('✅','일정 메모가 저장되었습니다','ok');
}

function deleteSchedule(){
  const id=document.getElementById('sd-id').value;
  const sc=confirmedSchedules.find(s=>s.id===id);if(!sc)return;
  if(!confirm(`"${sc.robot} ${sc.unitFrom}~${sc.unitTo}호기" 확정 일정을 삭제하시겠습니까?\n달력에서 간트 차트가 제거됩니다.`))return;
  const idx=confirmedSchedules.findIndex(s=>s.id===id);
  if(idx>=0)confirmedSchedules.splice(idx,1);
  logActivity(CU.id,CU.name,'LABOR',`확정 일정 삭제: ${sc.robot} ${sc.unitFrom}~${sc.unitTo}호기 납기 ${sc.deadline}`);
  closeMo('mo-schedule-detail');
  rendTechMonthGrid();
  toast('🗑️','확정 일정이 삭제되었습니다','ok');
}

function markTechColor(el,color){
  document.querySelectorAll('#ta-color-pick span').forEach(s=>s.style.border='2px solid transparent');
  el.style.border='2px solid var(--tx)';
}

function lookupUserForTech(val){
  const id=val.trim().toUpperCase();
  const hint=document.getElementById('ta-user-hint');
  const u=USERS[id];
  if(u){
    document.getElementById('ta-name').value=u.name||'';
    if(hint){hint.textContent=`✅ ${u.name} (${u.role==='admin'?'관리자':'일반 사용자'}) 자동 입력됨`;hint.style.display='block';hint.style.color='var(--gn)';}
  } else if(id.length>=4){
    if(hint){hint.textContent='등록되지 않은 사번입니다. 이름을 직접 입력하세요.';hint.style.display='block';hint.style.color='var(--am)';}
  } else {
    if(hint)hint.style.display='none';
  }
}

// ── 예약 취소 (더블클릭) ──────────────────────────────
function cancelBooking(bid){
  if(!bid)return;
  const b=techBookings.find(x=>x.id===bid);if(!b)return;
  const tech=technicians.find(t=>t.id===b.techId);
  if(!confirm(`예약을 취소하시겠습니까?\n\n${b.date} ${slotLabel24(b.startSlot)}~${slotLabel24(b.endSlot)}\n${tech?tech.name:''} · ${b.task||b.type||''}`))return;
  const idx=techBookings.findIndex(x=>x.id===bid);
  if(idx>=0)techBookings.splice(idx,1);
  logActivity(CU.id,CU.name,'TECH',`예약 취소: ${b.date} ${slotLabel24(b.startSlot)}~${slotLabel24(b.endSlot)}`);
  rendTechPage();
  toast('🗑️','예약이 취소되었습니다','ok');
}

// ── 테크니션 삭제 (관리자 전용) ──────────────────────
function deleteTech(techId){
  if(CU.role!=='admin'){toast('🔒','관리자만 작업 인원을 삭제할 수 있습니다','err');return;}
  const t=technicians.find(x=>x.id===techId);if(!t)return;
  if(!confirm(`테크니션 "${t.name}"을 삭제하시겠습니까?\n관련 예약도 모두 삭제됩니다.`))return;
  const idx=technicians.findIndex(x=>x.id===techId);
  if(idx>=0)technicians.splice(idx,1);
  // 해당 테크니션의 예약도 삭제
  techBookings=techBookings.filter(b=>b.techId!==techId);
  logActivity(CU.id,CU.name,'TECH',`작업 인원 삭제: ${t.name}`);
  rendTechPage();
  toast('🗑️',`${t.name} 작업 인원이 삭제되었습니다`,'ok');
}

function submitAddTech(){
  const name=document.getElementById('ta-name').value.trim();
  const uid=document.getElementById('ta-id').value.trim().toUpperCase();
  const skill=document.getElementById('ta-skill').value.trim();
  const colorEl=document.querySelector('input[name="ta-color"]:checked');
  const color=colorEl?colorEl.value:'#3B5BF6';
  if(!name){toast('⚠️','이름을 입력하세요','wa');return;}
  technicians.push({id:'T'+Date.now(),name,userId:uid||null,skill,color});
  ['ta-name','ta-id','ta-skill'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const hint=document.getElementById('ta-user-hint');if(hint)hint.style.display='none';
  closeMo('mo-tech-add');rendTechPage();
  toast('✅',`${name} 작업 인원 등록 완료`,'ok');
}

function submitTechBook(){
  const techId=document.getElementById('tb-tech').value;
  const date=document.getElementById('tb-date').value;
  const type=document.getElementById('tb-type').value;
  const robot=document.getElementById('tb-robot').value;
  const unit=parseInt(document.getElementById('tb-unit').value)||null;
  const note=document.getElementById('tb-note').value.trim();

  // 시작/종료: 드래그 방식이면 슬롯 기반, 모달 직접 입력이면 h 기반
  let sSlot, eSlot;
  if(_pendingBooking){
    // 드래그로 생성된 예약: 슬롯값 그대로 사용
    sSlot=_pendingBooking.startSlot; eSlot=_pendingBooking.endSlot;
  } else {
    // 모달 직접 입력 (시간 select → 슬롯 변환, WORK_START_H 기준)
    const startH=parseInt(document.getElementById('tb-start').value);
    const endH=parseInt(document.getElementById('tb-end').value);
    sSlot=(startH-WORK_START_H)*2; eSlot=(endH-WORK_START_H)*2;
  }

  if(!techId||!date||eSlot<=sSlot){toast('⚠️','작업 인원, 날짜, 시간을 확인하세요','wa');return;}
  if(!type){toast('⚠️','작업 유형을 선택하세요','wa');return;}

  // 날짜 목록 (범위 선택 시 일괄)
  const dates=[];
  if(_pendingBooking?.dateRange){
    let cur=new Date(_pendingBooking.dateRange.start);
    const endD=new Date(_pendingBooking.dateRange.end);
    while(cur<=endD){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
  } else {
    dates=[date];
  }

  dates.forEach(dk=>{
    techBookings.push({
      id:'B'+Date.now()+'_'+dk,
      techId, date:dk,
      startSlot:sSlot, endSlot:eSlot,
      startH:slotToH(sSlot), endH:slotToH(eSlot),
      type, robot, unit,
      note, task:type,
      log:null, userId:CU.id, userName:CU.name, ts:Date.now()
    });
  });

  const tname=technicians.find(t=>t.id===techId)?.name||'?';
  logActivity(CU.id,CU.name,'TECH',
    `예약: ${tname} ${dates[0]}${dates.length>1?'~'+dates[dates.length-1]:''} ${slotLabel24(sSlot)}~${slotLabel24(eSlot)} ${type}`);

  _pendingBooking=null; // 임시 데이터 초기화
  closeMo('mo-tech-book'); rendTechPage();
  toast('✅',dates.length>1?`${tname} ${dates.length}일 일괄 예약 완료`:'작업 예약이 등록되었습니다','ok');
}

function openTechBookingDetail(id){
  const b=techBookings.find(x=>x.id===id);if(!b)return;
  const tech=technicians.find(t=>t.id===b.techId);
  document.getElementById('techlog-title').textContent=`작업 기록 — ${tech?.name||'?'}`;
  document.getElementById('techlog-sub').textContent=`${b.date} ${slotLabel24(b.startSlot)}~${slotLabel24(b.endSlot)} · ${b.task||b.type||''}`;
  // booker info
  document.getElementById('tl-booker').textContent=`${b.userName||'-'} (${b.userId||'-'})`;
  document.getElementById('tl-booked-time').textContent=`${slotLabel24(b.startSlot)} ~ ${slotLabel24(b.endSlot)}`;
  document.getElementById('tl-booked-task').textContent=b.task||b.type||'-';
  document.getElementById('tl-booking-id').value=id;
  document.getElementById('tl-unplanned').value=b.log?.unplanned||'';
  document.getElementById('tl-memo').value=b.log?.memo||'';
  // populate tl-start/end selects dynamically (0:00~23:30)
  const mkOpts=(selId,cur)=>{
    const sel=document.getElementById(selId);if(!sel)return;
    sel.innerHTML=Array.from({length:WORK_SLOTS+1},(_,s)=>`<option value="${s}"${s===cur?' selected':''}>${slotLabel24(s)}</option>`).join('');
  };
  const curStart=b.log?.actualStart!=null?b.log.actualStart:b.startSlot;
  const curEnd=b.log?.actualEnd!=null?b.log.actualEnd:b.endSlot;
  mkOpts('tl-start',curStart);mkOpts('tl-end',curEnd);
  const isTech=technicians.find(t=>t.id===b.techId&&t.userId===CU.id);
  document.getElementById('tl-unplanned').readOnly=!isTech&&CU.role!=='admin';
  openMo('mo-tech-log');
}

function submitTechLog(){
  const id=document.getElementById('tl-booking-id').value;
  const b=techBookings.find(x=>x.id===id);if(!b)return;
  b.log={
    unplanned:document.getElementById('tl-unplanned').value.trim(),
    memo:document.getElementById('tl-memo').value.trim(),
    actualStart:parseInt(document.getElementById('tl-start').value),
    actualEnd:parseInt(document.getElementById('tl-end').value)
  };
  logActivity(CU.id,CU.name,'TECH',`작업 기록 저장: ${b.date} ${slotLabel24(b.startSlot)}~${slotLabel24(b.endSlot)}`);
  closeMo('mo-tech-log');rendTechPage();toast('✅','작업 내역이 저장되었습니다','ok');
}

function submitDelay(){
  // ── 지연 사유 등록 ─────────────────────────────────────
  const techId=document.getElementById('dl-tech').value;
  const date=document.getElementById('dl-date').value;
  const dtype=document.getElementById('dl-type').value;
  const title=document.getElementById('dl-title').value.trim();
  const body=document.getElementById('dl-body').value.trim();
  const hours=parseFloat(document.getElementById('dl-hours').value)||0;
  if(!title||!date){toast('⚠️','날짜와 제목을 입력하세요','wa');return;}

  // delayLogs 배열에 추가
  delayLogs.push({
    id:'D'+Date.now(),
    techId, date, type:dtype,
    title, body, hours,
    userId:CU.id, userName:CU.name, ts:Date.now()
  });
  logActivity(CU.id,CU.name,'DELAY',`지연: [${dtype}] ${title} ${hours}h`);
  closeMo('mo-delay');

  // ── 페이지 새로고침 ───────────────────────────────────
  // 테크니션 페이지에 있으면 전체 새로고침, 아니면 딜레이 테이블만
  rendTechPage();
  toast('⚠️','지연 사유가 등록되었습니다','ok');
}

function rendDelayTable(){
  // ── 지연 사유 목록 테이블 렌더링 ─────────────────────
  // delayLogs 배열 → 테이블 rows 로 변환, 최신순 정렬
  const tb=document.getElementById("tb-delay");if(!tb)return;
  tb.innerHTML=delayLogs.length
    ?[...delayLogs].sort((a,b)=>b.ts-a.ts).map(d=>{
      const tech=technicians.find(t=>t.id===d.techId);
      return`<tr>
        <td class="t-m t-sm">${d.date}</td>
        <td class="t-sm">${tech?tech.name:"-"}</td>
        <td><span style="background:var(--aml);color:var(--am-dark);border-radius:4px;padding:2px 7px;font-size:10px;font-family:var(--fm)">${d.type}</span></td>
        <td style="font-weight:500;font-size:12px">${d.title}</td>
        <td class="t-mu t-sm">${d.body||"-"}</td>
        <td class="t-m t-sm" style="color:var(--re);font-weight:600">-${d.hours}h</td>
      </tr>`;
    }).join("")
    :"<tr><td colspan=\"6\" style=\"text-align:center;padding:14px;color:var(--t2);font-size:12px\">지연 사유 없음</td></tr>";
}

function populateTechSels(){
  ['tb-tech','dl-tech'].forEach(id=>{const sel=document.getElementById(id);if(!sel)return;sel.innerHTML='<option value="">작업 인원 선택</option>'+technicians.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');});
}

