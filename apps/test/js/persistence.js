/* ===== persistence.js : localStorage 영속 저장/복원 =====
 *
 *  이 파일이 하는 일:
 *   - 새로고침/탭 종료 후에도 데이터가 남도록 브라우저 localStorage 에 저장/복원합니다.
 *   - 서버가 필요 없습니다(순수 프론트엔드). 단, "그 브라우저, 그 PC"에만 저장됩니다.
 *   - 사진 본문은 images.js 가 IndexedDB('robostock_images')에 따로 저장하고,
 *     이 상태에는 이미지 참조(id)만 들어갑니다.
 *
 *  로드 순서:
 *   - 이 스크립트는 index.html 에서 '가장 마지막' 앱 defer 스크립트입니다.
 *     따라서 data.js / accounts.js / images.js 등 모든 런타임 데이터가 정의된 뒤 실행됩니다.
 *
 *  안전 설계:
 *   - 복원 시 변수를 '재대입'하지 않고 배열/객체 '내용만 교체'합니다.
 *   - 변경 감지(dirty check): 마지막으로 저장/로드한 문자열과 다를 때만 저장합니다.
 *     로그인하지 않은 탭, 아무것도 바꾸지 않은 탭은 절대 저장하지 않습니다.
 *   - 다른 탭이 저장하면 storage 이벤트로 최신 상태를 다시 불러오고 화면을 갱신합니다.
 *   - 다른 탭/메인 포털이 저장 키를 지우면(초기화) 저장을 멈추고 새로고침합니다.
 *   - 저장 데이터가 손상되었으면 원본을 백업 키에 보관한 뒤 기본값으로 시작합니다.
 *     (백업조차 실패하면 손상 데이터를 덮어쓰지 않도록 자동 저장을 중단)
 *   - 저장 실패(용량 초과 등)는 한 번만 명확히 경고하고 앱은 계속 동작합니다.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'robostock_state_v1';
  var BACKUP_KEY = 'robostock_state_v1_corrupt_backup';
  var NOTICE_KEY = 'robostock_notice';   // sessionStorage: 새로고침 후 보여줄 안내
  var SCHEMA_VERSION = 2;                // v2: 이미지 참조화 · 일정 날짜 보정 · 사용자 개발로그 저장

  var lastSavedRaw = null;   // 마지막으로 저장/로드한 문자열 (dirty check 기준)
  var saveBlocked = false;   // 초기화 중 / 손상 데이터 보호 중이면 저장 금지
  var quotaWarned = false;

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  // 코드 기본값 (저장 데이터에 없는 키를 채울 때 사용)
  var DEFAULTS = clone({
    robotGoals: robotGoals,
    robotDashShow: robotDashShow,
    asmEntries: asmEntries,
    laborModules: laborModules,
    laborSettings: laborSettings,
    loginTimes: loginTimes
  });

  function isLoggedIn() { return typeof CU !== 'undefined' && !!CU; }
  function notify(icon, msg, type) { if (typeof toast === 'function') toast(icon, msg, type); }

  // 저장 대상: 런타임에 실제로 변경되는 데이터만 (화면 상태값은 제외)
  function snapshot() {
    return {
      _v: SCHEMA_VERSION,
      USERS: getUsers(),
      bom: bom,
      ioLogs: ioLogs,
      activityLog: activityLog,
      technicians: technicians,
      techBookings: techBookings,
      delayLogs: delayLogs,
      confirmedSchedules: confirmedSchedules,
      robotGoals: robotGoals,
      robotDashShow: robotDashShow,
      asmEntries: asmEntries,
      actualRecords: actualRecords,
      inquiries: inquiries,
      laborModules: laborModules,
      laborSettings: laborSettings,
      loginTimes: loginTimes,
      // 개발 로그는 코드(data.js)가 정본 → 관리자가 화면에서 추가한 항목만 저장
      changelogCustom: changelogData.filter(function (c) { return c && c.custom; })
    };
  }

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return undefined; }
  }

  function saveState() {
    if (saveBlocked) return false;
    if (!isLoggedIn()) return false;
    var raw;
    try { raw = JSON.stringify(snapshot()); }
    catch (e) { console.warn('[ROBOSTOCK] 상태 직렬화 실패:', e); return false; }
    if (raw === lastSavedRaw) return true;   // 변경 없음 → 저장 안 함

    // 다른 탭/포털의 변경을 아직 반영하지 못한 상태라면 덮어쓰지 않고 먼저 반영
    var stored = readStored();
    if (stored === undefined) return false;
    if (stored === null && lastSavedRaw !== null) { handleExternalClear(); return false; }
    if (stored !== null && stored !== lastSavedRaw) { applyExternal(stored); return false; }

    try {
      localStorage.setItem(STORAGE_KEY, raw);
      lastSavedRaw = raw;
      quotaWarned = false;
      return true;
    } catch (e) {
      console.warn('[ROBOSTOCK] 저장 실패 (localStorage 용량 초과 가능):', e);
      if (!quotaWarned) {
        quotaWarned = true;
        notify('⚠️', '저장 실패: 브라우저 저장 공간이 부족해 최근 변경이 저장되지 않고 있습니다. 메인 포털 → 데이터 관리에서 용량을 확인하세요.', 'err');
      }
      return false;
    }
  }

  // 배열은 내용 비우고 다시 채움(참조 유지)
  function fillArr(target, src) {
    if (Array.isArray(target) && Array.isArray(src)) {
      target.length = 0;
      for (var i = 0; i < src.length; i++) target.push(src[i]);
    }
  }
  // 객체는 키 비우고 기본값 → 저장값 순으로 채움(참조 유지, 새로 생긴 키는 기본값 유지)
  function fillObj(target, src, def) {
    if (target && src && typeof src === 'object' && !Array.isArray(src)) {
      Object.keys(target).forEach(function (k) { delete target[k]; });
      if (def) Object.assign(target, clone(def));
      Object.assign(target, src);
    }
  }

  // ── 스키마 마이그레이션 / 값 정리 ─────────────────────
  function num(v, def) { var n = Number(v); return isFinite(n) ? n : def; }
  function sanitizePart(b) {
    if (!b || typeof b !== 'object') return null;
    b.partNo = String(b.partNo == null ? '' : b.partNo).trim();
    if (!b.partNo) return null;
    b.name = b.name == null ? b.partNo : String(b.name);
    b.robot = String(b.robot || 'PARKIE');
    b.unit = String(b.unit || 'EA');
    b.stock = num(b.stock, 0);
    b.minStock = Math.max(0, num(b.minStock, 0));
    b.price = Math.max(0, num(b.price, 0));
    b.perUnit = num(b.perUnit, 1) > 0 ? num(b.perUnit, 1) : 1;
    var lv = parseInt(b.level, 10);
    b.level = lv >= 0 && lv <= 6 ? lv : 0;
    b.rev = b.rev == null || b.rev === '' ? 'A' : String(b.rev);
    b.parentPartNo = b.parentPartNo == null ? '' : String(b.parentPartNo);
    b.spec = b.spec == null ? '' : String(b.spec);
    if (!Array.isArray(b.imgs)) b.imgs = [];
    return b;
  }
  function migrateState(d) {
    var v = parseInt(d._v, 10) || 1;
    // 배열 필드 타입 보정
    ['bom', 'ioLogs', 'activityLog', 'technicians', 'techBookings', 'delayLogs',
      'confirmedSchedules', 'actualRecords', 'inquiries'].forEach(function (k) {
      if (d[k] !== undefined && !Array.isArray(d[k])) { console.warn('[ROBOSTOCK] 잘못된 필드 무시:', k); delete d[k]; }
    });
    if (Array.isArray(d.bom)) {
      var before = d.bom.length;
      d.bom = d.bom.map(sanitizePart).filter(Boolean);
      if (d.bom.length !== before) console.warn('[ROBOSTOCK] Part Number 없는 BOM 항목 ' + (before - d.bom.length) + '건 제외');
    }
    if (Array.isArray(d.ioLogs)) {
      d.ioLogs = d.ioLogs.filter(function (l) { return l && typeof l === 'object'; });
      d.ioLogs.forEach(function (l) { if (!Array.isArray(l.photos)) l.photos = []; });
    }
    if (v < 2 && Array.isArray(d.confirmedSchedules)) {
      // v1 버그: 확정 일정 날짜를 toISOString(UTC)으로 저장해 KST 에서 하루씩 앞당겨짐 → +1일 보정
      d.confirmedSchedules.forEach(function (sc) {
        if (!sc || !Array.isArray(sc.phases)) return;
        var gtc = sc.phases.find(function (p) { return p && p.type === 'gtc'; });
        if (!gtc || !gtc.end || !sc.deadline || gtc.end === sc.deadline) return;
        if (addDaysStr(gtc.end, 1) !== sc.deadline) return;
        sc.phases.forEach(function (p) {
          if (p.start) p.start = addDaysStr(p.start, 1);
          if (p.end) p.end = addDaysStr(p.end, 1);
        });
      });
    }
    d._v = SCHEMA_VERSION;
    return d;
  }

  function applyState(d) {
    migrateState(d);
    if (d.USERS) replaceUsers(d.USERS);
    fillArr(bom, d.bom);
    fillArr(ioLogs, d.ioLogs);
    fillArr(activityLog, d.activityLog);
    fillArr(technicians, d.technicians);
    fillArr(techBookings, d.techBookings);
    fillArr(delayLogs, d.delayLogs);
    fillArr(confirmedSchedules, d.confirmedSchedules);
    fillArr(actualRecords, d.actualRecords);
    fillArr(inquiries, d.inquiries);
    fillObj(robotGoals, d.robotGoals, DEFAULTS.robotGoals);
    fillObj(robotDashShow, d.robotDashShow, DEFAULTS.robotDashShow);
    fillObj(asmEntries, d.asmEntries, DEFAULTS.asmEntries);
    fillObj(laborModules, d.laborModules, DEFAULTS.laborModules);
    fillObj(laborSettings, d.laborSettings, DEFAULTS.laborSettings);
    fillObj(loginTimes, d.loginTimes, DEFAULTS.loginTimes);
    // 사용자 추가 개발 로그: 코드 정본은 유지하고 저장된 사용자 항목만 다시 붙임
    for (var i = changelogData.length - 1; i >= 0; i--) if (changelogData[i] && changelogData[i].custom) changelogData.splice(i, 1);
    if (Array.isArray(d.changelogCustom)) {
      d.changelogCustom.forEach(function (c) { if (c && c.ver && c.body) changelogData.push(Object.assign({}, c, { custom: true })); });
    }
    migrateImages();
  }

  // 상태 속 base64 이미지를 IndexedDB 로 옮김 (비동기). 옮긴 뒤 상태가 바뀌어 다음 저장에서 반영됨
  function imageLists() {
    var lists = [];
    bom.forEach(function (b) { if (Array.isArray(b.imgs)) lists.push(b.imgs); });
    ioLogs.forEach(function (l) { if (Array.isArray(l.photos)) lists.push(l.photos); });
    return lists;
  }
  function migrateImages() {
    if (!window.ImgStore) return;
    ImgStore.migrateLegacy(imageLists()).then(function (n) {
      if (n) console.info('[ROBOSTOCK] 기존 사진 ' + n + '장을 IndexedDB 로 옮겼습니다.');
    });
  }
  function collectImageRefs() {
    var set = new Set();
    imageLists().forEach(function (arr) { arr.forEach(function (r) { if (ImgStore.isRef(r)) set.add(r); }); });
    // 입고 모달에 첨부 중(아직 미등록)인 사진도 보호 (pendPh 는 data.js 의 let 전역)
    if (typeof pendPh !== 'undefined' && Array.isArray(pendPh)) pendPh.forEach(function (r) { set.add(r); });
    return set;
  }

  function parseRaw(raw) {
    var d;
    try { d = JSON.parse(raw); } catch (e) { return null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    return d;
  }

  function loadState() {
    var raw = readStored();
    if (raw === undefined) return;          // localStorage 접근 불가
    if (!raw) { lastSavedRaw = null; return; }
    var d = parseRaw(raw);
    if (!d) {
      console.warn('[ROBOSTOCK] 저장 데이터 손상 — 백업 후 기본값으로 시작');
      var backedUp = false;
      try { localStorage.setItem(BACKUP_KEY, raw); backedUp = true; } catch (e) { /* 용량 부족 */ }
      if (backedUp) {
        lastSavedRaw = raw;   // 다음 저장 때 손상 데이터를 덮어써도 백업이 남아 있음
        notify('⚠️', '저장 데이터가 손상되어 기본값으로 시작합니다. 원본은 ' + BACKUP_KEY + ' 키에 백업했습니다.', 'err');
      } else {
        saveBlocked = true;   // 백업 불가 → 원본 보호를 위해 자동 저장 중단
        notify('❌', '저장 데이터가 손상되었고 백업 공간이 부족해 자동 저장을 중단했습니다. 관리자에게 문의하세요.', 'err');
      }
      return;
    }
    applyState(d);
    lastSavedRaw = raw;
  }

  // ── 다른 탭/포털 변경 반영 ──────────────────────────
  function rerender() {
    if (!isLoggedIn()) return;
    try {
      if (typeof syncLaborInputsFromState === 'function') syncLaborInputsFromState();
      var act = document.querySelector('.pg.act');
      var pg = act && act.id ? act.id.replace(/^pg-/, '') : 'dash';
      rendAll();
      go(pg);
      if (typeof updateInqDots === 'function') updateInqDots();
    } catch (e) { console.warn('[ROBOSTOCK] 재렌더 실패:', e); }
  }
  function applyExternal(raw) {
    var d = parseRaw(raw);
    if (!d) return;
    var wasDirty = false;
    try { wasDirty = JSON.stringify(snapshot()) !== lastSavedRaw; } catch (e) { /* 무시 */ }
    applyState(d);
    lastSavedRaw = raw;
    if (isLoggedIn()) {
      rerender();
      notify('🔄', wasDirty
        ? '다른 탭에서 데이터가 변경되어 최신 상태로 다시 불러왔습니다. 이 탭에서 저장 전이던 변경은 반영되지 않았습니다.'
        : '다른 탭에서 변경된 데이터를 불러왔습니다.', wasDirty ? 'wa' : 'ok');
    }
  }
  function handleExternalClear() {
    if (saveBlocked) return;
    saveBlocked = true;     // 되살리지 않도록 저장 중단
    try { sessionStorage.setItem(NOTICE_KEY, '다른 탭(또는 메인 포털)에서 ROBOSTOCK 데이터가 초기화되어 새로 불러왔습니다.'); } catch (e) { /* 무시 */ }
    location.reload();
  }
  window.addEventListener('storage', function (e) {
    if (saveBlocked) return;
    if (e.key !== STORAGE_KEY && e.key !== null) return;   // null = localStorage.clear()
    var raw = readStored();
    if (raw === undefined) return;
    if (raw === null) { if (lastSavedRaw !== null || e.key === STORAGE_KEY) handleExternalClear(); return; }
    if (raw === lastSavedRaw) return;
    applyExternal(raw);
  });

  // 디버그/수동 초기화용으로 전역 노출 (콘솔에서 resetRobostock() 호출 가능)
  window.saveState = saveState;
  window.loadState = loadState;
  window.resetRobostock = function () {
    saveBlocked = true;   // reload 중 beforeunload/visibilitychange 저장으로 되살아나지 않게
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    try { localStorage.removeItem(BACKUP_KEY); } catch (e) { /* 무시 */ }
    var done = false;
    function finish() { if (done) return; done = true; location.reload(); }
    if (window.ImgStore) ImgStore.destroy().then(finish, finish); else finish();
    setTimeout(finish, 2500);   // IndexedDB 삭제가 지연돼도 새로고침
  };
  window.confirmResetRobostock = function () {
    if (!window.confirm('저장된 브라우저 데이터를 초기화하고 새로고침할까요?\n계정/입력 데이터와 첨부 사진이 현재 브라우저에서 초기 상태로 돌아갑니다.')) return;
    window.resetRobostock();
  };

  // ── 1) 시작 시 복원 ─────────────────────────────
  loadState();
  try {
    var notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) { sessionStorage.removeItem(NOTICE_KEY); setTimeout(function () { notify('ℹ️', notice, 'ok'); }, 300); }
  } catch (e) { /* 무시 */ }
  // 고아 이미지 정리 (마이그레이션이 끝난 뒤 여유 있게)
  setTimeout(function () {
    if (window.ImgStore && !saveBlocked) ImgStore.gc(collectImageRefs());
  }, 5000);

  // ── 2) 저장 트리거 (모두 '로그인 상태 + 실제 변경'일 때만 저장) ──
  // (a) 페이지를 떠날 때
  window.addEventListener('beforeunload', function () { saveState(); });
  // (b) 탭이 백그라운드로 갈 때(모바일/탭 전환 대비)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveState();
  });
  // (c) 안전망: 2초마다 변경 여부 확인 후 저장
  setInterval(function () { saveState(); }, 2000);
})();
