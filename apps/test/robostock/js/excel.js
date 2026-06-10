/* ===== excel.js : 엑셀 다운로드/업로드(XLSX 사용) ===== */
/* (원본 robot_inventory__44_.html 4618-4691 줄을 그대로 분리) */
// ════════════════════════════════════════
// EXCEL
// ════════════════════════════════════════
function dlBOM(){
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['Part Number','부품명','적용로봇','단위','현재재고','최소재고','단가(원)','대당수량'],...bom.map(b=>[b.partNo,b.name,b.robot,b.unit,b.stock,b.minStock,b.price,b.perUnit])]);
  ws['!cols']=[16,18,10,8,10,10,12,8].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'BOM');XLSX.writeFile(wb,'ROBOSTOCK_BOM.xlsx');toast('📥','BOM 다운로드 완료','ok');
}
function uplBOM(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      let n=0;
      for(let i=1;i<rows.length;i++){
        const[pn,nm,rb,u,st,ms,pr,pu]=rows[i];if(!pn||!nm)continue;
        const ex=bom.find(b=>b.partNo===String(pn));
        if(ex)Object.assign(ex,{name:nm,robot:rb||ex.robot,unit:u||ex.unit,stock:+st||0,minStock:+ms||0,price:+pr||0,perUnit:+pu||1});
        else bom.push({partNo:String(pn),name:nm,robot:rb||'PARKIE',unit:u||'EA',stock:+st||0,minStock:+ms||0,price:+pr||0,imgs:[],perUnit:+pu||1,spec:''});
        n++;
      }
      rendAll();toast('✅',`BOM ${n}건 반영`,'ok');
    }catch(err){toast('❌','파일 오류','err');}
  };
  r.readAsArrayBuffer(f);e.target.value='';
}
function dlIOT(){
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['구분(IN/OUT)','Part Number','부품명','적용로봇','수량','단위','메모'],['IN','PK-MC-001','메인컨트롤러','PARKIE',10,'EA','정기발주'],['OUT','CR-MT-001','리프트모터','CARRIE',2,'EA','조립투입']]);
  ws['!cols']=[10,16,18,10,8,8,20].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'입출고');XLSX.writeFile(wb,'ROBOSTOCK_입출고_양식.xlsx');toast('📥','양식 다운로드 완료','ok');
}
function uplIO(e){
  const f=e.target.files[0];if(!f)return;
  document.getElementById('io-fn').textContent=f.name;document.getElementById('io-fp').style.display='flex';
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      let ok=0,fail=0;
      for(let i=1;i<rows.length;i++){
        const[tp,pn,nm,rb,qty,u,memo]=rows[i];if(!tp||!qty)continue;
        const t=String(tp).toUpperCase();
        let b2=bom.find(b=>b.partNo===String(pn));
        if(!b2){if(t==='OUT'){fail++;continue;}if(!nm||!rb){fail++;continue;}b2={partNo:String(pn),name:nm,robot:rb,unit:u||'EA',stock:0,minStock:0,price:0,imgs:[],perUnit:1,spec:''};bom.push(b2);}
        const q=parseInt(qty);if(t==='OUT'&&b2.stock<q){fail++;continue;}
        b2.stock+=t==='IN'?q:-q;
        ioLogs.push({ts:Date.now(),type:t,robot:b2.robot,partNo:b2.partNo,partName:b2.name,qty:q,unit:b2.unit,memo:memo||'엑셀업로드',userId:CU.id,userName:CU.name,photos:[]});
        ok++;
      }
      rendAll();toast('✅',`${ok}건 반영 (실패${fail}건)`,'ok');
    }catch(err){toast('❌','파일 오류','err');}
  };
  r.readAsArrayBuffer(f);e.target.value='';
}
function dlLogs(){
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['일시','구분','로봇','Part Number','부품명','수량','단위','담당자','사번','메모','사진수'],...ioLogs.map(l=>[fd(l.ts),l.type==='IN'?'입고':'출고',l.robot,l.partNo,l.partName,l.qty,l.unit,l.userName,l.userId,l.memo||'',(l.photos||[]).length])]);
  XLSX.utils.book_append_sheet(wb,ws,'로그');XLSX.writeFile(wb,'ROBOSTOCK_로그_'+new Date().toISOString().slice(0,10)+'.xlsx');toast('📥','로그 다운로드 완료','ok');
}

// Drag & drop for excel upload
function dov(e,id){e.preventDefault();document.getElementById(id).classList.add('drag');}
function dlv(id){document.getElementById(id).classList.remove('drag');}
function ddrop(e){
  e.preventDefault();document.getElementById('io-dz').classList.remove('drag');
  const f=e.dataTransfer.files[0];if(!f)return;
  document.getElementById('io-fn').textContent=f.name;document.getElementById('io-fp').style.display='flex';
  uplIO({target:{files:[f],value:''}});
}
