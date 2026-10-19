/* ===== logs.js : 입출고 로그 렌더(rendLogs) ===== */
/* (원본 robot_inventory__44_.html 3880-3892 줄을 그대로 분리) */
// ════════════════════════════════════════
// LOGS
// ════════════════════════════════════════
function rendLogs(){
  let f=[...ioLogs];
  const tf=document.getElementById('lf-t').value;const rf=document.getElementById('lf-r').value;const df=document.getElementById('lf-d').value;
  // 날짜 필터는 로컬 날짜 기준 (UTC 비교 시 KST 00~09시 기록이 전날로 분류됨)
  if(tf)f=f.filter(l=>l.type===tf);if(rf)f=f.filter(l=>l.robot===rf);if(df)f=f.filter(l=>localDateStr(new Date(l.ts))===df);
  f.sort((a,b)=>b.ts-a.ts);
  document.getElementById('tb-logs').innerHTML=f.length
    ?f.map(l=>`<tr><td class="t-m t-sm">${fd(l.ts)}</td><td><span class="lb ${l.type==='IN'?'lb-in':'lb-out'}">${l.type==='IN'?'입고':'출고'}</span></td><td><span class="rb ${rbc(l.robot)}">${escHtml(l.robot)}</span></td><td class="t-m t-sm">${escHtml(l.partNo)}</td><td>${escHtml(l.partName)}</td><td class="t-m">${escHtml(l.qty)} ${escHtml(l.unit)}</td><td class="t-sm">${escHtml(l.userName)}</td><td class="t-m t-sm">${escHtml(l.userId)}</td><td class="t-mu t-sm">${escHtml(l.memo||'-')}</td><td>${pminis(l.photos,3)}</td></tr>`).join('')
    :'<tr><td colspan="10" style="text-align:center;color:var(--t2);padding:14px;font-size:12px">로그 없음</td></tr>';
}

