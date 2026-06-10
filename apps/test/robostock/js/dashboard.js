/* ===== dashboard.js : 대시보드 렌더(현황·목표대수·진행·알림·최근 입출고) ===== */
/* (원본 robot_inventory__44_.html 1857-2081 줄을 그대로 분리) */
// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
function rendDash(){
  const tgPK=id=>document.getElementById(id)&&document.getElementById(id).checked;
  togGoal.PARKIE=tgPK('tog-goal-pk'); togGoal.CARRIE=tgPK('tog-goal-ca'); togGoal.GOALIE=tgPK('tog-goal-go');
  togLabor.PARKIE=tgPK('tog-labor-pk'); togLabor.CARRIE=tgPK('tog-labor-ca'); togLabor.GOALIE=tgPK('tog-labor-go');

  const anyLabor=togLabor.PARKIE||togLabor.CARRIE||togLabor.GOALIE;
  const anyGoal=togGoal.PARKIE||togGoal.CARRIE||togGoal.GOALIE;

  // ① 오늘 작업 목표 배너
  document.getElementById('dg-banner').style.display=anyLabor?'block':'none';
  if(anyLabor) rendDailyGoal();

  // ② 로봇별 현황 카드 (대시보드에 표시 토글 → 2번째 위치)
  rendDashRobotSections();

  // ③ 목표 대수 + 달력
  document.getElementById('dash-goal-section').style.display=anyGoal?'block':'none';
  if(anyGoal){ rendRobotGoal(); }
  rendCalendar(); // 공수산정 기반 독립 달력

  // ④ 알림 + 최근 내역
  rendAlerts();
  rendRecent();
}

function rendDailyGoal(){
  // ── 오늘의 작업 목표 — 공정별 완료 체크 UI ──────────
  const hpd=laborSettings.hpd, wk=laborSettings.wk;
  const robots=['PARKIE','CARRIE','GOALIE'];
  const activeRobots=robots.filter(r=>togLabor[r]);
  let html=''; let anyTask=false;

  activeRobots.forEach(r=>{
    const allTasks=laborModules[r].flatMap(m=>m.tasks).filter(t=>t.hours>0||t.tbd);
    if(!allTasks.length)return;
    anyTask=true;

    const catColor={준비:'#8B5CF6',기구:'#0EA5E9',전장:'#EF4444',SW:'#10B981',검사:'#F59E0B',공통:'#6B7280'};
    const totalH=allTasks.filter(t=>!t.tbd&&!t.outsourced).reduce((a,t)=>a+t.hours,0);
    const cap=hpd*wk;

    // 실적 기반 효율 계산
    const rActual=actualRecords.filter(a=>a.robot===r);
    const planHSum=rActual.reduce((s,a)=>s+a.planH,0);
    const actHSum=rActual.reduce((s,a)=>s+a.actualH,0);
    const effRate=planHSum>0&&actHSum>0?Math.round((planHSum/actHSum)*100):null;
    const effColor=effRate===null?'rgba(255,255,255,.4)':effRate>=100?'#86EFAC':effRate>=80?'#FDE68A':'#FCA5A5';
    const effText=effRate===null?'기록 없음':effRate+'%';

    // 공정 행 렌더
    const rows=allTasks.map((t,i)=>{
      const ckId=`dg-ck-${r}-${i}`;
      const cat=t.category||'기구';
      const cc=catColor[cat]||'#6B7280';
      let flags='';
      if(t.outsourced) flags+=`<span style="background:#FEE2E2;color:#DC2626;border-radius:3px;padding:1px 5px;font-size:9px;font-family:var(--fm);font-weight:700;margin-left:4px">외주</span>`;
      if(t.tbd)        flags+=`<span style="background:#FEF3C7;color:#D97706;border-radius:3px;padding:1px 5px;font-size:9px;font-family:var(--fm);font-weight:700;margin-left:4px">TBD</span>`;
      if(t.inspection) flags+=`<span style="background:#DBEAFE;color:#1D4ED8;border-radius:3px;padding:1px 5px;font-size:9px;font-family:var(--fm);font-weight:700;margin-left:4px">검수</span>`;
      const hLabel=t.tbd?'-':t.hours+'h';
      return`<label style="display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.1)'" onmouseout="this.style.background=''">
        <input type="checkbox" id="${ckId}" style="accent-color:#10B981;width:14px;height:14px;flex-shrink:0" onchange="updDailyProgress('${r}')">
        <span style="background:${cc}33;color:${cc};border-radius:3px;padding:1px 5px;font-size:9px;font-family:var(--fm);font-weight:700;flex-shrink:0;min-width:26px;text-align:center">${cat}</span>
        <span id="${ckId}-lbl" style="font-size:12px;flex:1;transition:opacity .2s">${t.name}${flags}</span>
        <span style="font-family:var(--fm);font-size:11px;font-weight:600;opacity:.8;flex-shrink:0;min-width:28px;text-align:right">${hLabel}</span>
      </label>`;
    }).join('');

    const single=activeRobots.length===1;

    if(single){
      // ── 싱글 로봇: 사진처럼 좌=공정목록, 우=진행률+통계카드 ──
      html+=`<div style="display:grid;grid-template-columns:1fr 240px;gap:20px;width:100%">
        <!-- 좌: 공정 목록 -->
        <div>
          <div style="font-size:10px;opacity:.6;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;font-family:var(--fm);display:flex;align-items:center;gap:8px">
            금일 작업 공정 — ${r}
            <span id="dg-prog-${r}" style="font-size:11px;opacity:.8;text-transform:none;letter-spacing:0;font-weight:700">0/${allTasks.length}</span>
            <div style="flex:1;background:rgba(255,255,255,.2);border-radius:3px;height:4px;overflow:hidden"><div id="dg-bar-${r}" style="height:100%;background:#10B981;border-radius:3px;width:0%;transition:width .3s"></div></div>
          </div>
          <div style="max-height:200px;overflow-y:auto;padding-right:4px">${rows}</div>
          <div style="margin-top:8px;font-size:10px;opacity:.4;display:flex;gap:8px;flex-wrap:wrap">
            <span>총 공수 ${totalH}h</span>
            ${allTasks.some(t=>t.outsourced)?'<span style="color:#FCA5A5">외주 별도</span>':''}
            ${allTasks.some(t=>t.tbd)?'<span style="color:#FDE68A">TBD 있음</span>':''}
          </div>
        </div>
        <!-- 우: 효율 패널 (사진 스타일) -->
        <div style="display:flex;flex-direction:column;gap:10px;justify-content:center">
          <div>
            <div style="font-size:10px;opacity:.6;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:var(--fm)">공수 효율</div>
            <div style="font-family:var(--fd);font-size:36px;font-weight:700;line-height:1;color:${effColor}">${effText}</div>
            <div class="dg-prog-bar" style="margin-top:8px">
              <div class="dg-prog-fill" style="width:${effRate!==null?Math.min(effRate,100):0}%;background:${effColor}"></div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="background:rgba(255,255,255,.12);border-radius:8px;padding:9px 12px">
              <div style="font-size:10px;opacity:.6;margin-bottom:3px;letter-spacing:.5px;font-family:var(--fm)">하루 용량</div>
              <div style="font-family:var(--fm);font-size:16px;font-weight:700">${cap}h</div>
            </div>
            <div style="background:rgba(255,255,255,.12);border-radius:8px;padding:9px 12px">
              <div style="font-size:10px;opacity:.6;margin-bottom:3px;letter-spacing:.5px;font-family:var(--fm)">효율</div>
              <div style="font-family:var(--fm);font-size:16px;font-weight:700;color:${effColor}">${effText}</div>
            </div>
          </div>
        </div>
      </div>`;
    } else {
      // ── 다중 로봇: 컴팩트 카드 ─────────────────────────
      html+=`<div style="flex:1;min-width:260px">
        <div style="font-size:10px;opacity:.6;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;font-family:var(--fm);display:flex;align-items:center;gap:8px">
          금일 작업 공정 — ${r}
          <span id="dg-prog-${r}" style="font-size:11px;opacity:.8;text-transform:none;letter-spacing:0;font-weight:700">0/${allTasks.length}</span>
          <div style="flex:1;background:rgba(255,255,255,.2);border-radius:3px;height:4px;overflow:hidden"><div id="dg-bar-${r}" style="height:100%;background:#10B981;border-radius:3px;width:0%;transition:width .3s"></div></div>
        </div>
        <div style="max-height:180px;overflow-y:auto;padding-right:4px">${rows}</div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:4px 10px">
            <span style="font-size:9px;opacity:.6;font-family:var(--fm)">용량 </span>
            <span style="font-family:var(--fm);font-size:13px;font-weight:700">${cap}h</span>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:4px 10px">
            <span style="font-size:9px;opacity:.6;font-family:var(--fm)">효율 </span>
            <span style="font-family:var(--fm);font-size:13px;font-weight:700;color:${effColor}">${effText}</span>
          </div>
        </div>
      </div>`;
    }
  });

  document.getElementById('dg-robots').innerHTML=html;
  document.getElementById('dg-sub').textContent=anyTask
    ?`하루 ${hpd}h × ${wk}명 기준 — 체크로 완료 표시`
    :'공수 산정 메뉴에서 작업 정보를 설정하세요';
}

function updDailyProgress(r){
  // ── 공정 완료 체크박스 변경 시 진행률 업데이트 ───────
  const allTasks=laborModules[r].flatMap(m=>m.tasks).filter(t=>t.hours>0||t.tbd);
  let done=0;
  allTasks.forEach((t,i)=>{
    const ck=document.getElementById(`dg-ck-${r}-${i}`);
    const lbl=document.getElementById(`dg-ck-${r}-${i}-lbl`);
    if(ck&&ck.checked){
      done++;
      if(lbl){lbl.style.opacity='.4';lbl.style.textDecoration='line-through';}
    } else {
      if(lbl){lbl.style.opacity='1';lbl.style.textDecoration='none';}
    }
  });
  const pct=allTasks.length?Math.round((done/allTasks.length)*100):0;
  const prog=document.getElementById(`dg-prog-${r}`);
  const bar=document.getElementById(`dg-bar-${r}`);
  if(prog)prog.textContent=`${done}/${allTasks.length}`;
  if(bar)bar.style.width=pct+'%';
}

function rendRobotGoal(){
  const robots=['PARKIE','CARRIE','GOALIE'];
  const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const activeRobots=robots.filter(r=>togGoal[r]);
  const single=activeRobots.length===1;
  if(single){
    const r=activeRobots[0];
    const parts=bom.filter(b=>b.robot===r);
    const goal=robotGoals[r];
    const lacking=parts.filter(p=>p.stock<p.perUnit*goal);
    const ok=parts.filter(p=>p.stock>=p.perUnit*goal);
    document.getElementById('rg-grid').innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;grid-column:1/-1">
        <div class="rg-card">
          <div class="rg-head">
            <span class="rg-name" style="color:${cmap[r]}">${r}</span>
            <div class="rg-inp"><label>목표</label><input type="number" min="0" value="${goal}" oninput="setGoal('${r}',this.value)"><label>대</label></div>
          </div>
          <div style="display:flex;gap:16px;margin-bottom:10px">
            <div><div class="sl">정상</div><div style="font-size:20px;font-weight:700;font-family:var(--fd);color:var(--gn)">${ok.length}</div></div>
            <div><div class="sl">부족</div><div style="font-size:20px;font-weight:700;font-family:var(--fd);color:var(--re)">${lacking.length}</div></div>
            <div><div class="sl">전체</div><div style="font-size:20px;font-weight:700;font-family:var(--fd)">${parts.length}</div></div>
          </div>
          <div class="rg-parts" style="max-height:none">
            ${lacking.map(p=>{const need=p.perUnit*goal;return`<div class="rg-part"><span class="t-mu t-sm">${p.name}</span><span class="t-m t-sm rg-ng">재고 ${p.stock} / 필요 ${need} (부족 ${need-p.stock})</span></div>`;}).join('')||'<div class="t-sm t-mu" style="padding:4px 0">✅ 부족 품목 없음</div>'}
          </div>
        </div>
        <div class="rg-card" style="background:var(--s2)">
          <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:10px;letter-spacing:1px;text-transform:uppercase;font-family:var(--fm)">정상 품목</div>
          <div class="rg-parts" style="max-height:none">
            ${ok.map(p=>{const need=p.perUnit*goal;return`<div class="rg-part"><span class="t-mu t-sm">${p.name}</span><span class="t-m t-sm rg-ok">✓ ${p.stock}/${need}</span></div>`;}).join('')||'<div class="t-sm t-mu" style="padding:4px 0">정상 품목 없음</div>'}
          </div>
        </div>
      </div>`;
  } else {
    document.getElementById('rg-grid').innerHTML=activeRobots.map(r=>{
      const parts=bom.filter(b=>b.robot===r);
      const goal=robotGoals[r];
      const rows=parts.map(p=>{const need=p.perUnit*goal;const ok=p.stock>=need;return`<div class="rg-part"><span class="t-mu t-sm">${p.name}</span><span class="t-m t-sm ${ok?'rg-ok':'rg-ng'}">${p.stock}/${need}${ok?' ✓':` -${need-p.stock}`}</span></div>`;}).join('');
      return`<div class="rg-card"><div class="rg-head"><span class="rg-name" style="color:${cmap[r]}">${r}</span><div class="rg-inp"><label>목표</label><input type="number" min="0" value="${goal}" oninput="setGoal('${r}',this.value)"><label>대</label></div></div><div class="rg-parts">${rows||'<div class="t-sm t-mu">부품 없음</div>'}</div></div>`;
    }).join('');
  }
}
function setGoal(r,v){robotGoals[r]=Math.max(0,parseInt(v)||0);rendRobotGoal();}

function rendDashRobotSections(){
  const cont=document.getElementById('dash-robot-sections');
  let html='';
  ['PARKIE','CARRIE','GOALIE'].forEach(r=>{
    if(!robotDashShow[r]) return;
    const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
    const parts=bom.filter(b=>b.robot===r);
    const total=parts.reduce((a,b2)=>a+b2.stock,0);
    html+=`<div class="sec" style="border-top:3px solid ${cmap[r]}">
      <div class="sh"><div class="st" style="color:${cmap[r]}">${r} 현황</div><button class="btn b-se b-sm" onclick="go('r-${r.toLowerCase()}')">상세 보기 →</button></div>
      <div style="padding:12px 18px;display:flex;gap:20px;flex-wrap:wrap">
        <div><div class="sl">총 재고</div><div class="sv" style="font-size:20px;color:${cmap[r]}">${total}</div></div>
        <div><div class="sl">부족 품목</div><div class="sv" style="font-size:20px;color:${parts.filter(p=>p.stock<=p.minStock).length>0?'var(--re)':'var(--gn)'}">${parts.filter(p=>p.stock<=p.minStock).length}</div></div>
        <div><div class="sl">목표 대수</div><div class="sv" style="font-size:20px">${robotGoals[r]}</div></div>
      </div>
    </div>`;
  });
  cont.innerHTML=html;
}

