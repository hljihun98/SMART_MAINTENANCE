/* ===== scanner.js : 바코드 스캐너(카메라/BarcodeDetector) ===== */
/* (원본 robot_inventory__44_.html 2660-2697 줄을 그대로 분리) */
// ════════════════════════════════════════
// SCANNER
// ════════════════════════════════════════
function openScanner(dir){
  scanTarget=dir;
  document.getElementById('mo-scan').classList.add('open');
  document.getElementById('s-res').textContent='스캔 대기 중...';
  document.getElementById('s-ok').disabled=true;
  scannedCode=null;startCam();
}
async function startCam(){
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v=document.getElementById('sv');v.srcObject=scanStream;
    if('BarcodeDetector'in window){
      const d=new BarcodeDetector({formats:['code_128','ean_13','qr_code','code_39']});
      const loop=async()=>{
        if(!scanStream)return;
        try{const bs=await d.detect(v);if(bs.length){scannedCode=bs[0].rawValue;document.getElementById('s-res').textContent='스캔됨: '+scannedCode;document.getElementById('s-ok').disabled=false;return;}}catch(e){/* ignored */}
        requestAnimationFrame(loop);
      };
      v.addEventListener('play',loop,{once:true});
    } else {
      document.getElementById('s-res').textContent='자동 스캔 미지원. 직접 입력하세요.';
      setTimeout(()=>{
        const c=window.prompt('Part Number:');
        if(c&&c.trim()){
          scannedCode=c.trim();
          document.getElementById('s-res').textContent='입력됨: '+scannedCode;
          document.getElementById('s-ok').disabled=false;
        }
      },400);
    }
  }catch(e){document.getElementById('s-res').textContent='카메라 오류: '+e.message;}
}
function closeScanner(){if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}document.getElementById('mo-scan').classList.remove('open');}
function confirmScan(){if(scannedCode){document.getElementById(scanTarget+'-bc').value=scannedCode;lookupPN(scanTarget,scannedCode);closeScanner();toast('✅','스캔 완료: '+scannedCode,'ok');}}

