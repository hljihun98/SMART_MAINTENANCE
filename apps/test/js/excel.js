/* ===== excel.js : 엑셀 다운로드/업로드(XLSX 사용) ===== */
/* (원본 robot_inventory__44_.html 4618-4691 줄을 그대로 분리) */
// ════════════════════════════════════════
// EXCEL
// ════════════════════════════════════════
// XLSX 는 저장소에 포함된 ../../assets/vendor/xlsx-0.20.3.full.min.js 를 사용합니다.
// 사용 시점마다 xlsxReady() 로 로드 여부를 확인합니다(helpers.js).

// BOM 엑셀 열 순서 (다운로드·업로드 공통). 예전 8열 파일도 그대로 업로드할 수 있습니다.
const BOM_XLSX_COLS=['Part Number','부품명','적용로봇','단위','현재재고','최소재고','단가(원)','대당수량','Level','Rev','상위 Part Number','상세 스펙'];

function cellEmpty(v){return v===undefined||v===null||String(v).trim()==='';}
function cellStr(v){return cellEmpty(v)?'':String(v).trim();}

function dlBOM(){
  if(!xlsxReady())return;
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([BOM_XLSX_COLS,...bom.map(b=>[b.partNo,b.name,b.robot,b.unit,b.stock,b.minStock,b.price,b.perUnit,b.level||0,b.rev||'A',b.parentPartNo||'',b.spec||''])]);
  ws['!cols']=[16,18,10,8,10,10,12,8,6,6,16,24].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'BOM');XLSX.writeFile(wb,'ROBOSTOCK_BOM.xlsx');toast('📥','BOM 다운로드 완료','ok');
}

// BOM 업로드 규칙
//  - 빈 칸은 기존 값 유지 (기존 부품)
//  - 재고는 입출고로만 변경 → 기존 부품의 '현재재고' 열은 무시
//  - 신규 부품만 초기 재고 허용 (입고 기록으로 남김)
//  - 적용로봇은 PARKIE/CARRIE/GOALIE (대소문자 무관), 숫자 열은 0 이상
function uplBOM(e){
  const f=e.target.files[0];if(!f)return;
  e.target.value='';
  if(!xlsxReady())return;
  const r=new FileReader();
  r.onload=ev=>{
    let rows;
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
    }catch(err){console.warn('[ROBOSTOCK] BOM 엑셀 읽기 실패',err);toast('❌','엑셀 파일을 읽을 수 없습니다','err');return;}
    let added=0,updated=0,stockIgnored=0;
    const errs=[];
    const fail=msg=>errs.push(msg);
    for(let i=1;i<rows.length;i++){
      const row=rows[i]||[];
      if(!row.some(v=>!cellEmpty(v)))continue;   // 빈 행
      const rowNo=i+1;
      const [pnRaw,nm,rb,u,st,ms,pr,pu,lv,rev,parent,spec]=row;
      const pn=cellStr(pnRaw);
      if(!pn){fail(`${rowNo}행: Part Number 없음`);continue;}
      const robot=cellEmpty(rb)?null:normRobot(rb);
      if(!cellEmpty(rb)&&!robot){fail(`${rowNo}행: 적용로봇 값 오류(${rb})`);continue;}
      const msN=parseNonNegNum(ms),prN=parseNonNegNum(pr),stN=parseNonNegNum(st);
      if(Number.isNaN(msN)){fail(`${rowNo}행: 최소재고 값 오류(${ms})`);continue;}
      if(Number.isNaN(prN)){fail(`${rowNo}행: 단가 값 오류(${pr})`);continue;}
      const puN=cellEmpty(pu)?null:parsePosInt(pu);
      if(!cellEmpty(pu)&&!puN){fail(`${rowNo}행: 대당수량은 1 이상의 정수(${pu})`);continue;}
      let lvN=null;
      if(!cellEmpty(lv)){
        if(!/^[0-6]$/.test(String(lv).trim())){fail(`${rowNo}행: Level 은 0~6(${lv})`);continue;}
        lvN=parseInt(lv,10);
      }
      const parentPn=cellEmpty(parent)?null:cellStr(parent);
      if(parentPn===pn){fail(`${rowNo}행: 상위 Part Number 가 자기 자신`);continue;}

      const ex=bom.find(b=>b.partNo===pn);
      if(ex){
        if(!cellEmpty(nm))ex.name=cellStr(nm);
        if(robot)ex.robot=robot;
        if(!cellEmpty(u))ex.unit=cellStr(u);
        if(msN!==null)ex.minStock=Math.round(msN);
        if(prN!==null)ex.price=Math.round(prN);
        if(puN)ex.perUnit=puN;
        if(lvN!==null)ex.level=lvN;
        if(!cellEmpty(rev))ex.rev=cellStr(rev);
        if(parentPn!==null)ex.parentPartNo=parentPn;
        if(!cellEmpty(spec))ex.spec=String(spec);
        if(stN!==null&&!Number.isNaN(stN)&&stN!==ex.stock)stockIgnored++;
        updated++;
      } else {
        if(cellEmpty(nm)){fail(`${rowNo}행: 신규 부품은 부품명 필요(${pn})`);continue;}
        if(!robot){fail(`${rowNo}행: 신규 부품은 적용로봇 필요(${pn})`);continue;}
        if(Number.isNaN(stN)||(stN!==null&&!Number.isInteger(stN))){fail(`${rowNo}행: 초기 재고는 0 이상의 정수(${st})`);continue;}
        const b={partNo:pn,name:cellStr(nm),robot,unit:cellStr(u)||'EA',stock:0,minStock:Math.round(msN||0),price:Math.round(prN||0),
          imgs:[],perUnit:puN||1,spec:cellEmpty(spec)?'':String(spec),level:lvN||0,rev:cellStr(rev)||'A',parentPartNo:parentPn||''};
        bom.push(b);
        if(stN>0){
          // 신규 부품 초기 재고는 입고 기록으로 남김 (재고 변경 = 입출고 원칙)
          b.stock=stN;
          ioLogs.push({ts:Date.now(),type:'IN',robot,partNo:pn,partName:b.name,qty:stN,unit:b.unit,memo:'엑셀 BOM 업로드 — 신규 부품 초기 재고',status:'정상',userId:CU.id,userName:CU.name,photos:[]});
        }
        added++;
      }
    }
    if(errs.length)console.warn('[ROBOSTOCK] BOM 업로드 실패 행:\n'+errs.join('\n'));
    if(added||updated)logActivity(CU.id,CU.name,'BOM',`엑셀 BOM 업로드(${f.name}): 신규 ${added} · 수정 ${updated}${errs.length?` · 실패 ${errs.length}`:''}${stockIgnored?` · 재고 열 ${stockIgnored}건 무시`:''}`);
    rendAll();
    const msg=`BOM 반영: 신규 ${added} · 수정 ${updated}`
      +(stockIgnored?` · 재고 열 ${stockIgnored}건 무시(재고는 입출고로만 변경)`:'')
      +(errs.length?` · 실패 ${errs.length}건 (예: ${errs[0]})`:'');
    toast(errs.length?'⚠️':'✅',msg,errs.length?'wa':'ok');
  };
  r.readAsArrayBuffer(f);
}
function dlIOT(){
  if(!xlsxReady())return;
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['구분(IN/OUT·입고/출고)','Part Number','부품명','적용로봇','수량','단위','메모'],['IN','PK-MC-001','메인컨트롤러','PARKIE',10,'EA','정기발주'],['출고','CR-MT-001','리프트모터','CARRIE',2,'EA','조립투입']]);
  ws['!cols']=[10,16,18,10,8,8,20].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'입출고');XLSX.writeFile(wb,'ROBOSTOCK_입출고_양식.xlsx');toast('📥','양식 다운로드 완료','ok');
}
// 입출고 업로드 규칙
//  - 구분: IN/OUT(대소문자 무관)·입고/출고, 그 외 값은 오류
//  - 수량: 1 이상의 정수만 ('10개'·'1.5'·음수 → 오류)
//  - 출고는 재고 부족 시 오류, 존재하지 않는 Part Number 출고는 오류
//  - 신규 부품 입고는 부품명·적용로봇 필요
function uplIO(e){
  const f=e.target.files[0];if(!f)return;
  e.target.value='';
  document.getElementById('io-fn').textContent=f.name;document.getElementById('io-fp').style.display='flex';
  if(!xlsxReady())return;
  const r=new FileReader();
  r.onload=ev=>{
    let rows;
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
    }catch(err){console.warn('[ROBOSTOCK] 입출고 엑셀 읽기 실패',err);toast('❌','엑셀 파일을 읽을 수 없습니다','err');return;}
    let ok=0,newParts=0;
    const errs=[];
    const fail=msg=>errs.push(msg);
    for(let i=1;i<rows.length;i++){
      const row=rows[i]||[];
      if(!row.some(v=>!cellEmpty(v)))continue;   // 빈 행
      const rowNo=i+1;
      const [tp,pnRaw,nm,rb,qty,u,memo]=row;
      const t=parseIOType(tp);
      if(!t){fail(`${rowNo}행: 구분 값 오류(${tp}) — IN/OUT 또는 입고/출고`);continue;}
      const pn=cellStr(pnRaw);
      if(!pn){fail(`${rowNo}행: Part Number 없음`);continue;}
      const q=parsePosInt(qty);
      if(!q){fail(`${rowNo}행: 수량은 1 이상의 정수(${qty})`);continue;}
      let b2=findBomByPN(pn);
      if(!b2){
        if(t==='OUT'){fail(`${rowNo}행: 존재하지 않는 Part Number 출고(${pn})`);continue;}
        const robot=normRobot(rb);
        if(cellEmpty(nm)||!robot){fail(`${rowNo}행: 신규 부품은 부품명·적용로봇 필요(${pn})`);continue;}
        b2={partNo:pn,name:cellStr(nm),robot,unit:cellStr(u)||'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:'',level:0,rev:'A',parentPartNo:''};
        bom.push(b2);newParts++;
      }
      if(t==='OUT'&&!(b2.stock>=q)){fail(`${rowNo}행: 재고 부족 ${b2.partNo} (현재 ${b2.stock}, 요청 ${q})`);continue;}
      b2.stock+=t==='IN'?q:-q;
      ioLogs.push({ts:Date.now(),type:t,robot:b2.robot,partNo:b2.partNo,partName:b2.name,qty:q,unit:b2.unit,memo:cellEmpty(memo)?'엑셀업로드':String(memo),status:'정상',userId:CU.id,userName:CU.name,photos:[]});
      ok++;
    }
    if(errs.length)console.warn('[ROBOSTOCK] 입출고 업로드 실패 행:\n'+errs.join('\n'));
    if(ok)logActivity(CU.id,CU.name,'IO',`엑셀 입출고 업로드(${f.name}): ${ok}건 반영${newParts?` (신규 부품 ${newParts}건)`:''}${errs.length?` · 실패 ${errs.length}건`:''}`);
    rendAll();
    toast(errs.length?'⚠️':'✅',`${ok}건 반영${newParts?` (신규 ${newParts}건)`:''}${errs.length?` · 실패 ${errs.length}건 (예: ${errs[0]})`:''}`,errs.length?'wa':'ok');
  };
  r.readAsArrayBuffer(f);
}
function dlLogs(){
  if(!xlsxReady())return;
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['일시','구분','로봇','Part Number','부품명','수량','단위','담당자','사번','메모','사진수'],...ioLogs.map(l=>[fd(l.ts),l.type==='IN'?'입고':'출고',l.robot,l.partNo,l.partName,l.qty,l.unit,l.userName,l.userId,l.memo||'',(l.photos||[]).length])]);
  XLSX.utils.book_append_sheet(wb,ws,'로그');XLSX.writeFile(wb,'ROBOSTOCK_로그_'+localDateStr()+'.xlsx');toast('📥','로그 다운로드 완료','ok');
}

// Drag & drop for excel upload
function dov(e,id){e.preventDefault();document.getElementById(id).classList.add('drag');}
function dlv(id){document.getElementById(id).classList.remove('drag');}
function ddrop(e){
  e.preventDefault();document.getElementById('io-dz').classList.remove('drag');
  const f=e.dataTransfer.files[0];if(!f)return;
  uplIO({target:{files:[f],value:''}});
}
