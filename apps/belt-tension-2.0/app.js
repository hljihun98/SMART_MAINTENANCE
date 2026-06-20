"use strict";

/* toast alias — preserves 3200ms auto-hide timing of original */
const toast = (msg, type, dur) => smToast(msg, type, dur || 3200);

/* ---------- 분석 상수 ---------- */
const MIN_FREQ = 10;
const MAX_FREQ = 5000;
const ABS_MIN_DB = -72;
const PROMINENCE_DB = 9;
const NOISE_LOUD_DB = -42;
const BROADBAND_RATIO = 0.45;
const BUF_SIZE = 5;
const OUTLIER_TOL = 0.12;
const G = 9.80665;

/* ---------- PDF 헬퍼 (센서점검 앱 동일 스타일) ---------- */
const PDF_FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif";
const MM_TO_PX = 96 / 25.4;
let logoImagePromise = null;
function getLogoImage(){
  if(!logoImagePromise){
    logoImagePromise = new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = reject;
      img.src = '../../logo.png';
    });
  }
  return logoImagePromise;
}
function textToPng(text, opt={}){
  const sz=opt.size||7, bold=opt.bold?'700':'400';
  const color=Array.isArray(opt.color)?'rgb('+opt.color+')':opt.color||'#111';
  const scale=3, px=sz*96/72, pad=opt.pad??1.5;
  const cv=document.createElement('canvas'), ctx=cv.getContext('2d');
  ctx.font=bold+' '+px+'px '+PDF_FONT;
  const mw=ctx.measureText(String(text||' ')).width;
  const w=Math.max(1,Math.ceil(mw+pad*2)), h=Math.max(1,Math.ceil(px*1.45+pad*2));
  cv.width=w*scale; cv.height=h*scale;
  const c=cv.getContext('2d'); c.scale(scale,scale);
  c.font=bold+' '+px+'px '+PDF_FONT;
  c.fillStyle=color; c.textBaseline='middle';
  c.fillText(String(text||''),pad,h/2);
  return {data:cv.toDataURL('image/png'), wmm:w/MM_TO_PX, hmm:h/MM_TO_PX};
}
function pdfText(doc, text, x, y, opt={}){
  const t=textToPng(text,opt);
  let xx=x, yy=y;
  if(opt.align==='center') xx=x-t.wmm/2;
  else if(opt.align==='right') xx=x-t.wmm;
  if(opt.valign==='middle') yy=y-t.hmm/2;
  doc.addImage(t.data,'PNG',xx,yy,t.wmm,t.hmm,undefined,'FAST');
}

/* ---------- 벨트 ID 정의 (고정) ---------- */
const BELT_PRESETS = {
  lifting: { label:'리프팅 벨트', targetN:500, tolPct:10, mass:4.2, width:35, span:147, cf:1.000 },
  drive:   { label:'구동모듈 벨트', targetN:170, tolPct:20, mass:2.8, width:20, span:88,  cf:1.000 }
};
const BELT_IDS = [
  {key:'ID1', type:'drive',   label:'ID1'},
  {key:'ID2', type:'drive',   label:'ID2'},
  {key:'ID3', type:'drive',   label:'ID3'},
  {key:'ID4', type:'drive',   label:'ID4'},
  {key:'ID5', type:'lifting', label:'ID5'},
  {key:'ID6', type:'lifting', label:'ID6'},
];

/* ---------- 전역 상태 ---------- */
let audioCtx=null, analyser=null, srcNode=null, micStream=null;
let floatBuf=null, byteBuf=null, waveformBuf=null, rafId=null;
let measuring=false, held=false;
let dispFreq=0;
let peakBuffer=[];
let currentResult=null;
let activeBeltType=null;   // 현재 측정 중인 벨트 타입 ('lifting'|'drive')
let selectedDriveIds=new Set();   // 선택된 구동모듈 ID (초기: 없음)
let selectedLiftingIds=new Set(); // 선택된 리프팅 ID (초기: 없음)
let robots=[];             // [{id,unit,createdAt,completedAt,slots:[]}]
let activeRobot=null;      // 현재 측정 중인 로봇
let activeSlotIdx=0;       // 현재 slots[] 인덱스
let measureStartTs=0;
let collecting=false, strikeTs=0, collectStartTs=0, collectEndTs=0, collectedSnapshots=[];
let lastStrikeAt=0;
let guideActive=false, guideStartTs=0, guidePeriodMs=3000, guidePeakFired=false;
let collectionMaxRms=0;
let noiseReduction={enabled:false};
let noiseProfile=null;
let noiseProfileReady=false;
let filterStrength=2;   // 1~4: 노이즈 필터 강도 & 충격감지 임계값 연동
let ambientRms=0.02;    // 적응형 주변 RMS (EMA 추적)
let learnElapsedMs=0;   // 재학습: 조용한 구간 누적 시간
let learnLastTs=null;   // 재학습: 직전 조용한 프레임 타임스탬프
let learnLastPct=-1;    // throttle: 동일 pct 중복 DOM 업데이트 방지
let learnRequested=false; // 재학습 버튼 클릭 시에만 true — 자동 학습 방지
const LEARN_DURATION_MS=3000;  // 학습 완료까지 필요한 조용한 시간 (ms)
let targetLock={enabled:false, widthPct:30};
let lockCenter=NaN, lockLoBin=-1, lockHiBin=-1;
let flowEnabled=true;
let simpleHistory=[];

/* ---------- DOM 캐시 ---------- */
const $ = id => document.getElementById(id);
const inMass=$('inMass'), inWidth=$('inWidth'), inSpan=$('inSpan'), inCF=$('inCF'), inTargetN=$('inTargetN'), inTolPct=$('inTolPct'), selFFT=$('selFFT');
const btnStart=$('btnStart'), btnStop=$('btnStop'),
      btnSave=$('btnSave'), btnClear=$('btnClear'),
      btnCSV=$('btnCSV'), btnPDF=$('btnPDF'),
      btnCancelSetup=$('btnCancelSetup'), btnAddRobot=$('btnAddRobot');
const inUnit=$('inUnit');
const inDriveMeas=$('inDriveMeas'), inLiftingMeas=$('inLiftingMeas');

/* ---------- 보고서 버튼 활성화 ---------- */
function updateReportButtons(){
  const hasData = robots.length > 0;
  if(btnPDF) btnPDF.disabled = !hasData;
  if(btnCSV) btnCSV.disabled = !hasData;
}

/* ---------- 측정 플로우 단계 ---------- */
let currentStep=1;
function setStep(n){
  document.body.dataset.step = String(n);
  currentStep=n;
  if(!flowEnabled){
    const fs2=$('fs2'), fs3=$('fs3');
    if(fs2) fs2.className='flow-step s-active';
    if(fs3) fs3.className='flow-step s-active';
    if(btnCancelSetup) btnCancelSetup.style.display='none';
    return;
  }
  for(let i=1;i<=5;i++){
    const si=$('si'+i), fs=$('fs'+i);
    if(si) si.className='step-item'+(i<n?' s-done':i===n?' s-active':'');
    if(fs) fs.className='flow-step'+(i<n?' s-done':i===n?' s-active':'');
    if(i<5){const sc=$('sc'+i+(i+1)); if(sc) sc.className='step-conn'+(i<n?' s-done':'');}
  }
  if(btnCancelSetup) btnCancelSetup.style.display = (n===2 && activeRobot) ? 'flex' : 'none';
  updateSessionSwitchRow();
}

/* ---------- 벨트 ID 개별 선택 ---------- */
function toggleBeltId(key){
  const def = BELT_IDS.find(d=>d.key===key);
  if(!def) return;
  const set = def.type==='drive' ? selectedDriveIds : selectedLiftingIds;
  if(set.has(key)) set.delete(key);
  else set.add(key);
  refreshBeltBtns(def.type);
}
function clearBeltGroup(type){
  if(type==='drive') selectedDriveIds.clear();
  else selectedLiftingIds.clear();
  refreshBeltBtns(type);
}
function refreshBeltBtns(type){
  const set = type==='drive' ? selectedDriveIds : selectedLiftingIds;
  const grp = $(type==='drive'?'driveCountBtns':'liftingCountBtns');
  if(grp) grp.querySelectorAll('.cnt-btn').forEach(b=>{
    const k = b.dataset.key;
    b.classList.toggle('cnt-active', k==='none' ? set.size===0 : set.has(k));
  });
  const row = $(type==='drive'?'driveMeasRow':'liftingMeasRow');
  if(row) row.style.display = set.size>0 ? 'flex' : 'none';
}
function setBeltCount(type, n){ /* 하위호환 shim — 사용 안 함 */ }

/* ---------- 활성 슬롯 목록 생성 ---------- */
function buildActiveSlots(){
  const dm=parseInt(inDriveMeas&&inDriveMeas.value)||1;
  const lm=parseInt(inLiftingMeas&&inLiftingMeas.value)||1;
  return BELT_IDS
    .filter(def => (def.type==='drive' ? selectedDriveIds : selectedLiftingIds).has(def.key))
    .map(def => {
      const p = BELT_PRESETS[def.type];
      return {
        key: def.key, type: def.type, label: def.label,
        targetN: p.targetN, tolPct: p.tolPct,
        mass: parseFloat(inMass.value)||p.mass,
        width: parseFloat(inWidth.value)||p.width,
        span: parseFloat(inSpan.value)||p.span,
        cf: parseFloat(inCF.value)||p.cf,
        measCount: def.type==='drive' ? dm : lm,
        values: [], average: null, avgJudge: null, completedAt: null
      };
    });
}

/* ---------- 단순 모드 벨트 사양 빠른 선택 ---------- */
function applyBeltPreset(type){
  const p = BELT_PRESETS[type];
  if(!p) return;
  inMass.value = p.mass;
  inWidth.value = p.width;
  inSpan.value = p.span;
  inCF.value = p.cf.toFixed(3);
  inTargetN.value = p.targetN;
  inTolPct.value = p.tolPct;
  refreshPresetEstimate();
  document.querySelectorAll('.belt-preset-btn').forEach(b => b.classList.remove('bpb-active'));
  const btn = $('preset' + (type === 'drive' ? 'Drive' : 'Lifting'));
  if(btn) btn.classList.add('bpb-active');
  toast(p.label + ' 사양을 적용했습니다.', 'ok');
}

/* ---------- 슬롯 프리셋 적용 ---------- */
function applySlotPreset(slot){
  activeBeltType = slot.type;
  const changed = [];
  if(isFinite(slot.mass) && inMass.value !== '' && parseFloat(inMass.value) !== slot.mass)
    changed.push(`Mass ${inMass.value}→${slot.mass}`);
  if(isFinite(slot.span) && inSpan.value !== '' && parseFloat(inSpan.value) !== slot.span)
    changed.push(`Span ${inSpan.value}→${slot.span}`);
  if(changed.length) toast(`${slot.label} 전환: ${changed.join(', ')} 으로 조건 변경됨`, 'warn', 4000);
  inMass.value = slot.mass; inWidth.value = slot.width;
  inSpan.value = slot.span; inCF.value = slot.cf.toFixed(3);
  inTargetN.value = slot.targetN; inTolPct.value = slot.tolPct;
  refreshPresetEstimate();
  updateSlotProgress();
}

/* ---------- Step 2 진행 칩 ---------- */
function updateSlotProgress(){
  const el=$('measureProgress');
  if(el){
    if(!activeRobot){ el.textContent='0 / 1'; el.className='progress-chip'; }
    else{
      const slot = activeRobot.slots[activeSlotIdx];
      if(!slot){ el.textContent=''; }
      else{
        const cur=slot.values.length, max=slot.measCount;
        el.textContent = slot.label+' · '+cur+' / '+max;
        el.className = 'progress-chip'+(cur>0?' has-data':'');
      }
    }
  }

  // 모바일 전용 미니 배너 갱신
  const mini=$('sessionMiniProgress');
  if(!mini) return;
  if(!activeRobot || !flowEnabled){ mini.style.display='none'; return; }
  mini.style.display='flex';
  const smpR=$('smpRobot'), smpS=$('smpSlot'), smpC=$('smpChips');
  if(smpR) smpR.textContent = activeRobot.unit+'호기';
  const slot = activeRobot.slots[activeSlotIdx];
  if(smpS && slot) smpS.textContent = slot.label+' · '+slot.values.length+'/'+slot.measCount+'회';
  if(smpC) smpC.innerHTML = activeRobot.slots.map((s,i)=>{
    const done=!!s.completedAt, cur=(i===activeSlotIdx);
    const cls = done?'smp-chip-done':cur?'smp-chip-cur':'smp-chip-todo';
    const judge = done&&s.avgJudge?' · '+s.avgJudge:'';
    return `<span class="smp-chip ${cls}">${s.label}${judge}</span>`;
  }).join('');
}
function updateProgressChip(){ updateSlotProgress(); }  // 하위호환

/* ---------- 호기 큐에 추가 ---------- */
function addRobotToQueue(){
  const unit = inUnit ? inUnit.value.trim() : '';
  if(!unit){ toast('호기 번호를 입력해주세요.','err'); inUnit&&inUnit.focus(); return; }
  if(selectedDriveIds.size+selectedLiftingIds.size===0){ toast('벨트를 1개 이상 선택해주세요.','err'); return; }
  if(robots.some(r=>r.unit===unit&&!r.completedAt)){
    toast(unit+'호기가 이미 추가되어 있습니다.','err'); return;
  }
  const slots = buildActiveSlots();
  if(!slots.length){ toast('활성화된 벨트 슬롯이 없습니다.','err'); return; }
  const robot = { id:Date.now(), unit, createdAt:new Date(), startedAt:null, completedAt:null, slots };
  robots.push(robot);
  renderRobotProgress();
  renderRobots();
  updateReportButtons();
  updateSessionSwitchRow();
  inUnit.value='';
  inUnit.focus();
  saveState();
  toast(unit+'호기가 추가되었습니다.','ok');
}

/* ---------- 로봇 시퀀스 시작 ---------- */
function saveResult(){ saveCurrentSlot(); }  // btnSave 이벤트 호환

function initRobotIfNeeded(){
  if(activeRobot) return true;  // 이미 진행 중

  // 1순위: 큐에서 대기 중인 첫 호기 선택
  const pending = robots.find(r=>!r.startedAt);
  if(pending){
    activeRobot = pending;
    pending.startedAt = new Date();
    activeSlotIdx = 0;
    applySlotPreset(pending.slots[0]);
    renderRobotProgress();
    renderRobots();
    updateSessionSwitchRow();
    return true;
  }

  // 2순위(폴백): Step 1 현재 입력으로 즉시 생성
  const unit = inUnit ? inUnit.value.trim() : '';
  if(!unit){ toast('호기를 추가하거나 호기 번호를 입력해주세요.','err'); return false; }
  if(selectedDriveIds.size+selectedLiftingIds.size===0){ toast('벨트를 1개 이상 선택해주세요.','err'); return false; }
  const slots = buildActiveSlots();
  if(!slots.length){ toast('활성화된 벨트 슬롯이 없습니다.','err'); return false; }
  const robot = { id:Date.now(), unit, createdAt:new Date(), startedAt:new Date(), completedAt:null, slots };
  robots.push(robot);
  activeRobot = robot;
  activeSlotIdx = 0;
  applySlotPreset(slots[0]);
  renderRobotProgress();
  renderRobots();
  updateSessionSwitchRow();
  return true;
}

/* ---------- 현재 슬롯 저장 ---------- */
function saveCurrentSlot(){
  if(!currentResult||!isFinite(currentResult.freq)){
    toast('유효한 주파수가 없습니다.','err'); return;
  }
  if(!flowEnabled){
    const {targetN,tolPct}=readTarget();
    let judge='--';
    if(isFinite(targetN)&&isFinite(tolPct)){
      const lower=targetN*(1-tolPct/100), upper=targetN*(1+tolPct/100);
      judge=currentResult.corrN>=lower&&currentResult.corrN<=upper?'OK':'NG';
    }
    simpleHistory.push({time:new Date(),freq:currentResult.freq,corrN:currentResult.corrN,
      rawN:currentResult.rawN,kgf:currentResult.kgf,conf:currentResult.confidence||0,
      mass:currentResult.mass,width:currentResult.width,span:currentResult.span,cf:currentResult.cf,
      targetN,tolPct,judge});
    beep(1320,80);
    renderSimpleHistory();
    saveState();
    toast('저장되었습니다.','ok');
    resetForNextMeasurement(false);
    return;
  }
  if(!activeRobot){ toast('호기가 설정되지 않았습니다.','err'); return; }
  const slot = activeRobot.slots[activeSlotIdx];
  slot.mass = currentResult.mass; slot.width = currentResult.width;
  slot.span = currentResult.span; slot.cf = currentResult.cf;
  const lower = slot.targetN*(1-slot.tolPct/100), upper = slot.targetN*(1+slot.tolPct/100);
  const judge = currentResult.corrN>=lower && currentResult.corrN<=upper ? 'OK' : 'NG';
  slot.values.push({freq:currentResult.freq, corrN:currentResult.corrN, kgf:currentResult.kgf,
    rawN:currentResult.rawN, conf:currentResult.confidence||0, time:new Date(), judge});
  beep(1320, 80);
  saveState();

  const slotDone = slot.values.length >= slot.measCount;
  if(slotDone){
    slot.completedAt = new Date();
    const avg = slot.values.reduce((s,v)=>s+v.corrN,0)/slot.values.length;
    slot.average = avg;
    const lo=slot.targetN*(1-slot.tolPct/100), hi=slot.targetN*(1+slot.tolPct/100);
    slot.avgJudge = avg>=lo&&avg<=hi ? 'OK' : 'NG';
    const allDone = activeRobot.slots.every(s=>s.completedAt);
    if(allDone){
      activeRobot.completedAt = new Date();
      const completedUnit = activeRobot.unit;
      renderRobots();
      renderRobotProgress();

      const nextPending = robots.find(r=>!r.startedAt);
      if(nextPending){
        activeRobot = null; activeSlotIdx = 0;
        resetForNextMeasurement(false);
        activeRobot = nextPending;
        nextPending.startedAt = new Date();
        activeSlotIdx = 0;
        applySlotPreset(nextPending.slots[0]);
        renderRobotProgress();
        renderRobots();
        updateSessionSwitchRow();
        toast(completedUnit+'호기 완료 → '+nextPending.unit+'호기 측정을 시작합니다.','ok',4000);
        setStep(2);
        startMeasure();
      } else {
        activeRobot = null;
        resetForNextMeasurement(true);
        setStep(4);
        updateSessionSwitchRow();
        toast('모든 호기 측정 완료! 보고서를 다운로드하세요.','ok',4800);
      }
      return;
    }
    activeSlotIdx++;
    toast(slot.label+' 완료 (평균 '+slot.average.toFixed(1)+' N → '+slot.avgJudge+') — 다음으로 이동','ok',3000);
    renderRobotProgress();
    renderRobots();
    resetForNextMeasurement(false);
    applySlotPreset(activeRobot.slots[activeSlotIdx]);
    setStep(2);
    startMeasure();
  }else{
    const rem = slot.measCount - slot.values.length;
    toast('저장 ('+slot.values.length+'/'+slot.measCount+'회) · 남은: '+rem,'ok');
    renderRobotProgress();
    renderRobots();
    resetForNextMeasurement(false);
  }
}

/* ---------- 현재 호기 설정 취소 ---------- */
function cancelCurrentRobot(){
  if(!activeRobot){ setStep(1); return; }
  const hasMeasurements = activeRobot.slots.some(s=>s.values.length>0);
  if(hasMeasurements &&
     !confirm('이미 저장된 측정값이 있습니다.\n현재 호기 측정을 취소하면 미완료 상태로 남습니다. 계속할까요?')) return;
  if(measuring) stopMeasure();
  robots=robots.filter(r=>r!==activeRobot);
  activeRobot=null; activeSlotIdx=0; currentResult=null;
  renderRobots();
  renderRobotProgress();
  updateReportButtons();
  setStep(1);
  updateSessionSwitchRow();
  saveState();
  toast('측정 설정을 취소했습니다.','warn');
}

/* ---------- 측정 초기화 ---------- */
function resetForNextMeasurement(done){
  currentResult=null; dispFreq=0;
  if(waveformBuf){ waveformBuf.fill(128); drawWaveform(); }
  btnSave.disabled=true;
  if(!measuring){
    btnStart.disabled=false; btnStop.disabled=true; selFFT.disabled=false;
  }
  setStatus('ready', done ? '대기 중' : '대기 중 — 벨트를 튕겨주세요', 'READY');
}

/* ---------- 회차 측정값 취소 ---------- */
function cancelSlotMeasurement(vi){
  if(!activeRobot) return;
  const slot = activeRobot.slots[activeSlotIdx];
  if(!slot) return;
  slot.values.splice(vi, 1);
  slot.completedAt=null; slot.average=null; slot.avgJudge=null;
  activeRobot.completedAt=null;
  renderRobotProgress();
  renderRobots();
  updateSlotProgress();
  setStep(2);
  toast((vi+1)+'회차 측정값을 삭제했습니다.','warn');
}

/* ---------- 다음 호기 프롬프트 (자동 진행으로 대체 — stub 유지) ---------- */
function showNextRobotPrompt(){}
function startNextRobot(){}
function promptNextRobot(){}

/* ---------- Step 1 세션 전환 행 ---------- */
function updateSessionSwitchRow(){
  const row=$('sessionSwitchRow'), info=$('sessionSwitchInfo');
  if(!row||!info) return;
  if(robots.length>0){
    const done=robots.filter(r=>r.completedAt).length;
    const pending=robots.filter(r=>!r.startedAt).length;
    info.textContent='총 '+robots.length+'개 호기 · 완료 '+done+' · 대기 '+pending;
    row.style.display='flex';
  }else{ row.style.display='none'; }
}

/* ---------- 로봇 진행 표시 (Step 4) — robots[] 전체 카드 렌더링 ---------- */
function renderRobotProgress(){
  const el=$('sessionProgress'); if(!el) return;
  if(!robots.length){
    el.innerHTML='<div class="robot-empty">추가된 호기가 없습니다.</div>';
    return;
  }
  el.innerHTML = robots.map(robot=>{
    const isPending = !robot.startedAt;
    const isActive  = robot === activeRobot;
    const isDone    = !!robot.completedAt;

    /* ── 대기 중 카드 ── */
    if(isPending){
      const driveKeys = robot.slots.filter(s=>s.type==='drive').map(s=>s.key).join(' · ') || '없음';
      const liftKeys  = robot.slots.filter(s=>s.type==='lifting').map(s=>s.key).join(' · ') || '없음';
      return `<div class="robot-card robot-pending robot-clickable" onclick="startRobotFromProgress(${robot.id})">
        <div class="robot-card-head">
          <span class="robot-unit">${robot.unit}호기</span>
          <span class="robot-tag robot-tag-pending">▶ 클릭하여 시작</span>
          <button class="robot-del" onclick="event.stopPropagation();deleteRobot(${robot.id})" title="삭제">✕</button>
        </div>
        <div class="robot-card-config">구동 ${driveKeys} · 리프팅 ${liftKeys}</div>
      </div>`;
    }

    /* ── 완료 카드 (컴팩트) ── */
    if(isDone){
      const chips = robot.slots.map(slot=>{
        if(!slot.values.length) return '';
        const cls = slot.avgJudge==='OK' ? 'prog-ok' : 'prog-ng';
        return `<div class="prog-chip ${cls}">
          <span class="prog-num">${slot.label}</span>
          <span class="prog-val">${slot.average!=null?slot.average.toFixed(1):'—'}</span>
          <span class="prog-unit">N</span>
        </div>`;
      }).join('');
      return `<div class="robot-card robot-done">
        <div class="robot-card-head">
          <span class="robot-unit">${robot.unit}호기</span>
          <span class="robot-tag robot-tag-done">✓ 완료</span>
          <button class="robot-del" onclick="deleteRobot(${robot.id})" title="삭제">✕</button>
        </div>
        <div class="prog-grid">${chips}</div>
      </div>`;
    }

    /* ── 측정 중/일시중지 카드 ── */
    // isCurrent: activeRobot인 경우에만 현재 슬롯 강조
    const isCurrent = (si) => isActive && si===activeSlotIdx;
    const slotsHtml = robot.slots.map((slot,si)=>{
      const done   = !!slot.completedAt;
      const cur    = isCurrent(si);
      const chips = slot.values.map((v,vi)=>{
        const cls = v.judge==='OK' ? 'prog-ok' : 'prog-ng';
        return `<div class="prog-chip ${cls}">
          ${cur?`<button class="prog-del" onclick="event.stopPropagation();cancelSlotMeasurement(${vi})" title="취소">✕</button>`:''}
          <span class="prog-num">${vi+1}회</span>
          <span class="prog-val">${v.corrN.toFixed(1)}</span>
          <span class="prog-unit">N</span>
        </div>`;
      }).join('');
      const empties = done ? '' : Array.from({length:slot.measCount-slot.values.length},(_,i)=>
        `<div class="prog-chip prog-empty"><span class="prog-num">${slot.values.length+i+1}회</span><span class="prog-val">—</span></div>`
      ).join('');
      const avgBlock = done && slot.average!=null ?
        `<div class="prog-avg ${slot.avgJudge==='OK'?'avg-ok':'avg-ng'}">
           <span class="avg-label">평균</span><span class="avg-val">${slot.average.toFixed(1)} N</span>
           <span class="avg-judge">${slot.avgJudge}</span>
         </div>` : '';
      const statusTag = done ? '<span class="slot-tag-done">✓</span>' :
                        cur  ? '<span class="slot-tag-now">측정 중</span>' :
                               '<span class="slot-tag-goto">탭하여 이동</span>';
      const clickAttr = done ? '' : `onclick="switchToSlot(${robot.id},${si})"`;
      return `<div class="slot-section ${cur?'slot-cur':''}${done?' slot-done':' slot-goto'}" ${clickAttr}>
        <div class="slot-head"><span class="slot-key">${slot.label}</span>${statusTag}</div>
        <div class="prog-grid">${chips}${empties}</div>${avgBlock}
      </div>`;
    }).join('');

    const robotTag = isActive
      ? '<span class="robot-tag robot-tag-active">측정 중</span>'
      : '<span class="robot-tag robot-tag-paused">일시중지</span>';
    return `<div class="robot-card robot-active${isActive?'':' robot-paused'}">
      <div class="robot-card-head">
        <span class="robot-unit">${robot.unit}호기</span>
        ${robotTag}
        <button class="robot-del" onclick="deleteRobot(${robot.id})" title="삭제">✕</button>
      </div>
      ${slotsHtml}
    </div>`;
  }).join('');

  updateSessionSwitchRow();
}

/* ---------- 세션 진행 — 슬롯 직접 이동 ---------- */
function switchToSlot(robotId, slotIdx){
  const robot = robots.find(r=>r.id===robotId);
  if(!robot) return;
  const slot = robot.slots[slotIdx];
  if(!slot) return;
  if(measuring) stopMeasure();
  if(!robot.startedAt) robot.startedAt = new Date();
  activeRobot = robot;
  activeSlotIdx = slotIdx;
  applySlotPreset(slot);
  renderRobotProgress();
  renderRobots();
  updateSessionSwitchRow();
  setStep(2);
  saveState();
  toast(robot.unit+'호기 '+slot.label+' 측정으로 이동합니다.','ok');
}

/* ---------- 대기 호기 클릭으로 시작 ---------- */
function startRobotFromProgress(id){
  const robot = robots.find(r=>r.id===id);
  if(!robot || robot.startedAt) return;
  if(measuring) stopMeasure();
  activeRobot = robot;
  robot.startedAt = new Date();
  activeSlotIdx = 0;
  applySlotPreset(robot.slots[0]);
  renderRobotProgress();
  renderRobots();
  updateSessionSwitchRow();
  setStep(2);
  saveState();
  toast(robot.unit+'호기 측정을 시작합니다.','ok');
}

/* ---------- 호기 삭제 ---------- */
function deleteRobot(id){
  const robot = robots.find(r=>r.id===id);
  if(!robot) return;
  const isActive = robot === activeRobot;
  const hasMeasurements = robot.slots.some(s=>s.values.length>0);
  if(hasMeasurements){
    if(!confirm(robot.unit+'호기를 삭제할까요? 저장된 측정값도 함께 삭제됩니다.')) return;
  }
  if(isActive){
    if(measuring) stopMeasure();
    activeRobot=null; activeSlotIdx=0; currentResult=null;
  }
  robots=robots.filter(r=>r.id!==id);
  renderRobots(); renderRobotProgress(); updateReportButtons(); updateSessionSwitchRow();
  if(isActive) setStep(1);
  saveState();
  toast(robot.unit+'호기가 삭제됐습니다.','warn');
}

const estFreq=$('estFreq'), kconst=$('kconst');
const statusDot=$('statusDot'), statusText=$('statusText'), statusPill=$('statusPill');
const liveFreq=$('liveFreq'), livePeak=$('livePeak'), meterFill=$('meterFill'), meterVal=$('meterVal');
const canvas=$('spectrum'), ctx=canvas&&canvas.getContext('2d');
const waveCanvas=$('waveform'), waveCtx=waveCanvas&&waveCanvas.getContext('2d');
const resTarget=$('resTarget'), resJudge=$('resJudge'), resJudgeWrap=$('resJudgeWrap');

/* ================================================================
   상태 배지 갱신
   ================================================================ */
function setStatus(state, text, pillText){
  statusText.textContent=text;
  statusPill.textContent=pillText;
  statusPill.className='status-pill '+
    ({ready:'',listen:'s-listen',good:'s-good',weak:'s-weak',noise:'s-noise',bad:'s-bad'}[state]||'');
  statusDot.className='dot'+(state==='listen'||state==='good'?' live':'');
  if(state==='good') statusDot.style.background='var(--green)';
  else if(state==='listen') statusDot.style.background='var(--cyan)';
  else if(state==='weak') statusDot.style.background='var(--amber)';
  else if(state==='noise') statusDot.style.background='var(--orange)';
  else if(state==='bad') statusDot.style.background='var(--red)';
  else statusDot.style.background='var(--muted-2)';
}

/* ================================================================
   입력값 검증
   ================================================================ */
function readInputs(){
  const mass=parseFloat(inMass.value);
  const width=parseFloat(inWidth.value);
  const span=parseFloat(inSpan.value);
  let cf=parseFloat(inCF.value);
  if(!isFinite(cf)||cf<=0) cf=1.0;
  return {mass,width,span,cf};
}
function readTarget(){
  let targetN=parseFloat(inTargetN.value);
  let tolPct=parseFloat(inTolPct.value);
  if(!isFinite(targetN) || targetN<=0) targetN=NaN;
  if(!isFinite(tolPct) || tolPct<=0) tolPct=NaN;
  return {targetN, tolPct};
}
function validateInputs(){
  [inMass,inWidth,inSpan].forEach(el=>el.classList.remove('invalid'));
  const {mass,width,span}=readInputs();
  if([mass,width,span].some(v=>isNaN(v))){
    [inMass,inWidth,inSpan].forEach(el=>{ if(isNaN(parseFloat(el.value))) el.classList.add('invalid'); });
    toast('입력값을 모두 입력해주세요.', 'err');
    return false;
  }
  if(mass<=0||width<=0||span<=0){
    [inMass,inWidth,inSpan].forEach(el=>{ if(parseFloat(el.value)<=0) el.classList.add('invalid'); });
    toast('Mass, Width, Span은 0보다 큰 값을 입력해야 합니다.', 'err');
    return false;
  }
  return true;
}

/* ================================================================
   장력 계산
   ================================================================ */
function calcTension(mass,width,span,freq,cf){
  const rawN = 4*mass*width*span*span*freq*freq*1e-9;
  const corrN = rawN*cf;
  const kgf = corrN/G;
  return {rawN, corrN, kgf};
}
function calcExpectedFreq(mass,width,span,targetN,cf){
  const safeCF = (isFinite(cf) && cf > 0) ? cf : 1;
  const denom = 4 * mass * width * span * span * 1e-9 * safeCF;
  if(!isFinite(targetN) || targetN <= 0 || !isFinite(denom) || denom <= 0) return NaN;
  return Math.sqrt(targetN / denom);
}
function refreshPresetEstimate(){
  const mass = parseFloat(inMass.value);
  const width = parseFloat(inWidth.value);
  const span = parseFloat(inSpan.value);
  const targetN = parseFloat(inTargetN.value);
  const cf = parseFloat(inCF.value);
  const expectedFreq = calcExpectedFreq(mass, width, span, targetN, cf);
  if(isFinite(expectedFreq)){
    estFreq.value = expectedFreq.toFixed(2);
  } else {
    const k = parseFloat(kconst.value)||1000;
    if(isFinite(span) && span>0) estFreq.value = (k/span).toFixed(2);
  }
  updateAssistInfo();
}
function canUseMicrophone(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}
function micUnavailableMessage(){
  if(!window.isSecureContext){
    return '모바일에서 마이크 권한 팝업이 안 뜨는 경우는 대부분 HTTPS가 아니기 때문입니다. HTTPS 또는 localhost에서 열어주세요.';
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return '이 브라우저/환경에서는 마이크를 사용할 수 없습니다. 브라우저 설정과 권한을 확인해주세요.';
  }
  return '마이크를 사용할 수 없는 환경입니다. 브라우저 권한과 기기 설정을 확인해주세요.';
}

/* ================================================================
   측정 시작 — 마이크 권한 요청 & Web Audio API 초기화
   ================================================================ */
async function startMeasure(){
  if(measuring) return;
  if(flowEnabled && !activeRobot){ if(!initRobotIfNeeded()) return; }
  if(!validateInputs()) return;
  if(!canUseMicrophone()){
    setStatus('bad','마이크 사용 불가','UNAVAILABLE');
    toast(micUnavailableMessage(), 'err');
    btnStart.disabled = !window.isSecureContext;
    return;
  }

  try{
    micStream = await navigator.mediaDevices.getUserMedia({
      audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    });
  }catch(err){
    const name = err && err.name ? err.name : '';
    if(name === 'NotAllowedError' || name === 'SecurityError'){
      setStatus('bad','마이크 권한 거부','DENIED');
      toast('마이크 권한이 거부되었거나 브라우저가 차단했습니다. 사이트 설정에서 마이크를 허용해주세요.', 'err');
    }else if(name === 'NotFoundError'){
      setStatus('bad','마이크를 찾을 수 없음','NO MIC');
      toast('사용 가능한 마이크를 찾지 못했습니다. 기기 마이크 또는 외부 마이크 연결을 확인해주세요.', 'err');
    }else{
      setStatus('bad','마이크 초기화 실패','ERROR');
      toast('마이크 초기화에 실패했습니다: '+(err.message || '알 수 없는 오류'), 'err');
    }
    stopMeasure();
    return;
  }

  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') await audioCtx.resume();
    srcNode = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = parseInt(selFFT.value,10);
    analyser.smoothingTimeConstant = 0;
    srcNode.connect(analyser);
    floatBuf = new Float32Array(analyser.frequencyBinCount);
    byteBuf  = new Uint8Array(analyser.frequencyBinCount);
    waveformBuf = new Uint8Array(analyser.fftSize);
  }catch(err){
    setStatus('bad','오디오 초기화 실패','ERROR');
    toast('오디오 초기화에 실패했습니다: '+err.message, 'err');
    stopMeasure();
    return;
  }

  measuring=true; held=false; peakBuffer=[];
  ambientRms=0.02;    // 측정 시작 시 기준선 리셋 (filterStrength=2 기준 초기 임계값 ≈ 0.08)
  measureStartTs=Date.now();
  btnStart.disabled=true; btnStop.disabled=false; btnSave.disabled=true;
  setStep(2);
  selFFT.disabled=true;
  setStatus('listen','측정 중 — 벨트를 튕겨주세요','LISTENING');
  toast('측정을 시작했습니다. 벨트 Span 중앙을 가볍게 튕기세요.', 'ok');
  if(noiseReduction.enabled && !noiseProfileReady){
    setNoiseChip(learnRequested ? '학습 중 0%' : '재학습 버튼으로 학습');
  }
  analyzeLoop();
}

/* ================================================================
   측정 중지 — 리소스 정리
   ================================================================ */
function stopMeasure(){
  measuring=false;
  if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
  if(srcNode){ try{srcNode.disconnect();}catch(e){} srcNode=null; }
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
  if(audioCtx){ try{audioCtx.close();}catch(e){} audioCtx=null; }
  analyser=null;
  btnStart.disabled=false; btnStop.disabled=true; btnSave.disabled=true;
  selFFT.disabled=false;
  held=false; dispFreq=0;
  setStatus('ready','대기 중','READY');
  meterFill.style.width='0%'; meterVal.textContent='0%';
  liveFreq.textContent='--'; livePeak.textContent='대기'; livePeak.style.color='var(--muted)';
  if(waveformBuf){ waveformBuf.fill(128); drawWaveform(); }
  guideActive=false; guidePeakFired=false;
  learnLastTs=null;  // 측정 중지 시 학습 타이머 일시 정지 (재시작 시 시간 점프 방지)
  const swG=$('swGuide');
  if(swG){ swG.setAttribute('aria-pressed','false'); swG.classList.remove('on'); }
  const chip=$('guideChip'); if(chip) chip.style.display='none';
}

/* ================================================================
   피크 주파수 검출 + 분석 루프
   ================================================================ */
function analyzeLoop(){
  if(!measuring||!analyser){ return; }

  try{
    analyser.getFloatFrequencyData(floatBuf);
    analyser.getByteFrequencyData(byteBuf);
  }catch(err){
    console.error('FFT read error', err);
    toast('오디오 처리 중 오류가 발생했습니다. 측정을 중지합니다.','err');
    stopMeasure();
    return;
  }

  const sampleRate = audioCtx.sampleRate;
  const binHz = sampleRate / analyser.fftSize;

  let byteDraw = byteBuf;
  if(noiseReduction.enabled){ byteDraw = applyNoiseReduction(floatBuf, byteBuf, binHz); }

  let minBin = Math.max(1, Math.floor(MIN_FREQ/binHz));
  let maxBin = Math.min(floatBuf.length-2, Math.ceil(MAX_FREQ/binHz));

  lockLoBin=-1; lockHiBin=-1; lockCenter=NaN;
  if(targetLock.enabled){
    const c = computeLockCenter();
    if(isFinite(c) && c>0){
      lockCenter=c;
      const w=targetLock.widthPct/100;
      const lo=Math.max(MIN_FREQ, c*(1-w)), hi=Math.min(MAX_FREQ, c*(1+w));
      lockLoBin=Math.max(minBin, Math.floor(lo/binHz));
      lockHiBin=Math.min(maxBin, Math.ceil(hi/binHz));
      if(lockHiBin>lockLoBin){ minBin=lockLoBin; maxBin=lockHiBin; }
    }
  }

  let peakBin=-1, peakDb=-Infinity, sumDb=0, n=0;
  let aboveCount=0;
  for(let i=minBin;i<=maxBin;i++){
    const db=floatBuf[i];
    sumDb+=db; n++;
    if(db>peakDb){ peakDb=db; peakBin=i; }
  }
  const meanDb = sumDb/Math.max(1,n);

  for(let i=minBin;i<=maxBin;i++){ if(floatBuf[i] >= peakDb-6) aboveCount++; }
  const broadband = (aboveCount/Math.max(1,n)) > BROADBAND_RATIO;

  let lvl=0; for(let i=minBin;i<=maxBin;i++){ if(byteBuf[i]>lvl) lvl=byteBuf[i]; }
  const lvlPct=Math.round(lvl/255*100);
  meterFill.style.width=lvlPct+'%'; meterVal.textContent=lvlPct+'%';

  drawSpectrum(byteDraw, binHz, minBin, maxBin, peakBin);
  drawWaveform();

  const now = Date.now();
  const rms = computeRMS();
  if(!collecting){
    // 비수집 구간에서 ambient RMS EMA 추적 (충격음이 기준선을 오염시키지 않도록)
    ambientRms = 0.98 * ambientRms + 0.02 * rms;

    if(guideActive){
      // 가이드 모드: 사인파 피크에서 자동 트리거
      const elapsed=(Date.now()-guideStartTs)%guidePeriodMs;
      const phase=(elapsed/guidePeriodMs)*2*Math.PI;
      const sineVal=Math.sin(phase);
      if(sineVal>0.95 && !guidePeakFired){
        guidePeakFired=true;
        const ts=Date.now();
        strikeTs=ts; lastStrikeAt=ts;
        collecting=true; collectStartTs=ts+300; collectEndTs=ts+1800; collectedSnapshots=[];
        collectionMaxRms=0;
        beep(880, 80);
        setStatus('listen','피크 — 지금 튕겨주세요!','COLLECTING');
      }
      if(sineVal<0) guidePeakFired=false;
    } else {
      // 일반 모드: 적응형 동적 임계값 (ambient × triggerK)
      const K_MAP = [2.5, 4.0, 6.0, 8.0];
      const triggerK = K_MAP[filterStrength - 1];
      const dynamicThreshold = Math.max(0.04, ambientRms * triggerK);
      if(rms > dynamicThreshold && (now - lastStrikeAt) > 3000){
        strikeTs=now; lastStrikeAt=now;
        collecting=true; collectStartTs=strikeTs+500; collectEndTs=strikeTs+2000; collectedSnapshots=[];
        collectionMaxRms=0;
        beep(880, 80);
        setStatus('listen','충격 감지 — 0.5s 무시 후 1.5s 분석','COLLECTING');
      }
    }
  } else {
    collectionMaxRms = Math.max(collectionMaxRms, rms);
    if(now > collectEndTs){
      collecting = false;
      finalizeCollection();
    }else if(now >= collectStartTs){
      const det = detectFundamentalBandpass(floatBuf, binHz, minBin, maxBin);
      if(det) collectedSnapshots.push({t:now, f:det.freq, mag:det.mag});
      if(det){ dispFreq = dispFreq ? dispFreq*0.65+det.freq*0.35 : det.freq; liveFreq.textContent=dispFreq.toFixed(1); }
      else { liveFreq.textContent='--'; }
    }
    rafId=requestAnimationFrame(analyzeLoop); return;
  }

  if(meanDb > NOISE_LOUD_DB){
    setStatus('noise','주변 소음이 큽니다','NOISE');
    livePeak.textContent='소음'; livePeak.style.color='var(--orange)';
    liveFreq.textContent='--';
  }
  else if(peakDb < ABS_MIN_DB){
    setStatus('weak','신호가 약합니다 — 더 명확히 튕겨주세요','WEAK');
    livePeak.textContent='약함'; livePeak.style.color='var(--amber)';
    liveFreq.textContent='--';
  }
  else if(broadband || (peakDb - meanDb) < PROMINENCE_DB){
    setStatus('listen','대기 중 — 벨트를 튕겨주세요','LISTENING');
    livePeak.textContent='—'; livePeak.style.color='var(--muted)';
    liveFreq.textContent='--';
  }
  else{
    const f = interpolatePeak(floatBuf, peakBin, binHz);
    if(f<MIN_FREQ || f>MAX_FREQ){
      setStatus('listen','측정 범위를 벗어난 주파수','RANGE');
    }else{
      pushPeak(f);
      const stable = stableFreq();
      const unstable = isUnstable();
      dispFreq = dispFreq ? dispFreq*0.65+f*0.35 : f;
      liveFreq.textContent = dispFreq.toFixed(1);
      livePeak.textContent='검출'; livePeak.style.color='var(--green)';
      if(unstable){
        setStatus('noise','측정 불안정 — 반복 측정해주세요','UNSTABLE');
      }else{
        setStatus('good','신호 검출','DETECTED');
      }
      // updateResult는 finalizeCollection()에서만 호출 — outer loop에서 호출하면 배경 소음이 결과를 오염시킴
    }
  }

  rafId=requestAnimationFrame(analyzeLoop);
}

function interpolatePeak(buf, bin, binHz){
  const a=buf[bin-1], b=buf[bin], c=buf[bin+1];
  const denom=(a-2*b+c);
  let delta=0;
  if(denom!==0) delta=0.5*(a-c)/denom;
  if(!isFinite(delta)||Math.abs(delta)>1) delta=0;
  return (bin+delta)*binHz;
}

function computeRMS(){
  if(!analyser) return 0;
  const tbuf = new Float32Array(analyser.fftSize);
  try{ analyser.getFloatTimeDomainData(tbuf); }catch(e){ return 0; }
  let s=0; for(let i=0;i<tbuf.length;i++){ s += tbuf[i]*tbuf[i]; }
  return Math.sqrt(s/tbuf.length);
}

function applyNoiseReduction(floatBuf, byteBuf, binHz){
  const N=floatBuf.length;
  if(!noiseProfile || noiseProfile.length!==N){ noiseProfile=new Float32Array(N); noiseProfileReady=false; }
  const afterCooldown=!collecting && (Date.now()-lastStrikeAt > 2500);
  // 프로파일 갱신: 재학습 진행 중 OR 학습 완료 후 느린 드리프트 추적
  const quiet=afterCooldown && (learnRequested || noiseProfileReady);
  const beta=noiseProfileReady?0.92:0.6;
  const ALPHA_MAP=[1.0, 1.5, 2.5, 3.5];
  const alpha=ALPHA_MAP[filterStrength-1];
  const floorRatio=0.06;
  const minDb=analyser?analyser.minDecibels:-100, maxDb=analyser?analyser.maxDecibels:-30;
  const rng=Math.max(1,maxDb-minDb);
  const out=new Uint8Array(N);
  for(let i=0;i<N;i++){
    const lin=Math.pow(10,(floatBuf[i]||-200)/20);
    if(quiet){ noiseProfile[i]=beta*noiseProfile[i]+(1-beta)*lin; }
    let cleaned=lin-alpha*noiseProfile[i];
    if(cleaned < floorRatio*lin) cleaned=floorRatio*lin;
    if(cleaned < 1e-7) cleaned=1e-7;
    const cdb=20*Math.log10(cleaned);
    floatBuf[i]=cdb;
    let b=(cdb-minDb)/rng*255;
    out[i]=b<0?0:(b>255?255:b);
  }
  if(afterCooldown && learnRequested && !noiseProfileReady){
    const nowMs=performance.now();
    if(learnLastTs!==null) learnElapsedMs+=nowMs-learnLastTs;
    learnLastTs=nowMs;
    const pct=Math.min(100,Math.round(learnElapsedMs/LEARN_DURATION_MS*100));
    if(pct!==learnLastPct){ learnLastPct=pct; setNoiseChip(`학습 중 ${pct}%`); }
    if(learnElapsedMs>=LEARN_DURATION_MS){
      noiseProfileReady=true;
      learnRequested=false;
      learnLastTs=null;
      learnLastPct=-1;
      setNoiseChip('학습완료');
      toast('현장 소음 학습 완료 — 이 환경에 맞춰 노이즈 저감이 적용됩니다.','ok');
    }
  } else if(!afterCooldown && learnRequested && !noiseProfileReady){
    learnLastTs=null;  // 여진 쿨다운 중 타이머 일시 정지
  }
  return out;
}

function computeLockCenter(){
  let c=parseFloat(estFreq.value);
  if(isFinite(c) && c>0) return c;
  const mass=parseFloat(inMass.value), width=parseFloat(inWidth.value),
        span=parseFloat(inSpan.value), cf=parseFloat(inCF.value), targetN=parseFloat(inTargetN.value);
  const ef=calcExpectedFreq(mass,width,span,targetN,cf);
  if(isFinite(ef) && ef>0) return ef;
  const k=parseFloat(kconst.value)||1000;
  if(isFinite(span) && span>0) return k/span;
  return NaN;
}

function setNoiseChip(txt){
  const el=document.getElementById('nrChip');
  if(!el) return;
  el.textContent=txt||''; el.style.display=txt?'inline-flex':'none';
}

function detectFundamentalBandpass(floatBuf, binHz, globalMinBin, globalMaxBin){
  const span = parseFloat(inSpan.value) || 0;
  const k = parseFloat(kconst.value) || 1000;
  let expected = parseFloat(estFreq.value);
  if(!isFinite(expected) && span>0){ expected = k / span; }
  let loBin = globalMinBin, hiBin = globalMaxBin;
  if(isFinite(expected) && expected>0){
    const lo = Math.max(MIN_FREQ, expected*0.7);
    const hi = Math.min(MAX_FREQ, expected*1.3);
    loBin = Math.max(globalMinBin, Math.floor(lo/binHz));
    hiBin = Math.min(globalMaxBin, Math.ceil(hi/binHz));
  }
  if(targetLock.enabled && lockLoBin>=0 && lockHiBin>lockLoBin){
    loBin=Math.max(globalMinBin, lockLoBin);
    hiBin=Math.min(globalMaxBin, lockHiBin);
  }
  const cands = [];
  for(let i=loBin;i<=hiBin;i++){
    const db = floatBuf[i];
    const mag = Math.pow(10, db/20);
    cands.push({bin:i,mag});
  }
  cands.sort((a,b)=>b.mag-a.mag);
  if(!cands.length) return null;
  const selected = [];
  for(const c of cands.slice(0,12)){
    const f = c.bin * binHz;
    let isHarm=false;
    for(const s of selected){
      const ratio = f / s.freq;
      for(let n=2;n<=4;n++){
        if(Math.abs(ratio - n) < 0.035){ isHarm = true; break; }
      }
      if(isHarm) break;
    }
    if(!isHarm) selected.push({freq:f,mag:c.mag,bin:c.bin});
    if(selected.length>=1) break;
  }
  if(!selected.length){
    const top=cands[0];
    return {freq: top.bin*binHz, mag: top.mag};
  }
  const best = selected[0];
  const refined = interpolatePeak(floatBuf, best.bin, binHz);
  return {freq: refined, mag: best.mag};
}

/* ----------------------------------------------------------------
   측정 안정화
   ---------------------------------------------------------------- */
function pushPeak(f){
  peakBuffer.push(f);
  if(peakBuffer.length>BUF_SIZE) peakBuffer.shift();
}
function median(arr){
  if(!arr.length) return NaN;
  const s=[...arr].sort((x,y)=>x-y);
  const m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function stableFreq(){
  if(!peakBuffer.length) return NaN;
  let med=median(peakBuffer);
  if(!isFinite(med) || med===0){
    const avg = peakBuffer.reduce((s,v)=>s+v,0)/peakBuffer.length;
    if(!isFinite(avg) || avg===0) return NaN;
    med = avg;
  }
  const kept=peakBuffer.filter(v=>Math.abs(v-med)<=med*OUTLIER_TOL);
  const use=kept.length?kept:peakBuffer;
  return use.reduce((a,b)=>a+b,0)/use.length;
}
function isUnstable(){
  if(peakBuffer.length<3) return false;
  const med=median(peakBuffer);
  const spread=Math.max(...peakBuffer)-Math.min(...peakBuffer);
  return spread > med*OUTLIER_TOL*2;
}

/* ----------------------------------------------------------------
   최종 결과 카드 갱신
   ---------------------------------------------------------------- */
function updateResult(freq, extConf){
  if(!isFinite(freq)) return;
  const {mass,width,span,cf}=readInputs();
  const {rawN,corrN,kgf}=calcTension(mass,width,span,freq,cf);
  const {targetN, tolPct}=readTarget();
  let judge='--';
  let judgeOk = null;
  if(isFinite(targetN) && isFinite(tolPct)){
    const lower = targetN * (1 - tolPct/100);
    const upper = targetN * (1 + tolPct/100);
    judgeOk = corrN >= lower && corrN <= upper;
    judge = judgeOk ? 'OK' : 'NG';
    resTarget.textContent = targetN.toFixed(1)+' N ±'+tolPct.toFixed(0)+'%';
    resJudge.textContent = judge;
    resJudgeWrap.className = judgeOk ? 'judge-ok' : 'judge-ng';
  }else{
    resTarget.textContent = '--';
    resJudge.textContent = '--';
    resJudgeWrap.className = '';
  }
  const realtimeConf = extConf !== undefined ? extConf :
    (peakBuffer.length < 2 ? 15 :
     peakBuffer.length < BUF_SIZE ? 25 + peakBuffer.length * 8 :
     isUnstable() ? 20 : 65);
  currentResult={
    time:new Date(), mass,width,span,cf, freq, targetN, tolPct,
    rawN, corrN, kgf, confidence: Math.round(realtimeConf)
  };
  $('resTensionN').textContent=corrN.toFixed(1);
  $('resTensionKgf').textContent=kgf.toFixed(2);
  $('resFreq').textContent=freq.toFixed(1);
  try{ renderTargetGauge(corrN, targetN, tolPct, judgeOk); }catch(e){}
}

function finalizeCollection(){
  if(guideActive && collectionMaxRms < 0.02){
    setStatus('listen','대기 중 — 벨트를 튕겨주세요','LISTENING');
    toast('벨트 튕김이 감지되지 않았습니다. 사인파 피크에 맞춰 튕겨주세요.','warn',2500);
    return;
  }
  if(!collectedSnapshots.length){
    setStatus('listen','유효한 스냅샷이 없습니다','READY');
    toast('충격은 감지되었으나 유효한 주파수를 수집하지 못했습니다. 다시 시도하세요.','err');
    return;
  }
  const last = collectedSnapshots.slice(-20);
  const freqs = last.map(s=>s.f);
  const mags = last.map(s=>s.mag);
  freqs.sort((a,b)=>a-b);
  const med = median(freqs);
  const lower = med*0.95, upper = med*1.05;
  const filtered = last.filter(s=>s.f>=lower && s.f<=upper);
  const finalFreq = filtered.length ? filtered.reduce((s,i)=>s+i.f,0)/filtered.length : (freqs[Math.floor(freqs.length/2)]||NaN);
  const minF = Math.min(...freqs), maxF = Math.max(...freqs);
  const rangePercent = (maxF - minF)/med*100;

  analyser.getFloatFrequencyData(floatBuf);
  const sr = audioCtx.sampleRate; const binHz = sr / analyser.fftSize;
  const bandMin = Math.max(1, Math.floor(MIN_FREQ/binHz));
  const bandMax = Math.min(floatBuf.length-2, Math.ceil(MAX_FREQ/binHz));
  let avgNoise = 0, cnt=0;
  if(noiseReduction.enabled && noiseProfile && noiseProfileReady){
    // 학습된 프로파일을 noise floor로 사용 — 수집 신호(노이즈 저감 적용)와 동일 기준으로 SNR 계산
    for(let i=bandMin;i<=bandMax;i++){ avgNoise += noiseProfile[i]; cnt++; }
    avgNoise = cnt? avgNoise/cnt : 1e-6;
  } else {
    for(let i=bandMin;i<=bandMax;i++){ avgNoise += Math.pow(10,(floatBuf[i]||-200)/20); cnt++; }
    avgNoise = cnt? avgNoise/cnt : 1e-6;
  }
  const avgMag = mags.reduce((s,v)=>s+v,0)/mags.length;
  const snr = avgMag / Math.max(1e-6, avgNoise);
  const agreement = filtered.length / Math.max(1,last.length);

  let confidence = Math.min(100, (Math.log10(snr+1)*30 + agreement*50 + Math.max(0,40 - rangePercent)));
  if(!isFinite(confidence)) confidence = 0; if(confidence<0) confidence=0;

  updateResult(finalFreq, confidence);
  if(currentResult){ currentResult.rangePercent = rangePercent; }
  $('resConf').textContent = Math.round(confidence);
  try{ renderConfidenceRing(Math.round(confidence)); }catch(e){}
  const hasResult = isFinite(finalFreq);
  btnSave.disabled = !hasResult;

  if(rangePercent<=3 && agreement>=0.8){
    setStatus('good','결과 안정 — 저장하거나 재측정하세요','STABLE');
    beep(1100, 150);
    toast('결과가 안정적입니다. 저장 버튼을 눌러주세요.','ok');
  }else{
    setStatus('weak','결과 불안정 — 재측정 권장','UNSTABLE');
    beep(660, 80);
    toast('측정 완료 (Confidence '+Math.round(confidence)+'%). 재측정하거나 저장하세요.','warn');
  }
}

/* ================================================================
   스펙트럼 그래프
   ================================================================ */
function setupCanvas(){
  if(!canvas||!ctx) return;
  const dpr=window.devicePixelRatio||1;
  const w=canvas.clientWidth, h=200;
  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function drawSpectrum(byte, binHz, minBin, maxBin, peakBin){
  if(!canvas||!ctx) return;
  const W=canvas.clientWidth, H=200;
  ctx.clearRect(0,0,W,H);
  if(!byte || byte.length===0){ return; }

  ctx.strokeStyle='rgba(100,116,139,.22)'; ctx.fillStyle='#94a3b8';
  ctx.font='11px "Noto Sans KR","Malgun Gothic",sans-serif'; ctx.textAlign='center'; ctx.lineWidth=1;
  const grids=[10,500,1000,2000,3000,4000,5000];
  grids.forEach(fr=>{
    const x=(fr-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H-14); ctx.stroke();
    ctx.fillText(fr>=1000?(fr/1000)+'k':fr, x, H-2);
  });

  if(lockLoBin>=0 && lockHiBin>lockLoBin){
    const lx=((lockLoBin*binHz)-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
    const rx=((lockHiBin*binHz)-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
    ctx.fillStyle='rgba(0,153,204,.10)';
    ctx.fillRect(lx,0,Math.max(2,rx-lx),H-14);
    ctx.strokeStyle='rgba(3,105,161,.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,H-14); ctx.moveTo(rx,0); ctx.lineTo(rx,H-14); ctx.stroke();
    if(isFinite(lockCenter)){
      const cx=(lockCenter-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
      ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(3,105,161,.8)';
      ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H-14); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  const fMin=Math.max(1,Math.floor(MIN_FREQ/binHz));
  const fMax=Math.min(byte.length-2,Math.ceil(MAX_FREQ/binHz));
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'rgba(0,153,204,.5)');
  grad.addColorStop(1,'rgba(0,153,204,.04)');
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.moveTo(0,H-14);
  const usableH=H-22;
  for(let i=fMin;i<=fMax;i++){
    const f=i*binHz;
    const x=(f-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
    const y=(H-14)-(byte[i]/255)*usableH;
    ctx.lineTo(x,y);
  }
  ctx.lineTo(W,H-14); ctx.closePath(); ctx.fill();

  if(peakBin>=minBin && peakBin<=maxBin){
    const pf=peakBin*binHz;
    const px=(pf-MIN_FREQ)/(MAX_FREQ-MIN_FREQ)*W;
    ctx.strokeStyle='#111827'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H-14); ctx.stroke();
    const label=Math.round(pf)+' Hz';
    ctx.font='700 12px "Noto Sans KR","Malgun Gothic",sans-serif';
    const tw=ctx.measureText(label).width+12;
    let bx=px-tw/2; bx=Math.max(2,Math.min(bx,W-tw-2));
    ctx.fillStyle='rgba(17,24,39,.10)';
    ctx.fillRect(bx,4,tw,18);
    ctx.fillStyle='#111827'; ctx.textAlign='center';
    ctx.fillText(label, bx+tw/2, 17);
  }
}

/* ================================================================
   파형 오실로스코프 (타이밍 가이드)
   ================================================================ */
function setupWaveformCanvas(){
  if(!waveCanvas) return;
  const dpr=window.devicePixelRatio||1;
  const w=waveCanvas.clientWidth, h=72;
  waveCanvas.width=Math.round(w*dpr);
  waveCanvas.height=Math.round(h*dpr);
  waveCtx.setTransform(dpr,0,0,dpr,0,0);
}
function drawWaveform(){
  if(!waveCtx || !waveformBuf) return;
  const W=waveCanvas.clientWidth, H=72;

  /* ── 가이드 모드: 스크롤 사인파 애니메이션 ── */
  if(guideActive && !collecting){
    const elapsed=(Date.now()-guideStartTs)%guidePeriodMs;
    const phase=(elapsed/guidePeriodMs)*2*Math.PI;
    const sineNow=Math.sin(phase);
    const nearPeak=sineNow>0.80;

    waveCtx.fillStyle='#111827'; waveCtx.fillRect(0,0,W,H);
    waveCtx.strokeStyle='#374151'; waveCtx.lineWidth=1;
    waveCtx.beginPath(); waveCtx.moveTo(0,H/2); waveCtx.lineTo(W,H/2); waveCtx.stroke();

    waveCtx.beginPath();
    for(let x=0;x<W;x++){
      const wPhase=phase-(1-(x/W))*2*Math.PI;
      const v=Math.sin(wPhase);
      const y=H/2-v*(H/2-8);
      x===0 ? waveCtx.moveTo(x,y) : waveCtx.lineTo(x,y);
    }
    waveCtx.strokeStyle=nearPeak?'#22c55e':'#0099CC';
    waveCtx.lineWidth=nearPeak?2.5:1.5;
    waveCtx.stroke();

    const dotY=H/2-sineNow*(H/2-8);
    waveCtx.beginPath();
    waveCtx.arc(W-2,dotY,nearPeak?7:3,0,2*Math.PI);
    waveCtx.fillStyle=nearPeak?'#22c55e':'#0099CC';
    waveCtx.fill();

    if(sineNow>0.95){
      waveCtx.fillStyle='#22c55e';
      waveCtx.font='bold 12px sans-serif';
      waveCtx.textAlign='center';
      waveCtx.fillText('지금!',W/2,15);
    }
    return;
  }

  /* ── 마이크 모드: 시간축 오실로스코프 ── */
  if(analyser) analyser.getByteTimeDomainData(waveformBuf);
  waveCtx.fillStyle=collecting?'#0c1e35':'#111827';
  waveCtx.fillRect(0,0,W,H);
  waveCtx.strokeStyle='#374151'; waveCtx.lineWidth=1;
  waveCtx.beginPath(); waveCtx.moveTo(0,H/2); waveCtx.lineTo(W,H/2); waveCtx.stroke();
  waveCtx.strokeStyle=collecting?'#38bdf8':'#94a3b8';
  waveCtx.lineWidth=1.5;
  waveCtx.beginPath();
  for(let x=0;x<W;x++){
    const i=Math.floor(x/W*waveformBuf.length);
    const v=waveformBuf[i]/128-1;
    const y=H/2+v*(H/2-5);
    x===0 ? waveCtx.moveTo(x,y) : waveCtx.lineTo(x,y);
  }
  waveCtx.stroke();
  if(collecting && collectStartTs){
    const elapsed=Math.max(0,Date.now()-collectStartTs);
    const total=collectEndTs-collectStartTs;
    const pct=Math.min(1,elapsed/total);
    waveCtx.fillStyle='rgba(56,189,248,.5)';
    waveCtx.fillRect(0,H-3,W*pct,3);
  }
}

/* ================================================================
   삑 소리 (AudioContext oscillator)
   ================================================================ */
function beep(freq=880, ms=110){
  if(!audioCtx) return;
  try{
    const osc=audioCtx.createOscillator(), g=audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.frequency.value=freq;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+ms/1000);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime+ms/1000);
  }catch(e){}
}

/* ================================================================
   결과 테이블 렌더링 (transposed: rows=벨트ID, columns=호기)
   ================================================================ */
function renderRobots(){
  if(!flowEnabled){ renderSimpleHistory(); return; }
  const head=$('histHead'), body=$('histBody');
  if(!head||!body) return;
  if(!robots.length){
    head.innerHTML='<tr><th colspan="3" style="text-align:center;color:#9CA3AF;">저장된 측정이 없습니다.</th></tr>';
    body.innerHTML='';
    return;
  }
  // Collect all belt IDs that were used across all robots
  const allKeys = BELT_IDS.map(d=>d.key);
  // Build column headers per robot
  const robotHeaders = robots.map(r=>`<th>${r.unit ? r.unit+'호기' : '(미설정)'}</th>`).join('');
  head.innerHTML = `<tr>
    <th>벨트 ID</th><th>종류 / Target</th>${robotHeaders}
  </tr>`;
  body.innerHTML = allKeys.map(key=>{
    const def = BELT_IDS.find(d=>d.key===key);
    if(!def) return '';
    const p = BELT_PRESETS[def.type];
    // check if any robot measured this ID
    const anyMeasured = robots.some(r=>r.slots.find(s=>s.key===key));
    if(!anyMeasured) return '';
    const targetStr = p.targetN+' N ±'+p.tolPct+'%';
    const typeLbl = def.type==='drive' ? '구동모듈' : '리프팅';
    const cells = robots.map(r=>{
      const slot = r.slots.find(s=>s.key===key);
      if(!slot) return '<td class="val-empty">-</td>';
      if(!slot.values.length) return '<td class="val-empty">—</td>';
      const avg = slot.average != null ? slot.average :
        slot.values.reduce((a,v)=>a+v.corrN,0)/slot.values.length;
      const judge = slot.avgJudge || (avg >= p.targetN*(1-p.tolPct/100) && avg <= p.targetN*(1+p.tolPct/100) ? 'OK' : 'NG');
      const cls = judge==='OK' ? 'val-ok' : 'val-ng';
      return `<td class="val-cell ${cls}" style="text-align:center;font-weight:700;">${avg.toFixed(1)}<br><span style="font-size:9px;font-weight:800;">${judge}</span></td>`;
    }).join('');
    return `<tr>
      <td style="font-weight:800;color:#111;">${key}</td>
      <td style="font-size:11px;color:#6B7280;">${typeLbl}<br>${targetStr}</td>
      ${cells}
    </tr>`;
  }).filter(Boolean).join('');
  updateSessionSwitchRow();
  updateReportButtons();
}
function renderSessions(){ renderRobots(); }  // 하위호환

/* ================================================================
   localStorage 상태 저장 / 복원
   ================================================================ */
function dateReplacer(key, val){
  if(val instanceof Date) return {__type:'Date', iso:val.toISOString()};
  return val;
}
function dateReviver(key, val){
  if(val && val.__type==='Date') return new Date(val.iso);
  return val;
}
function saveState(){
  try{
    const data={version:1, flowEnabled, robots, simpleHistory, filterStrength};
    localStorage.setItem('beltTension_v1', JSON.stringify(data, dateReplacer));
  }catch(e){}
}
function loadState(){
  try{
    const raw=localStorage.getItem('beltTension_v1');
    if(!raw) return;
    const data=JSON.parse(raw, dateReviver);
    if(data.version!==1) return;
    robots=data.robots||[];
    simpleHistory=data.simpleHistory||[];
    flowEnabled=data.flowEnabled??true;
    filterStrength=(data.filterStrength>=1&&data.filterStrength<=4)?data.filterStrength:2;
  }catch(e){}
}

/* ================================================================
   단순 측정 모드 (플로우 OFF)
   ================================================================ */
function renderSimpleHistory(){
  const head=$('histHead'), body=$('histBody');
  if(!head||!body) return;
  if(!simpleHistory.length){
    head.innerHTML='<tr><th colspan="5" style="text-align:center;color:#9CA3AF;">저장된 측정이 없습니다.</th></tr>';
    body.innerHTML='';
    return;
  }
  head.innerHTML=`<tr>
    <th>회차</th><th>주파수 (Hz)</th><th>장력 (N)</th><th>판정</th><th>시각</th>
  </tr>`;
  body.innerHTML=simpleHistory.map((v,i)=>{
    const ok=v.judge==='OK', ng=v.judge==='NG';
    const cls=ok?'val-ok':ng?'val-ng':'';
    return `<tr>
      <td style="text-align:center;">${i+1}회</td>
      <td style="text-align:center;">${v.freq.toFixed(1)}</td>
      <td class="${cls}" style="text-align:center;font-weight:700;">${v.corrN.toFixed(1)} N</td>
      <td class="${cls}" style="text-align:center;font-weight:700;">${v.judge}</td>
      <td style="text-align:center;">${fmtTime(v.time)}</td>
    </tr>`;
  }).join('');
}

function downloadSimpleCSV(){
  if(!simpleHistory.length){ toast('다운로드할 측정이 없습니다.','err'); return; }
  const header=['회차','주파수(Hz)','장력(N)','kgf','판정','시각'];
  const rows=simpleHistory.map((v,i)=>[
    i+1, v.freq.toFixed(2), v.corrN.toFixed(2), v.kgf.toFixed(3), v.judge, fmtTime(v.time,true)
  ]);
  const csv='﻿'+[header,...rows].map(l=>l.join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const stamp=fmtTime(new Date(),true).replace(/[: ]/g,'-');
  a.href=url; a.download='belt_tension_simple_'+stamp+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV 파일을 다운로드했습니다.','ok');
}

function setFlowMode(enabled){
  if(enabled && simpleHistory.length > 0){
    if(!confirm('단순 측정 기록이 있습니다. 플로우 모드로 전환하면 해당 기록이 보이지 않습니다. 계속할까요?')) return false;
  }
  if(!enabled && robots.length > 0){
    if(!confirm('세션 데이터가 있습니다. 단순 모드로 전환하면 세션이 보이지 않습니다. 계속할까요?')) return false;
  }
  flowEnabled=enabled;
  if(measuring) stopMeasure();
  activeRobot=null; activeSlotIdx=0; currentResult=null;

  const stepBar=document.querySelector('.step-bar');
  const flowOnlyEls=['fs1','fs4','fs5'];
  const simCSV=$('btnSimpleCSV');

  if(enabled){
    if(stepBar) stepBar.style.display='';
    flowOnlyEls.forEach(id=>{ const el=$(id); if(el) el.style.display=''; });
    const prog=$('measureProgress'); if(prog) prog.style.display='';
    if(simCSV) simCSV.style.display='none';
    renderRobots();
    setStep(1);
  } else {
    if(stepBar) stepBar.style.display='none';
    flowOnlyEls.forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    const prog=$('measureProgress'); if(prog) prog.style.display='none';
    if(simCSV) simCSV.style.display='';
    const fs2=$('fs2'), fs3=$('fs3');
    if(fs2) fs2.className='flow-step s-active';
    if(fs3) fs3.className='flow-step s-active';
    document.body.dataset.step = '2';
    if(btnCancelSetup) btnCancelSetup.style.display='none';
    renderSimpleHistory();
  }
}

function clearHistory(){
  if(!flowEnabled){
    if(!simpleHistory.length){ toast('초기화할 측정이 없습니다.'); return; }
    if(confirm('모든 측정 기록을 삭제할까요?')){
      simpleHistory=[];
      currentResult=null;
      btnSave.disabled=true;
      renderSimpleHistory();
      saveState();
      toast('측정 기록을 초기화했습니다.','warn');
    }
    return;
  }
  if(!robots.length){ toast('초기화할 측정이 없습니다.'); return; }
  if(confirm('모든 측정 기록을 삭제할까요?')){
    robots=[]; activeRobot=null; activeSlotIdx=0;
    renderRobots(); renderRobotProgress(); setStep(1);
    updateSlotProgress(); updateReportButtons();
    saveState();
    toast('측정 기록을 초기화했습니다.','warn');
  }
}

/* ================================================================
   CSV 다운로드 (로봇 × 슬롯 형식)
   ================================================================ */
function downloadCSV(){
  if(!robots.length){ toast('다운로드할 측정이 없습니다.','err'); return; }
  const usedKeys = BELT_IDS.filter(def=>robots.some(r=>r.slots.find(s=>s.key===def.key))).map(d=>d.key);
  const header=['호기','날짜',...usedKeys.flatMap(k=>[k+'_평균(N)',k+'_판정'])];
  const rows = robots.map(r=>{
    const unit = r.unit ? r.unit+'호기' : '(미설정)';
    const date = fmtTime(r.createdAt, true);
    const slotCols = usedKeys.flatMap(k=>{
      const slot = r.slots.find(s=>s.key===k);
      if(!slot||!slot.values.length) return ['',''];
      const p = BELT_PRESETS[slot.type];
      const avg = slot.average!=null ? slot.average : slot.values.reduce((a,v)=>a+v.corrN,0)/slot.values.length;
      const judge = slot.avgJudge || (avg>=p.targetN*(1-p.tolPct/100)&&avg<=p.targetN*(1+p.tolPct/100)?'OK':'NG');
      return [avg.toFixed(2), judge];
    });
    return [unit, date, ...slotCols];
  });
  const csv='﻿'+[header,...rows].map(line=>line.join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const stamp=fmtTime(new Date(),true).replace(/[: ]/g,'-');
  a.href=url; a.download='belt_tension_'+stamp+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV 파일을 다운로드했습니다.','ok');
}

/* ================================================================
   PDF 보고서 다운로드 (센서점검 앱 동일 양식)
   ================================================================ */
async function downloadPDF(){
  if(!robots.length){ toast('다운로드할 측정이 없습니다.','err'); return; }
  toast('PDF 생성 중...','ok');
  try{
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
    const W=210, M=14;
    const lastTs = robots.reduce((mx,r)=>{ const t=r.completedAt?new Date(r.completedAt).getTime():0; return t>mx?t:mx; }, 0);
    const now = fmtTime(lastTs ? new Date(lastTs) : new Date(), true);

    /* ---- 열 너비 ---- */
    const TW = {id:16, round:14, freq:40, tension:52, judge:26, time:34};
    const tableW = TW.id + TW.round + TW.freq + TW.tension + TW.judge + TW.time;

    /* ---- 헤더 ---- */
    doc.setFillColor(255,255,255); doc.rect(0,0,W,22,'F');
    doc.setDrawColor(229,232,237); doc.setLineWidth(0.3); doc.line(0,22,W,22);
    try{
      const logoImg = await getLogoImage();
      const maxW=40, maxH=12;
      const srcW = logoImg.naturalWidth||logoImg.width||1;
      const srcH = logoImg.naturalHeight||logoImg.height||1;
      const ratio = srcW/srcH;
      let lw=maxW, lh=maxW/ratio;
      if(lh>maxH){ lh=maxH; lw=maxH*ratio; }
      doc.addImage(logoImg,'PNG',M,4+(maxH-lh)/2,lw,lh);
    }catch(e){
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(17,17,17); doc.text('HL Robotics',M,13);
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('BELT TENSION MEASUREMENT REPORT', M+42, 10);
    doc.text(now, W-M, 10, {align:'right'});

    let y = 27;

    const allOK = robots.every(r=>r.slots.every(s=>!s.completedAt||s.avgJudge==='OK'));
    const ngCount = robots.reduce((n,r)=>n+r.slots.filter(s=>s.avgJudge==='NG').length, 0);
    pdfText(doc,
      '호기: '+robots.length+'   NG 슬롯: '+ngCount+'   측정완료: '+now,
      M, y-2, {size:7.5, color:[90,90,90]});
    y += 5;

    /* ---- 열 헤더 그리기 함수 ---- */
    const hColDefs = [
      {t:'벨트 ID',  w:TW.id},
      {t:'회차',    w:TW.round},
      {t:'측정주파수 (Hz)', w:TW.freq},
      {t:'측정장력 (N)',   w:TW.tension},
      {t:'판정',    w:TW.judge},
      {t:'측정시각', w:TW.time},
    ];
    function drawColHeaders(yy){
      let hx=M;
      hColDefs.forEach(h=>{
        doc.setFillColor(100,120,150); doc.setDrawColor(100,120,150); doc.setLineWidth(0.25);
        doc.rect(hx,yy,h.w,5.5,'FD');
        pdfText(doc,h.t,hx+h.w/2,yy+2.75,{align:'center',valign:'middle',size:6.5,bold:true,color:[255,255,255]});
        hx+=h.w;
      });
      return yy+5.5;
    }

    /* ---- 호기별 섹션 ---- */
    for(const robot of robots){
      const unitStr = robot.unit ? robot.unit+'호기' : '(미설정)';
      const robotOK = robot.slots.filter(s=>s.completedAt).every(s=>s.avgJudge==='OK');
      const robotNG = robot.slots.some(s=>s.avgJudge==='NG');
      const robotJudge = robotNG ? 'NG' : (robot.completedAt ? 'OK' : '-');

      if(y > 252){ doc.addPage(); y=14; }

      /* 호기 배너 (다크 블루) */
      doc.setFillColor(30,60,114); doc.setDrawColor(30,60,114); doc.setLineWidth(0.3);
      doc.rect(M,y,tableW,7,'FD');
      pdfText(doc,unitStr,M+3,y+3.5,{size:9,bold:true,color:[255,255,255],valign:'middle'});
      pdfText(doc,robotJudge,M+tableW-3,y+3.5,{size:9,bold:true,
        color:robotNG?[255,180,180]:robot.completedAt?[150,255,180]:[200,210,220],align:'right',valign:'middle'});
      y += 7;

      y = drawColHeaders(y);

      /* 슬롯별 측정값 */
      for(const slot of robot.slots){
        const p = BELT_PRESETS[slot.type];
        if(!slot.values.length) continue;

        slot.values.forEach((v,vi)=>{
          const rowH=7;
          if(y+rowH>285){ doc.addPage(); y=14; y=drawColHeaders(y); }
          const isOK=v.judge==='OK', isNG=v.judge==='NG';
          let rx=M;
          doc.setDrawColor(200,205,215); doc.setLineWidth(0.25);
          if(vi%2===0){ doc.setFillColor(245,248,252); doc.rect(rx,y,tableW,rowH,'F'); }

          /* 벨트 ID */
          doc.rect(rx,y,TW.id,rowH);
          pdfText(doc,slot.label,rx+TW.id/2,y+rowH/2,{size:7.5,bold:true,color:[40,40,40],align:'center',valign:'middle'});
          rx+=TW.id;

          /* 회차 */
          doc.rect(rx,y,TW.round,rowH);
          pdfText(doc,(vi+1)+'회',rx+TW.round/2,y+rowH/2,{size:7,color:[60,60,60],align:'center',valign:'middle'});
          rx+=TW.round;

          /* 주파수 */
          doc.rect(rx,y,TW.freq,rowH);
          pdfText(doc,v.freq.toFixed(1),rx+TW.freq/2,y+rowH/2,{size:7,color:[60,60,60],align:'center',valign:'middle'});
          rx+=TW.freq;

          /* 장력 */
          doc.rect(rx,y,TW.tension,rowH);
          pdfText(doc,v.corrN.toFixed(1)+' N',rx+TW.tension/2,y+rowH/2,{
            size:7,bold:isOK||isNG,color:isOK?[25,120,60]:isNG?[160,20,20]:[60,60,60],align:'center',valign:'middle'});
          rx+=TW.tension;

          /* 판정 */
          if(isOK){ doc.setFillColor(220,245,225); doc.setDrawColor(80,180,100); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          else if(isNG){ doc.setFillColor(255,230,230); doc.setDrawColor(220,80,80); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          else{ doc.setFillColor(240,241,242); doc.setDrawColor(150,155,160); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          pdfText(doc,v.judge||'-',rx+TW.judge/2,y+rowH/2,{
            size:7,bold:true,color:isOK?[25,120,60]:isNG?[160,20,20]:[130,130,130],align:'center',valign:'middle'});
          rx+=TW.judge;

          /* 시각 */
          doc.setDrawColor(200,205,215); doc.rect(rx,y,TW.time,rowH);
          pdfText(doc,v.time?fmtTime(v.time):'-',rx+TW.time/2,y+rowH/2,{size:6.5,color:[100,100,100],align:'center',valign:'middle'});
          y+=rowH;
        });

        /* 슬롯 평균 행 */
        if(slot.values.length>0 && slot.average!=null){
          const rowH=7;
          if(y+rowH>285){ doc.addPage(); y=14; }
          const isOK=slot.avgJudge==='OK', isNG=slot.avgJudge==='NG';
          const avgColor=isOK?[25,120,60]:isNG?[160,20,20]:[60,60,60];
          if(isOK){ doc.setFillColor(220,245,225); doc.setDrawColor(80,180,100); }
          else if(isNG){ doc.setFillColor(255,230,230); doc.setDrawColor(220,80,80); }
          else{ doc.setFillColor(240,241,242); doc.setDrawColor(150,155,160); }
          doc.setLineWidth(0.3); doc.rect(M,y,tableW,rowH,'FD');
          pdfText(doc,slot.label+' 평균',M+TW.id/2,y+rowH/2,{size:7,bold:true,color:[40,40,40],align:'center',valign:'middle'});
          pdfText(doc,'-',M+TW.id+TW.round/2,y+rowH/2,{size:7,color:[130,130,130],align:'center',valign:'middle'});
          pdfText(doc,'-',M+TW.id+TW.round+TW.freq/2,y+rowH/2,{size:7,color:[130,130,130],align:'center',valign:'middle'});
          pdfText(doc,slot.average.toFixed(1)+' N',M+TW.id+TW.round+TW.freq+TW.tension/2,y+rowH/2,{size:8,bold:true,color:avgColor,align:'center',valign:'middle'});
          pdfText(doc,slot.avgJudge||'-',M+TW.id+TW.round+TW.freq+TW.tension+TW.judge/2,y+rowH/2,{size:8,bold:true,color:avgColor,align:'center',valign:'middle'});
          y+=rowH;
        }
      }
      y+=5;
    }

    /* ---- 푸터 ---- */
    const pages = doc.internal.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setDrawColor(229,232,237); doc.setLineWidth(0.3); doc.line(M,287,M+tableW,287);
      doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(190,190,190);
      doc.text('HL Robotics - Belt Tension Measurement Report  |  '+now+'  |  '+i+' / '+pages, W/2, 292, {align:'center'});
    }

    /* ---- 저장 ---- */
    const st=new Date();
    const pn=n=>String(n).padStart(2,'0');
    doc.save('belt_tension_report_'+st.getFullYear()+pn(st.getMonth()+1)+pn(st.getDate())+'_'+pn(st.getHours())+pn(st.getMinutes())+'.pdf');
    toast('PDF 보고서를 다운로드했습니다.','ok');
  }catch(e){
    console.error('PDF 생성 실패',e);
    toast('PDF 생성에 실패했습니다.','err');
  }
}

function fmtTime(d, withDate=false){
  const p=n=>String(n).padStart(2,'0');
  const t=p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
  if(!withDate) return t;
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+t;
}

/* ================================================================
   이벤트 바인딩 & 초기화
   ================================================================ */
btnStart.addEventListener('click', startMeasure);
btnStop.addEventListener('click', stopMeasure);
btnSave.addEventListener('click', saveCurrentSlot);
if(btnCancelSetup) btnCancelSetup.addEventListener('click', cancelCurrentRobot);
if(btnAddRobot) btnAddRobot.addEventListener('click', addRobotToQueue);
btnClear.addEventListener('click', clearHistory);
// 가이드 모드 스위치
const swGuide=$('swGuide');
if(swGuide){
  swGuide.addEventListener('click',()=>{
    guideActive=!guideActive;
    swGuide.setAttribute('aria-pressed', guideActive);
    swGuide.classList.toggle('on', guideActive);
    const chip=$('guideChip');
    if(chip) chip.style.display=guideActive?'inline-flex':'none';
    if(guideActive){ guideStartTs=Date.now(); guidePeakFired=false; }
  });
}
document.querySelectorAll('.guide-period-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    guidePeriodMs=parseInt(btn.dataset.period,10);
    if(guideActive) guideStartTs=Date.now();
    document.querySelectorAll('.guide-period-btn').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
});
// 주파수 스펙트럼 토글
const swSpectrum=$('swSpectrum'), spectrumPanel=$('spectrumPanel');
if(swSpectrum&&spectrumPanel){
  swSpectrum.addEventListener('click',()=>{
    const on=swSpectrum.getAttribute('aria-pressed')==='true';
    const next=!on;
    swSpectrum.setAttribute('aria-pressed',next);
    swSpectrum.classList.toggle('on',next);
    spectrumPanel.style.display=next?'':'none';
    if(next) setupCanvas();
  });
}
btnCSV.addEventListener('click', downloadCSV);
btnPDF.addEventListener('click', downloadPDF);
['input','change'].forEach(evt=>{
  inMass.addEventListener(evt, refreshPresetEstimate);
  inWidth.addEventListener(evt, refreshPresetEstimate);
  inSpan.addEventListener(evt, refreshPresetEstimate);
  inCF.addEventListener(evt, refreshPresetEstimate);
  inTargetN.addEventListener(evt, refreshPresetEstimate);
  kconst.addEventListener(evt, refreshPresetEstimate);
});

/* ---------- 측정 보조 토글 ---------- */
const swNoise=$('swNoise'), swLock=$('swLock'), btnRelearn=$('btnRelearn'),
      selLockWidth=$('selLockWidth'), lockWidthWrap=$('lockWidthWrap'),
      selFilterStrength=$('selFilterStrength'), filterStrengthRow=$('filterStrengthRow');
function setSwitch(btn,on){ btn.setAttribute('aria-pressed', on?'true':'false'); }
function updateAssistInfo(){
  const el=document.getElementById('lockDesc');
  if(!el) return;
  if(!targetLock.enabled){
    el.textContent='예상 주파수 주변의 좁은 대역만 탐색해 엉뚱한 피크를 무시합니다.'; return;
  }
  const c=computeLockCenter();
  el.textContent=(isFinite(c)&&c>0)
    ? ('중심 ≈ '+c.toFixed(1)+' Hz · ±'+targetLock.widthPct+'% 대역만 탐색합니다.')
    : '예상 주파수나 목표 장력을 입력하면 중심이 설정됩니다.';
}
swNoise.addEventListener('click', ()=>{
  noiseReduction.enabled=!noiseReduction.enabled;
  setSwitch(swNoise, noiseReduction.enabled);
  btnRelearn.style.display = noiseReduction.enabled?'inline-flex':'none';
  if(filterStrengthRow) filterStrengthRow.style.display = noiseReduction.enabled?'block':'none';
  if(noiseReduction.enabled){
    // 프로파일 유지 — ON/OFF 토글로 재학습 불필요
    if(noiseProfileReady){ setNoiseChip('학습완료'); }
    else if(learnRequested){ setNoiseChip(`학습 중 ${Math.min(100,Math.round(learnElapsedMs/LEARN_DURATION_MS*100))}%`); }
    else { setNoiseChip('재학습 버튼으로 학습'); }
    toast('노이즈 저감 ON','ok');
  }else{ setNoiseChip(''); toast('노이즈 저감 OFF','warn'); }
});
if(selFilterStrength) selFilterStrength.addEventListener('change', ()=>{
  filterStrength=parseInt(selFilterStrength.value,10)||2;
  saveState();
});
btnRelearn.addEventListener('click', ()=>{
  noiseProfile=null; noiseProfileReady=false; learnRequested=true;
  learnElapsedMs=0; learnLastTs=null; learnLastPct=-1; setNoiseChip('학습 중 0%');
  toast('소음 프로파일 초기화 — 측정 중 3초간 현장 소음을 다시 학습합니다.','ok');
});
swLock.addEventListener('click', ()=>{
  targetLock.enabled=!targetLock.enabled;
  setSwitch(swLock, targetLock.enabled);
  lockWidthWrap.style.display = targetLock.enabled?'inline-flex':'none';
  if(targetLock.enabled){
    const c=computeLockCenter();
    if(isFinite(c)&&c>0) toast('측정 대상 고정 ON — 중심 ≈ '+c.toFixed(1)+' Hz','ok');
    else toast('측정 대상 고정 ON — 예상 주파수나 목표 장력을 입력하면 정확해집니다.','warn');
  }else toast('측정 대상 고정 OFF','warn');
  updateAssistInfo();
});
selLockWidth.addEventListener('change', ()=>{
  targetLock.widthPct=parseInt(selLockWidth.value,10)||30; updateAssistInfo();
});
['input','change'].forEach(evt=>{
  [inMass,inWidth,inSpan,inCF,inTargetN,estFreq,kconst].forEach(el=>el.addEventListener(evt, updateAssistInfo));
});

/* ---------- 측정 플로우 토글 ---------- */
const swFlow=$('swFlow'), btnSimpleCSV=$('btnSimpleCSV');
if(swFlow){
  swFlow.addEventListener('click',()=>{
    const next=swFlow.getAttribute('aria-pressed')!=='true';
    if(setFlowMode(next) === false) return;  // confirm 취소 시 버튼 상태 유지
    swFlow.setAttribute('aria-pressed',next?'true':'false');
    saveState();
    toast(next
      ?'측정 플로우 ON — 세션 관리 모드로 전환됩니다.'
      :'측정 플로우 OFF — 단순 측정 모드로 전환됩니다.','ok');
  });
}
if(btnSimpleCSV) btnSimpleCSV.addEventListener('click', downloadSimpleCSV);

window.addEventListener('resize', setupCanvas);
window.addEventListener('beforeunload', ()=>{ if(measuring) stopMeasure(); });

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && measuring)
    toast('탭이 백그라운드로 전환됐습니다. 측정은 계속 실행됩니다.', 'warn', 2000);
});

/* ====================================================================
   목표 허용밴드 게이지 / Confidence 링
   ==================================================================== */
function renderTargetGauge(corrN, targetN, tolPct, judgeOk){
  var wrap=document.getElementById('gaugeWrap');
  var zone=document.getElementById('gaugeZone');
  var marker=document.getElementById('gaugeMarker');
  var low=document.getElementById('gaugeLow');
  var high=document.getElementById('gaugeHigh');
  if(!zone||!marker) return;
  var ok = isFinite(targetN) && isFinite(tolPct) && targetN>0 && tolPct>0;
  if(!ok){
    if(wrap) wrap.classList.add('no-target');
    zone.style.left='30%'; zone.style.width='40%';
    marker.style.left='50%'; marker.classList.remove('ok','ng');
    if(low) low.textContent='–'; if(high) high.textContent='–';
    return;
  }
  if(wrap) wrap.classList.remove('no-target');
  var lower=targetN*(1-tolPct/100), upper=targetN*(1+tolPct/100);
  var pad=tolPct/100*2.4;
  var domMin=targetN*(1-pad), domMax=targetN*(1+pad), span=domMax-domMin;
  if(span<=0) span=1;
  zone.style.left=((lower-domMin)/span*100)+'%';
  zone.style.width=((upper-lower)/span*100)+'%';
  var mk=(corrN-domMin)/span*100; mk=Math.max(0,Math.min(100,mk));
  marker.style.left=mk+'%';
  marker.classList.toggle('ok', judgeOk===true);
  marker.classList.toggle('ng', judgeOk===false);
  if(low) low.textContent=Math.round(lower);
  if(high) high.textContent=Math.round(upper);
}

function renderConfidenceRing(pct){
  var arc=document.getElementById('confArc');
  if(!arc) return;
  var circ=2*Math.PI*26;
  var p=Math.max(0,Math.min(100, isFinite(pct)?pct:0));
  arc.style.strokeDasharray=circ.toFixed(2);
  arc.style.strokeDashoffset=(circ*(1-p/100)).toFixed(2);
  arc.style.stroke = p>=90 ? 'var(--green)' : (p>=60 ? 'var(--warn)' : (p>0 ? 'var(--red)' : 'var(--line-2)'));
}

window.addEventListener('load', ()=>{
  setupCanvas();
  setupWaveformCanvas();
  drawSpectrum(new Uint8Array(0),1,1,0,-1);

  loadState();  // localStorage 복원

  // flowEnabled 상태에 따라 UI 초기화
  const swFlowEl=$('swFlow');
  if(swFlowEl) swFlowEl.setAttribute('aria-pressed', flowEnabled?'true':'false');
  if(!flowEnabled){
    const stepBar=document.querySelector('.step-bar');
    if(stepBar) stepBar.style.display='none';
    ['fs1','fs4','fs5'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    const prog=$('measureProgress'); if(prog) prog.style.display='none';
    const simCSV=$('btnSimpleCSV'); if(simCSV) simCSV.style.display='';
    const fs2=$('fs2'), fs3=$('fs3');
    if(fs2) fs2.className='flow-step s-active';
    if(fs3) fs3.className='flow-step s-active';
    document.body.dataset.step = '2';
  } else {
    setStep(1);
  }

  if(selFilterStrength) selFilterStrength.value=String(filterStrength);
  refreshBeltBtns('drive'); refreshBeltBtns('lifting');
  updateSlotProgress();
  renderRobots();
  updateReportButtons();
  updateSessionSwitchRow();
  renderConfidenceRing(0);
  renderTargetGauge(NaN, NaN, NaN, null);
  if(!canUseMicrophone()){
    toast(micUnavailableMessage(), 'err');
    btnStart.disabled=true;
  }
  if(robots.length||simpleHistory.length)
    toast('이전 측정 데이터를 복원했습니다.','ok',2500);
});
