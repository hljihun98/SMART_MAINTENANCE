/* ===== persistence.js : localStorage 영속 저장/복원 =====
 *
 *  이 파일이 하는 일:
 *   - 새로고침/탭 종료 후에도 데이터가 남도록 브라우저 localStorage 에 저장/복원합니다.
 *   - 서버가 필요 없습니다(순수 프론트엔드). 단, "그 브라우저, 그 PC"에만 저장됩니다.
 *
 *  로드 순서:
 *   - 이 스크립트는 index.html 에서 '가장 마지막' defer 스크립트입니다.
 *     따라서 data.js / config.accounts.js 등 모든 데이터가 정의된 뒤 실행됩니다.
 *
 *  안전 설계:
 *   - 복원 시 변수를 '재대입'하지 않고 배열/객체 '내용만 교체'합니다.
 *     (기존 전역 바인딩을 그대로 유지 → 다른 코드가 참조하는 참조값이 안 깨짐)
 *   - 저장 실패(용량 초과 등)는 try/catch 로 흡수하여 앱이 멈추지 않습니다.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'robostock_state_v1';

  // 저장 대상: 런타임에 실제로 변경되는 데이터만 (화면 상태값은 제외)
  function snapshot() {
    return {
      USERS: USERS,
      bom: bom,
      ioLogs: ioLogs,
      activityLog: activityLog,
      technicians: technicians,
      techBookings: techBookings,
      delayLogs: delayLogs,
      confirmedSchedules: confirmedSchedules,
      robotGoals: robotGoals,
      asmEntries: asmEntries,
      actualRecords: actualRecords,
      inquiries: inquiries,
      laborModules: laborModules,
      laborSettings: laborSettings,
      loginTimes: loginTimes
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch (e) {
      // QuotaExceededError(이미지 base64 가 많을 때) 등 → 앱은 계속 동작
      console.warn('[ROBOSTOCK] 저장 실패 (localStorage 용량 초과 가능):', e);
    }
  }

  // 배열은 내용 비우고 다시 채움(참조 유지)
  function fillArr(target, src) {
    if (Array.isArray(target) && Array.isArray(src)) {
      target.length = 0;
      for (var i = 0; i < src.length; i++) target.push(src[i]);
    }
  }
  // 객체는 키 비우고 다시 채움(참조 유지)
  function fillObj(target, src) {
    if (target && src && typeof src === 'object') {
      Object.keys(target).forEach(function (k) { delete target[k]; });
      Object.assign(target, src);
    }
  }

  function loadState() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var d;
    try { d = JSON.parse(raw); } catch (e) { console.warn('[ROBOSTOCK] 저장 데이터 손상 — 무시'); return; }

    fillObj(USERS, d.USERS);
    fillArr(bom, d.bom);
    fillArr(ioLogs, d.ioLogs);
    fillArr(activityLog, d.activityLog);
    fillArr(technicians, d.technicians);
    fillArr(techBookings, d.techBookings);
    fillArr(delayLogs, d.delayLogs);
    fillArr(confirmedSchedules, d.confirmedSchedules);
    fillArr(actualRecords, d.actualRecords);
    fillArr(inquiries, d.inquiries);
    fillObj(robotGoals, d.robotGoals);
    fillObj(asmEntries, d.asmEntries);
    fillObj(laborModules, d.laborModules);
    fillObj(laborSettings, d.laborSettings);
    fillObj(loginTimes, d.loginTimes);
  }

  // 디버그/수동 초기화용으로 전역 노출 (콘솔에서 resetRobostock() 호출 가능)
  window.saveState = saveState;
  window.loadState = loadState;
  window.resetRobostock = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  };

  // ── 1) 시작 시 복원 ─────────────────────────────
  loadState();

  // ── 2) 저장 트리거 ──────────────────────────────
  // (a) 페이지를 떠날 때
  window.addEventListener('beforeunload', saveState);
  // (b) 탭이 백그라운드로 갈 때(모바일/탭 전환 대비)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveState();
  });
  // (c) 안전망: 로그인 상태에서 2초마다 자동 저장 (데이터가 작아 부담 없음)
  setInterval(function () {
    if (typeof CU !== 'undefined' && CU) saveState();
  }, 2000);
})();
