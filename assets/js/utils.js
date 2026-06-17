/* =====================================================
   SMART Maintenance Platform — 공통 유틸리티 함수
   모든 앱이 공유하는 date/toast/download 헬퍼
   ===================================================== */

/* ── 숫자를 2자리 문자열로 zero-padding ── */
function smPad(n) {
  return String(n).padStart(2, '0');
}

/* ── YYYY-MM-DD HH:mm 형식 날짜·시간 문자열 반환 ── */
function smFormatDatetime(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' +
    smPad(d.getMonth() + 1) + '-' +
    smPad(d.getDate()) + ' ' +
    smPad(d.getHours()) + ':' +
    smPad(d.getMinutes());
}

/* ── 지정 element에 시계 표시 후 setInterval 핸들 반환 ──
   elementId: 시계를 표시할 element의 id
   interval:  갱신 주기(ms), 기본 1000 */
function smStartClock(elementId, interval) {
  const el = document.getElementById(elementId);
  if (!el) return null;
  function tick() {
    el.textContent = smFormatDatetime(new Date());
  }
  tick();
  return setInterval(tick, interval || 1000);
}

/* ── 토스트 메시지 표시 ──
   msg:      표시할 문자열. 빈 문자열이면 즉시 숨김
   type:     CSS 클래스 추가용 타입 (예: 'err', 'ok', 'warn', '')
   duration: 자동 닫힘 시간(ms), 기본 3000 */
let _smToastTimer = null;
function smToast(msg, type, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (!msg) {
    t.className = '';
    t.textContent = '';
    clearTimeout(_smToastTimer);
    return;
  }
  clearTimeout(_smToastTimer);
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  _smToastTimer = setTimeout(function () {
    t.className = '';
    t.textContent = '';
  }, duration || 3000);
}

/* ── Blob을 파일로 다운로드 ── */
function smDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
