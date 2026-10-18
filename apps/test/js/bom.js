/* ===== bom.js : BOM 관리: 트리렌더·상세모달·상위부품·이미지 ===== */
/* (원본 robot_inventory__44_.html 2180-2576 줄을 그대로 분리) */
// ════════════════════════════════════════
// BOM
// ════════════════════════════════════════
function rendBOM(){
  // ── BOM 렌더링: 단일 Lv 뱃지 + 들여쓰기로 계층 표현 ──
  // 7개 넓은 레벨 컬럼 → 1개 Lv 컬럼 + Part Number 들여쓰기
  const rawList = bomFilter==='ALL' ? bom : bom.filter(b=>b.robot===bomFilter);
  if(!rawList.length){
    document.getElementById('tb-bom').innerHTML='<tr><td colspan="11" style="text-align:center;color:var(--t2);padding:20px">항목 없음</td></tr>';
    return;
  }

  // 레벨별 색상
  const lvTx =['#6B7280','#3B5BF6','#0EA5E9','#10B981','#F59E0B','#EF4444','#7C3AED'];
  const lvBg2=['#F3F4F6','#EEF1FF','#E0F7FD','#D1FAE5','#FEF3C7','#FEE2E2','#EDE9FF'];

  // Rev. 뱃지 색상
  const revTx={TBD:'#F59E0B',A:'#6B7280',B:'#3B5BF6',C:'#059669',D:'#EF4444'};
  const revBg={TBD:'#FEF3C7',A:'#F3F4F6',B:'#EEF1FF',C:'#D1FAE5',D:'#FEE2E2'};

  // parentPartNo 기반 트리 순서로 평탄화
  function flattenTree(items, parentPN, depth, visited=new Set()){
    if(visited.has(parentPN)) return [];
    if(parentPN) visited.add(parentPN);
    const children=items.filter(b=>{
      const bp=b.parentPartNo||'';
      return depth===0 ? !bp||!items.find(x=>x.partNo===bp) : bp===parentPN;
    });
    let result=[];
    children.forEach(c=>{
      if(!visited.has(c.partNo)){
        result.push(c);
        result=result.concat(flattenTree(items,c.partNo,depth+1,new Set(visited)));
      }
    });
    return result;
  }
  const ordered=flattenTree(rawList,'',0);
  rawList.forEach(b=>{if(!ordered.find(x=>x.partNo===b.partNo))ordered.push(b);});

  let html='';
  ordered.forEach(b=>{
    const lv=b.level||0;
    const s=sts(b.stock,b.minStock);
    const pct=Math.min(100,Math.round((b.stock/Math.max(b.minStock*2,1))*100));
    const rev=b.rev||'A';
    const lc=lvTx[lv]||'#6B7280';
    const lb=lvBg2[lv]||'#F3F4F6';
    const rc=revTx[rev]||'#6B7280';
    const rb2=revBg[rev]||'#F3F4F6';

    // Lv 뱃지 (단일 컬럼)
    const lvBadge=`<span style="background:${lb};color:${lc};border:1px solid ${lc}44;border-radius:4px;padding:2px 6px;font-size:10px;font-family:var(--fm);font-weight:700">L${escHtml(lv)}</span>`;
    // Rev 뱃지
    const revBadge=`<span style="background:${rb2};color:${rc};border-radius:3px;padding:1px 6px;font-size:11px;font-family:var(--fm);font-weight:700">${escHtml(rev)}</span>`;
    // Part Number 들여쓰기: 레벨 × 16px
    const indent=(Number(lv)||0)*16;
    // 상위 부품 연결선 표시
    const prefix=lv>0?`<span style="display:inline-block;width:${indent}px;color:var(--t3);font-size:10px;text-align:right;padding-right:4px">${'└'}</span>`:'';

    html+=`<tr class="bom-row" ondblclick="openPartDetail(${jsArg(b.partNo)})" style="border-bottom:1px solid var(--bd);background:${lv>0?lb+'40':''}">
      <td style="text-align:center;padding:4px 6px">${lvBadge}</td>
      <td style="padding:4px 6px;font-family:var(--fm);font-size:12px;font-weight:${lv<=1?'700':'500'};color:${lc};white-space:nowrap">
        ${prefix}${escHtml(b.partNo)}
      </td>
      <td style="padding:4px 6px;text-align:center">${revBadge}</td>
      <td style="padding:4px 8px;font-size:13px;font-weight:${lv===0?'700':lv===1?'600':'400'}">${escHtml(b.name)}</td>
      <td><span class="rb ${rbc(b.robot)}">${escHtml(b.robot)}</span></td>
      <td class="t-m t-sm">${escHtml(b.unit)}</td>
      <td><div style="display:flex;align-items:center;gap:5px"><span class="t-m" style="min-width:20px;font-weight:600">${escHtml(b.stock)}</span><div class="pb"><div class="pf" style="width:${pct||0}%;background:${b.stock===0?'var(--re)':b.stock<=b.minStock?'var(--am)':'var(--gn)'}"></div></div></div></td>
      <td class="t-m t-sm">${escHtml(b.minStock)}</td>
      <td class="t-m t-sm">${escHtml((Number(b.price)||0).toLocaleString())}</td>
      <td><span class="sb2 ${s.c}">${s.t}</span></td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn b-sm b-wa" onclick="openEditPart(${jsArg(b.partNo)})">수정</button>
        <button class="btn b-sm b-su" onclick="quickIO('in',${jsArg(b.partNo)})">입고</button>
        <button class="btn b-sm b-dn" onclick="quickIO('out',${jsArg(b.partNo)})">출고</button>
      </td>
    </tr>`;
  });
  document.getElementById('tb-bom').innerHTML=html;
}
function filtBOM(r,el){bomFilter=r;document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('act'));if(el)el.classList.add('act');rendBOM();}


// Part edit (수정 모달 재활용)
function openEditPart(pn){
  const b=bom.find(x=>x.partNo===pn);if(!b)return;
  // open part detail on info tab for editing
  openPartDetail(pn);
}

// Part detail modal
function openPartDetail(pn){
  const b=bom.find(x=>x.partNo===pn);if(!b)return;
  currentPDpartNo=pn;
  document.getElementById('pd-title').textContent=`${b.name} (${b.partNo})`;
  pdTab(document.querySelector('.pd-tab'),'pd-info');
  rendPDinfo(b);
  rendPDimages(b);
  rendPDlogs(b);
  rendPDphotos(b);
  openMo('mo-partdetail');
}

function pdTab(el,showId){
  document.querySelectorAll('.pd-tab').forEach(t=>t.classList.remove('act'));
  el.classList.add('act');
  ['pd-info','pd-images','pd-logs','pd-photos'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById(showId).style.display='block';
}

function rendPDinfo(b){
  // ── BOM 상세 정보 모달 ────────────────────────────────
  // stock: 읽기 전용 (입출고로만 변경)
  // parentPartNo: 드롭다운으로 상위 부품 직접 지정 가능
  const lvNames=['L0 완성품','L1 ASSY','L2 서브어셈블리','L3 단위부품','L4 세부부품','L5 세부부품','L6 최하위'];
  // 상위 부품 후보: 같은 로봇, 현재 레벨보다 낮은 레벨 (단, 자기 자신 제외)
  const parentCandidates=bom.filter(x=>x.robot===b.robot && (x.level||0)<(b.level||0) && x.partNo!==b.partNo);
  const parentOpts=`<option value="">없음 (최상위)</option>`+parentCandidates.map(p=>`<option value="${escHtml(p.partNo)}"${b.parentPartNo===p.partNo?' selected':''}>[L${escHtml(p.level||0)}] ${escHtml(p.partNo)} — ${escHtml(p.name)}</option>`).join('');
  // 인라인 핸들러 인자: Part Number 는 jsArg 로 이스케이프 (따옴표·역슬래시 포함 값 안전)
  const pnA=jsArg(b.partNo);

  document.getElementById('pd-info').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">Part Number</label><input class="fi" value="${escHtml(b.partNo)}" onchange="updPart(${pnA},'partNo',this.value)"></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">Part Name</label><input class="fi" value="${escHtml(b.name)}" onchange="updPart(${pnA},'name',this.value)"></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">적용 로봇</label><select class="fs" onchange="updPart(${pnA},'robot',this.value)"><option${b.robot==='PARKIE'?' selected':''}>PARKIE</option><option${b.robot==='CARRIE'?' selected':''}>CARRIE</option><option${b.robot==='GOALIE'?' selected':''}>GOALIE</option></select></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">단위</label><input class="fi" value="${escHtml(b.unit)}" onchange="updPart(${pnA},'unit',this.value)"></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">레벨 (0~6)</label>
        <select class="fs" onchange="updPart(${pnA},'level',parseInt(this.value))">${[0,1,2,3,4,5,6].map(l=>`<option value="${l}"${(b.level||0)===l?' selected':''}>${l} — ${lvNames[l]}</option>`).join('')}</select>
      </div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">Rev.</label><input class="fi" value="${escHtml(b.rev||'A')}" placeholder="A" onchange="updPart(${pnA},'rev',this.value)"></div>
      <div class="fl" style="margin:0;grid-column:1/-1">
        <label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">상위 부품 (Parent) <span style="color:var(--ac);font-size:9px;text-transform:none;letter-spacing:0;font-weight:400">— 이 부품이 속하는 상위 어셈블리</span></label>
        <select class="fs" onchange="updPart(${pnA},'parentPartNo',this.value)">${parentOpts}</select>
      </div>
      <div class="fl" style="margin:0">
        <label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">현재 재고 <span style="color:var(--am);font-weight:400;font-size:9px;letter-spacing:0;text-transform:none">🔒 입출고로만 변경</span></label>
        <input class="fi" type="number" value="${escHtml(b.stock)}" readonly style="background:var(--s3);color:var(--t3);cursor:not-allowed">
      </div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">최소 재고</label><input class="fi" type="number" min="0" value="${escHtml(b.minStock)}" onchange="updPart(${pnA},'minStock',Math.max(0,parseInt(this.value)||0))"></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">단가 (원)</label><input class="fi" type="number" min="0" value="${escHtml(b.price)}" onchange="updPart(${pnA},'price',Math.max(0,parseInt(this.value)||0))"></div>
      <div class="fl" style="margin:0"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">대당 수량</label><input class="fi" type="number" min="1" value="${escHtml(b.perUnit)}" onchange="updPart(${pnA},'perUnit',Math.max(1,parseInt(this.value)||1))"></div>
    </div>
    ${rendBOMHierarchy(b)}
    <div class="fl"><label style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;font-family:var(--fm)">상세 스펙 / 메모</label><textarea class="ft" style="min-height:80px" onchange="updPart(${pnA},'spec',this.value)">${escHtml(b.spec||'')}</textarea></div>
    <div style="text-align:right;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn b-su b-sm" onclick="openAddPartAsChild(${pnA},${jsArg(b.robot)},${(Number(b.level)||0)+1})">+ 하위 부품 추가</button>
      <button class="btn b-pr b-sm" onclick="savePDinfo(${pnA})">변경사항 저장</button>
    </div>`;
}
// ────────────────────────────────────────────────────────
// BOM 계층 구조 패널
// 이미지와 같이 상위·현재·하위 부품을 클릭 가능한 카드로 표시
// 각 카드에 "열기" 버튼 → openPartDetail() 호출
// ────────────────────────────────────────────────────────
function rendBOMHierarchy(b){
  // ── BOM 계층 구조 패널 (이미지 스타일) ────────────────
  // 상위 부품 → 현재 부품 → 하위 부품을 카드로 표시
  // 각 카드 클릭 시 해당 부품 상세로 이동 (현재 품목은 수정 가능)
  const lv = Number(b.level)||0;
  const robot = b.robot;
  const pnA = jsArg(b.partNo), rbA = jsArg(robot);
  const lvNames=['L0 완성품','L1 ASSY','L2 서브어셈블리','L3 단위부품','L4 세부부품','L5 세부부품','L6 최하위'];
  const lvColors=['#6B7280','#3B5BF6','#0EA5E9','#10B981','#F59E0B','#EF4444','#7C3AED'];
  const lvBg   =['#F3F4F6','#EEF1FF','#E0F7FD','#D1FAE5','#FEF3C7','#FEE2E2','#EDE9FF'];

  // parentPartNo 기반 탐색
  const directParent   = b.parentPartNo ? bom.find(x=>x.partNo===b.parentPartNo) : null;
  const directChildren = bom.filter(x=>x.parentPartNo===b.partNo);
  const siblings       = b.parentPartNo ? bom.filter(x=>x.parentPartNo===b.parentPartNo && x.partNo!==b.partNo) : [];

  // 부품 카드 렌더 헬퍼 (클릭 이동 제거 — 정보만 표시)
  const card=(item,isCurrent)=>{
    const li=item.level||0;
    const lc=lvColors[li]||'#6B7280';
    const lb=lvBg[li]||'#F3F4F6';
    const revColors={TBD:'#F59E0B',A:'#6B7280',B:'#3B5BF6',C:'#059669',D:'#EF4444'};
    const rc=revColors[item.rev||'A']||'#6B7280';
    return`<div style="display:flex;align-items:center;gap:8px;background:${isCurrent?lc+'18':lb};border:${isCurrent?'2px solid '+lc:'1px solid '+lc+'22'};border-radius:7px;padding:7px 12px">
      <span style="background:${lc};color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;font-family:var(--fm);font-weight:700;flex-shrink:0">L${escHtml(li)}</span>
      <span style="font-family:var(--fm);font-size:12px;font-weight:600;color:${lc};flex-shrink:0">${escHtml(item.partNo)}</span>
      <span style="background:${rc}22;color:${rc};border-radius:3px;padding:1px 5px;font-size:10px;font-family:var(--fm);font-weight:700;flex-shrink:0">${escHtml(item.rev||'A')}</span>
      <span style="font-size:12px;color:var(--tx);font-weight:${isCurrent?'600':'400'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(item.name)}</span>
      ${isCurrent?`<span style="font-size:11px;font-weight:700;color:${lc};flex-shrink:0">현재</span>`:''}
    </div>`;
  };

  let html=`<div style="margin-bottom:16px;border:1px solid var(--bd);border-radius:10px;overflow:hidden">
    <div style="background:var(--s2);padding:10px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:12px;font-weight:700;color:var(--tx)">BOM 계층 구조</span>
        <span style="font-size:11px;font-weight:400;color:var(--t2);margin-left:6px">— 현재:
          <span style="color:${lvColors[lv]||'#6B7280'};font-weight:700">${escHtml(lvNames[lv]||'L'+lv)}</span>
        </span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn b-se b-sm" onclick="openSetParentModal(${pnA})" title="이 부품의 상위 부품 변경">✏️ 상위 변경</button>
        <button class="btn b-su b-sm" onclick="openAddPartAsChild(${pnA},${rbA},${lv+1})" title="하위 부품 추가">+ 하위 부품 추가</button>
      </div>
    </div>
    <div style="padding:12px 14px;display:flex;flex-direction:column;gap:7px">`;

  // 상위 부품
  if(directParent){
    html+=`<div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:1px">▲ 상위 부품 (L${escHtml(directParent.level||0)})</div>`;
    html+=card(directParent,false);
    html+=`<div style="border-left:2px dashed var(--bd);height:10px;margin-left:22px"></div>`;
  } else if(lv>0){
    html+=`<div style="font-size:11px;color:var(--am);margin-bottom:4px;display:flex;align-items:center;gap:8px">
      ▲ 상위 부품 미지정
      <button class="btn b-wa b-sm" onclick="openSetParentModal(${pnA})">상위 부품 지정하기</button>
    </div>`;
  }

  // 현재 부품
  html+=card(b,true);

  // 형제 부품 (접힘)
  if(siblings.length){
    const sibId=`sib_${b.partNo.replace(/[^a-zA-Z0-9]/g,'_')}`;
    html+=`<div style="margin-left:20px">
      <button class="btn b-se b-sm" style="width:100%;text-align:left;margin-top:4px" onclick="document.getElementById('${sibId}').style.display=document.getElementById('${sibId}').style.display==='none'?'flex':'none'">
        ↔ 같은 레벨 형제 부품 ${siblings.length}개 (클릭하여 펼치기)
      </button>
      <div id="${sibId}" style="display:none;flex-direction:column;gap:5px;margin-top:6px">
        ${siblings.map(s=>card(s,false)).join('')}
      </div>
    </div>`;
  }

  // 하위 부품
  if(directChildren.length){
    html+=`<div style="border-left:2px dashed var(--bd);height:10px;margin-left:22px"></div>`;
    html+=`<div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:1px">▼ 하위 부품 (L${lv+1}) · ${directChildren.length}개</div>`;
    directChildren.forEach(c=>{ html+=card(c,false); });
    html+=`<button class="btn b-se b-sm" style="margin-left:20px;margin-top:2px" onclick="openAddPartAsChild(${pnA},${rbA},${lv+1})">+ 하위 부품 추가</button>`;
  } else {
    html+=`<div style="border-left:2px dashed var(--bd);height:10px;margin-left:22px"></div>`;
    html+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <span style="font-size:11px;color:var(--t3)">▼ 하위 부품 없음</span>
      <button class="btn b-se b-sm" onclick="openAddPartAsChild(${pnA},${rbA},${lv+1})">+ 하위 부품 추가</button>
    </div>`;
  }

  html+=`</div></div>`;
  return html;
}

// 하위 부품 추가 (상위 부품 미리 지정하여 mo-addpart 열기)
function openAddPartAsChild(parentPN,robot,childLevel){
  openMo('mo-addpart');
  setTimeout(()=>{
    const rb=document.getElementById('ap-rb');if(rb)rb.value=robot;
    const lv=document.getElementById('ap-lv');if(lv)lv.value=Math.min(childLevel,6);
    updAddPartParentSel();
    setTimeout(()=>{
      const sel=document.getElementById('ap-parent');
      if(sel)sel.value=parentPN;
      updAddPartParentPreview();
    },30);
  },20);
}

// 형제 부품 접기/펼치기
// ── 상위 부품 지정/변경 모달 ─────────────────────────────
// prompt() 대신 전용 모달로 교체
function openSetParentModal(pn){
  const b=bom.find(x=>x.partNo===pn);if(!b)return;
  // 같은 로봇의 다른 모든 부품 (자기 자신 제외)
  const valid=bom.filter(x=>x.robot===b.robot && x.partNo!==pn);
  document.getElementById('spm-title').textContent=`"${b.name}" 의 상위 부품 지정`;
  document.getElementById('spm-pn').value=pn;
  const sel=document.getElementById('spm-parent');
  sel.innerHTML=`<option value="">없음 (최상위 — parentPartNo 비움)</option>`+
    valid.map(p=>`<option value="${escHtml(p.partNo)}"${b.parentPartNo===p.partNo?' selected':''}>[L${escHtml(p.level||0)}] ${escHtml(p.partNo)} — ${escHtml(p.name)}</option>`).join('');
  openMo('mo-set-parent');
}

function submitSetParent(){
  const pn=document.getElementById('spm-pn').value;
  const parentPN=document.getElementById('spm-parent').value;
  const b=bom.find(x=>x.partNo===pn);if(!b)return;
  const old=b.parentPartNo||'';
  b.parentPartNo=parentPN;
  logActivity(CU.id,CU.name,'BOM',`상위 부품 변경: ${pn} [${old||'없음'} → ${parentPN||'없음'}]`);
  closeMo('mo-set-parent');
  rendBOM();openPartDetail(pn);
  toast('✅',parentPN?`상위 부품이 "${parentPN}"으로 지정되었습니다`:'상위 부품이 해제되었습니다','ok');
}

// ────────────────────────────────────────────────────────
// BOM 부품 속성 업데이트
// stock(재고) 필드는 입출고로만 변경 → 직접 수정 차단
// ────────────────────────────────────────────────────────
function updPart(pn,key,val){
  if(key==='stock'){
    // 재고는 입출고 기능으로만 변경 가능
    toast('🔒','재고는 입출고 메뉴에서만 변경할 수 있습니다','err');
    return;
  }
  const b=bom.find(x=>x.partNo===pn);
  if(!b){toast('⚠️','부품을 찾을 수 없습니다. 상세 창을 다시 열어주세요.','wa');return;}
  if(key==='partNo'){renamePartNo(b,val);return;}
  const oldVal=b[key];
  b[key]=val;
  // 변경 내역 활동 로그에 기록
  logActivity(CU.id,CU.name,'BOM',`BOM 수정: ${pn} [${key}] ${oldVal} → ${val}`);
  if(key==='name'){const t=document.getElementById('pd-title');if(t&&currentPDpartNo===pn)t.textContent=`${b.name} (${b.partNo})`;}
  rendBOM();rendDash();
}

// Part Number 변경: 중복 검사 + 하위 부품 parentPartNo · 입출고 기록 partNo 참조까지 함께 갱신
function renamePartNo(b,val){
  const oldPn=b.partNo;
  const newPn=String(val ?? '').trim();
  if(newPn===oldPn)return;
  if(!newPn){toast('⚠️','Part Number는 비울 수 없습니다','wa');openPartDetail(oldPn);return;}
  if(bom.some(x=>x!==b&&x.partNo===newPn)){toast('❌',`이미 존재하는 Part Number입니다: ${newPn}`,'err');openPartDetail(oldPn);return;}
  b.partNo=newPn;
  let nChild=0,nLog=0;
  bom.forEach(x=>{if(x.parentPartNo===oldPn){x.parentPartNo=newPn;nChild++;}});
  ioLogs.forEach(l=>{if(l.partNo===oldPn){l.partNo=newPn;nLog++;}});
  if(currentPDpartNo===oldPn)currentPDpartNo=newPn;
  logActivity(CU.id,CU.name,'BOM',`Part Number 변경: ${oldPn} → ${newPn} (하위 ${nChild}건 · 입출고 ${nLog}건 갱신)`);
  rendBOM();rendDash();
  openPartDetail(newPn);   // 모달 핸들러가 새 Part Number 를 가리키도록 다시 렌더
  toast('✅',`Part Number 변경: ${oldPn} → ${newPn}`,'ok');
}

function rendPDimages(b){
  const imgs=b.imgs||[];
  let html=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">`;
  imgs.forEach((src,i)=>{
    html+=`<div style="position:relative;aspect-ratio:1"><img ${imgAttrs(src)} style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--bd);cursor:pointer" onclick="openLBFromImg(this)"><button onclick="delPartImg(${jsArg(b.partNo)},${i})" style="position:absolute;top:4px;right:4px;width:20px;height:20px;background:rgba(0,0,0,.55);border:none;border-radius:50%;color:#fff;font-size:10px;cursor:pointer">✕</button></div>`;
  });
  html+=`<div class="pd-img-add" onclick="document.getElementById('pd-img-fi').click()"><span style="font-size:22px">📷</span><span>이미지 추가</span><span class="t-sm t-mu">또는 드래그</span></div></div>`;
  html+=`<div class="uz" ondragover="event.preventDefault()" ondrop="dropPartImgs(${jsArg(b.partNo)},event)" style="padding:16px"><div class="t-sm t-mu">이미지를 여기에 드래그하여 추가</div></div>`;
  document.getElementById('pd-images').innerHTML=html;
}
// 부품 이미지 첨부: 리사이즈 후 IndexedDB 저장, 상태에는 참조(id)만 보관 (images.js)
function attachPartImgs(b,files){
  if(!files||!files.length)return;
  toast('⏳','이미지 처리 중...','wa');
  ImgStore.addFiles(files).then(refs=>{
    if(!refs.length)return;
    if(!b.imgs)b.imgs=[];
    refs.forEach(r=>b.imgs.push(r));
    if(currentPDpartNo===b.partNo)rendPDimages(b);
    rendBOM();
    toast('✅',`이미지 ${refs.length}개 추가`,'ok');
  });
}
function addPartImg(e){
  const b=bom.find(x=>x.partNo===currentPDpartNo);
  const files=Array.from(e.target.files||[]);
  e.target.value='';
  if(b)attachPartImgs(b,files);
}
function dropPartImgs(pn,e){
  e.preventDefault();const b=bom.find(x=>x.partNo===pn);if(!b)return;
  attachPartImgs(b,Array.from(e.dataTransfer.files||[]));
}
function delPartImg(pn,i){
  const b=bom.find(x=>x.partNo===pn);
  if(b&&b.imgs){const removed=b.imgs.splice(i,1);ImgStore.remove(removed);rendPDimages(b);rendBOM();}
}

function rendPDlogs(b){
  const logs=ioLogs.filter(l=>l.partNo===b.partNo).sort((a,c)=>c.ts-a.ts);
  document.getElementById('pd-logs').innerHTML=logs.length
    ?`<table><thead><tr><th>일시</th><th>구분</th><th>수량</th><th>담당자</th><th>메모</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="t-m t-sm">${fd(l.ts)}</td><td><span class="lb ${l.type==='IN'?'lb-in':'lb-out'}">${l.type==='IN'?'입고':'출고'}</span></td><td class="t-m">${escHtml(l.qty)} ${escHtml(l.unit)}</td><td class="t-sm">${escHtml(l.userName)}</td><td class="t-mu t-sm">${escHtml(l.memo||'-')}</td></tr>`).join('')}</tbody></table>`
    :'<div class="t-mu t-sm" style="text-align:center;padding:20px">입출고 내역 없음</div>';
}

function rendPDphotos(b){
  const photos=ioLogs.filter(l=>l.partNo===b.partNo&&l.photos&&l.photos.length).flatMap(l=>l.photos.map(p=>({src:p,ts:l.ts,user:l.userName,type:l.type})));
  document.getElementById('pd-photos').innerHTML=photos.length
    ?`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${photos.map(p=>`<div><img ${imgAttrs(p.src)} style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid var(--bd);cursor:pointer" onclick="openLBFromImg(this)"><div class="t-sm t-mu" style="margin-top:3px">${escHtml(p.user)} · ${fd(p.ts)}</div></div>`).join('')}</div>`
    :'<div class="t-mu t-sm" style="text-align:center;padding:20px">인증사진 없음</div>';
}

// 부품 추가 모달: 상위부품 셀렉트 박스 업데이트
// 선택된 로봇·레벨에 맞는 상위 후보 필터링
function updAddPartParentSel(){
  const rb=document.getElementById('ap-rb')?.value||'PARKIE';
  const lv=parseInt(document.getElementById('ap-lv')?.value)||0;
  const sel=document.getElementById('ap-parent');if(!sel)return;
  // 상위 부품: 같은 로봇, 현재 레벨보다 낮은 레벨
  const candidates=bom.filter(x=>x.robot===rb&&(x.level||0)<lv);
  sel.innerHTML=`<option value="">없음 (최상위)</option>`+
    candidates.map(p=>`<option value="${escHtml(p.partNo)}">[L${escHtml(p.level||0)}] ${escHtml(p.partNo)} — ${escHtml(p.name)}</option>`).join('');
  updAddPartParentPreview();
}

function updAddPartParentPreview(){
  const sel=document.getElementById('ap-parent');
  const preview=document.getElementById('ap-parent-preview');
  if(!sel||!preview)return;
  const pn=sel.value;
  if(!pn){preview.style.display='none';return;}
  const p=bom.find(x=>x.partNo===pn);
  if(p){
    preview.style.display='block';
    preview.textContent=`선택: [L${p.level||0}] ${p.partNo} — ${p.name}`;
  }
}

function submitAddPart(){
  // ── 신규 부품 등록: 재고는 항상 0으로 고정 ────────────
  const pn=document.getElementById('ap-pn').value.trim();
  const nm=document.getElementById('ap-nm').value.trim();
  if(!pn||!nm){toast('⚠️','Part Number와 부품명을 입력하세요','wa');return;}
  if(bom.find(b=>b.partNo===pn)){toast('⚠️','이미 존재하는 Part Number입니다','wa');return;}
  const lv=parseInt(document.getElementById('ap-lv')?.value)||0;
  const rev=document.getElementById('ap-rev')?.value.trim()||'A';
  const parentPN=document.getElementById('ap-parent')?.value||'';
  bom.push({
    partNo:pn, name:nm,
    robot:normRobot(document.getElementById('ap-rb').value)||'PARKIE',
    unit:document.getElementById('ap-u').value,
    stock:0,                   // 재고 0 고정 (입출고로만 변경)
    minStock:Math.max(0,parseInt(document.getElementById('ap-ms').value)||0),
    price:Math.max(0,parseInt(document.getElementById('ap-pr').value)||0),
    imgs:[], perUnit:1, spec:'',
    level:lv, rev, parentPartNo:parentPN
  });
  logActivity(CU.id,CU.name,'BOM',`신규 부품 등록: ${pn} ${nm} L${lv}${parentPN?' 상위:'+parentPN:''}`);
  closeMo('mo-addpart');rendBOM();rendDash();
  toast('✅',`${pn} 등록 완료 (재고 0 → 입출고에서 입고 처리하세요)`,'ok');
}

// 기본정보 저장 (모달 내 저장 버튼)
function savePDinfo(pn){
  rendBOM();rendDash();
  logActivity(CU.id,CU.name,'BOM',`부품 정보 저장: ${pn}`);
  toast('✅','저장되었습니다','ok');
}



/* --- (원본 1245-1249 인라인 <script>에서 이전) 상위부품 선택 미리보기 --- */
document.addEventListener('DOMContentLoaded', function(){
  var __spm = document.getElementById('spm-parent');
  if(!__spm) return;
  __spm.addEventListener('change', function(){
    const pn=this.value;const p=bom.find(x=>x.partNo===pn);const prev=document.getElementById('spm-preview');
    if(p&&prev){prev.style.display='block';prev.textContent=`선택: [L${p.level||0}] ${p.partNo} — ${p.name}`;}
    else if(prev){prev.style.display='none';}
  });
});
