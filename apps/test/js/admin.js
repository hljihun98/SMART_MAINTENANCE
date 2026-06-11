/* ===== admin.js : 사용자 관리·활동로그(관리자 전용) ===== */
/* (원본 robot_inventory__44_.html 4314-4535 줄을 그대로 분리) */
// ════════════════════════════════════════
// ADMIN
// ════════════════════════════════════════
// ────────────────────────────────────────────────────────
// 개발 로그 뷰어
// ────────────────────────────────────────────────────────
function rendChangelog(){
  const typeFilter=document.getElementById('cl-filter-type')?.value||'';
  const typeIcon={기능추가:'✨',버그수정:'🐛',UI개선:'🎨',데이터구조:'🗄️',보안:'🔒',최적화:'⚙️',문서화:'📝'};
  const typeBg={기능추가:'var(--gnl)',버그수정:'var(--rel)',UI개선:'var(--pkl)',데이터구조:'var(--aml)',보안:'var(--cal)',최적화:'#EEF2FF',문서화:'#F3F4F6'};
  const typeTx={기능추가:'var(--gn)',버그수정:'var(--re)',UI개선:'var(--pk)',데이터구조:'var(--am)',보안:'var(--ca)',최적화:'#4338CA',문서화:'var(--t2)'};

  // 버전별 최신 항목으로 카드 생성
  const latest=[...changelogData].sort(changelogCompare);
  const versions=[...new Set(latest.map(c=>c.ver))].slice(0,6);
  const vCards=document.getElementById('cl-version-cards');
  if(vCards){
    vCards.innerHTML=versions.map(v=>{
      const items=changelogData.filter(c=>c.ver===v);
      const d=items[0]?.date||'';
      const types=[...new Set(items.map(c=>c.type))];
      return`<div style="background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px 16px;box-shadow:var(--sh)">
        <div style="font-family:var(--fm);font-size:14px;font-weight:700;color:var(--ac);margin-bottom:4px">${v}</div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:8px">${d}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${types.map(t=>`<span style="background:${typeBg[t]||'var(--s2)'};color:${typeTx[t]||'var(--t2)'};border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600">${typeIcon[t]||''}${t}</span>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--t2);margin-top:6px">${items.length}개 변경</div>
      </div>`;
    }).join('');
  }

  // 전체 목록 테이블
  const filtered=typeFilter
    ?changelogData.filter(c=>c.type===typeFilter)
    :changelogData;
  const sorted=[...filtered].sort(changelogCompare);
  const tb=document.getElementById('tb-changelog');
  if(tb){
    tb.innerHTML=sorted.length
      ?sorted.map(c=>`<tr>
          <td class="t-m t-sm">${c.date}</td>
          <td><span style="font-family:var(--fm);font-size:12px;font-weight:700;color:var(--ac)">${c.ver}</span></td>
          <td><span style="background:${typeBg[c.type]||'var(--s2)'};color:${typeTx[c.type]||'var(--t2)'};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap">${typeIcon[c.type]||''}${c.type}</span></td>
          <td style="font-size:12px;color:var(--tx)">${c.body}</td>
          <td class="t-sm t-mu">${c.author||'-'}</td>
        </tr>`).join('')
      :'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--t2)">항목 없음</td></tr>';
  }
}

function submitChangelog(){
  // 새 변경사항 등록 (사용자 직접 + AI 요청 시 모두 사용)
  const date=document.getElementById('cl-date').value;
  const ver=document.getElementById('cl-ver').value.trim();
  const type=document.getElementById('cl-type').value;
  const body=document.getElementById('cl-body').value.trim();
  const author=document.getElementById('cl-author').value.trim()||CU?.name||'사용자';
  if(!date||!ver||!body){toast('⚠️','날짜, 버전, 내용을 입력하세요','wa');return;}
  changelogData.push({date,ver,type,body,author});
  logActivity(CU.id,CU.name,'CHANGELOG',`개발 로그 추가: ${ver} [${type}] ${body.slice(0,40)}`);
  closeMo('mo-add-changelog');
  rendChangelog();
  toast('✅','개발 로그가 추가되었습니다','ok');
}

function rendAdmin(){
  const users=getUsers();
  document.getElementById('tb-admin').innerHTML=Object.entries(users).map(([id,u])=>`<tr>
    <td class="t-m" style="font-weight:600">${id}</td>
    <td style="font-weight:500">${u.name||'-'}</td>
    <td>${u.role==='admin'?'<span class="a-badge">관리자</span>':'<span class="t-mu t-sm">일반 사용자</span>'}</td>
    <td class="t-mu t-sm">${loginTimes[id]||'-'}</td>
    <td><span class="sb2 s-ok">활성</span></td>
    <td><button class="btn b-sm b-wa" onclick="openEditUser('${id}')">수정</button> ${id!==CU.id?`<button class="btn b-sm b-dn" onclick="delUser('${id}')">삭제</button>`:'<span class="t-sm t-mu">현재 계정</span>'}</td>
  </tr>`).join('');
  // update user filter dropdown
  const sel=document.getElementById('al-filter-user');
  if(sel){sel.innerHTML='<option value="">전체 사용자</option>'+Object.entries(users).map(([id,u])=>`<option value="${id}">${u.name}(${id})</option>`).join('');}
  rendActivityLog();
}

function rendActivityLog(){
  const uf=document.getElementById('al-filter-user')?.value||'';
  const tf=document.getElementById('al-filter-type')?.value||'';
  const df=document.getElementById('al-filter-date')?.value||'';
  let list=[...activityLog];
  if(uf) list=list.filter(a=>a.userId===uf);
  if(tf) list=list.filter(a=>a.type===tf);
  if(df) list=list.filter(a=>new Date(a.ts).toISOString().slice(0,10)===df);

  const typeLabel={
    LOGIN:'🔑 로그인', IN:'📥 입고', OUT:'📤 출고', BOM:'📦 BOM',
    LABOR:'🏭 공수산정', TECH:'👤 작업인원', DELAY:'⚠️ 지연',
    CHANGELOG:'📝 개발로그', INQ:'📨 문의', ACCOUNT:'👤 계정관리'
  };
  const typeBg={
    LOGIN:'var(--acl)',IN:'var(--gnl)',OUT:'var(--rel)',BOM:'var(--aml)',
    LABOR:'#EDE9FF',TECH:'#E0F7FD',DELAY:'#FEF3C7',
    CHANGELOG:'var(--s2)',INQ:'var(--cal)',ACCOUNT:'#E0F2FE'
  };
  const typeTx={
    LOGIN:'var(--ac)',IN:'var(--gn)',OUT:'var(--re)',BOM:'var(--am)',
    LABOR:'#5B21B6',TECH:'#0369A1',DELAY:'#92400E',
    CHANGELOG:'var(--t2)',INQ:'var(--ca)',ACCOUNT:'#075985'
  };

  // 요약 통계
  const summary=document.getElementById('al-summary');
  if(summary){
    const counts={};
    list.forEach(a=>{counts[a.type]=(counts[a.type]||0)+1;});
    summary.innerHTML=`<span style="font-size:11px;color:var(--t2)">총 ${list.length}건</span>`+
      Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t,n])=>
        `<span style="background:${typeBg[t]||'var(--s2)'};color:${typeTx[t]||'var(--t2)'};border-radius:5px;padding:2px 8px;font-size:11px;font-weight:600">${typeLabel[t]||t} ${n}</span>`
      ).join('');
  }

  document.getElementById('tb-activity').innerHTML=list.length
    ?list.slice(0,200).map(a=>`<tr>
      <td class="t-m t-sm">${fd(a.ts)}</td>
      <td class="t-m t-sm" style="font-weight:600;font-family:var(--fm)">${a.userId}</td>
      <td class="t-sm">${a.userName}</td>
      <td><span style="background:${typeBg[a.type]||'var(--s2)'};color:${typeTx[a.type]||'var(--t2)'};padding:2px 8px;border-radius:4px;font-size:10px;font-family:var(--fm);font-weight:600;white-space:nowrap">${typeLabel[a.type]||a.type}</span></td>
      <td class="t-sm" style="color:var(--tx)">${a.detail}</td>
    </tr>`).join('')
    :'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--t2);font-size:12px">활동 로그가 없습니다</td></tr>';
}

function dlActivityLog(){
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['일시','사번','성명','활동유형','상세'],
    ...activityLog.map(a=>[fd(a.ts),a.userId,a.userName,a.type,a.detail])]);
  XLSX.utils.book_append_sheet(wb,ws,'활동로그');
  XLSX.writeFile(wb,'ROBOSTOCK_활동로그_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('📥','활동 로그 다운로드 완료','ok');
}

function rendActualTable(){
  const tb=document.getElementById('tb-actual');if(!tb)return;
  tb.innerHTML=actualRecords.length
    ?[...actualRecords].reverse().map(a=>{
      const diff=a.actualH-a.planH;
      const diffStr=diff===0?'±0':(diff>0?`+${diff}h`:`${diff}h`);
      const diffClr=diff===0?'var(--t2)':diff>0?'var(--re)':'var(--gn)';
      return`<tr>
        <td><span class="rb ${rbc(a.robot)}">${a.robot}</span></td>
        <td class="t-sm">${a.module}</td>
        <td class="t-sm">${a.task}</td>
        <td class="t-m t-sm">${a.planH}h</td>
        <td class="t-m t-sm" style="font-weight:600">${a.actualH}h</td>
        <td class="t-m t-sm" style="font-weight:600;color:${diffClr}">${diffStr}</td>
        <td class="t-m t-sm">${fd(a.ts)}</td>
        <td class="t-sm">${a.userName}</td>
      </tr>`;
    }).join('')
    :'<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--t2);font-size:12px">실제 공수 기록이 없습니다</td></tr>';
}

function updActualModSel(){
  const r=document.getElementById('ac-robot')?.value;
  const mods=laborModules[r]||[];
  const sel=document.getElementById('ac-mod');
  if(sel)sel.innerHTML=mods.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
  updActualTaskSel();
}
function updActualTaskSel(){
  const r=document.getElementById('ac-robot')?.value;
  const mi=parseInt(document.getElementById('ac-mod')?.value)||0;
  const tasks=(laborModules[r]||[])[mi]?.tasks||[];
  const sel=document.getElementById('ac-task');
  if(sel)sel.innerHTML=tasks.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('');
  // update plan hour
  const ti=parseInt(sel?.value)||0;
  const ph=tasks[ti]?.hours||0;
  const planEl=document.getElementById('ac-plan');
  if(planEl)planEl.value=ph;
}
function submitActual(){
  const r=document.getElementById('ac-robot').value;
  const mi=parseInt(document.getElementById('ac-mod').value)||0;
  const ti=parseInt(document.getElementById('ac-task').value)||0;
  const mod=(laborModules[r]||[])[mi];
  const task=mod?.tasks?.[ti];
  if(!mod||!task){toast('⚠️','작업 항목을 다시 선택해주세요','wa');return;}
  const actualH=parseFloat(document.getElementById('ac-actual').value);
  const memo=document.getElementById('ac-memo').value.trim();
  if(!actualH||actualH<=0){toast('⚠️','실제 시간을 입력하세요','wa');return;}
  actualRecords.push({ts:Date.now(),robot:r,module:mod.name,task:task.name,planH:task.hours,actualH,memo,userId:CU.id,userName:CU.name});
  logActivity(CU.id,CU.name,'LABOR',`실제 공수 기록: ${r} ${task.name} ${task.hours}h→${actualH}h`);
  closeMo('mo-actual');rendLaborSummary();toast('✅','실제 공수가 기록되었습니다','ok');
}
function openEditUser(id){
  const u=getUser(id);if(!u)return;
  document.getElementById('eu-id').value=id;
  document.getElementById('eu-idshow').value=id;
  document.getElementById('eu-nm').value=u.name;
  document.getElementById('eu-pw').value='';
  document.getElementById('eu-rl').value=u.role;
  openMo('mo-edituser');
}
function submitEditUser(){
  const id=document.getElementById('eu-id').value;
  const u=getUser(id);if(!u)return;
  const nm=document.getElementById('eu-nm').value.trim();
  const pw=document.getElementById('eu-pw').value;
  const rl=document.getElementById('eu-rl').value;
  if(!nm){toast('⚠️','성명을 입력하세요','wa');return;}
  const changes=[];
  if(u.name!==nm)changes.push(`이름 ${u.name}→${nm}`);
  if(u.role!==rl)changes.push(`권한 ${u.role}→${rl}`);
  if(pw)changes.push('비밀번호 변경');
  updateUser(id,{name:nm,role:rl,pw:pw||u.pw});
  if(id===CU.id){CU.name=nm;CU.role=rl;document.getElementById('sb-un').textContent=nm;document.getElementById('sb-av').textContent=nm[0]||'?';}
  logActivity(CU.id,CU.name,'ACCOUNT',`계정 수정: ${id}${changes.length?` [${changes.join(', ')}]`:''}`);
  if(typeof saveState==='function')saveState();
  closeMo('mo-edituser');rendAdmin();toast('✅','사용자 정보가 수정되었습니다','ok');
}
function submitAddUser(){
  const id=document.getElementById('nu-id').value.trim().toUpperCase();
  const nm=document.getElementById('nu-nm').value.trim();
  const pw=document.getElementById('nu-pw').value;
  const rl=document.getElementById('nu-rl').value;
  if(!id||!nm||!pw){toast('⚠️','모든 항목을 입력하세요','wa');return;}
  if(hasUser(id)){toast('⚠️','이미 존재하는 사번입니다','wa');return;}
  createUser(id,{pw,role:rl,name:nm});
  logActivity(CU.id,CU.name,'ACCOUNT',`계정 추가: ${nm}(${id}) [${rl}]`);
  if(typeof saveState==='function')saveState();
  closeMo('mo-adduser');rendAdmin();toast('✅',`${nm}(${id}) 추가 완료`,'ok');
}
function delUser(id){
  const user=getUser(id);
  if(!confirm(`${id} (${user?.name}) 삭제하시겠습니까?`))return;
  deleteUserAccount(id);
  logActivity(CU.id,CU.name,'ACCOUNT',`계정 삭제: ${user?.name||'-'}(${id})`);
  if(typeof saveState==='function')saveState();
  rendAdmin();
  toast('🗑️','계정 삭제됨','ok');
}
