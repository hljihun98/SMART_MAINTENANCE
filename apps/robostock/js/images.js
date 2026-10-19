/* ===== images.js : 이미지 저장소(IndexedDB) · 첨부 리사이즈 · 렌더 헬퍼 =====
 *
 *  왜 필요한가:
 *   - 예전에는 사진 원본 base64 를 localStorage 상태에 그대로 넣어 5MB 한도를 금방 넘겼고,
 *     한도를 넘으면 그 뒤의 모든 저장(재고·입출고·계정 변경)이 실패했습니다.
 *   - 이제 첨부 시 canvas 로 리사이즈(긴 변 1280px, JPEG 0.75)하고,
 *     이미지 본문은 IndexedDB 에, localStorage 상태에는 이미지 id(참조)만 저장합니다.
 *
 *  저장 형식 (메인 포털 '데이터 관리'와 공유하는 규약 — 바꾸지 마세요):
 *   - DB 이름   : 'robostock_images'  (버전 1)
 *   - store 이름: 'images'  (out-of-line key)
 *   - key       : 'img_<시간36진>_<난수>' (신규) / 'img_m_<해시>_<길이>' (기존 base64 마이그레이션)
 *   - value     : data URL 문자열 ('data:image/jpeg;base64,...')
 *   - 포털이 deleteDatabase 를 호출하면 onversionchange 에서 즉시 close() 합니다.
 *
 *  상태 안의 이미지 참조:
 *   - 'img_...' 문자열 → IndexedDB 에서 읽어 표시
 *   - 'data:...' 문자열 → (마이그레이션 전 데이터 / IndexedDB 를 못 쓰는 환경) 그대로 표시
 */
(function(){
  'use strict';
  const DB_NAME='robostock_images';
  const STORE='images';
  const DB_VERSION=1;
  const MAX_SIDE=1280;
  const QUALITY=0.75;
  const ORPHAN_AGE_MS=24*60*60*1000; // 참조 없는 신규 이미지는 하루 지난 뒤에만 정리
  // 1x1 투명 GIF (IndexedDB 에서 읽어오기 전 자리표시)
  const BLANK='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const cache=new Map();   // id → data URL
  let dbPromise=null;
  let available=typeof indexedDB!=='undefined';
  let quotaWarned=false;

  function isRef(v){return typeof v==='string'&&v.indexOf('img_')===0;}
  function isDataUrl(v){return typeof v==='string'&&v.indexOf('data:')===0;}

  function openDB(){
    if(!available)return Promise.reject(new Error('IndexedDB 사용 불가'));
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let req;
      try{req=indexedDB.open(DB_NAME,DB_VERSION);}
      catch(e){available=false;reject(e);return;}
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
      };
      req.onsuccess=()=>{
        const db=req.result;
        // 포털/다른 탭의 deleteDatabase·버전 변경을 막지 않도록 즉시 닫음
        db.onversionchange=()=>{try{db.close();}catch(e){/* 이미 닫힘 */}dbPromise=null;};
        db.onclose=()=>{dbPromise=null;};
        resolve(db);
      };
      req.onerror=()=>{available=false;dbPromise=null;reject(req.error);};
    });
    return dbPromise;
  }

  function isQuotaError(e){
    return !!e&&(e.name==='QuotaExceededError'||e.code===22||e.name==='NS_ERROR_DOM_QUOTA_REACHED');
  }
  function warnQuotaOnce(){
    if(quotaWarned)return;
    quotaWarned=true;
    if(typeof toast==='function')toast('⚠️','이미지 저장 공간이 부족합니다. 불필요한 사진을 삭제한 뒤 다시 첨부하세요.','err');
  }

  // 여러 (id, dataUrl) 쌍을 한 트랜잭션으로 저장
  function putMany(pairs){
    return openDB().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      const st=tx.objectStore(STORE);
      pairs.forEach(([id,url])=>st.put(url,id));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error('트랜잭션 중단'));
    }));
  }

  function newId(){
    return 'img_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }

  // data URL 저장 → 참조 문자열 반환. IndexedDB 를 못 쓰면 data URL 자체를 참조로 사용(구버전 방식)
  function put(dataUrl){
    if(!available)return Promise.resolve(dataUrl);
    const id=newId();
    cache.set(id,dataUrl);
    return putMany([[id,dataUrl]]).then(()=>id,e=>{
      cache.delete(id);
      if(isQuotaError(e)){warnQuotaOnce();throw e;}
      if(!available)return dataUrl; // 열기 실패 → 구버전 방식으로 폴백
      throw e;
    });
  }

  function get(ref){
    if(isDataUrl(ref))return Promise.resolve(ref);
    if(!isRef(ref))return Promise.resolve(null);
    if(cache.has(ref))return Promise.resolve(cache.get(ref));
    return openDB().then(db=>new Promise(resolve=>{
      const rq=db.transaction(STORE,'readonly').objectStore(STORE).get(ref);
      rq.onsuccess=()=>{const v=rq.result;if(typeof v==='string')cache.set(ref,v);resolve(typeof v==='string'?v:null);};
      rq.onerror=()=>resolve(null);
    })).catch(()=>null);
  }

  function remove(refs){
    const ids=(refs||[]).filter(isRef);
    if(!ids.length)return Promise.resolve();
    ids.forEach(id=>cache.delete(id));
    return openDB().then(db=>new Promise(resolve=>{
      const tx=db.transaction(STORE,'readwrite');
      const st=tx.objectStore(STORE);
      ids.forEach(id=>st.delete(id));
      tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
    })).catch(()=>{});
  }

  function allKeys(){
    return openDB().then(db=>new Promise((resolve,reject)=>{
      const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();
      rq.onsuccess=()=>resolve(rq.result||[]);
      rq.onerror=()=>reject(rq.error);
    }));
  }

  // DB 전체 삭제 (앱 '초기화'용). 열린 연결을 먼저 닫음
  function destroy(){
    cache.clear();
    const p=dbPromise;dbPromise=null;
    const closeP=p?p.then(db=>{try{db.close();}catch(e){/* 무시 */}},()=>{}):Promise.resolve();
    return closeP.then(()=>new Promise(resolve=>{
      if(typeof indexedDB==='undefined'){resolve();return;}
      let req;
      try{req=indexedDB.deleteDatabase(DB_NAME);}catch(e){resolve();return;}
      req.onsuccess=req.onerror=()=>resolve();
      req.onblocked=()=>setTimeout(resolve,800); // 다른 탭이 곧 onversionchange 로 닫음
    }));
  }

  // 문자열 해시 (FNV-1a 32bit) — 마이그레이션 id 를 내용 기반으로 만들어 중복 저장 방지
  function hash(str){
    let h=0x811c9dc5;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}
    return (h>>>0).toString(36);
  }

  // 기존 상태 속 base64(data URL) 이미지를 IndexedDB 로 옮기고 참조로 교체
  // lists: 이미지 배열들의 배열 (예: [b.imgs, l.photos, ...]) — 배열을 직접 수정합니다.
  function migrateLegacy(lists){
    if(!available)return Promise.resolve(0);
    const pairs=new Map();
    lists.forEach(arr=>{
      if(!Array.isArray(arr))return;
      arr.forEach(v=>{if(isDataUrl(v)&&!pairs.has(v))pairs.set(v,'img_m_'+hash(v)+'_'+v.length.toString(36));});
    });
    if(!pairs.size)return Promise.resolve(0);
    const entries=[...pairs].map(([url,id])=>[id,url]);
    return putMany(entries).then(()=>{
      entries.forEach(([id,url])=>cache.set(id,url));
      let n=0;
      lists.forEach(arr=>{
        if(!Array.isArray(arr))return;
        for(let i=0;i<arr.length;i++){
          if(isDataUrl(arr[i])&&pairs.has(arr[i])){arr[i]=pairs.get(arr[i]);n++;}
        }
      });
      return n;
    }).catch(e=>{
      if(isQuotaError(e))warnQuotaOnce();
      console.warn('[ROBOSTOCK] 이미지 마이그레이션 실패 — 기존 방식 유지',e);
      return 0;
    });
  }

  // 참조되지 않는 이미지 정리 (신규 id 는 생성 후 하루 지난 것만 — 다른 탭의 작성 중 첨부 보호)
  function gc(referenced){
    if(!available)return Promise.resolve(0);
    return allKeys().then(keys=>{
      const now=Date.now();
      const dead=keys.filter(k=>{
        if(typeof k!=='string'||referenced.has(k))return false;
        const m=k.match(/^img_([0-9a-z]+)_/);
        if(k.indexOf('img_m_')===0)return true;
        if(m){const ts=parseInt(m[1],36);return isFinite(ts)&&now-ts>ORPHAN_AGE_MS;}
        return false;
      });
      return remove(dead).then(()=>dead.length);
    }).catch(()=>0);
  }

  // ── 첨부 리사이즈: 긴 변 1280px, JPEG 0.75 (투명 배경은 흰색) ──
  function resizeFile(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{
        try{
          const w=img.naturalWidth,h=img.naturalHeight;
          if(!w||!h)throw new Error('이미지 크기를 읽을 수 없습니다');
          const scale=Math.min(1,MAX_SIDE/Math.max(w,h));
          const cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
          const c=document.createElement('canvas');c.width=cw;c.height=ch;
          const ctx=c.getContext('2d');
          ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);
          ctx.drawImage(img,0,0,cw,ch);
          resolve(c.toDataURL('image/jpeg',QUALITY));
        }catch(e){reject(e);}
        finally{URL.revokeObjectURL(url);}
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('이미지를 읽을 수 없습니다(지원하지 않는 형식)'));};
      img.src=url;
    });
  }

  // 파일 목록 → 리사이즈 + 저장 → 참조 배열 (실패한 파일은 건너뛰고 안내)
  function addFiles(files,max){
    const list=Array.from(files||[]).filter(f=>f&&f.type&&f.type.indexOf('image/')===0).slice(0,max==null?Infinity:Math.max(0,max));
    let failed=0;
    return list.reduce((p,f)=>p.then(refs=>resizeFile(f).then(put).then(ref=>{refs.push(ref);return refs;},e=>{
      failed++;console.warn('[ROBOSTOCK] 이미지 첨부 실패:',f.name,e);return refs;
    })),Promise.resolve([])).then(refs=>{
      if(failed&&!quotaWarned&&typeof toast==='function')toast('⚠️',`이미지 ${failed}개를 첨부하지 못했습니다(형식 또는 저장 공간 확인)`,'wa');
      return refs;
    });
  }

  // ── 렌더 헬퍼: <img ${imgAttrs(ref)}> ──
  function imgAttrs(ref){
    if(isDataUrl(ref))return `src="${escHtml(ref)}"`;
    return `src="${BLANK}" data-img-ref="${escHtml(ref)}" alt=""`;
  }
  function hydrate(root){
    if(!root||!root.querySelectorAll)return;
    const imgs=root.matches&&root.matches('img[data-img-ref]')?[root]:[];
    root.querySelectorAll('img[data-img-ref]').forEach(x=>imgs.push(x));
    imgs.forEach(img=>{
      if(img.dataset.imgLoaded===img.dataset.imgRef)return;
      const ref=img.dataset.imgRef;
      img.dataset.imgLoaded=ref;
      get(ref).then(url=>{
        if(img.dataset.imgRef!==ref)return;
        if(url)img.src=url;
        else{img.alt='이미지 없음';img.title='이미지를 찾을 수 없습니다(초기화되었거나 삭제됨)';}
      });
    });
  }
  function startObserver(){
    if(!document.body||typeof MutationObserver==='undefined')return;
    hydrate(document.body);
    new MutationObserver(muts=>{
      muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)hydrate(n);}));
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver);
  else startObserver();

  window.ImgStore={DB_NAME,STORE,isRef,isDataUrl,put,get,remove,destroy,migrateLegacy,gc,resizeFile,addFiles,
    isAvailable:()=>available};
  window.imgAttrs=imgAttrs;
})();
