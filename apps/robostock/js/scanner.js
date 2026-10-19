/* ===== scanner.js : 바코드 스캐너(카메라/BarcodeDetector) ===== */
/* (원본 robot_inventory__44_.html 2660-2697 줄을 그대로 분리) */
// ════════════════════════════════════════
// SCANNER
// ════════════════════════════════════════
// 스캐너 세션 번호: 열기/닫기마다 증가. 카메라 권한 대기 중에 닫으면
// 늦게 도착한 스트림을 즉시 정지해 카메라가 켜진 채 남지 않게 합니다.
let scanSession=0;
function openScanner(dir){
  scanTarget=dir;
  document.getElementById('mo-scan').classList.add('open');
  document.getElementById('s-res').textContent='스캔 대기 중...';
  document.getElementById('s-ok').disabled=true;
  scannedCode=null;startCam(++scanSession);
}
function stopStream(stream){if(stream)stream.getTracks().forEach(t=>t.stop());}
async function startCam(session){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    if(session!==scanSession){stopStream(stream);return;}   // 대기 중 스캐너가 닫힘
    stopStream(scanStream);
    scanStream=stream;
    const v=document.getElementById('sv');v.srcObject=scanStream;
    if('BarcodeDetector'in window){
      const d=new BarcodeDetector({formats:['code_128','ean_13','qr_code','code_39']});
      const loop=async()=>{
        if(!scanStream||session!==scanSession)return;
        try{const bs=await d.detect(v);if(bs.length){scannedCode=bs[0].rawValue;document.getElementById('s-res').textContent='스캔됨: '+scannedCode;document.getElementById('s-ok').disabled=false;return;}}catch(e){/* ignored */}
        requestAnimationFrame(loop);
      };
      v.addEventListener('play',loop,{once:true});
    } else {
      document.getElementById('s-res').textContent='자동 스캔 미지원. 직접 입력하세요.';
      setTimeout(()=>{
        if(session!==scanSession)return;
        const c=window.prompt('Part Number:');
        if(c&&c.trim()&&session===scanSession){
          scannedCode=c.trim();
          document.getElementById('s-res').textContent='입력됨: '+scannedCode;
          document.getElementById('s-ok').disabled=false;
        }
      },400);
    }
  }catch(e){if(session===scanSession)document.getElementById('s-res').textContent='카메라 오류: '+e.message;}
}
function closeScanner(){
  scanSession++;   // 진행 중인 카메라 요청·인식 루프 무효화
  stopStream(scanStream);scanStream=null;
  const v=document.getElementById('sv');if(v)v.srcObject=null;
  document.getElementById('mo-scan').classList.remove('open');
}
function confirmScan(){if(scannedCode){document.getElementById(scanTarget+'-bc').value=scannedCode;lookupPN(scanTarget,scannedCode);closeScanner();toast('✅','스캔 완료: '+scannedCode,'ok');}}
