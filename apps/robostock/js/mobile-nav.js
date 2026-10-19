/* ===== mobile-nav.js : 모바일 상단 메뉴 자동 순환 ===== */
(function(){
  'use strict';

  const mq=window.matchMedia('(max-width: 760px)');
  const speed=22; // px per second
  let raf=0,lastTs=0,pausedUntil=0;
  let pos=0; // 소수점 스크롤 위치 누적 (DPR 1 화면에서 scrollLeft 가 정수로 반올림돼 멈추던 문제 방지)
  let initialized=false;
  let cycleWidth=0;

  function nav(){return document.querySelector('.sb-nav');}
  function pause(ms=5000){
    const el=nav();
    pausedUntil=Date.now()+ms;
    if(el)el.classList.add('nav-paused');
  }
  function removeClones(el){
    el.querySelectorAll('.nav-clone').forEach(x=>x.remove());
    cycleWidth=0;
  }
  function stripIds(root){
    if(root.removeAttribute)root.removeAttribute('id');
    root.querySelectorAll&&root.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
  }
  function ensureClones(el){
    if(el.dataset.navCloned==='1'&&cycleWidth>0)return cycleWidth;
    removeClones(el);
    const originals=[...el.children].filter(x=>!x.classList.contains('nav-clone')&&getComputedStyle(x).display!=='none');
    originals.forEach(item=>{
      const clone=item.cloneNode(true);
      clone.classList.add('nav-clone');
      clone.setAttribute('aria-hidden','true');
      clone.removeAttribute('onclick');
      stripIds(clone);
      clone.querySelectorAll('[onclick]').forEach(x=>x.removeAttribute('onclick'));
      el.appendChild(clone);
    });
    el.dataset.navCloned='1';
    const firstClone=el.querySelector('.nav-clone');
    cycleWidth=firstClone?firstClone.offsetLeft:0;
    return cycleWidth;
  }
  function resumeIfReady(el){
    if(Date.now()<pausedUntil)return false;
    el.classList.remove('nav-paused');
    return true;
  }
  // 순환이 필요 없을 때(데스크톱 폭·로그인 화면·메뉴가 넘치지 않음)는 루프를 멈춥니다.
  // 화면 폭 변경(resize·미디어쿼리 change)이나 initApp 의 startMobileNav() 호출 시 다시 시작합니다.
  function tick(ts){
    const el=nav();
    if(!el){raf=0;return;}
    if(!mq.matches){
      el.classList.remove('nav-rotating','nav-paused');
      delete el.dataset.navCloned;
      removeClones(el);
      raf=0;
      return;
    }
    const cycle=ensureClones(el);
    if(cycle<=el.clientWidth+6||el.scrollWidth<=el.clientWidth+6){
      el.classList.remove('nav-rotating','nav-paused');
      delete el.dataset.navCloned;
      removeClones(el);
      raf=0;
      return;
    }
    el.classList.add('nav-rotating');
    if(!lastTs)lastTs=ts;
    const dt=Math.min(80,ts-lastTs);
    lastTs=ts;
    if(resumeIfReady(el)){
      if(Math.abs(el.scrollLeft-pos)>2)pos=el.scrollLeft; // 사용자가 직접 스크롤한 경우 그 위치부터
      pos+=speed*(dt/1000);
      if(pos>=cycle)pos-=cycle;
      el.scrollLeft=pos;
    }
    raf=requestAnimationFrame(tick);
  }
  function start(){
    const el=nav();
    if(el){
      delete el.dataset.navCloned;
      removeClones(el);
    }
    if(raf)return;
    lastTs=0;
    raf=requestAnimationFrame(tick);
  }
  window.startMobileNav=start;
  window.pauseMobileNav=pause;

  function init(){
    if(initialized)return;
    initialized=true;
    const el=nav();
    if(!el)return;
    ['pointerdown','wheel','touchstart','focusin'].forEach(ev=>el.addEventListener(ev,()=>pause(5000),{passive:true}));
    el.addEventListener('click',e=>{
      if(e.target.closest('.ni'))pause(5000);
    });
    start();
  }
  function syncMcPadding(){
    const sb=document.querySelector('.sb');
    const mc=document.querySelector('.mc');
    if(!sb||!mc)return;
    if(window.innerWidth>980){mc.style.paddingTop='';return;}
    const h=sb.offsetHeight;
    if(h>0) mc.style.paddingTop=(h+14)+'px';
  }
  window.syncMcPadding=syncMcPadding;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  document.addEventListener('DOMContentLoaded',syncMcPadding);
  window.addEventListener('resize',()=>{
    const el=nav();
    if(el){
      delete el.dataset.navCloned;
      removeClones(el);
    }
    pause(1200);
    syncMcPadding();
    start();
  });
  // 모바일 폭으로 바뀌면 루프 재시작
  const onMqChange=()=>{if(mq.matches)start();};
  if(mq.addEventListener)mq.addEventListener('change',onMqChange);
  else if(mq.addListener)mq.addListener(onMqChange);
})();
