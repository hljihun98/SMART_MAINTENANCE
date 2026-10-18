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

/* ---------- 기본주파수 판정 (배음 오검출 방지) 상수 ----------
   튕긴 벨트는 f0, 2f0, 3f0 … 배음을 함께 낸다. 그런데
   - 측정 대상 고정 대역(예상 주파수 ±30%)은 T∝f² 이므로 장력 0.49~1.69배만 담는다.
     크게 느슨한 벨트는 f0가 대역 밖(아래)에 있고 2f0/3f0만 대역 안에 남는다.
   - 스마트폰 마이크는 100 Hz 이하 감도가 낮아(저역 롤오프 -10~-15 dB) 느슨한 벨트의 f0가
     배음보다 약하게 잡힐 수 있다.
   → 대역 안에서 고른 피크 f에 대해 f/2, f/3 위치(분석 범위 10~5000 Hz 안)에
     '진짜' 국소 피크가 있으면 그것을 기본주파수로 보고 장력을 계산한다. */
const SUBHARM_DIVISORS = [2, 3];
const SUBHARM_TOL = 0.035;       // f/n 허용 오차 ±3.5% (벨트 강성에 의한 배음 비정수성) — 보간 주파수 비율로 최종 확인
const SUBHARM_MIN_TOL_BINS = 1;  // 저주파에서 탐색 창이 최소 ±1 bin은 되도록 (정현파 argmax 오차 ±0.5 bin).
                                 // ±2 bin 이상이면 8192 FFT에서 60 Hz 험이 f/3 창(±12 Hz)에 걸려 오판했음(합성 신호 검증)
const PEAK_MIN_PROM_DB = 12;     // 충격 수집 구간 프레임 피크의 최소 돌출도(주변 노이즈 바닥 대비).
                                 // 대역 안이 노이즈뿐일 때(기본파가 대역 밖) 노이즈 최대값을 주파수로 채택하지 않도록
const SUBHARM_MIN_REL_DB = -20;  // 선택 피크 대비 -20 dB(진폭 10%) 이상 — 폰 마이크 저역 롤오프 + 튕김 위치에 따른 배음비 허용
const SUBHARM_MIN_PROM_DB = 12;  // 주변 노이즈 바닥(중앙값) 대비 +12 dB 이상 — 단일 프레임 노이즈(레일리 분포)가
                                 // 중앙값+12 dB를 넘을 확률 ≈ 2e-5/bin 이므로 우연 일치를 배제
const EDGE_BINS = 1;             // 피크가 잠금 대역 경계에서 이 bin 이내면 '경계 피크'(진짜 피크가 대역 밖일 수 있음)
const EDGE_CONF_CAP = 30;        // 경계 피크의 신뢰도 상한 — 저장 불가 수준
const LIVE_SAVE_MIN_CONF = 50;   // 연속 측정 모드 저장 최소 신뢰도 (버퍼 5프레임이 채워지고 안정적일 때 65)
const REARM_QUIET_MS = 300;      // 연속 모드 저장 후, 신호가 이 시간 이상 사라져야 다음 측정 허용(같은 진동 재저장 방지)

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
let floatBuf=null, byteBuf=null, waveformBuf=null, timeBuf=null, rafId=null;
let measuring=false;
let starting=false, startToken=0;   // 측정 시작 진행 중(중복 시작 방지) / stop 시 증가 → 진행 중인 시작 취소
let pausedByHide=false;             // 백그라운드 전환으로 측정을 멈춘 경우 복귀 시 안내
let dispFreq=0;
let peakBuffer=[];
let peakFlagBuffer=[];              // peakBuffer와 같은 길이 — 프레임별 {edge, subN}
let rearmPending=false, rearmQuietSince=0;  // 연속 모드: 저장 후 새 튕김 대기
let currentResult=null;
let activeBeltType=null;   // 현재 측정 중인 벨트 타입 ('lifting'|'drive')
let selectedDriveIds=new Set();   // 선택된 구동모듈 ID (초기: 없음)
let selectedLiftingIds=new Set(); // 선택된 리프팅 ID (초기: 없음)
let robots=[];             // [{id,unit,createdAt,completedAt,slots:[]}]
let activeRobot=null;      // 현재 측정 중인 로봇
let activeSlotIdx=0;       // 현재 slots[] 인덱스
/* 벨트 타입별 형상 기억 — 새 호기 슬롯은 반드시 자기 타입의 형상만 사용 (다른 타입 값 혼입 금지)
   초기값은 프리셋, 해당 타입 슬롯을 저장할 때 실제 사용한 형상으로 갱신 */
let beltGeom={
  drive:   {mass:BELT_PRESETS.drive.mass,   width:BELT_PRESETS.drive.width,   span:BELT_PRESETS.drive.span,   cf:BELT_PRESETS.drive.cf},
  lifting: {mass:BELT_PRESETS.lifting.mass, width:BELT_PRESETS.lifting.width, span:BELT_PRESETS.lifting.span, cf:BELT_PRESETS.lifting.cf}
};
let storageWarned=false;   // localStorage 저장 실패 안내(연속 실패 시 1회)
let collecting=false, strikeTs=0, collectStartTs=0, collectEndTs=0, collectedSnapshots=[];
let lastStrikeAt=0;
let guideActive=true, guideStartTs=Date.now(), guidePeriodMs=3000, guidePeakFired=false;  // 타이밍 가이드 기본 ON
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
let targetLock={enabled:true, widthPct:30};
let lockCenter=NaN, lockLoBin=-1, lockHiBin=-1;
let adaptiveTrigger=false;  // true=적응형(v2), false=고정 0.08(v1 클래식)
let flowEnabled=true;
let nrHintShown=false, unstableCount=0;  // 노이즈 저감 안내 토스트 (세션 내 1회)
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

/* ---------- 안전 헬퍼 (XSS·CSV·날짜) ---------- */
/* innerHTML에 넣는 사용자 입력/저장값은 반드시 이스케이프 */
function escapeHtml(v){
  return String(v==null?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* 호기 번호: 숫자 1~6자리만 허용 */
const UNIT_RE=/^[0-9]{1,6}$/;
/* 날짜 복원: Date / ISO 문자열 / 숫자(ms) / 구형 {__type:'Date',iso} 모두 허용, 실패 시 null */
function toDate(v){
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(v && typeof v==='object' && v.__type==='Date') v=v.iso;
  if(typeof v==='string' || typeof v==='number'){
    const d=new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
/* CSV 셀: 따옴표 이스케이프 + 수식 주입 방어(=,+,-,@,탭,CR 시작 시 ' 접두). 숫자(음수 포함)는 그대로 */
const CSV_NUM_RE=/^-?\d+(\.\d+)?$/;
function csvCell(v){
  if(v==null) return '';
  if(typeof v==='number') return isFinite(v) ? String(v) : '';
  let s=String(v);
  if(!CSV_NUM_RE.test(s) && /^[=+\-@\t\r]/.test(s)) s="'"+s;
  if(/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s='"'+s.replace(/"/g,'""')+'"';
  return s;
}
function toCsv(lines){ return '﻿'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n'); }

/* ---------- 보고서 버튼 활성화 ---------- */
function updateReportButtons(){
  const hasData = robots.length > 0;
  if(btnPDF) btnPDF.disabled = !hasData;
  if(btnCSV) btnCSV.disabled = !hasData;
}

/* ---------- 측정 플로우 단계 ---------- */
function setStep(n){
  document.body.dataset.step = String(n);
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

/* ---------- 활성 슬롯 목록 생성 ---------- */
/* 형상(mass/width/span/cf)은 입력칸이 아니라 '해당 타입'의 기억값(beltGeom)에서 가져온다.
   (입력칸은 직전 슬롯의 값이 남아 있어 구동/리프팅 형상이 섞이는 원인이었음) */
function buildActiveSlots(){
  const clampCount=v=>Math.min(10, Math.max(1, parseInt(v,10)||1));
  const dm=clampCount(inDriveMeas&&inDriveMeas.value);
  const lm=clampCount(inLiftingMeas&&inLiftingMeas.value);
  return BELT_IDS
    .filter(def => (def.type==='drive' ? selectedDriveIds : selectedLiftingIds).has(def.key))
    .map(def => {
      const p = BELT_PRESETS[def.type];
      const g = beltGeom[def.type];
      return {
        key: def.key, type: def.type, label: def.label,
        targetN: p.targetN, tolPct: p.tolPct,
        mass: g.mass, width: g.width, span: g.span, cf: g.cf,
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
        const unit = flowEnabled && activeRobot ? activeRobot.unit+'호기 · ' : '';
        el.textContent = unit + slot.label+' · '+cur+' / '+max;
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
    return `<span class="smp-chip ${cls}">${escapeHtml(s.label+judge)}</span>`;
  }).join('');
}

/* ---------- 호기 대기열 미리보기 카드 (Step 1) ---------- */
function renderRobotQueuePreview(){
  const el=$('robotQueuePreview');
  if(!el) return;
  if(robots.length===0){ el.style.display='none'; return; }
  el.style.display='block';
  el.innerHTML=robots.map(r=>{
    const driveSlots=r.slots.filter(s=>s.type==='drive').map(s=>s.label).join(', ');
    const liftSlots=r.slots.filter(s=>s.type==='lifting').map(s=>s.label).join(', ');
    const canDelete=!r.startedAt;
    const parts=[driveSlots?'구동 '+driveSlots:'', liftSlots?'리프팅 '+liftSlots:''].filter(Boolean);
    const measCount=r.slots[0]?.measCount||1;
    return `<div class="rq-card">
      <div class="rq-unit">${escapeHtml(r.unit)}호기</div>
      <div class="rq-info">${escapeHtml(parts.join(' · '))} · ${Number(measCount)}회</div>
      ${canDelete
        ?`<button class="rq-del" onclick="deleteRobot(${Number(r.id)})" type="button">삭제</button>`
        :`<span class="rq-started">측정중</span>`}
    </div>`;
  }).join('');
}

/* ---------- 호기 큐에 추가 ---------- */
function addRobotToQueue(){
  const unit = inUnit ? inUnit.value.trim() : '';
  if(!unit){ toast('호기 번호를 입력해주세요.','err'); inUnit&&inUnit.focus(); return; }
  if(!UNIT_RE.test(unit)){ toast('호기 번호는 숫자(1~6자리)만 입력할 수 있습니다.','err'); inUnit&&inUnit.focus(); return; }
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
  renderRobotQueuePreview();
  inUnit.value='';
  inUnit.focus();
  saveState();
  toast(unit+'호기가 추가되었습니다.','ok');
}

/* ---------- 로봇 시퀀스 시작 ---------- */
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

  // 2순위: 페이지 재로드 후 미완료 호기 재개 (startedAt 있으나 completedAt 없음)
  const inProgress = robots.find(r=>r.startedAt && !r.completedAt);
  if(inProgress){
    activeRobot = inProgress;
    activeSlotIdx = Math.max(0, inProgress.slots.findIndex(s=>!s.completedAt));
    applySlotPreset(inProgress.slots[activeSlotIdx]);
    renderRobotProgress();
    renderRobots();
    updateSessionSwitchRow();
    saveState();
    toast(inProgress.unit+'호기 측정을 재개합니다.','ok');
    return true;
  }

  // 3순위(폴백): Step 1 현재 입력으로 즉시 생성
  const unit = inUnit ? inUnit.value.trim() : '';
  if(!unit){ toast('호기를 추가하거나 호기 번호를 입력해주세요.','err'); return false; }
  if(!UNIT_RE.test(unit)){ toast('호기 번호는 숫자(1~6자리)만 입력할 수 있습니다.','err'); return false; }
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
  // 최소 품질 검사: 경계 피크는 실제 피크가 대역 밖일 수 있어 값 자체를 믿을 수 없음
  if(currentResult.edge){
    toast('피크가 측정 대상 고정 대역 경계에 있어 저장할 수 없습니다. 측정 보조에서 고정 범위를 넓히거나 끄고 다시 측정하세요.','err',5000);
    return;
  }
  // 연속 측정 모드: 5프레임 안정 + 최소 신뢰도 + 새 튕김(같은 진동 재저장 방지)
  if(currentResult.source==='live'){
    if(rearmPending){ toast('이미 저장한 진동입니다. 벨트를 다시 튕긴 뒤 저장하세요.','warn'); return; }
    if(!currentResult.stable || (currentResult.confidence||0) < LIVE_SAVE_MIN_CONF){
      toast('측정값이 아직 안정되지 않았습니다. 벨트를 다시 튕겨 신호 검출 상태에서 저장하세요.','warn'); return;
    }
  }
  if(currentResult.source==='live') startRearm();  // 이 진동은 소비됨 → 신호가 사라졌다 다시 튕길 때까지 대기
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
  // 이 타입에서 실제 사용한 형상을 기억 → 이후 추가하는 호기의 같은 타입 슬롯에만 적용
  if(beltGeom[slot.type]) beltGeom[slot.type]={mass:slot.mass, width:slot.width, span:slot.span, cf:slot.cf};
  const lower = slot.targetN*(1-slot.tolPct/100), upper = slot.targetN*(1+slot.tolPct/100);
  const judge = currentResult.corrN>=lower && currentResult.corrN<=upper ? 'OK' : 'NG';
  slot.values.push({freq:currentResult.freq, corrN:currentResult.corrN, kgf:currentResult.kgf,
    rawN:currentResult.rawN, conf:currentResult.confidence||0, time:new Date(), judge});
  beep(1320, 80);

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
        nextPending.startedAt = new Date();
        saveState(); // 슬롯·호기 완료 + 다음 호기 시작 상태까지 모두 저장
        activeRobot = null; activeSlotIdx = 0;
        resetForNextMeasurement(false);
        activeRobot = nextPending;
        activeSlotIdx = 0;
        applySlotPreset(nextPending.slots[0]);
        renderRobotProgress();
        renderRobots();
        updateSessionSwitchRow();
        toast(completedUnit+'호기 완료 → '+nextPending.unit+'호기 벨트를 튕겨주세요.','ok',4000);
      } else {
        saveState(); // 슬롯·호기 완료 상태 저장
        activeRobot = null;
        resetForNextMeasurement(true);
        setStep(4);
        updateSessionSwitchRow();
        toast('모든 호기 측정 완료! 보고서를 다운로드하세요.','ok',4800);
      }
      return;
    }
    saveState(); // 슬롯 완료 상태(completedAt·average·avgJudge) 저장
    activeSlotIdx++;
    toast(slot.label+' 완료 (평균 '+slot.average.toFixed(1)+' N → '+slot.avgJudge+') — 다음으로 이동','ok',3000);
    renderRobotProgress();
    renderRobots();
    resetForNextMeasurement(false);
    applySlotPreset(activeRobot.slots[activeSlotIdx]);
  }else{
    saveState(); // 측정값 저장
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
  saveState(); // 회차 삭제 즉시 반영
  renderRobotProgress();
  renderRobots();
  updateSlotProgress();
  setStep(2);
  toast((vi+1)+'회차 측정값을 삭제했습니다.','warn');
}

/* ---------- 연속 모드 재무장: 저장 후 같은 진동으로 다시 채우지 않도록 ---------- */
function startRearm(){
  rearmPending=true; rearmQuietSince=0;
  peakBuffer=[]; peakFlagBuffer=[];
}

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
    const rid  = Number(robot.id);
    const unitH = escapeHtml(robot.unit);

    /* ── 대기 중 카드 ── */
    if(isPending){
      const driveKeys = robot.slots.filter(s=>s.type==='drive').map(s=>s.key).join(' · ') || '없음';
      const liftKeys  = robot.slots.filter(s=>s.type==='lifting').map(s=>s.key).join(' · ') || '없음';
      return `<div class="robot-card robot-pending robot-clickable" onclick="startRobotFromProgress(${rid})">
        <div class="robot-card-head">
          <span class="robot-unit">${unitH}호기</span>
          <span class="robot-tag robot-tag-pending">▶ 클릭하여 시작</span>
          <button class="robot-del" onclick="event.stopPropagation();deleteRobot(${rid})" title="삭제">✕</button>
        </div>
        <div class="robot-card-config">구동 ${escapeHtml(driveKeys)} · 리프팅 ${escapeHtml(liftKeys)}</div>
      </div>`;
    }

    /* ── 완료 카드 (컴팩트) ── */
    if(isDone){
      const chips = robot.slots.map(slot=>{
        if(!slot.values.length) return '';
        const cls = slot.avgJudge==='OK' ? 'prog-ok' : 'prog-ng';
        return `<div class="prog-chip ${cls}">
          <span class="prog-num">${escapeHtml(slot.label)}</span>
          <span class="prog-val">${slot.average!=null?slot.average.toFixed(1):'—'}</span>
          <span class="prog-unit">N</span>
        </div>`;
      }).join('');
      return `<div class="robot-card robot-done">
        <div class="robot-card-head">
          <span class="robot-unit">${unitH}호기</span>
          <span class="robot-tag robot-tag-done">✓ 완료</span>
          <button class="robot-del" onclick="deleteRobot(${rid})" title="삭제">✕</button>
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
           <span class="avg-judge">${escapeHtml(slot.avgJudge)}</span>
         </div>` : '';
      const statusTag = done ? '<span class="slot-tag-done">✓</span>' :
                        cur  ? '<span class="slot-tag-now">측정 중</span>' :
                               '<span class="slot-tag-goto">탭하여 이동</span>';
      const clickAttr = done ? '' : `onclick="switchToSlot(${rid},${si})"`;
      return `<div class="slot-section ${cur?'slot-cur':''}${done?' slot-done':' slot-goto'}" ${clickAttr}>
        <div class="slot-head"><span class="slot-key">${escapeHtml(slot.label)}</span>${statusTag}</div>
        <div class="prog-grid">${chips}${empties}</div>${avgBlock}
      </div>`;
    }).join('');

    const robotTag = isActive
      ? '<span class="robot-tag robot-tag-active">측정 중</span>'
      : '<span class="robot-tag robot-tag-paused">일시중지</span>';
    return `<div class="robot-card robot-active${isActive?'':' robot-paused'}">
      <div class="robot-card-head">
        <span class="robot-unit">${unitH}호기</span>
        ${robotTag}
        <button class="robot-del" onclick="deleteRobot(${rid})" title="삭제">✕</button>
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
  renderRobots(); renderRobotProgress(); updateReportButtons(); updateSessionSwitchRow(); renderRobotQueuePreview();
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
  if(measuring || starting) return;   // 권한 팝업 대기 중 연타 → 스트림/AudioContext 중복 생성 방지
  if(flowEnabled && !activeRobot){ if(!initRobotIfNeeded()) return; }
  if(!validateInputs()) return;
  if(!canUseMicrophone()){
    setStatus('bad','마이크 사용 불가','UNAVAILABLE');
    toast(micUnavailableMessage(), 'err');
    btnStart.disabled = !window.isSecureContext;
    return;
  }

  starting=true; btnStart.disabled=true;
  const myToken=++startToken;
  try{
    await openAudio(myToken);
  }finally{
    starting=false;
  }
}

async function openAudio(myToken){
  let stream=null;
  try{
    stream = await navigator.mediaDevices.getUserMedia({
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
    stopMeasure(true);
    return;
  }
  // 권한 대기 중에 중지/화면 전환 등으로 시작이 취소됨 → 방금 얻은 마이크를 즉시 반납
  if(myToken!==startToken){ stream.getTracks().forEach(t=>t.stop()); return; }
  micStream = stream;

  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') await audioCtx.resume();
    if(myToken!==startToken){ stopMeasure(true); return; }
    srcNode = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = parseInt(selFFT.value,10);
    analyser.smoothingTimeConstant = 0;
    srcNode.connect(analyser);
    floatBuf = new Float32Array(analyser.frequencyBinCount);
    byteBuf  = new Uint8Array(analyser.frequencyBinCount);
    waveformBuf = new Uint8Array(analyser.fftSize);
    timeBuf = new Float32Array(analyser.fftSize);   // computeRMS 재사용 버퍼 (프레임마다 할당하지 않음)
  }catch(err){
    setStatus('bad','오디오 초기화 실패','ERROR');
    toast('오디오 초기화에 실패했습니다: '+err.message, 'err');
    stopMeasure(true);
    return;
  }

  measuring=true; peakBuffer=[]; peakFlagBuffer=[];
  rearmPending=false; rearmQuietSince=0;
  resetCollection();
  nrHintShown=false; unstableCount=0;
  ambientRms=0.02;    // 측정 시작 시 기준선 리셋 (filterStrength=2 기준 초기 임계값 ≈ 0.08)
  guideStartTs=Date.now(); guidePeakFired=false;  // 사인파 위상을 측정 시작점부터 새로 시작
  btnStart.disabled=true; btnStop.disabled=false; btnSave.disabled=true;
  setStep(2);
  selFFT.disabled=true;
  setStatus('listen','측정 중 — 벨트를 튕겨주세요','LISTENING');
  toast('측정을 시작했습니다. 벨트 Span 중앙을 가볍게 튕기세요.', 'ok');
  analyzeLoop();
}

/* ================================================================
   측정 중지 — 리소스 정리
   ================================================================ */
/* keepStatus=true: 오류 상태 표시(권한 거부 등)를 '대기 중'으로 덮어쓰지 않음 */
function stopMeasure(keepStatus){
  measuring=false;
  startToken++;   // 진행 중인 startMeasure(권한 대기 등)가 있으면 취소
  if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
  if(srcNode){ try{srcNode.disconnect();}catch(e){} srcNode=null; }
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
  if(audioCtx){ try{ const p=audioCtx.close(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} audioCtx=null; }
  analyser=null;
  resetCollection();   // 수집 중 중지 → 재시작 시 이전 벨트 스냅샷으로 결과가 나오지 않도록
  peakBuffer=[]; peakFlagBuffer=[];
  btnStart.disabled=false; btnStop.disabled=true; btnSave.disabled=true;
  selFFT.disabled=false;
  dispFreq=0;
  if(keepStatus!==true) setStatus('ready','대기 중','READY');
  meterFill.style.width='0%'; meterVal.textContent='0%';
  liveFreq.textContent='--'; livePeak.textContent='대기'; livePeak.style.color='var(--muted)';
  if(waveformBuf){ waveformBuf.fill(128); drawWaveform(); }
  learnLastTs=null;  // 측정 중지 시 학습 타이머 일시 정지 (재시작 시 시간 점프 방지)
  // 가이드는 적응형 충격 감지 ON일 때만 기본값(ON)으로 복귀 — 연속 모드에서 숨은 가이드가 켜지지 않도록
  setGuide(adaptiveTrigger);
}

/* 충격 수집 상태 초기화 */
function resetCollection(){
  collecting=false; collectStartTs=0; collectEndTs=0;
  collectedSnapshots=[]; collectionMaxRms=0;
}

/* 타이밍 가이드 ON/OFF + 스위치·칩 동기화 */
function setGuide(on){
  guideActive=!!on; guidePeakFired=false;
  if(guideActive) guideStartTs=Date.now();
  const swG=$('swGuide');
  if(swG){ swG.setAttribute('aria-pressed', guideActive?'true':'false'); swG.classList.toggle('on', guideActive); }
  const chip=$('guideChip'); if(chip) chip.style.display=guideActive?'inline-flex':'none';
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

  // 분석 범위(10~5000 Hz) — 기본주파수(f/2, f/3) 탐색은 잠금 대역 밖이어도 이 범위 안이면 허용
  const fullMinBin = Math.max(1, Math.floor(MIN_FREQ/binHz));
  const fullMaxBin = Math.min(floatBuf.length-2, Math.ceil(MAX_FREQ/binHz));
  let minBin = fullMinBin, maxBin = fullMaxBin;
  let lockNarrowed = false;

  lockLoBin=-1; lockHiBin=-1; lockCenter=NaN;
  if(targetLock.enabled){
    const c = computeLockCenter();
    if(isFinite(c) && c>0){
      lockCenter=c;
      const w=targetLock.widthPct/100;
      const lo=Math.max(MIN_FREQ, c*(1-w)), hi=Math.min(MAX_FREQ, c*(1+w));
      lockLoBin=Math.max(minBin, Math.floor(lo/binHz));
      lockHiBin=Math.min(maxBin, Math.ceil(hi/binHz));
      if(lockHiBin>lockLoBin){ minBin=lockLoBin; maxBin=lockHiBin; lockNarrowed=true; }
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

    if(guideActive && adaptiveTrigger){
      // 가이드 모드(적응형 충격 감지 ON일 때만): 사인파 피크에서 자동 트리거
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
    } else if(adaptiveTrigger) {
      // 적응형 충격 감지
      const K_MAP = [2.5, 4.0, 6.0, 8.0];
      const threshold = Math.max(0.04, ambientRms * K_MAP[filterStrength - 1]);
      if(rms > threshold && (now - lastStrikeAt) > 3000){
        strikeTs=now; lastStrikeAt=now;
        collecting=true; collectStartTs=strikeTs+500; collectEndTs=strikeTs+2000; collectedSnapshots=[];
        collectionMaxRms=0;
        beep(880, 80);
        setStatus('listen','충격 감지 — 0.5s 무시 후 1.5s 분석','COLLECTING');
      }
    }
    // !adaptiveTrigger: 연속 측정 모드 — 충격 감지 없이 주파수 직접 업데이트
  } else {
    collectionMaxRms = Math.max(collectionMaxRms, rms);
    if(now > collectEndTs){
      collecting = false;
      finalizeCollection();
    }else if(now >= collectStartTs){
      const det = detectFundamentalBandpass(floatBuf, binHz, minBin, maxBin, fullMinBin, fullMaxBin, lockNarrowed);
      if(det) collectedSnapshots.push({t:now, f:det.freq, mag:det.mag, edge:det.edge, subN:det.subN});
      if(det){ dispFreq = dispFreq ? dispFreq*0.65+det.freq*0.35 : det.freq; liveFreq.textContent=dispFreq.toFixed(1); }
      else { liveFreq.textContent='--'; }
    }
    rafId=requestAnimationFrame(analyzeLoop); return;
  }

  let detected=false;
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
    const det = analyzePeak(floatBuf, binHz, peakBin, minBin, maxBin, fullMinBin, fullMaxBin, lockNarrowed);
    const f = det.freq;
    if(f<MIN_FREQ || f>MAX_FREQ){
      setStatus('listen','측정 범위를 벗어난 주파수','RANGE');
    }else{
      detected=true;
      dispFreq = dispFreq ? dispFreq*0.65+f*0.35 : f;
      liveFreq.textContent = dispFreq.toFixed(1);
      livePeak.textContent='검출'; livePeak.style.color='var(--green)';
      if(!adaptiveTrigger && rearmPending){
        // 연속 모드: 방금 저장한 진동이 아직 남아 있음 → 결과 갱신·저장 보류
        setStatus('listen','저장 완료 — 다음 측정은 벨트를 다시 튕겨주세요','NEXT');
      }else{
        pushPeak(f, det);
        const stable = stableFreq();
        const unstable = isUnstable();
        const flags = bufferFlags();
        if(unstable){
          setStatus('noise','측정 불안정 — 반복 측정해주세요','UNSTABLE');
        }else if(flags.edge){
          setStatus('weak','피크가 고정 대역 경계 — 목표에서 크게 벗어났을 수 있음 (고정 범위 확대/해제 후 재측정)','EDGE');
        }else if(flags.subN>1){
          setStatus('good',subharmText(flags.subN),'DETECTED');
        }else{
          setStatus('good','신호 검출','DETECTED');
        }
        if(!adaptiveTrigger && !unstable){
          // 결과는 EMA 표시값이 아니라 이상치를 제거한 안정화 주파수로 계산
          const full = peakBuffer.length>=BUF_SIZE;
          updateResult(stable, undefined, {source:'live', edge:flags.edge, subN:flags.subN, stable:full});
          if(btnSave) btnSave.disabled = !(full && !flags.edge && currentResult && currentResult.confidence>=LIVE_SAVE_MIN_CONF);
        }
      }
    }
  }

  // 연속 모드 재무장: 저장 후 신호가 REARM_QUIET_MS 이상 사라지면 다음 튕김을 받음
  if(rearmPending){
    if(detected) rearmQuietSince=0;
    else if(!rearmQuietSince) rearmQuietSince=now;
    else if(now-rearmQuietSince>=REARM_QUIET_MS){ rearmPending=false; rearmQuietSince=0; }
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

/* ================================================================
   기본주파수 판정 — 배음 오검출 방지 (상수·근거는 파일 상단 SUBHARM_* 참고)
   ================================================================ */
/* centerHz 부근(±SUBHARM_TOL, 최소 ±SUBHARM_MIN_TOL_BINS)에서 가장 큰 국소 극대점 */
function localPeakNear(buf, centerHz, binHz, loLimit, hiLimit){
  const c = centerHz/binHz;
  const tol = Math.max(SUBHARM_MIN_TOL_BINS, c*SUBHARM_TOL);
  const lo = Math.max(loLimit, Math.floor(c-tol)), hi = Math.min(hiLimit, Math.ceil(c+tol));
  let best=-1, bestDb=-Infinity;
  for(let i=lo;i<=hi;i++){
    const v=buf[i];
    if(isFinite(v) && v>bestDb && v>=buf[i-1] && v>=buf[i+1]){ bestDb=v; best=i; }
  }
  return best<0 ? null : {bin:best, db:bestDb};
}
/* bin 주변(±25%, 최소 ±12 bin)의 노이즈 바닥 = 피크 주엽(±4 bin)을 뺀 dB 중앙값 */
function localFloorDb(buf, bin, loLimit, hiLimit){
  const half=Math.max(12, Math.round(bin*0.25)), excl=4;
  const vals=[];
  for(let i=Math.max(loLimit,bin-half); i<=Math.min(hiLimit,bin+half); i++){
    if(Math.abs(i-bin)<=excl) continue;
    const v=buf[i]; if(isFinite(v)) vals.push(v);
  }
  return vals.length ? median(vals) : -Infinity;
}
/* 선택 피크(peakBin)에 대해 f/2, f/3 위치에 유의미한 국소 피크가 있으면 그쪽을 기본주파수로.
   최대 2단계(→ 4·6·9배 배음까지) 반복. 반환 subN = 선택 피크가 기본파의 몇 배인지(1=그대로) */
function resolveFundamental(buf, binHz, peakBin, anaLo, anaHi){
  const refDb = buf[peakBin];
  let bin=peakBin, subN=1, fCur=interpolatePeak(buf, peakBin, binHz);
  for(let step=0; step<2; step++){
    let pick=null;
    for(const n of SUBHARM_DIVISORS){
      const cand = localPeakNear(buf, fCur/n, binHz, anaLo, anaHi);
      if(!cand || cand.bin>=bin) continue;
      if(cand.db < ABS_MIN_DB) continue;                       // 절대 신호 약함
      if(cand.db - refDb < SUBHARM_MIN_REL_DB) continue;        // 선택 피크 대비 너무 약함
      if(cand.db - localFloorDb(buf, cand.bin, anaLo, anaHi) < SUBHARM_MIN_PROM_DB) continue; // 노이즈 바닥과 구분 안 됨
      const fc = interpolatePeak(buf, cand.bin, binHz);
      if(Math.abs(fc*n/fCur - 1) > SUBHARM_TOL) continue;       // 정수배 관계가 아님(예: 60 Hz 험)
      if(!pick || n>pick.n) pick={bin:cand.bin, n, f:fc};       // 둘 다 맞으면 더 낮은 주파수(큰 n)
    }
    if(!pick) break;
    bin=pick.bin; subN*=pick.n; fCur=pick.f;
  }
  return {bin, subN};
}
/* 대역 [bandLo,bandHi] 안의 최대 피크(peakBin)를 분석해 기본주파수·플래그 반환
   - freq: subN>1이면 '선택 피크의 보간 주파수 / subN' (고주파 쪽 해상도가 상대적으로 더 정밀)
   - edge: 잠금 대역(narrowed) 경계 피크이면서 기본파를 따로 찾지 못한 경우 */
function analyzePeak(buf, binHz, peakBin, bandLo, bandHi, anaLo, anaHi, narrowed){
  const atEdge = narrowed && (peakBin-bandLo<=EDGE_BINS || bandHi-peakBin<=EDGE_BINS);
  const fPeak = atEdge ? peakBin*binHz : interpolatePeak(buf, peakBin, binHz);  // 경계에서는 바깥 bin이 더 클 수 있어 보간 생략
  const r = resolveFundamental(buf, binHz, peakBin, anaLo, anaHi);
  // 경계 배음은 위치가 부정확 → 이 경우만 기본파 자체를 보간
  const freq = r.subN===1 ? fPeak : (atEdge ? interpolatePeak(buf, r.bin, binHz) : fPeak / r.subN);
  return {
    freq,
    bin: r.bin, subN: r.subN,
    db: buf[peakBin], mag: Math.pow(10, buf[peakBin]/20),
    edge: atEdge && r.subN===1
  };
}

function computeRMS(){
  if(!analyser) return 0;
  if(!timeBuf || timeBuf.length!==analyser.fftSize) timeBuf=new Float32Array(analyser.fftSize);
  try{ analyser.getFloatTimeDomainData(timeBuf); }catch(e){ return 0; }
  let s=0; for(let i=0;i<timeBuf.length;i++){ s += timeBuf[i]*timeBuf[i]; }
  return Math.sqrt(s/timeBuf.length);
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

/* 배음 판정 안내 문구 — 잠금 대역이 좁혀진 상태면 기본주파수는 반드시 대역 밖 */
function subharmText(subN){
  const locked = lockLoBin>=0 && lockHiBin>lockLoBin;
  return (locked ? '기본주파수가 고정 대역 밖' : '배음 감지')+' — '+subN+'차 배음을 기본주파수로 환산';
}

/* 충격 수집 구간의 프레임별 기본주파수 검출
   - 탐색 대역: 측정 대상 고정 ON이면 잠금 대역, OFF면 분석 범위 전체 (예전의 숨은 '예상±30%' 대역 제거 —
     고정 OFF인데도 대역이 좁혀져 경계 안내가 무의미해지는 문제)
   - 대역 최대 피크 → analyzePeak()로 배음(f/2, f/3) 검사 + 경계 판정 */
function detectFundamentalBandpass(floatBuf, binHz, bandLo, bandHi, anaLo, anaHi, narrowed){
  let peakBin=-1, peakDb=-Infinity;
  for(let i=bandLo;i<=bandHi;i++){
    const v=floatBuf[i];
    if(v>peakDb){ peakDb=v; peakBin=i; }
  }
  if(peakBin<0 || !isFinite(peakDb)) return null;
  // 대역 안이 노이즈뿐이면(기본파가 대역 밖 등) 프레임을 버림 — 노이즈 최대값이 주파수로 채택되는 것 방지
  if(peakDb - localFloorDb(floatBuf, peakBin, bandLo, bandHi) < PEAK_MIN_PROM_DB) return null;
  return analyzePeak(floatBuf, binHz, peakBin, bandLo, bandHi, anaLo, anaHi, narrowed);
}

/* ----------------------------------------------------------------
   측정 안정화
   ---------------------------------------------------------------- */
function pushPeak(f, det){
  peakBuffer.push(f);
  peakFlagBuffer.push({edge:!!(det&&det.edge), subN:(det&&det.subN)||1});
  if(peakBuffer.length>BUF_SIZE) peakBuffer.shift();
  if(peakFlagBuffer.length>BUF_SIZE) peakFlagBuffer.shift();
}
/* 버퍼 과반 기준 플래그 — 한두 프레임의 흔들림으로 안내가 깜빡이지 않도록 */
function bufferFlags(){
  const n=peakFlagBuffer.length;
  if(!n) return {edge:false, subN:1};
  const edgeCnt=peakFlagBuffer.filter(x=>x.edge).length;
  const subs=peakFlagBuffer.map(x=>x.subN).filter(v=>v>1);
  return {edge: edgeCnt*2>n, subN: subs.length*2>n ? Math.round(median(subs)) : 1};
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
/* meta: {source:'live'|'collect', edge, subN, stable} — 저장 품질 검사·안내에 사용 */
function updateResult(freq, extConf, meta){
  if(!isFinite(freq)) return;
  meta = meta || {};
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
  let realtimeConf = extConf !== undefined ? extConf :
    (peakBuffer.length < 2 ? 15 :
     peakBuffer.length < BUF_SIZE ? 25 + peakBuffer.length * 8 :
     isUnstable() ? 20 : 65);
  if(meta.edge) realtimeConf = Math.min(realtimeConf, EDGE_CONF_CAP);  // 경계 피크 → 신뢰도 낮춤(저장 불가)
  currentResult={
    time:new Date(), mass,width,span,cf, freq, targetN, tolPct,
    rawN, corrN, kgf, confidence: Math.round(realtimeConf),
    source: meta.source||'collect', edge: !!meta.edge, subN: meta.subN||1, stable: meta.stable!==false
  };
  if(extConf === undefined){
    // 연속 모드: 링/숫자도 실시간 신뢰도로 갱신 (예전엔 충격 수집 결과에서만 갱신)
    $('resConf').textContent = currentResult.confidence;
    try{ renderConfidenceRing(currentResult.confidence); }catch(e){}
  }
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

  // 채택된 스냅샷 과반이 경계 피크/배음 판정이면 결과 플래그로 반영
  const base = filtered.length ? filtered : last;
  const edge = base.filter(s=>s.edge).length*2 > base.length;
  const subs = base.map(s=>s.subN||1).filter(v=>v>1);
  const subN = subs.length*2 > base.length ? Math.round(median(subs)) : 1;
  if(edge) confidence = Math.min(confidence, EDGE_CONF_CAP);

  updateResult(finalFreq, confidence, {source:'collect', edge, subN, stable:true});
  if(currentResult){ currentResult.rangePercent = rangePercent; }
  $('resConf').textContent = Math.round(confidence);
  try{ renderConfidenceRing(Math.round(confidence)); }catch(e){}
  const hasResult = isFinite(finalFreq);
  btnSave.disabled = !hasResult || edge;

  if(edge){
    setStatus('weak','피크가 고정 대역 경계 — 목표에서 크게 벗어났을 수 있음','EDGE');
    beep(660, 80);
    toast('피크가 측정 대상 고정 대역 경계에 있습니다. 고정 범위를 넓히거나 끄고 다시 측정하세요.','warn',5000);
  }else if(subN>1 && rangePercent<=3 && agreement>=0.8){
    setStatus('good',subharmText(subN),'STABLE');
    beep(1100, 150);
    toast(subharmText(subN)+' — 장력이 목표와 크게 다를 수 있으니 확인 후 저장하세요.','warn',5000);
  }else if(rangePercent<=3 && agreement>=0.8){
    setStatus('good','결과 안정 — 저장하거나 재측정하세요','STABLE');
    beep(1100, 150);
    toast('결과가 안정적입니다. 저장 버튼을 눌러주세요.','ok');
  }else{
    setStatus('weak','결과 불안정 — 재측정 권장','UNSTABLE');
    beep(660, 80);
    toast('측정 완료 (Confidence '+Math.round(confidence)+'%). 재측정하거나 저장하세요.','warn');
    if(!noiseReduction.enabled && !nrHintShown){
      unstableCount++;
      if(unstableCount>=2){
        setTimeout(()=>toast('소음이 많으면 측정 보조 → 노이즈 저감을 켜보세요','warn',5000),3500);
        nrHintShown=true;
      }
    }
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

  /* ── 가이드 모드: 스크롤 사인파 애니메이션 (적응형 충격 감지 ON일 때만) ── */
  if(guideActive && adaptiveTrigger && !collecting){
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

  /* ── 노이즈 저감 밴드 시각화 ── */
  const NR_ALPHA=[1.0,1.5,2.5,3.5];
  const nrAlpha=NR_ALPHA[(filterStrength||2)-1];
  const halfH=H/2-5;
  let suppressPx=0;
  if(noiseReduction.enabled && ambientRms>0){
    const noisePx=Math.min(ambientRms*halfH, halfH);
    suppressPx=Math.min(noisePx*nrAlpha, halfH);
    if(noiseProfileReady){
      // ① 원래 소음 수준 밴드 (황색 — "이만큼이 배경 소음")
      waveCtx.fillStyle='rgba(251,191,36,0.12)';
      waveCtx.fillRect(0, H/2-noisePx, W, noisePx*2);
      // ② 억제 구간 밴드 (파랑 — "필터가 잘라내는 범위")
      waveCtx.fillStyle='rgba(56,189,248,0.15)';
      waveCtx.fillRect(0, H/2-suppressPx, W, suppressPx*2);
      // ③ 억제 경계 점선
      waveCtx.save();
      waveCtx.setLineDash([4,4]);
      waveCtx.strokeStyle='rgba(56,189,248,0.5)';
      waveCtx.lineWidth=1;
      waveCtx.beginPath();
      waveCtx.moveTo(0,H/2-suppressPx); waveCtx.lineTo(W,H/2-suppressPx);
      waveCtx.moveTo(0,H/2+suppressPx); waveCtx.lineTo(W,H/2+suppressPx);
      waveCtx.stroke();
      waveCtx.restore();
      // ④ NR 강도 텍스트
      waveCtx.fillStyle='rgba(56,189,248,0.8)';
      waveCtx.font='bold 9px sans-serif';
      waveCtx.textAlign='right';
      waveCtx.fillText('NR ×'+['1.0','1.5','2.5','3.5'][(filterStrength||2)-1], W-4, 11);
      waveCtx.textAlign='left';
    } else if(learnRequested){
      // 학습 중: 황색 점선만 (ambientRms 기반, 아직 불안정)
      waveCtx.save();
      waveCtx.setLineDash([2,6]);
      waveCtx.strokeStyle='rgba(251,191,36,0.4)';
      waveCtx.lineWidth=1;
      waveCtx.beginPath();
      waveCtx.moveTo(0,H/2-noisePx); waveCtx.lineTo(W,H/2-noisePx);
      waveCtx.moveTo(0,H/2+noisePx); waveCtx.lineTo(W,H/2+noisePx);
      waveCtx.stroke();
      waveCtx.restore();
    }
  }

  /* ── 파형 그리기 (억제 구간=회색, 신호 구간=밝은색) ── */
  waveCtx.lineWidth=1.5;
  waveCtx.beginPath();
  let lastInNoise=null;
  for(let x=0;x<W;x++){
    const i=Math.floor(x/W*waveformBuf.length);
    const v=waveformBuf[i]/128-1;
    const y=H/2+v*(H/2-5);
    const inNoise=suppressPx>0 && Math.abs(v*(H/2-5))<=suppressPx;
    if(inNoise!==lastInNoise){
      if(x>0) waveCtx.stroke();
      waveCtx.strokeStyle=inNoise
        ? (collecting?'#4B5563':'#374151')
        : (collecting?'#38bdf8':'#94a3b8');
      waveCtx.beginPath();
      waveCtx.moveTo(x,y);
      lastInNoise=inNoise;
    } else {
      x===0 ? waveCtx.moveTo(x,y) : waveCtx.lineTo(x,y);
    }
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
  const robotHeaders = robots.map(r=>`<th>${r.unit ? escapeHtml(r.unit)+'호기' : '(미설정)'}</th>`).join('');
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
      return `<td class="val-cell ${cls}" style="text-align:center;font-weight:700;">${avg.toFixed(1)}<br><span style="font-size:9px;font-weight:800;">${escapeHtml(judge)}</span></td>`;
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

/* ================================================================
   localStorage 상태 저장 / 복원
   - 키: beltTension_v1 (2.0 전용. 1.0은 별도 키 beltTension_classic_v1 사용)
   - Date는 JSON.stringify가 toJSON()으로 먼저 바꾸므로 ISO 문자열로 저장된다.
     복원 시 알려진 날짜 필드(createdAt·startedAt·completedAt·time)를 toDate()로 되돌린다.
   ================================================================ */
const STORAGE_KEY='beltTension_v1';
function saveState(){
  try{
    const data={version:1, flowEnabled, robots, simpleHistory, filterStrength, adaptiveTrigger, beltGeom};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageWarned=false;
    return true;
  }catch(e){
    console.error('saveState 실패', e);
    if(!storageWarned){
      storageWarned=true;
      // 호출부가 곧바로 띄우는 '저장되었습니다' 토스트에 덮이지 않도록 다음 틱에 표시
      setTimeout(()=>toast('기록을 브라우저에 저장하지 못했습니다(저장 공간 부족/차단). 새로고침 전에 CSV·PDF로 내보내세요.','err',6000), 0);
    }
    return false;
  }
}
/* 숫자 필드 정규화: 숫자가 아니면 NaN(또는 기본값) */
function numOr(v, d){ return (typeof v==='number' && isFinite(v)) ? v : d; }
function normGeom(g, type){
  const p=BELT_PRESETS[type];
  g = (g && typeof g==='object') ? g : {};
  const pos=(v,d)=>{ const n=numOr(v,NaN); return n>0 ? n : d; };
  return {mass:pos(g.mass,p.mass), width:pos(g.width,p.width), span:pos(g.span,p.span), cf:pos(g.cf,p.cf)};
}
function normValue(v){
  if(!v || typeof v!=='object' || !isFinite(v.freq) || !isFinite(v.corrN)) return null;
  return {freq:+v.freq, corrN:+v.corrN, kgf:numOr(v.kgf, v.corrN/G), rawN:numOr(v.rawN, NaN),
          conf:numOr(v.conf,0), time:toDate(v.time), judge:(v.judge==='OK'||v.judge==='NG')?v.judge:'--'};
}
function normSlot(s){
  if(!s || typeof s!=='object') return null;
  const def=BELT_IDS.find(d=>d.key===s.key);
  if(!def) return null;                       // 알 수 없는 벨트 ID는 버림
  const p=BELT_PRESETS[def.type];
  const values=Array.isArray(s.values) ? s.values.map(normValue).filter(Boolean) : [];
  const g=normGeom(s, def.type);
  const slot={
    key:def.key, type:def.type, label:def.label,
    targetN:numOr(s.targetN,p.targetN), tolPct:numOr(s.tolPct,p.tolPct),
    mass:g.mass, width:g.width, span:g.span, cf:g.cf,
    measCount:Math.min(10, Math.max(1, parseInt(s.measCount,10)||1)),
    values, average:numOr(s.average,null), avgJudge:(s.avgJudge==='OK'||s.avgJudge==='NG')?s.avgJudge:null,
    completedAt:toDate(s.completedAt)
  };
  // 아직 측정하지 않은 슬롯은 해당 타입 형상으로 재설정 (이전 버전에서 다른 타입 형상이 섞여 들어간 대기 슬롯 복구)
  if(!values.length){ const t=beltGeom[def.type]; slot.mass=t.mass; slot.width=t.width; slot.span=t.span; slot.cf=t.cf; }
  return slot;
}
function normRobot(r, i){
  if(!r || typeof r!=='object' || !Array.isArray(r.slots)) return null;
  const slots=r.slots.map(normSlot).filter(Boolean);
  if(!slots.length) return null;
  const id=numOr(r.id, NaN);
  return {
    id: isFinite(id) ? id : Date.now()+i,
    unit: String(r.unit==null?'':r.unit).slice(0,20),
    createdAt: toDate(r.createdAt) || new Date(),
    startedAt: toDate(r.startedAt), completedAt: toDate(r.completedAt),
    slots
  };
}
function normSimple(v){
  const n=normValue(v);
  if(!n) return null;
  return Object.assign(n, {
    mass:numOr(v.mass,NaN), width:numOr(v.width,NaN), span:numOr(v.span,NaN), cf:numOr(v.cf,NaN),
    targetN:numOr(v.targetN,NaN), tolPct:numOr(v.tolPct,NaN)
  });
}
function loadState(){
  let data=null;
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    data=JSON.parse(raw);
  }catch(e){ console.error('loadState: 저장 데이터 파싱 실패', e); return; }
  if(!data || typeof data!=='object' || data.version!==1) return;
  beltGeom={ drive:normGeom(data.beltGeom&&data.beltGeom.drive,'drive'),
             lifting:normGeom(data.beltGeom&&data.beltGeom.lifting,'lifting') };
  robots=(Array.isArray(data.robots)?data.robots:[]).map(normRobot).filter(Boolean);
  simpleHistory=(Array.isArray(data.simpleHistory)?data.simpleHistory:[]).map(normSimple).filter(Boolean);
  flowEnabled=data.flowEnabled!==false;
  filterStrength=(data.filterStrength>=1&&data.filterStrength<=4)?Math.round(data.filterStrength):2;
  adaptiveTrigger=data.adaptiveTrigger===true;
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
      <td class="${cls}" style="text-align:center;font-weight:700;">${escapeHtml(v.judge)}</td>
      <td style="text-align:center;">${escapeHtml(fmtTime(v.time))}</td>
    </tr>`;
  }).join('');
}

/* CSV 파일 저장 (BOM + 셀 이스케이프는 toCsv, 다운로드는 공통 smDownload — URL 지연 해제) */
function saveCsvFile(lines, prefix){
  const blob=new Blob([toCsv(lines)],{type:'text/csv;charset=utf-8;'});
  const stamp=fmtTime(new Date(),true).replace(/[: ]/g,'-');
  smDownload(blob, prefix+stamp+'.csv');
  toast('CSV 파일을 다운로드했습니다.','ok');
}

function downloadSimpleCSV(){
  if(!simpleHistory.length){ toast('다운로드할 측정이 없습니다.','err'); return; }
  const header=['회차','주파수(Hz)','장력(N)','kgf','판정','시각'];
  const rows=simpleHistory.map((v,i)=>[
    i+1, v.freq.toFixed(2), v.corrN.toFixed(2), isFinite(v.kgf)?v.kgf.toFixed(3):'', v.judge, fmtTime(v.time,true)
  ]);
  saveCsvFile([header,...rows], 'belt_tension_simple_');
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
  saveCsvFile([header,...rows], 'belt_tension_');
}

/* ================================================================
   PDF 보고서 다운로드 (센서점검 앱 동일 양식)
   ================================================================ */
async function downloadPDF(){
  if(!robots.length){ toast('다운로드할 측정이 없습니다.','err'); return; }
  // jsPDF는 저장소에 포함한 로컬 파일(assets/vendor)에서 로드 — 실패 시 명확히 안내
  if(!window.jspdf || !window.jspdf.jsPDF){
    toast('PDF 라이브러리(jsPDF)를 불러오지 못했습니다. 페이지를 새로고침하거나 CSV로 내보내세요.','err',6000);
    return;
  }
  // iOS Safari: 생성(비동기) 후 window.open을 부르면 사용자 제스처가 만료돼 팝업이 차단됨
  // → 클릭 직후(첫 await 전) 빈 창을 먼저 열어 두고 생성이 끝나면 그 창으로 PDF를 보낸다
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);   // iPadOS 13+는 Mac으로 보고됨
  let iosWin=null;
  if(isIOS){ try{ iosWin=window.open('', '_blank'); }catch(e){ iosWin=null; } }
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
        doc.setFillColor(70,70,70); doc.setDrawColor(70,70,70); doc.setLineWidth(0.25);
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

      /* 호기 배너 (다크 그레이) */
      doc.setFillColor(30,30,30); doc.setDrawColor(30,30,30); doc.setLineWidth(0.3);
      doc.rect(M,y,tableW,7,'FD');
      pdfText(doc,unitStr,M+3,y+3.5,{size:9,bold:true,color:[255,255,255],valign:'middle'});
      pdfText(doc,robotJudge,M+tableW-3,y+3.5,{size:9,bold:true,
        color:robotNG?[255,160,160]:robot.completedAt?[140,230,160]:[190,190,190],align:'right',valign:'middle'});
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
          doc.setDrawColor(205,205,205); doc.setLineWidth(0.25);
          if(vi%2===0){ doc.setFillColor(247,247,247); doc.rect(rx,y,tableW,rowH,'F'); }

          /* 벨트 ID */
          doc.rect(rx,y,TW.id,rowH);
          pdfText(doc,slot.label,rx+TW.id/2,y+rowH/2,{size:7.5,bold:true,color:[30,30,30],align:'center',valign:'middle'});
          rx+=TW.id;

          /* 회차 */
          doc.rect(rx,y,TW.round,rowH);
          pdfText(doc,(vi+1)+'회',rx+TW.round/2,y+rowH/2,{size:7,color:[80,80,80],align:'center',valign:'middle'});
          rx+=TW.round;

          /* 주파수 */
          doc.rect(rx,y,TW.freq,rowH);
          pdfText(doc,v.freq.toFixed(1),rx+TW.freq/2,y+rowH/2,{size:7,color:[80,80,80],align:'center',valign:'middle'});
          rx+=TW.freq;

          /* 장력 */
          doc.rect(rx,y,TW.tension,rowH);
          pdfText(doc,v.corrN.toFixed(1)+' N',rx+TW.tension/2,y+rowH/2,{
            size:7,bold:isOK||isNG,color:isOK?[20,110,50]:isNG?[160,20,20]:[80,80,80],align:'center',valign:'middle'});
          rx+=TW.tension;

          /* 판정 */
          if(isOK){ doc.setFillColor(220,245,225); doc.setDrawColor(100,190,120); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          else if(isNG){ doc.setFillColor(255,228,228); doc.setDrawColor(210,70,70); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          else{ doc.setFillColor(242,242,242); doc.setDrawColor(180,180,180); doc.rect(rx,y,TW.judge,rowH,'FD'); }
          pdfText(doc,v.judge||'-',rx+TW.judge/2,y+rowH/2,{
            size:7,bold:true,color:isOK?[20,110,50]:isNG?[160,20,20]:[140,140,140],align:'center',valign:'middle'});
          rx+=TW.judge;

          /* 시각 */
          doc.setDrawColor(205,205,205); doc.rect(rx,y,TW.time,rowH);
          pdfText(doc,v.time?fmtTime(v.time):'-',rx+TW.time/2,y+rowH/2,{size:6.5,color:[110,110,110],align:'center',valign:'middle'});
          y+=rowH;
        });

        /* 슬롯 평균 행 */
        if(slot.values.length>0 && slot.average!=null){
          const rowH=7;
          if(y+rowH>285){ doc.addPage(); y=14; }
          const isOK=slot.avgJudge==='OK', isNG=slot.avgJudge==='NG';
          const avgColor=isOK?[20,110,50]:isNG?[160,20,20]:[80,80,80];
          // 행 전체: 중립 회색 배경
          doc.setFillColor(242,242,242); doc.setDrawColor(180,180,180);
          doc.setLineWidth(0.3); doc.rect(M,y,tableW,rowH,'FD');
          // 판정 셀만 OK/NG 색상
          const jx=M+TW.id+TW.round+TW.freq+TW.tension;
          if(isOK){ doc.setFillColor(220,245,225); doc.setDrawColor(100,190,120); }
          else if(isNG){ doc.setFillColor(255,228,228); doc.setDrawColor(210,70,70); }
          doc.rect(jx,y,TW.judge,rowH,'FD');
          pdfText(doc,slot.label+' 평균',M+TW.id/2,y+rowH/2,{size:7,bold:true,color:[30,30,30],align:'center',valign:'middle'});
          pdfText(doc,'-',M+TW.id+TW.round/2,y+rowH/2,{size:7,color:[140,140,140],align:'center',valign:'middle'});
          pdfText(doc,'-',M+TW.id+TW.round+TW.freq/2,y+rowH/2,{size:7,color:[140,140,140],align:'center',valign:'middle'});
          pdfText(doc,slot.average.toFixed(1)+' N',M+TW.id+TW.round+TW.freq+TW.tension/2,y+rowH/2,{size:8,bold:true,color:avgColor,align:'center',valign:'middle'});
          pdfText(doc,slot.avgJudge||'-',jx+TW.judge/2,y+rowH/2,{size:8,bold:true,color:avgColor,align:'center',valign:'middle'});
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
    const fname='belt_tension_report_'+st.getFullYear()+pn(st.getMonth()+1)+pn(st.getDate())+'_'+pn(st.getHours())+pn(st.getMinutes())+'.pdf';
    if(isIOS && iosWin && !iosWin.closed){
      const blob=doc.output('blob');
      const url=URL.createObjectURL(blob);
      iosWin.location.href=url;
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
      toast('PDF가 새 탭에서 열렸습니다. 공유(↑) 버튼으로 저장하세요.','ok',5000);
    }else{
      // 데스크톱/안드로이드, 또는 iOS에서 새 창이 차단된 경우 → 직접 다운로드
      doc.save(fname);
      toast(isIOS ? '새 탭이 차단되어 PDF를 바로 다운로드했습니다. 파일 앱에서 확인하세요.' : 'PDF 보고서를 다운로드했습니다.','ok',isIOS?5000:undefined);
    }
  }catch(e){
    console.error('PDF 생성 실패',e);
    if(iosWin && !iosWin.closed){ try{ iosWin.close(); }catch(_){} }
    toast('PDF 생성에 실패했습니다.','err');
  }
}

/* 시각 포맷 — Date가 아니어도(복원된 ISO 문자열·숫자·null) 죽지 않도록 방어 */
function fmtTime(d, withDate=false){
  d = toDate(d);
  if(!d) return '-';
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
  swGuide.addEventListener('click',()=>{ setGuide(!guideActive); });
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
const swAdaptiveTrigger=$('swAdaptiveTrigger');
const swNoise=$('swNoise'), swLock=$('swLock'),
      selLockWidth=$('selLockWidth'), lockWidthWrap=$('lockWidthWrap'),
      selFilterStrength=$('selFilterStrength'), filterStrengthRow=$('filterStrengthRow'),
      btnLearn=$('btnLearn'), learnRow=$('learnRow');
function setSwitch(btn,on){ if(btn) btn.setAttribute('aria-pressed', on?'true':'false'); }
/* 파형·가이드 섹션은 적응형 충격 감지 ON일 때만 표시. 가이드는 ON이면 기본 켜짐, OFF면 강제 꺼짐
   (페이지 첫 로드에도 항상 호출 — 예전엔 저장 데이터가 있을 때만 호출돼 연속 모드에서 숨은 가이드가 동작) */
function applyAdaptiveTriggerUI(){
  const waveSection=document.getElementById('waveformSection');
  if(waveSection) waveSection.style.display=adaptiveTrigger?'':'none';
  setGuide(adaptiveTrigger);
}
swAdaptiveTrigger.addEventListener('click', ()=>{
  adaptiveTrigger=!adaptiveTrigger;
  setSwitch(swAdaptiveTrigger, adaptiveTrigger);
  applyAdaptiveTriggerUI();
  saveState();
  toast(adaptiveTrigger ? '적응형 충격 감지 ON — 벨트를 튕겨주세요' : '연속 측정 모드 ON — 주파수가 바로바로 업데이트됩니다', adaptiveTrigger?'ok':'warn',4000);
});
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
function startNoiseLearn(){
  noiseProfile=null; noiseProfileReady=false; learnRequested=true;
  learnElapsedMs=0; learnLastTs=null; learnLastPct=-1; setNoiseChip('학습 중 0%');
}
swNoise.addEventListener('click', ()=>{
  noiseReduction.enabled=!noiseReduction.enabled;
  setSwitch(swNoise, noiseReduction.enabled);
  const show=noiseReduction.enabled;
  if(filterStrengthRow) filterStrengthRow.style.display=show?'block':'none';
  if(learnRow) learnRow.style.display=show?'flex':'none';
  if(show){
    if(noiseProfileReady){ setNoiseChip('학습완료'); }
    else if(learnRequested){ setNoiseChip(`학습 중 ${Math.min(100,Math.round(learnElapsedMs/LEARN_DURATION_MS*100))}%`); }
    else { setNoiseChip(''); }
    toast('노이즈 저감 ON','ok');
  }else{
    learnRequested=false;
    setNoiseChip(''); toast('노이즈 저감 OFF','warn');
  }
});
if(selFilterStrength) selFilterStrength.addEventListener('change', ()=>{
  filterStrength=parseInt(selFilterStrength.value,10)||2;
  saveState();
});
if(btnLearn) btnLearn.addEventListener('click', ()=>{
  startNoiseLearn();
  toast('측정 중 3초간 현장 소음을 학습합니다.','ok');
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

/* 백그라운드 전환 시 측정 중지 — 숨은 탭에서는 requestAnimationFrame이 멈춰 분석이 안 되는데
   마이크만 계속 열려 배터리를 쓰므로(v1과 동일 정책). 복귀하면 안내 */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(measuring || starting){ stopMeasure(); pausedByHide=true; }
  }else if(pausedByHide){
    pausedByHide=false;
    toast('화면을 벗어나 측정을 중지했습니다. 측정 시작을 다시 눌러주세요.', 'warn', 4000);
  }
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

  loadState();  // localStorage 복원 (구조 검증·날짜 복원 포함)
  setSwitch(swAdaptiveTrigger, adaptiveTrigger);
  applyAdaptiveTriggerUI();   // 저장 데이터 유무와 관계없이 항상 — 연속 모드면 파형·가이드 숨김/OFF

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
  setSwitch(swLock, targetLock.enabled);
  if(lockWidthWrap) lockWidthWrap.style.display=targetLock.enabled?'inline-flex':'none';
  refreshBeltBtns('drive'); refreshBeltBtns('lifting');
  updateSlotProgress();
  renderRobots();
  renderRobotProgress();
  renderRobotQueuePreview();
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
