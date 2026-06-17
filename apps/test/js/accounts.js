/* ===== accounts.js : 계정 전용 저장소/헬퍼 =====
 *
 *  역할:
 *   - DEFAULT_USERS(초기 시드)와 런타임 USERS를 분리합니다.
 *   - 로그인, 관리자 계정 수정, localStorage 복원이 모두 이 파일의 함수를 사용합니다.
 *   - 현재는 브라우저 앱이므로 "파일 저장"은 못 하고, 런타임 상태 + localStorage를 관리합니다.
 */
(function () {
  'use strict';

  function cloneUsers(src) {
    if (!src || typeof src !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(src));
    } catch (e) {
      console.warn('[ROBOSTOCK] 계정 시드 복제 실패, 빈 계정으로 초기화합니다.', e);
      return {};
    }
  }

  function sanitizeUser(user) {
    if (!user) return null;
    return {
      pw: String(user.pw || ''),
      role: user.role === 'admin' ? 'admin' : 'user',
      name: String(user.name || '')
    };
  }

  const INITIAL_DEFAULT_USERS = cloneUsers(window.DEFAULT_USERS);
  let USERS = cloneUsers(INITIAL_DEFAULT_USERS);

  window.getUsers = function () {
    return USERS;
  };

  window.getUser = function (id) {
    return USERS[id] || null;
  };

  window.hasUser = function (id) {
    return !!USERS[id];
  };

  window.authenticateUser = function (id, pw) {
    const user = window.getUser(id);
    return !!(user && user.pw === pw);
  };

  window.getAuthConfigStatus = function () {
    if (!window.DEFAULT_USERS || typeof window.DEFAULT_USERS !== 'object') {
      return {
        ok: false,
        code: 'missing-config',
        message: '로그인 계정 파일(js/config.accounts.js)을 찾지 못했습니다. GitHub 업로드 시 이 파일이 포함되어 있는지 확인하세요.'
      };
    }
    if (!Object.keys(USERS).length) {
      return {
        ok: false,
        code: 'empty-users',
        message: '등록된 로그인 계정이 없습니다. js/config.accounts.js 또는 브라우저 저장 데이터를 확인하세요.'
      };
    }
    return { ok: true, code: 'ok', message: '' };
  };

  window.createUser = function (id, userData) {
    if (!id || window.hasUser(id)) return false;
    USERS[id] = sanitizeUser(userData);
    return true;
  };

  window.updateUser = function (id, patch) {
    const user = window.getUser(id);
    if (!user) return false;
    const next = {
      pw: patch && Object.prototype.hasOwnProperty.call(patch, 'pw') ? patch.pw : user.pw,
      role: patch && Object.prototype.hasOwnProperty.call(patch, 'role') ? patch.role : user.role,
      name: patch && Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : user.name
    };
    USERS[id] = sanitizeUser(next);
    return true;
  };

  window.deleteUserAccount = function (id) {
    if (!window.hasUser(id)) return false;
    delete USERS[id];
    return true;
  };

  window.replaceUsers = function (nextUsers) {
    USERS = cloneUsers(nextUsers);
    return USERS;
  };

  window.resetUsersFromSeed = function () {
    USERS = cloneUsers(INITIAL_DEFAULT_USERS);
    return USERS;
  };
})();
