/* ===== helpers.js : 공용 헬퍼: rbc·sts·fd·toast·logActivity·addWD·rendAll ===== */
/* (원본 robot_inventory__44_.html 1831-1856 줄을 그대로 분리) */
// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function rbc(r){return r==='PARKIE'?'rb-pk':r==='CARRIE'?'rb-ca':'rb-go';}
function sts(s,m){if(s===0)return{c:'s-out',t:'재고없음'};if(s<=m)return{c:'s-low',t:'부족'};return{c:'s-ok',t:'정상'};}
function fd(ts){return new Date(ts).toLocaleString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function pminis(ph,max){if(!ph||!ph.length)return'-';let h=ph.slice(0,max).map(p=>`<img src="${p}" class="pm" onclick="event.stopPropagation();openLB('${p}')">`).join('');if(ph.length>max)h+=`<span class="t-sm t-mu">+${ph.length-max}</span>`;return h;}
function toast(icon,msg,type){
  const t=document.getElementById('tst');
  t.style.borderColor=type==='ok'?'var(--gn)':type==='err'?'var(--re)':'var(--am)';
  document.getElementById('tst-i').textContent=icon;
  document.getElementById('tst-m').textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
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

