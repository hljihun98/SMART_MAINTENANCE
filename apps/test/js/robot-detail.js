/* ===== robot-detail.js : 로봇별 현황 페이지(rendRobotDetail) ===== */
/* (원본 robot_inventory__44_.html 4236-4313 줄을 그대로 분리) */
// ════════════════════════════════════════
// ROBOT DETAIL
// ════════════════════════════════════════
function rendRobotDetail(robot){
  const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const color=cmap[robot];
  const parts=bom.filter(b=>b.robot===robot);
  const rLogs=ioLogs.filter(l=>l.robot===robot).sort((a,b)=>b.ts-a.ts);
  const total=parts.reduce((a,b2)=>a+b2.stock,0);
  const goal=robotGoals[robot];

  document.getElementById('rd-'+robot.toLowerCase()).innerHTML=`
    <div class="ph">
      <div><div class="pt" style="color:${color}">${robot}</div><div class="ps">${robot==='PARKIE'?'주차로봇':robot==='CARRIE'?'물류로봇':'순찰로봇'} — 상세 현황</div></div>
      <div class="bg">
        <label class="tog"><input type="checkbox" ${robotDashShow[robot]?'checked':''} onchange="setRobotDashShow('${robot}',this.checked)"><div class="tog-sl"></div><span>대시보드에 표시</span></label>
        <div class="rd-quick-actions">
          <button class="btn b-su" onclick="quickIO('in','')">+ 입고</button>
          <button class="btn b-dn" onclick="quickIO('out','')">- 출고</button>
        </div>
      </div>
    </div>
    <div class="sg" style="grid-template-columns:repeat(4,1fr)">
      <div class="sc" style="cursor:default"><div class="sl">총 부품</div><div class="sv">${parts.length}</div></div>
      <div class="sc" style="cursor:default"><div class="sl">총 재고</div><div class="sv" style="color:${color}">${total}</div></div>
      <div class="sc" style="cursor:pointer" onclick="showLackingModal('${robot}')"><div class="sl">부족 품목</div><div class="sv" style="color:${parts.filter(isLowStock).length>0?'var(--re)':'var(--gn)'}">${parts.filter(isLowStock).length}</div><div class="ss" style="font-size:10px;color:var(--ac)">클릭하여 상세 보기</div></div>
      <div class="sc" style="cursor:default"><div class="sl">목표 대수</div><div class="sv">${goal}</div></div>
    </div>
    <div class="rd-tabs tabs">
      <div class="tab act" onclick="rdTab(this,'rdb-${robot}','rdi-${robot}')">BOM 부품 목록</div>
      <div class="tab" onclick="rdTab(this,'rdi-${robot}','rdb-${robot}')">입출고 내역</div>
    </div>
    <div id="rdb-${robot}">
      <div class="sec"><table><thead><tr><th>이미지</th><th>Part Number</th><th>부품명</th><th>단위</th><th>재고</th><th>최소</th><th>대당</th><th>목표 필요</th><th>상태</th></tr></thead>
        <tbody>${parts.map(b=>{const s=sts(b.stock,b.minStock);const need=b.perUnit*goal;const ok=b.stock>=need;const imgEl=b.imgs&&b.imgs.length?`<img ${imgAttrs(b.imgs[0])} class="bom-img" onclick="openLBFromImg(this)">`:'<span class="t-mu t-sm">-</span>';return`<tr><td>${imgEl}</td><td class="t-m t-sm" style="font-weight:600">${escHtml(b.partNo)}</td><td>${escHtml(b.name)}</td><td class="t-m t-sm">${escHtml(b.unit)}</td><td class="t-m" style="font-weight:600">${escHtml(b.stock)}</td><td class="t-m t-sm">${escHtml(b.minStock)}</td><td class="t-m t-sm">${escHtml(b.perUnit)}</td><td class="t-m t-sm" style="color:${ok?'var(--gn)':'var(--re)'};font-weight:600">${escHtml(need)}${ok?' ✓':` (-${escHtml(need-b.stock)})`}</td><td><span class="sb2 ${s.c}">${s.t}</span></td></tr>`;}).join('')||'<tr><td colspan="9" style="text-align:center;padding:14px;color:var(--t2)">없음</td></tr>'}</tbody>
      </table></div>
    </div>
    <div id="rdi-${robot}" style="display:none">
      <div class="sec"><table><thead><tr><th>일시</th><th>구분</th><th>Part Number</th><th>부품명</th><th>수량</th><th>담당자</th><th>메모</th><th>사진</th></tr></thead>
        <tbody>${rLogs.length?rLogs.map(l=>`<tr><td class="t-m t-sm">${fd(l.ts)}</td><td><span class="lb ${l.type==='IN'?'lb-in':'lb-out'}">${l.type==='IN'?'입고':'출고'}</span></td><td class="t-m t-sm">${escHtml(l.partNo)}</td><td>${escHtml(l.partName)}</td><td class="t-m">${escHtml(l.qty)} ${escHtml(l.unit)}</td><td class="t-sm">${escHtml(l.userName)}</td><td class="t-mu t-sm">${escHtml(l.memo||'-')}</td><td>${pminis(l.photos,2)}</td></tr>`).join(''):'<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--t2)">내역 없음</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function showLackingModal(robot){
  const cmap={PARKIE:'var(--pk)',CARRIE:'var(--ca)',GOALIE:'var(--go)'};
  const parts=bom.filter(b=>b.robot===robot&&isLowStock(b));
  document.getElementById('lacking-title').textContent=`${robot} — 부족 품목 현황`;
  document.getElementById('lacking-sub').textContent=`총 ${parts.length}개 품목이 최소 재고 이하입니다`;
  const goal=robotGoals[robot];
  document.getElementById('lacking-body').innerHTML=parts.length
    ?`<table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">Part Number</th>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">부품명</th>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">현재</th>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">최소</th>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">목표 필요</th>
          <th style="padding:7px 10px;background:var(--s2);font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">부족량</th>
        </tr></thead>
        <tbody>${parts.map(p=>{const need=p.perUnit*goal;const short=Math.max(0,need-p.stock);return`<tr>
          <td style="padding:8px 10px;font-family:var(--fm);font-size:11px;font-weight:600;border-bottom:1px solid var(--bd)">${escHtml(p.partNo)}</td>
          <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid var(--bd)">${escHtml(p.name)}</td>
          <td style="padding:8px 10px;font-family:var(--fm);font-size:12px;color:${p.stock===0?'var(--re)':'var(--am)'};font-weight:600;border-bottom:1px solid var(--bd)">${escHtml(p.stock)}</td>
          <td style="padding:8px 10px;font-family:var(--fm);font-size:12px;border-bottom:1px solid var(--bd)">${escHtml(p.minStock)}</td>
          <td style="padding:8px 10px;font-family:var(--fm);font-size:12px;border-bottom:1px solid var(--bd)">${need}</td>
          <td style="padding:8px 10px;font-family:var(--fm);font-size:12px;color:var(--re);font-weight:700;border-bottom:1px solid var(--bd)">−${short}</td>
        </tr>`;}).join('')}</tbody>
      </table>`
    :`<div style="text-align:center;padding:24px;color:var(--t2);font-size:13px">✅ 부족 품목이 없습니다</div>`;
  openMo('mo-lacking');
}

function rdTab(el,showId,hideId){
  document.querySelectorAll('.rd-tabs .tab').forEach(t=>t.classList.remove('act'));
  el.classList.add('act');
  document.getElementById(showId).style.display='';
  document.getElementById(hideId).style.display='none';
}

function setRobotDashShow(robot, checked){
  robotDashShow[robot]=!!checked;
  if(typeof saveState==='function')saveState();
  rendDash();
  toast('✅',`${robot} ${checked?'표시':'숨김'} 설정이 저장되었습니다`,'ok');
}
