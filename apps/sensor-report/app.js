function saveToServer() {
  alert('추후에 기능 업데이트 예정입니다.');
}

// 점검 대상 센서 목록입니다. 화면과 PDF, 서버 저장에 공통으로 사용됩니다.
const SENSORS = [
  {name:'FRONT LIDAR', type:'lidar'},
  {name:'REAR LIDAR',  type:'lidar'},
  {name:'FRONT CAMERA',type:'camera'},
  {name:'REAR CAMERA', type:'camera'}
];
const ANGLES = ['정면','좌측','우측','후면'];
function getAnglesForSensor(sensor){
  if(sensor && sensor.type === 'camera') return ['정면','측면'];
  if(sensor && String(sensor.name||'').toUpperCase() === 'FRONT LIDAR') return ['정면','좌측','우측','상면'];
  return ANGLES;
}
const STAGES = [
  {key:'before',      label:'작업 전'},
  {key:'move_before', label:'이동 전'},
  {key:'after',       label:'작업 후'},
  {key:'move_after',  label:'이동 후'}
];
const STORAGE_KEY = 'parkie_sensor_v3';
const STATUS_OPTIONS = ['정상','경미한 손상','교체 필요','긴급 점검'];
const LOGO_SRC = '../../logo.png';
const PDF_FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif";
const MM_TO_PX = 96 / 25.4;
let robots = [], rid = 0, activeStage = '';
let toastTimer = null;
let logoImagePromise = null;
const imageInfoCache = new Map();

function getLogoImage(){
  if(!logoImagePromise){
    logoImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = LOGO_SRC;
    });
  }
  return logoImagePromise;
}
function getImageInfo(src){
  if(!src) return Promise.resolve({w:1,h:1});
  if(imageInfoCache.has(src)) return imageInfoCache.get(src);
  const p = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({w:img.naturalWidth||img.width||1,h:img.naturalHeight||img.height||1});
    img.onerror = () => resolve({w:1,h:1});
    img.src = src;
  });
  imageInfoCache.set(src,p);
  return p;
}
function pad(n){ return String(n).padStart(2,'0'); }
function getNow(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
function getDate(){ const d=new Date(); return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate()); }
function updateClock(){ document.getElementById('clock').textContent=getNow(); }
function stageLabel(k){
  if(!k) return '단계 미선택';
  return (STAGES.find(s=>s.key===k)||{label:k}).label;
}

function escHtml(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function stagePhotoKey(rid,si,ai,stage){ return rid+'_'+si+'_'+ai+'_'+stage; }
function emptyStageMap(val){ return STAGES.reduce((o,s)=>{ o[s.key]=SENSORS.map(()=>val); return o; },{}); }
function makeRobot(num,id){ return {id,num,status:'',photos:{},ss:emptyStageMap(null),memo:emptyStageMap('')}; }
function ensureBuckets(r){
  if(!r.ss||typeof r.ss!=='object') r.ss=emptyStageMap(null);
  if(!r.memo||typeof r.memo!=='object') r.memo=emptyStageMap('');
  for(const s of STAGES){
    if(!Array.isArray(r.ss[s.key])) r.ss[s.key]=SENSORS.map(()=>null);
    if(!Array.isArray(r.memo[s.key])) r.memo[s.key]=SENSORS.map(()=>'');
    while(r.ss[s.key].length<SENSORS.length) r.ss[s.key].push(null);
    while(r.memo[s.key].length<SENSORS.length) r.memo[s.key].push('');
  }
}
function normalizeRobot(r){
  if(!r||typeof r!=='object') return makeRobot(1,Date.now());
  const out=makeRobot(Number(r.num)||1, Number(r.id)||Date.now());
  out.status = STATUS_OPTIONS.includes(r.status) ? r.status : '정상';
  if(r.photos && typeof r.photos==='object'){
    for(const [key,val] of Object.entries(r.photos)){
      if(!val) continue;
      const parts = key.split('_');
      if(parts.length===4) out.photos[key]=val;
      else if(parts.length===3) for(const s of STAGES) out.photos[parts[0]+'_'+parts[1]+'_'+parts[2]+'_'+s.key]=val;
    }
  }
  if(r.ss){
    if(Array.isArray(r.ss)){
      const base = SENSORS.map((_,i)=>r.ss[i]??null);
      for(const s of STAGES) out.ss[s.key]=[...base];
    } else {
      for(const s of STAGES){
        const arr = Array.isArray(r.ss[s.key]) ? r.ss[s.key] : [];
        out.ss[s.key] = SENSORS.map((_,i)=>arr[i]??null);
      }
    }
  }
  if(r.memo){
    if(Array.isArray(r.memo)){
      const base = SENSORS.map((_,i)=>r.memo[i]??'');
      for(const s of STAGES) out.memo[s.key]=[...base];
    } else {
      for(const s of STAGES){
        const arr = Array.isArray(r.memo[s.key]) ? r.memo[s.key] : [];
        out.memo[s.key]=SENSORS.map((_,i)=>arr[i]??'');
      }
    }
  }
  ensureBuckets(out);
  return out;
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      robots, rid, activeStage,
      photo_by: document.getElementById('photo_by').value
    }));
  }catch(e){ showToast('저장 공간 부족. 사진 수를 줄여주세요.'); }
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const d=JSON.parse(raw);
    const legacyStatus = STATUS_OPTIONS.includes(d.category) ? d.category : '정상';
    robots = Array.isArray(d.robots) ? d.robots.map(r => {
      const nr = normalizeRobot(r);
      if(!r || typeof r !== 'object' || !('status' in r)) nr.status = legacyStatus;
      return nr;
    }) : [];
    rid = Number(d.rid) || robots.reduce((m,r)=>Math.max(m,Number(r.id)||0),0);
    document.getElementById('photo_by').value = d.photo_by||'';
    activeStage = STAGES.some(s=>s.key===d.activeStage) ? d.activeStage : '';
    if(!robots.length) robots=[makeRobot(1,++rid)];
    return true;
  }catch(e){ return false; }
}
function getFilename(){
  const nums = robots.map(r=>r.num).join('-');
  return getDate()+'_PARKIE_'+nums+' 호기_'+stageLabel(activeStage).replace(/\s+/g,'')+'_센서점검보고서';
}
function updateMeta(){
  document.getElementById('fname-text').textContent = getFilename()+'.pdf';
  document.getElementById('stage-badge').textContent = stageLabel(activeStage)+' 기준으로 편집 중';
  document.querySelectorAll('#stage-switch .tbtn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.stage===activeStage);
  });
}
function setStage(stage){
  if(!STAGES.some(s=>s.key===stage)) return;
  activeStage=stage;
  updateMeta(); render(); saveState();
}
function addRobot(){
  rid++;
  const next = robots.length>0 ? Math.max(...robots.map(r=>Number(r.num)))+1 : 1;
  robots.push(makeRobot(next,rid));
  render(); updateMeta(); saveState();
  setTimeout(()=>{ const el=document.querySelector('[data-rid="'+rid+'"]'); if(el) el.scrollIntoView({behavior:'smooth',block:'nearest'}); },80);
}
function removeRobot(id){
  if(robots.length<=1){ showToast('최소 1개 호기가 필요합니다.'); return; }
  robots = robots.filter(r=>r.id!==id);
  render(); updateMeta(); saveState();
}
function toggleStatus(robId,si,val){
  const r=robots.find(x=>x.id===robId); if(!r) return;
  if(!activeStage){ showToast('작업 단계를 선택해주세요'); return; }
  r.ss[activeStage][si] = (r.ss[activeStage][si]===val) ? null : val;
  if(r.ss[activeStage][si]!=='ng') r.memo[activeStage][si]='';
  try{
    const hasNg = Array.isArray(r.ss?.[activeStage]) && r.ss[activeStage].some(v=>v==='ng');
    const allOk = Array.isArray(r.ss?.[activeStage]) && r.ss[activeStage].every(v=>v==='ok');
    if(hasNg){
      r.status = '경미한 손상';
    } else if(allOk){
      r.status = '정상';
    }
  }catch(e){}
  render(); saveState();
}
function updateMemo(robId,si,val){
  const r=robots.find(x=>x.id===robId);
  if(!r) return;
  if(!activeStage){ showToast('작업 단계를 선택해주세요'); return; }
  if(r.memo && r.memo[activeStage]){ r.memo[activeStage][si]=val; saveState(); }
}
function render(){
  if(!robots.length) robots=[makeRobot(1,++rid)];
  const c=document.getElementById('robots');
  c.innerHTML='';
  robots.forEach((r,ri)=>{
    ensureBuckets(r);
    const total = SENSORS.reduce((acc,s)=>acc+getAnglesForSensor(s).length,0);
    const done = SENSORS.reduce((acc,s,si)=>acc+getAnglesForSensor(s).filter((_,ai)=>r.photos[stagePhotoKey(r.id,si,ai,activeStage)]).length,0);
    const pct = Math.round(done/total*100)||0;
    const sensorsHTML = SENSORS.map((s,si)=>{
      const ssArr = Array.isArray(r.ss?.[activeStage]) ? r.ss[activeStage] : SENSORS.map(()=>null);
      const memoArr = Array.isArray(r.memo?.[activeStage]) ? r.memo[activeStage] : SENSORS.map(()=>'');
      const st = ssArr[si];
      const angles = getAnglesForSensor(s);
      const cnt = angles.filter((_,ai)=>r.photos[stagePhotoKey(r.id,si,ai,activeStage)]).length;
      const memoVal = escHtml(memoArr[si]||'');
      const slots = angles.map((a,ai)=>{
        const key = stagePhotoKey(r.id,si,ai,activeStage);
        const img = r.photos[key];
        if(img) return '<div class="pslot"><img src="'+img+'" alt="'+s.name+' '+a+'"><button class="xb" onclick="event.stopPropagation();delPhoto(\''+key+'\','+r.id+')">×</button></div>';
        return '<div class="pslot" onclick="upload(\''+key+'\','+r.id+')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="al">'+a+'</span></div>';
      }).join('');
      return '<div class="srow"><div class="stripe'+(st==='ok'?' ok':st==='ng'?' ng':'')+'"></div><div class="srow-top"><div class="s-name"><div class="dot '+s.type+'"></div>'+s.name+'</div><div class="s-r"><span class="s-cnt">'+cnt+'/'+angles.length+'</span><div class="toggle"><button class="tbtn'+(st==='ok'?' ok':'')+'" onclick="toggleStatus('+r.id+','+si+',\'ok\')">✓ 정상</button><button class="tbtn'+(st==='ng'?' ng':'')+'" onclick="toggleStatus('+r.id+','+si+',\'ng\')">⚠ 이상</button></div></div></div><div class="photo-grid">'+slots+'</div><div class="ng-memo'+(st==='ng'?' show':'')+'"><div class="ng-memo-lbl">⚠ 이상 내용 기록</div><textarea rows="2" placeholder="이상 내용을 입력하세요..." oninput="updateMemo('+r.id+','+si+',this.value)">'+memoVal+'</textarea></div></div>';
    }).join('');

    const div=document.createElement('div');
    div.className='rcard'; div.dataset.rid=r.id;
    div.innerHTML='<div class="rcard-hd"><div class="hd-l"><span class="hd-tag">호기</span><input class="n-inp" type="number" value="'+r.num+'" min="1" onchange="robots['+ri+'].num=Number(this.value)||1;updateMeta();saveState()"><select class="fi rstatus" onchange="robots['+ri+'].status=this.value;saveState();render()"><option value="">상태 선택</option><option value="정상">정상</option><option value="경미한 손상">경미한 손상</option><option value="교체 필요">교체 필요</option><option value="긴급 점검">긴급 점검</option></select></div><div class="hd-r"><span class="prog-lbl">'+done+'/'+total+' · '+pct+'%</span>'+(robots.length>1?'<button class="del-btn" onclick="removeRobot('+r.id+')" aria-label="삭제">✕</button>':'')+'</div></div><div class="prog-track"><div class="prog-fill" style="width:'+pct+'%"></div></div><div class="stage-row"><div class="stage-row-hd"><span class="stage-name">'+stageLabel(activeStage)+'</span><span class="stage-note">현재 단계 편집 중</span></div>'+sensorsHTML+'</div>';
    c.appendChild(div);
    const statusSelect = div.querySelector('.rstatus');
    if(statusSelect) statusSelect.value = r.status || '';
  });
}
async function fileToJpeg(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const max=1600, s=Math.min(1,max/Math.max(img.width,img.height));
      const w=Math.round(img.width*s), h=Math.round(img.height*s);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const ctx=cv.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      resolve(cv.toDataURL('image/jpeg',0.80));
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('load fail')); };
    img.src=url;
  });
}
function upload(key,robId){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.capture='environment';
  inp.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    try{
      const url=await fileToJpeg(file);
      const r=robots.find(x=>x.id===robId);
      if(r){ r.photos[key]=url; render(); saveState(); }
    }catch(e){ showToast('사진 불러오기 실패'); }
  };
  inp.click();
}
function delPhoto(key,robId){
  const r=robots.find(x=>x.id===robId);
  if(r){ delete r.photos[key]; render(); saveState(); }
}
function textToPng(text,opt={}){
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
function pdfText(doc,text,x,y,opt={}){
  const t=textToPng(text,opt);
  let xx=x, yy=y;
  if(opt.align==='center') xx=x-t.wmm/2;
  else if(opt.align==='right') xx=x-t.wmm;
  if(opt.valign==='middle') yy=y-t.hmm/2;
  doc.addImage(t.data,'PNG',xx,yy,t.wmm,t.hmm,undefined,'FAST');
}
function pdfWrappedText(doc,text,x,y,maxWmm,opt={}){
  const sz=opt.size||6, bold=opt.bold?'700':'400', px=sz*96/72;
  const maxPx=maxWmm*MM_TO_PX, lineH=opt.lineH||3.8, maxLines=opt.maxLines||5;
  const cv=document.createElement('canvas'), ctx=cv.getContext('2d');
  ctx.font=bold+' '+px+'px '+PDF_FONT;
  const lines=[];
  String(text||'').split(/\r?\n/).forEach(par=>{
    let line='';
    for(const ch of Array.from(par)){
      const test=line+ch;
      if(ctx.measureText(test).width>maxPx&&line){ lines.push(line); line=ch; }
      else line=test;
    }
    if(line) lines.push(line);
  });
  (lines.length?lines:['']).slice(0,maxLines).forEach((ln,i)=>pdfText(doc,ln,x,y+i*lineH,opt));
  return Math.min(lines.length||1,maxLines)*lineH;
}
async function pdfAddSection(doc,r,stage,startY){
  const M=14;
  const C={no:12,name:26,status:20,photo:31};
  const totalW=C.no+C.name+C.status+C.photo*4;
  let y=startY;
  doc.setFillColor(30,60,114); doc.setDrawColor(30,60,114); doc.setLineWidth(0.3);
  doc.rect(M,y,totalW,6.5,'FD');
  pdfText(doc,stageLabel(stage)+' — '+r.num+' 호기', M+totalW/2, y+6.5/2, {align:'center',valign:'middle',size:8,bold:true,color:[255,255,255]});
  y+=6.5;
  const hCols=[{t:'No.',w:C.no},{t:'Sensor',w:C.name},{t:'Status',w:C.status},{t:'정면',w:C.photo},{t:'좌측',w:C.photo},{t:'우측',w:C.photo},{t:'후면',w:C.photo}];
  let hx=M;
  hCols.forEach(h=>{
    doc.setFillColor(100,120,150); doc.setDrawColor(100,120,150); doc.setLineWidth(0.25);
    doc.rect(hx,y,h.w,5.5,'FD');
    pdfText(doc,h.t,hx+h.w/2,y+5.5/2,{align:'center',valign:'middle',size:7,bold:true,color:[255,255,255]});
    hx+=h.w;
  });
  y+=5.5;
  for(let si=0;si<SENSORS.length;si++){
    const rowH=26;
    if(y+rowH>280){ doc.addPage(); y=M; }
    const st=r.ss[stage]?.[si];
    const memo=r.memo[stage]?.[si]||'';
    const angles = getAnglesForSensor(SENSORS[si]);
    const even=si%2===0;
    let rx=M;
    doc.setDrawColor(200,205,215); doc.setLineWidth(0.25);
    if(even){ doc.setFillColor(245,248,252); doc.rect(rx,y,totalW,rowH,'F'); }
    doc.rect(rx,y,C.no,rowH);
    pdfText(doc,String(si+1),rx+C.no/2,y+rowH/2,{align:'center',valign:'middle',size:8,bold:true,color:[50,50,50]});
    rx+=C.no;
    doc.rect(rx,y,C.name,rowH);
    pdfText(doc,SENSORS[si].name,rx+2,y+5,{size:6.5,color:[60,60,60]});
    pdfText(doc,SENSORS[si].type==='lidar'?'LIDAR':'CAMERA',rx+2,y+10,{size:5.5,color:[130,130,130]});
    rx+=C.name;
    doc.rect(rx,y,C.status,rowH);
    if(st==='ok'){
      doc.setFillColor(220,245,225); doc.rect(rx,y,C.status,rowH,'F');
      doc.setDrawColor(80,180,100); doc.rect(rx,y,C.status,rowH);
      pdfText(doc,'✓ 정상',rx+C.status/2,y+rowH/2,{align:'center',valign:'middle',size:7.5,bold:true,color:[25,120,60]});
    } else if(st==='ng'){
      doc.setFillColor(255,230,230); doc.rect(rx,y,C.status,rowH,'F');
      doc.setDrawColor(220,80,80); doc.rect(rx,y,C.status,rowH);
      pdfText(doc,'⚠ 이상',rx+C.status/2,y+5.5,{align:'center',valign:'middle',size:7.5,bold:true,color:[180,30,30]});
      if(memo) pdfWrappedText(doc,memo,rx+1.5,y+10,C.status-3,{size:5,color:[140,40,40],maxLines:3,lineH:3.5});
    } else {
      doc.setFillColor(240,241,242); doc.rect(rx,y,C.status,rowH,'F');
      doc.setDrawColor(150,155,160); doc.rect(rx,y,C.status,rowH);
      pdfText(doc,'미확인',rx+C.status/2,y+rowH/2,{align:'center',valign:'middle',size:6.5,color:[170,170,170]});
    }
    rx+=C.status;
    for(let ai=0;ai<4;ai++){
      doc.setDrawColor(180,185,195); doc.setLineWidth(0.25);
      doc.rect(rx,y,C.photo,rowH);
      const imgSrc = ai<angles.length ? r.photos[stagePhotoKey(r.id,si,ai,stage)] : null;
      if(imgSrc){
        try{
          const dataUrl = await ensureDataUrl(imgSrc) || imgSrc;
          const info = await getImageInfo(dataUrl);
          const maxW=C.photo-2, maxH=rowH-2;
          const ratio = (info.w||1)/(info.h||1);
          let w = maxW, h = maxW/ratio;
          if(h>maxH){ h=maxH; w=maxH*ratio; }
          const ix = rx + (C.photo - w)/2, iy = y + (rowH - h)/2;
          let imgFormat = 'JPEG';
          try{ if(String(dataUrl).startsWith('data:image/png')) imgFormat = 'PNG'; }catch(e){}
          doc.addImage(dataUrl, imgFormat, ix, iy, w, h, undefined, 'FAST');
        }catch(e){
          doc.setFillColor(235,238,242); doc.rect(rx,y,C.photo,rowH,'F');
          pdfText(doc,'—',rx+C.photo/2,y+rowH/2,{align:'center',valign:'middle',size:6,color:[190,190,190]});
        }
      } else {
        doc.setFillColor(235,238,242); doc.rect(rx,y,C.photo,rowH,'F');
        pdfText(doc,'—',rx+C.photo/2,y+rowH/2,{align:'center',valign:'middle',size:6,color:[190,190,190]});
      }
      rx+=C.photo;
    }
    y+=rowH;
  }
  return y+4;
}
function buildPdfConfirmationMessage(){
  const stageText = stageLabel(activeStage);
  const issues = robots.map(r => {
    const badSensors = SENSORS.map((sensor, si) => {
      const status = r.ss[activeStage]?.[si];
      if(status === 'ng') return sensor.name;
      return null;
    }).filter(Boolean);
    return badSensors.length ? `${r.num}호기: ${badSensors.join(', ')}` : null;
  }).filter(Boolean);

  let message = `다음 정보를 확인합니다.\n\n\n촬영 단계: ${stageText}\n`;
  if(issues.length){
    message += `\n이상 항목:\n` + issues.map(i => `- ${i}`).join('\n');
  } else {
    message += '\n현재 모든 센서 이상 없습니다.';
  }
  message += '\n\n이대로 PDF를 생성하시겠습니까?';
  return message;
}

async function generatePDF(){
  const photoBy = document.getElementById('photo_by').value.trim();
  if(!photoBy){
    alert('촬영자 이름을 입력해주세요.\n\nPDF 생성을 위해서는 촬영자 정보가 필수입니다.');
    showToast('촬영자 이름 입력 필요');
    return;
  }
  if(!activeStage || !STAGES.some(s=>s.key===activeStage)){
    alert('촬영 단계를 선택해주세요.\n\nPDF 생성을 위해서는 촬영 단계 선택이 필수입니다.');
    showToast('촬영 단계 선택 필요');
    return;
  }

  const uncheckedItems = [];
  robots.forEach(r => {
    SENSORS.forEach((sensor, si) => {
      if(!r.ss[activeStage]?.[si]){
        uncheckedItems.push(`${r.num}호기 ${sensor.name}`);
      }
    });
  });
  if(uncheckedItems.length){
    const preview = uncheckedItems.slice(0, 6).join('\n');
    alert(`미확인 항목이 ${uncheckedItems.length}개 있습니다.\n먼저 완료해주세요.\n\n${preview}${uncheckedItems.length > 6 ? '\n...' : ''}`);
    showToast('미확인 항목을 먼저 입력해주세요.');
    return;
  }

  const confirmMessage = buildPdfConfirmationMessage();
  if(!confirm(confirmMessage)){
    showToast('PDF 생성이 취소되었습니다.');
    return;
  }
  try {
    const now=getNow();
    document.getElementById('confirmed_at').textContent=now;
    showToast('PDF 생성 중...');
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,M=14; let y=M;
    doc.setFillColor(255,255,255); doc.rect(0,0,W,22,'F');
    doc.setDrawColor(229,232,237); doc.setLineWidth(0.3); doc.line(0,22,W,22);
    try{
      const logoImg=await getLogoImage();
      const maxW=40, maxH=12;
      const srcW=logoImg.naturalWidth||logoImg.width||1;
      const srcH=logoImg.naturalHeight||logoImg.height||1;
      const ratio=srcW/srcH;
      let w=maxW, h=maxW/ratio;
      if(h>maxH){ h=maxH; w=maxH*ratio; }
      doc.addImage(logoImg,'PNG',M,4+(maxH-h)/2,w,h);
    }catch(e){
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(17,17,17); doc.text('HL Robotics',M,13);
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('SENSOR INSPECTION TRACKER (RMEO)',M+42,10);
    doc.text(now,W-M,10,{align:'right'});
    y=27;
    const pb=document.getElementById('photo_by').value||'-';
    const statusText = robots.map(r => r.num + ' 호기 ' + (r.status || '정상')).join(' / ');
    pdfText(doc,'Device: PARKIE   Inspector: '+pb+'   Date: '+now+'   Status: '+statusText,M,y-4,{size:7.5,color:[90,90,90]});
    y+=6;
    for(const r of robots){
      if(y>252){ doc.addPage(); y=M; }
      y=await pdfAddSection(doc,r,activeStage,y);
      y+=4;
    }
    const pages=doc.internal.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setDrawColor(229,232,237); doc.setLineWidth(0.3); doc.line(M,287,M+181,287);
      doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(190,190,190);
      doc.text('HL Robotics - PARKIE Sensor Inspection Report  |  '+now+'  |  '+i+' / '+pages, W/2,292,{align:'center'});
    }
    doc.save(getFilename()+'.pdf');
    showToast('✓ PDF 저장 완료');
  } catch (error) {
    console.error('PDF 생성 실패', error);
    showToast('PDF 생성 실패');
  }
}
function showToast(msg){
  if(toastTimer) clearTimeout(toastTimer);
  document.getElementById('toast').textContent=msg;
  if(msg) toastTimer=setTimeout(()=>showToast(''),4000);
}

function resetAll(){
  try{
    if(!confirm('진행중인 내용을 모두 초기화합니다. 계속 진행하시겠습니까?')) return;
    robots = [makeRobot(1,1)];
    rid = 1;
    activeStage = '';
    document.getElementById('photo_by').value = '';
    try{ imageInfoCache && imageInfoCache.clear(); }catch(e){}
    try{ imageElementCache && imageElementCache.clear(); }catch(e){}
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    updateMeta(); render(); saveState();
    showToast('초기화 완료');
  }catch(e){
    console.error('초기화 실패', e);
    showToast('초기화 실패');
  }
}
function boot(){
  document.getElementById('tb-logo').src=LOGO_SRC;
  const loaded=loadState();
  if(!loaded){ robots=[makeRobot(1,1)]; rid=1; activeStage = ''; }
  if(activeStage && !STAGES.some(s=>s.key===activeStage)) activeStage = '';
  document.querySelectorAll('#stage-switch .tbtn').forEach(btn=>btn.addEventListener('click',()=>setStage(btn.dataset.stage)));
  setInterval(updateClock,1000);
  updateClock(); updateMeta(); render(); saveState();
}
boot();

/* ── 오프라인(Canvas) PDF 생성 ── */
const OFFLINE_PDF_SCALE = 5;
const OFFLINE_FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo','Segoe UI',system-ui,sans-serif";
const PDF_A4_W_MM = 210;
const PDF_A4_H_MM = 297;
const imageElementCache = new Map();

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getImageElement(src){
  if(!src) return Promise.resolve(null);
  if(imageElementCache.has(src)) return imageElementCache.get(src);
  const p = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageElementCache.set(src, p);
  return p;
}

async function fetchImageAsDataUrl(url){
  try{
    const res = await fetch(url, {mode: 'cors'});
    if(!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }catch(e){
    return null;
  }
}

async function ensureDataUrl(src){
  if(!src) return null;
  if(String(src).startsWith('data:')) return src;
  if(String(src).startsWith('blob:')) return src;
  return await fetchImageAsDataUrl(src);
}

function canvasToJpegBytes(canvas, quality=0.92){
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

function dataUrlToBytes(dataUrl){
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodePdfText(text){
  return new TextEncoder().encode(String(text));
}

function concatUint8Arrays(parts){
  const total = parts.reduce((sum,p)=>sum+p.length,0);
  const out = new Uint8Array(total);
  let off = 0;
  for(const p of parts){
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function drawText(ctx, text, x, y, opt={}){
  const size = opt.size || 12;
  const bold = opt.bold ? '700' : '400';
  ctx.font = `${bold} ${size}px ${OFFLINE_FONT}`;
  ctx.fillStyle = opt.color || '#111';
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'alphabetic';
  ctx.fillText(String(text ?? ''), x, y);
}

function wrapText(ctx, text, maxWidth){
  const lines = [];
  String(text ?? '').split(/\r?\n/).forEach(par => {
    let line = '';
    for(const ch of Array.from(par)){
      const test = line + ch;
      if(ctx.measureText(test).width > maxWidth && line){
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if(line) lines.push(line);
  });
  return lines.length ? lines : [''];
}

function fillStrokeRect(ctx, x, y, w, h, fill, stroke){
  if(fill){
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if(stroke){
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, w, h);
  }
}

async function drawImageContain(ctx, src, x, y, w, h){
  const img = await getImageElement(src);
  if(!img) return false;
  const ratio = img.naturalWidth / img.naturalHeight || 1;
  let dw = w, dh = w / ratio;
  if(dh > h){
    dh = h;
    dw = h * ratio;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return true;
}

async function renderReportPages(now){
  const scale = OFFLINE_PDF_SCALE;
  const pageW = PDF_A4_W_MM * scale;
  const pageH = PDF_A4_H_MM * scale;
  const pages = [];

  function newPage(){
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pageW, pageH);
    return {canvas, ctx};
  }

  const logo = await getImageElement(LOGO_SRC);
  let page = newPage();
  await drawHeader(page.ctx);

  async function drawHeader(ctx){
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pageW, 22 * scale);
    ctx.strokeStyle = '#E5E8ED';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 22 * scale);
    ctx.lineTo(pageW, 22 * scale);
    ctx.stroke();

    if(logo){
      const maxW = 40 * scale;
      const maxH = 12 * scale;
      const ratio = logo.naturalWidth / logo.naturalHeight || 1;
      let w = maxW, h = maxW / ratio;
      if(h > maxH){ h = maxH; w = maxH * ratio; }
      ctx.drawImage(logo, 14 * scale, 4 * scale + (maxH - h) / 2, w, h);
    } else {
      drawText(ctx, 'HL Robotics', 14 * scale, 13 * scale, {size: 14, bold: true});
    }
    drawText(ctx, 'SENSOR INSPECTION TRACKER (RMEO)', 56 * scale, 10 * scale, {size: 9, color: '#808080'});
    drawText(ctx, now, (PDF_A4_W_MM - 14) * scale, 10 * scale, {size: 9, color: '#808080', align: 'right'});
  }

  async function drawRobotSection(ctx, r, stage, yMm){
    const x = 14 * scale;
    const w = (PDF_A4_W_MM - 28) * scale;
    const noW = 12 * scale, nameW = 26 * scale, statusW = 20 * scale, photoW = 31 * scale;
    const topH = 6.5 * scale, headH = 5.5 * scale, rowH = 26 * scale;

    fillStrokeRect(ctx, x, yMm * scale, w, topH, '#1E3C72', '#1E3C72');
    drawText(ctx, `${stageLabel(stage)} - ${r.num} 호기`, x + w / 2, yMm * scale + topH / 2 + 4, {size: 11, bold: true, color: '#fff', align: 'center', baseline: 'middle'});

    const headers = ['No.', 'Sensor', 'Status', '정면', '좌측', '우측', '후면'];
    const widths = [noW, nameW, statusW, photoW, photoW, photoW, photoW];
    let hx = x;
    let hy = (yMm + 6.5) * scale;
    for(let i=0;i<headers.length;i++){
      fillStrokeRect(ctx, hx, hy, widths[i], headH, '#6B7C93', '#6B7C93');
      drawText(ctx, headers[i], hx + widths[i]/2, hy + headH/2 + 4, {size: 10, bold: true, color: '#fff', align: 'center', baseline: 'middle'});
      hx += widths[i];
    }

    const anglesFor = SENSORS.map(getAnglesForSensor);
    for(let si=0; si<SENSORS.length; si++){
      const sensor = SENSORS[si];
      const st = r.ss[stage]?.[si];
      const memo = r.memo[stage]?.[si] || '';
      const angles = anglesFor[si];
      const rowY = (yMm + 12 + si * 26) * scale;
      const isEven = si % 2 === 0;
      if(isEven){
        ctx.fillStyle = '#F5F8FC';
        ctx.fillRect(x, rowY, w, rowH);
      }
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, rowY, noW, rowH);
      ctx.strokeRect(x + noW, rowY, nameW, rowH);
      ctx.strokeRect(x + noW + nameW, rowY, statusW, rowH);
      for(let ai=0; ai<4; ai++){
        ctx.strokeRect(x + noW + nameW + statusW + ai * photoW, rowY, photoW, rowH);
      }

      drawText(ctx, String(si + 1), x + noW / 2, rowY + rowH / 2 + 4, {size: 11, bold: true, color: '#333', align: 'center', baseline: 'middle'});
      drawText(ctx, sensor.name, x + noW + 4, rowY + 9, {size: 10, color: '#444'});
      drawText(ctx, sensor.type === 'lidar' ? 'LIDAR' : 'CAMERA', x + noW + 4, rowY + 20, {size: 8, color: '#888'});

      if(st === 'ok'){
        ctx.fillStyle = '#DFF5E6';
        ctx.fillRect(x + noW + nameW, rowY, statusW, rowH);
        ctx.strokeStyle = '#4CAF50';
        ctx.strokeRect(x + noW + nameW, rowY, statusW, rowH);
        drawText(ctx, '✓ 정상', x + noW + nameW + statusW / 2, rowY + rowH / 2 + 4, {size: 11, bold: true, color: '#1B7A3A', align: 'center', baseline: 'middle'});
      } else if(st === 'ng'){
        ctx.fillStyle = '#FDEAEA';
        ctx.fillRect(x + noW + nameW, rowY, statusW, rowH);
        ctx.strokeStyle = '#DC2626';
        ctx.strokeRect(x + noW + nameW, rowY, statusW, rowH);
        drawText(ctx, '⚠ 이상', x + noW + nameW + statusW / 2, rowY + 7, {size: 11, bold: true, color: '#B91C1C', align: 'center'});
        if(memo){
          ctx.fillStyle = '#8B1A1A';
          ctx.font = `400 8px ${OFFLINE_FONT}`;
          const lines = wrapText(ctx, memo, statusW - 6);
          let ly = rowY + 16;
          for(const line of lines.slice(0, 3)){
            drawText(ctx, line, x + noW + nameW + 3, ly, {size: 8, color: '#8B1A1A'});
            ly += 9;
          }
        }
      } else {
        ctx.fillStyle = '#F0F1F2';
        ctx.fillRect(x + noW + nameW, rowY, statusW, rowH);
        ctx.strokeStyle = '#9AA0A6';
        ctx.strokeRect(x + noW + nameW, rowY, statusW, rowH);
        drawText(ctx, '미확인', x + noW + nameW + statusW / 2, rowY + rowH / 2 + 4, {size: 10, color: '#A3A3A3', align: 'center', baseline: 'middle'});
      }

      drawText(ctx, `${angles.filter((_, ai)=>r.photos[stagePhotoKey(r.id, si, ai, stage)]).length}/${angles.length}`, x + noW + nameW + statusW - 4, rowY - 2, {size: 8, color: '#9CA3AF', align: 'right'});

      for(let ai=0; ai<4; ai++){
        const slotX = x + noW + nameW + statusW + ai * photoW;
        const imgY = rowY + 1;
        const imgW = photoW - 2;
        const imgH = rowH - 2;
        const key = stagePhotoKey(r.id, si, ai, stage);
        const src = r.photos[key];
        if(src){
          await drawImageContain(ctx, src, slotX + 1, imgY, imgW, imgH);
        } else {
          ctx.fillStyle = '#EBEEF2';
          ctx.fillRect(slotX + 1, imgY, imgW, imgH);
          drawText(ctx, '—', slotX + photoW / 2, rowY + rowH / 2 + 4, {size: 12, color: '#C6CBD2', align: 'center', baseline: 'middle'});
        }
      }
    }
    return yMm + 12 + SENSORS.length * 26 + 4;
  }

  let y = 27;
  for(const r of robots){
    const sectionHeight = 12 + SENSORS.length * 26 + 4;
    if(y + sectionHeight > 252){
      pages.push(page.canvas);
      page = newPage();
      await drawHeader(page.ctx);
      y = 27;
    }
    y = await drawRobotSection(page.ctx, r, activeStage, y);
  }
  pages.push(page.canvas);

  for(let i=0;i<pages.length;i++){
    const ctx = pages[i].getContext('2d');
    ctx.strokeStyle = '#E5E8ED';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14 * scale, 287 * scale);
    ctx.lineTo((PDF_A4_W_MM - 14) * scale, 287 * scale);
    ctx.stroke();
    drawText(ctx, `HL Robotics - PARKIE Sensor Inspection Report  |  ${now}  |  ${i + 1} / ${pages.length}`, pageW / 2, 292 * scale, {size: 8, color: '#C0C0C0', align: 'center'});
  }
  return pages;
}

function canvasToPngBytes(canvas){
  const dataUrl = canvas.toDataURL('image/png');
  const binary = atob(dataUrl.split(',')[1]);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

function buildOfflinePdfFromCanvases(canvases){
  const pageWpt = 595.28;
  const pageHpt = 841.89;
  const objectBytes = [];
  const pageMeta = [];
  let objNum = 3;
  for(const canvas of canvases){
    pageMeta.push({
      imageRef: objNum++,
      contentRef: objNum++,
      pageRef: objNum++,
      canvas
    });
  }

  const ascii = s => encodePdfText(s);
  const header = ascii('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  objectBytes.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  const kids = pageMeta.map(p => `${p.pageRef} 0 R`).join(' ');
  objectBytes.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageMeta.length} >>\nendobj\n`));

  for(const meta of pageMeta){
    const imgBytes = canvasToPngBytes(meta.canvas);
    objectBytes.push(concatUint8Arrays([
      ascii(`${meta.imageRef} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${meta.canvas.width} /Height ${meta.canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imgBytes.length} >>\nstream\n`),
      imgBytes,
      ascii('\nendstream\nendobj\n')
    ]));

    const content = `q\n${pageWpt} 0 0 ${pageHpt} 0 0 cm\n/Im1 Do\nQ\n`;
    const contentBytes = ascii(content);
    objectBytes.push(concatUint8Arrays([
      ascii(`${meta.contentRef} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      ascii('endstream\nendobj\n')
    ]));

    objectBytes.push(ascii(`${meta.pageRef} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] /Resources << /XObject << /Im1 ${meta.imageRef} 0 R >> >> /Contents ${meta.contentRef} 0 R >>\nendobj\n`));
  }

  const fileParts = [header];
  let offsets = [0];
  let pos = header.length;
  for(const obj of objectBytes){
    offsets.push(pos);
    fileParts.push(obj);
    pos += obj.length;
  }
  const xrefStart = pos;
  const objectCount = objectBytes.length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++){
    xref += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Blob([...fileParts, ascii(xref), ascii(trailer)], {type:'application/pdf'});
}
