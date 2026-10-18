/* ===== helpers.js : 공용 헬퍼: escHtml·jsArg·로컬날짜·입력검증·rbc·sts·fd·toast·logActivity·addWD·rendAll ===== */
/* (원본 robot_inventory__44_.html 1831-1856 줄을 그대로 분리) */
// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

// ── HTML 이스케이프 (innerHTML·속성값에 사용자 입력을 넣을 때 필수) ──
// 다른 렌더 파일보다 먼저 로드되도록 helpers.js 에 둡니다.
function escHtml(v){
  return String(v ?? '').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
// 인라인 onclick="fn(...)" 의 문자열 인자용: JS 문자열 이스케이프 후 HTML 이스케이프.
// 반환값은 따옴표까지 포함된 리터럴 → onclick="openPartDetail(${jsArg(pn)})"
// (escHtml 만 쓰면 &#39; 가 HTML 파싱 단계에서 ' 로 복원되어 JS 문자열이 깨집니다)
function jsArg(v){
  const s=String(v ?? '')
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/\r\n|\r|\n|\u2028|\u2029/g,'\\n')
    .replace(/</g,'\\x3c');
  return "'"+escHtml(s)+"'";
}

// ── 로컬(브라우저 시간대) 기준 날짜 문자열 'YYYY-MM-DD' ──
// toISOString().slice(0,10) 은 UTC 기준이라 KST 00~09시에 하루 전 날짜가 됩니다.
function localDateStr(d){
  const x=d instanceof Date?d:(d==null?new Date():new Date(d));
  if(isNaN(x))return '';
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
// 'YYYY-MM-DD' → 로컬 자정 Date (new Date('YYYY-MM-DD') 는 UTC 자정으로 해석됨)
function parseLocalDate(s){
  const m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(!m)return null;
  return new Date(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3]));
}
// 'YYYY-MM-DD' 에 n일(달력일) 더한 문자열
function addDaysStr(s,n){
  const d=parseLocalDate(s);if(!d)return '';
  d.setDate(d.getDate()+n);
  return localDateStr(d);
}

// ── 입력 검증/정규화 (엑셀·직접입력·입출고 모달 공통) ──
const ROBOTS=['PARKIE','CARRIE','GOALIE'];
// 로봇명 정규화: 대소문자·공백 무시, 그 외 값은 null
function normRobot(v){
  const s=String(v ?? '').trim().toUpperCase();
  return ROBOTS.includes(s)?s:null;
}
// 입출고 구분: IN/OUT(대소문자 무관)·입고/출고 → 'IN'|'OUT', 그 외 null
function parseIOType(v){
  const s=String(v ?? '').trim().toUpperCase();
  if(s==='IN'||s==='입고')return 'IN';
  if(s==='OUT'||s==='출고')return 'OUT';
  return null;
}
// 양의 정수만 허용 (천 단위 콤마 허용). '10개'·'1.5'·'-3'·'' → null
function parsePosInt(v){
  if(typeof v==='number')return Number.isInteger(v)&&v>0?v:null;
  const s=String(v ?? '').trim().replace(/,/g,'');
  if(!/^\d+$/.test(s))return null;
  const n=parseInt(s,10);
  return n>0?n:null;
}
// 0 이상 숫자 (빈 칸은 null → '기존 값 유지' 판단용). 잘못된 값은 NaN
function parseNonNegNum(v){
  if(v===undefined||v===null)return null;
  if(typeof v==='number')return isFinite(v)&&v>=0?v:NaN;
  const s=String(v).trim().replace(/,/g,'');
  if(s==='')return null;
  if(!/^\d+(\.\d+)?$/.test(s))return NaN;
  return parseFloat(s);
}
// 최소 재고가 설정된 부품만 부족 판단 (minStock 0 인 조립품·미관리 품목 제외)
function isLowStock(b){
  return (Number(b.minStock)||0)>0&&(Number(b.stock)||0)<=Number(b.minStock);
}
// XLSX 라이브러리 로드 확인 (로컬 vendor 파일, 사용 시점 가드)
function xlsxReady(){
  if(typeof XLSX!=='undefined')return true;
  toast('❌','엑셀 라이브러리를 아직 불러오지 못했습니다. 잠시 후 다시 시도하거나 새로고침하세요.','err');
  return false;
}

function rbc(r){return r==='PARKIE'?'rb-pk':r==='CARRIE'?'rb-ca':'rb-go';}
function sts(s,m){if(s===0)return{c:'s-out',t:'재고없음'};if(s<=m)return{c:'s-low',t:'부족'};return{c:'s-ok',t:'정상'};}
function fd(ts){return new Date(ts).toLocaleString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
// 사진 미리보기 썸네일 (이미지 참조 id 또는 data URL → images.js 의 imgAttrs 로 렌더)
function pminis(ph,max){if(!ph||!ph.length)return'-';let h=ph.slice(0,max).map(p=>`<img ${imgAttrs(p)} class="pm" onclick="event.stopPropagation();openLBFromImg(this)">`).join('');if(ph.length>max)h+=`<span class="t-sm t-mu">+${ph.length-max}</span>`;return h;}
let _toastTimer=null;
function toast(icon,msg,type){
  const t=document.getElementById('tst');
  if(!t)return;
  t.style.borderColor=type==='ok'?'var(--gn)':type==='err'?'var(--re)':'var(--am)';
  document.getElementById('tst-i').textContent=icon;
  document.getElementById('tst-m').textContent=msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>t.classList.remove('show'),type==='err'?5000:3000);
}
function logActivity(userId,userName,type,detail){
  activityLog.unshift({ts:Date.now(),userId,userName,type,detail});
  if(activityLog.length>500)activityLog.pop();
}
function addWD(date,days){
  let d=new Date(date);let added=0;
  while(added<days){d.setDate(d.getDate()+1);const dw=d.getDay();if(dw!==0&&dw!==6)added++;}
  return d;
}
function rendAll(){rendDash();rendBOM();rendLogs();rendLabor();}
