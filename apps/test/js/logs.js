/* ===== logs.js : 입출고 로그 렌더(rendLogs) ===== */
/* (원본 robot_inventory__44_.html 3880-3892 줄을 그대로 분리) */
// ════════════════════════════════════════
// LOGS
// ════════════════════════════════════════
function rendLogs(){
  let f=[...ioLogs];
  const tf=document.getElementById('lf-t').value;const rf=document.getElementById('lf-r').value;const df=document.getElementById('lf-d').value;
  if(tf)f=f.filter(l=>l.type===tf);if(rf)f=f.filter(l=>l.robot===rf);if(df)f=f.filter(l=>new Date(l.ts).toISOString().slice(0,10)===df);
  f.sort((a,b)=>b.ts-a.ts);
  document.getElementById('tb-logs').innerHTML=f.length
    ?f.map(l=>`<tr><td class="t-m t-sm">${fd(l.ts)}</td><td><span class="lb ${l.type==='IN'?'lb-in':'lb-out'}">${l.type==='IN'?'입고':'출고'}</span></td><td><span class="rb ${rbc(l.robot)}">${l.robot}</span></td><td class="t-m t-sm">${l.partNo}</td><td>${l.partName}</td><td class="t-m">${l.qty} ${l.unit}</td><td class="t-sm">${l.userName}</td><td class="t-m t-sm">${l.userId}</td><td class="t-mu t-sm">${l.memo||'-'}</td><td>${pminis(l.photos,3)}</td></tr>`).join('')
    :'<tr><td colspan="10" style="text-align:center;color:var(--t2);padding:14px;font-size:12px">로그 없음</td></tr>';
}

