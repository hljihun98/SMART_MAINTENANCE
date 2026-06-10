/* ===== mobile-nav.js : 모바일 상단 메뉴 자동 순환 ===== */
(function(){
  'use strict';

  const mq=window.matchMedia('(max-width: 760px)');
  const speed=22; // px per second
  let raf=0,lastTs=0,pausedUntil=0;
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
  function tick(ts){
    const el=nav();
    if(!el){raf=0;return;}
    if(!mq.matches){
      el.classList.remove('nav-rotating','nav-paused');
      delete el.dataset.navCloned;
      removeClones(el);
      raf=requestAnimationFrame(tick);
      return;
    }
    const cycle=ensureClones(el);
    if(cycle<=el.clientWidth+6||el.scrollWidth<=el.clientWidth+6){
      el.classList.remove('nav-rotating','nav-paused');
      raf=requestAnimationFrame(tick);
      return;
    }
    el.classList.add('nav-rotating');
    if(!lastTs)lastTs=ts;
    const dt=Math.min(80,ts-lastTs);
    lastTs=ts;
    if(resumeIfReady(el)){
      el.scrollLeft+=speed*(dt/1000);
      if(el.scrollLeft>=cycle)el.scrollLeft-=cycle;
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  window.addEventListener('resize',()=>{
    const el=nav();
    if(el){
      delete el.dataset.navCloned;
      removeClones(el);
    }
    pause(1200);
  });
})();
